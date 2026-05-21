import { PROTOCOL_VERSION } from "../protocol/types.js";
import { makeId, computeHash } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { readAiProviderConfig } from "../ai/config.js";
import { createOpenAiCompatibleJsonClient } from "../ai/client.js";
import type { AiJsonClient } from "../ai/client.js";
import { writeJson } from "../store/file-store.js";
import { collectWikiSources } from "./collect.js";
import { analyzeWikiSource } from "./analyze.js";
import { containsPrivateMaterial, isAllowedWikiPatchPath } from "./lint.js";
import { makeWikiSlug, type WikiSource } from "./model.js";
import { buildWikiCuratorPrompt } from "./curator-prompt.js";
import {
  CuratedWikiProposalSchema,
  WikiCurationReportSchema,
  WikiEvidenceClusterSchema,
  WikiEvidenceItemSchema,
  type CuratedWikiProposal,
  type WikiCurationReport,
  type WikiEvidenceCluster,
  type WikiEvidenceItem,
} from "./curation-model.js";

const REPORTS_WIKI_CURATION = ".praxisbase/reports/wiki-curation";

export interface WikiEvidencePool {
  items: WikiEvidenceItem[];
  filtered_noise: number;
  human_required: number;
  rejected: number;
}

export interface CurateWikiOptions {
  mode: "dry-run" | "review";
  now?: string;
  degraded?: boolean;
  minSourceCount?: number;
  limit?: number;
  aiClient?: AiJsonClient;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

export type CuratedProposalResult =
  | { ok: true; proposal: CuratedWikiProposal }
  | { ok: false; category: "ai_error" | "schema_error" | "guard_error" | "privacy_error"; error: string };

function textForSource(source: WikiSource): string {
  return [source.title, source.summary, source.body].filter(Boolean).join("\n").trim();
}

function hasConcreteExperienceTerms(text: string): boolean {
  return /\b(user preference|preference|operating policy|fixed|resolved|passed|verified|validated|workaround|pitfall|decision|failed|avoid|lesson|ack)\b/i.test(text);
}

function isOperationalNoiseSource(source: WikiSource): boolean {
  const bodyText = [source.summary, source.body].filter(Boolean).join("\n").trim();
  const text = textForSource(source);
  const ref = [source.source_ref, source.path].filter(Boolean).join("\n");
  if (!text) return true;
  if (/^\s*\{[\s\S]*"type"\s*:\s*"session_meta"/.test(bodyText)) return true;
  if (/^\s*\{[\s\S]*"base_instructions"\s*:/.test(bodyText)) return true;
  if (/^\s*openclaw:unknown\s*$/i.test(bodyText)) return true;
  if (/(^|\n)#\s*Deep Sleep\b/i.test(bodyText) && /\bPromoted\s+0\s+candidate\(s\)/i.test(bodyText)) return true;
  if (/\bDeep Sleep\b/i.test(text) && /\b(recall store|promoted\s+0\s+candidate|MEMORY\.md)\b/i.test(text)) return true;
  if (/\b(official documentation|official docs|api reference|reference documentation)\b/i.test(text) && !hasConcreteExperienceTerms(text)) return true;
  if (/^https?:\/\/[^ \n]*(?:docs|documentation|reference|api)[^ \n]*/i.test(ref) && !hasConcreteExperienceTerms(text)) return true;
  if (/\bCodex Desktop agent session initialization\b/i.test(text)
    && /\b(base instructions|personality configuration|frontend design rules|editing constraints|sandbox mode|approval policy|skill registry)\b/i.test(text)
    && !hasConcreteExperienceTerms(text)) return true;
  if (/\b(session boot|session initialization|initialization metadata|boot configuration|startup configuration|skill registry|approval policy|sandbox mode)\b/i.test(text)
    && !hasConcreteExperienceTerms(text)) return true;
  if (/\bCandidate:\s*Reflections?:\s*Theme:\s*`?(assistant|user)`?\s+kept surfacing\b/i.test(text) && !hasConcreteExperienceTerms(text)) return true;
  if ((/\bPromoted From Short-Term Memory\b/i.test(text) || /openclaw-memory-promotion:/i.test(text)) && !hasConcreteExperienceTerms(text)) return true;
  return false;
}

function evidenceKindForSource(source: WikiSource): WikiEvidenceItem["kind"] | undefined {
  if (source.kind === "capture") return "capture";
  if (source.kind === "episode") return "episode";
  if (source.kind === "native_memory") return "native_memory";
  if (source.kind === "external_ref") return "external_ref";
  if (source.kind === "proposal") return "proposal_candidate";
  return undefined;
}

function sentences(text: string): string[] {
  return text
    .split(/(?:\r?\n|[.;]\s+)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function inferActions(text: string): string[] {
  const matches = sentences(text).filter((line) => /\b(refresh|retry|restart|run|fix|fixed|update|promote|verify|send|ack|continue)\b/i.test(line));
  return matches.length > 0 ? matches.slice(0, 4) : [];
}

function inferVerification(text: string): string[] {
  const matches = sentences(text).filter((line) => /\b(test|check|verify|passed|sync|build|pnpm|pytest)\b/i.test(line));
  return matches.length > 0 ? matches.slice(0, 3) : [];
}

function inferReusableLessons(text: string): string[] {
  const matches = sentences(text).filter((line) => /\b(lesson|remember|prefer|preference|refresh|avoid|use|run|should|must|ack|before retrying)\b/i.test(line));
  return matches.length > 0 ? matches.slice(0, 4) : [];
}

function hasUsefulExperienceSignal(input: {
  text: string;
  actions: string[];
  verification: string[];
  reusableLessons: string[];
  suggestedKind: WikiEvidenceItem["suggested_wiki_kind"];
}): boolean {
  const knownOperationalSignature = /\bopenclaw:[a-z0-9-]+(?:auth|expired|failure|error|fix|sync)[a-z0-9-]*\b/i.test(input.text);
  const durableLesson = hasConcreteExperienceTerms(input.text)
    || knownOperationalSignature;
  const actionable = input.actions.length > 0 || knownOperationalSignature || input.suggestedKind === "decision" || input.suggestedKind === "preference" || input.suggestedKind === "pitfall";
  const grounded = input.verification.length > 0 || input.reusableLessons.length > 0 || knownOperationalSignature || hasConcreteExperienceTerms(input.text);
  return durableLesson && actionable && grounded;
}

function curationKindFromAnalysis(kind: string): WikiEvidenceItem["suggested_wiki_kind"] {
  if (kind === "skill_seed") return "skill";
  if (kind === "known_fix" || kind === "procedure" || kind === "decision" || kind === "pitfall" || kind === "preference" || kind === "incident" || kind === "note") {
    return kind;
  }
  return "note";
}

export function buildWikiEvidencePool(sources: WikiSource[]): WikiEvidencePool {
  const items: WikiEvidenceItem[] = [];
  let filteredNoise = 0;
  let humanRequired = 0;
  let rejected = 0;

  for (const source of sources) {
    const kind = evidenceKindForSource(source);
    if (!kind) continue;
    if (isOperationalNoiseSource(source)) {
      filteredNoise++;
      continue;
    }

    const text = textForSource(source);
    const analysis = analyzeWikiSource(source);
    if (containsPrivateMaterial(text) || analysis.risks.includes("private_material")) {
      humanRequired++;
      continue;
    }
    if (analysis.risks.includes("unsafe_path") || analysis.risks.includes("weak_provenance")) {
      rejected++;
      continue;
    }

    const sourceRef = source.source_ref ?? source.path ?? source.id;
    const actions = inferActions(text);
    const verification = inferVerification(text);
    const reusableLessons = inferReusableLessons(text);
    const suggestedWikiKind = curationKindFromAnalysis(analysis.suggested_page_kind);
    if (!hasUsefulExperienceSignal({
      text,
      actions,
      verification,
      reusableLessons,
      suggestedKind: suggestedWikiKind,
    })) {
      filteredNoise++;
      continue;
    }

    items.push(WikiEvidenceItemSchema.parse({
      id: source.id,
      kind,
      source_ref: sourceRef,
      source_hash: source.source_hash,
      scope: source.scope,
      title: source.title,
      summary: source.summary || source.title,
      actions,
      failed_attempts: sentences(text).filter((line) => /\b(failed|fail|did not work|retry loop)\b/i.test(line)).slice(0, 3),
      outcome: /\b(success|fixed|resolved|passed)\b/i.test(text) ? "success" : "unknown",
      verification,
      reusable_lessons: reusableLessons,
      signatures: analysis.signatures.filter((signature) => !signature.startsWith(`${source.kind}:`)),
      suggested_wiki_kind: suggestedWikiKind,
      privacy_verdict: source.scope === "personal" ? "personal_only" : "safe",
      created_at: source.updated_at ?? source.created_at,
    }));
  }

  const deduped = new Map<string, WikiEvidenceItem>();
  for (const item of items) {
    const key = `${item.source_ref}:${item.source_hash}`;
    if (!deduped.has(key)) deduped.set(key, item);
  }

  return {
    items: Array.from(deduped.values()).sort((a, b) => a.id.localeCompare(b.id)),
    filtered_noise: filteredNoise,
    human_required: humanRequired,
    rejected,
  };
}

export async function buildWikiEvidencePoolFromRoot(root: string): Promise<WikiEvidencePool> {
  return buildWikiEvidencePool(await collectWikiSources(root));
}

function firstSignature(item: WikiEvidenceItem): string | undefined {
  return item.signatures.find((signature) => !/^(capture|native_memory|episode|external_ref|proposal|review|skill):/.test(signature));
}

function clusterKey(item: WikiEvidenceItem): string {
  const signature = firstSignature(item);
  if (signature) return `sig:${signature}`;
  return `title:${makeWikiSlug(item.title)}`;
}

function pageKindForCluster(items: WikiEvidenceItem[]): WikiEvidenceCluster["page_kind"] {
  return items.find((item) => item.suggested_wiki_kind)?.suggested_wiki_kind ?? "note";
}

function targetPathForCluster(pageKind: WikiEvidenceCluster["page_kind"], title: string): string {
  const slug = makeWikiSlug(title);
  if (pageKind === "known_fix") return `kb/known-fixes/${slug}.md`;
  if (pageKind === "procedure") return `kb/procedures/${slug}.md`;
  if (pageKind === "decision") return `kb/decisions/${slug}.md`;
  if (pageKind === "pitfall") return `kb/pitfalls/${slug}.md`;
  if (pageKind === "skill") return `skills/${slug}/SKILL.md`;
  if (pageKind === "preference") return `kb/memory/preferences-${slug}.md`;
  return `kb/notes/wiki-${slug}.md`;
}

function normalizedTitleForItems(items: WikiEvidenceItem[]): string {
  const signatures = items.flatMap((item) => item.signatures);
  if (signatures.includes("openclaw:auth-expired")) return "OpenClaw auth expired";
  return items[0].title;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

export function clusterWikiEvidence(items: WikiEvidenceItem[]): WikiEvidenceCluster[] {
  const buckets = new Map<string, WikiEvidenceItem[]>();
  for (const item of items) {
    const key = clusterKey(item);
    const bucket = buckets.get(key) ?? [];
    bucket.push(item);
    buckets.set(key, bucket);
  }

  const clusters = Array.from(buckets.entries()).map(([key, bucket]) => {
    const sorted = bucket.slice().sort((a, b) => a.source_ref.localeCompare(b.source_ref));
    const pageKind = pageKindForCluster(sorted);
    const normalizedTitle = normalizedTitleForItems(sorted);
    const sourceRefs = uniq(sorted.map((item) => item.source_ref));
    const sourceHashes = uniq(sorted.map((item) => item.source_hash));
    return WikiEvidenceClusterSchema.parse({
      id: makeId("wiki-cluster", key),
      cluster_key: key,
      target_path_hint: targetPathForCluster(pageKind, normalizedTitle),
      normalized_title: normalizedTitle,
      page_kind: pageKind,
      scope: sorted[0].scope,
      evidence_ids: sorted.map((item) => item.id).sort(),
      source_refs: sourceRefs,
      source_hashes: sourceHashes,
      source_count: sourceRefs.length,
      signatures: uniq(sorted.flatMap((item) => item.signatures)),
      confidence_hint: Math.min(0.95, 0.72 + Math.min(sourceRefs.length, 4) * 0.05),
      reasons: key.startsWith("sig:") ? [`shared signature ${key.slice(4)}`] : ["normalized title match"],
      conflicts: [],
    });
  });

  return clusters.sort((a, b) => a.cluster_key.localeCompare(b.cluster_key));
}

function pageKindRank(kind: WikiEvidenceCluster["page_kind"]): number {
  if (kind === "known_fix") return 7;
  if (kind === "procedure") return 6;
  if (kind === "pitfall") return 5;
  if (kind === "decision") return 4;
  if (kind === "skill") return 3;
  if (kind === "preference") return 2;
  if (kind === "incident") return 1;
  return 0;
}

function clusterQualityRank(cluster: WikiEvidenceCluster): number {
  const captureTextPenalty = cluster.cluster_key.startsWith("sig:text:capture-") ? 1 : 0;
  return pageKindRank(cluster.page_kind) * 100
    + Math.min(cluster.source_count, 5) * 10
    + cluster.confidence_hint
    - captureTextPenalty;
}

function sortProposalClusters(clusters: WikiEvidenceCluster[]): WikiEvidenceCluster[] {
  return clusters.slice().sort((a, b) => {
    const rankDiff = clusterQualityRank(b) - clusterQualityRank(a);
    if (rankDiff !== 0) return rankDiff;
    return a.cluster_key.localeCompare(b.cluster_key);
  });
}

function titleFromCluster(cluster: WikiEvidenceCluster): string {
  if (cluster.signatures.includes("openclaw:auth-expired")) return "OpenClaw auth expired recovery";
  return cluster.normalized_title;
}

function buildBody(cluster: WikiEvidenceCluster, evidence: WikiEvidenceItem[]): string {
  const title = titleFromCluster(cluster);
  const actions = uniq(evidence.flatMap((item) => item.actions)).slice(0, 5);
  const failed = uniq(evidence.flatMap((item) => item.failed_attempts)).slice(0, 4);
  const verification = uniq(evidence.flatMap((item) => item.verification)).slice(0, 4);
  const lessons = uniq(evidence.flatMap((item) => item.reusable_lessons)).slice(0, 5);
  const problem = evidence.find((item) => item.problem)?.problem ?? evidence[0].summary;

  return [
    `# ${title}`,
    "",
    "## Problem",
    problem,
    "",
    "## Applicability",
    `Use this when evidence matches ${cluster.signatures.join(", ") || cluster.normalized_title}.`,
    "",
    "## Fix",
    ...(actions.length > 0 ? actions.map((action) => `- ${action}`) : ["- Review the provenance and apply the repeated successful action."]),
    "",
    ...(failed.length > 0 ? ["## Failed Attempts", ...failed.map((item) => `- ${item}`), ""] : []),
    "## Verification",
    ...(verification.length > 0 ? verification.map((item) => `- ${item}`) : ["- Re-run the failing workflow and confirm the original symptom is gone."]),
    "",
    "## Reusable Lessons",
    ...(lessons.length > 0 ? lessons.map((item) => `- ${item}`) : ["- Keep this page updated when the same signature appears again."]),
    "",
    "## Provenance",
    ...cluster.source_refs.map((ref, index) => `- ${ref} (${cluster.source_hashes[index] ?? "unknown-hash"})`),
    "",
  ].join("\n");
}

function proposalAction(pageKind: WikiEvidenceCluster["page_kind"]): CuratedWikiProposal["action"] {
  return pageKind === "skill" ? "skill_create" : "create";
}

function synthesizeDegradedProposal(cluster: WikiEvidenceCluster, evidence: WikiEvidenceItem[], now: string): CuratedWikiProposal {
  const title = titleFromCluster(cluster);
  const targetPath = cluster.target_path_hint ?? targetPathForCluster(cluster.page_kind, title);
  const body = buildBody(cluster, evidence);
  const guards = [
    { id: "path", ok: isAllowedWikiPatchPath(targetPath), message: isAllowedWikiPatchPath(targetPath) ? "allowed stable knowledge path" : "unsafe target path" },
    { id: "privacy", ok: !containsPrivateMaterial(body), message: containsPrivateMaterial(body) ? "private material detected" : "no private material detected" },
    { id: "provenance", ok: cluster.source_refs.length > 0 && cluster.source_hashes.length > 0, message: "source provenance present" },
    ...proposalQualityGuards(body, evidence),
  ];
  return CuratedWikiProposalSchema.parse({
    id: makeId("wiki-curated", `${targetPath}:${computeHash(cluster.source_hashes.join("|"))}`),
    protocol_version: PROTOCOL_VERSION,
    type: "wiki_curated_proposal",
    target_path: targetPath,
    action: proposalAction(cluster.page_kind),
    page_kind: cluster.page_kind,
    scope: cluster.scope,
    title,
    summary: evidence[0].summary,
    body_markdown: body,
    source_refs: cluster.source_refs,
    source_hashes: cluster.source_hashes,
    source_count: cluster.source_count,
    evidence_ids: cluster.evidence_ids,
    confidence: cluster.confidence_hint,
    maturity: "draft",
    provenance: cluster.source_refs.map((sourceRef, index) => ({
      source_ref: sourceRef,
      source_hash: cluster.source_hashes[index] ?? cluster.source_hashes[0],
      excerpt: evidence.find((item) => item.source_ref === sourceRef)?.summary,
    })),
    review_hint: {
      why_review: cluster.reasons.join("; "),
      suggested_decision: guards.every((guard) => guard.ok) ? "approve" : "edit",
      risk_notes: guards.filter((guard) => !guard.ok).map((guard) => guard.message),
    },
    guards,
    created_at: now,
  });
}

function parseAiPageKind(value: unknown, fallback: WikiEvidenceCluster["page_kind"]): WikiEvidenceCluster["page_kind"] {
  return typeof value === "string" && ["known_fix", "procedure", "decision", "pitfall", "preference", "incident", "note", "skill"].includes(value)
    ? value as WikiEvidenceCluster["page_kind"]
    : fallback;
}

function proposalQualityGuards(body: string, evidence: WikiEvidenceItem[]): CuratedWikiProposal["guards"] {
  const evidenceText = evidence.map((item) => [item.title, item.summary, ...item.actions, ...item.verification, ...item.reusable_lessons].join("\n")).join("\n");
  const experienceSignal = evidence.some((item) =>
    item.actions.length > 0
    || item.verification.length > 0
    || item.reusable_lessons.length > 0
    || item.outcome === "success"
    || item.signatures.some((signature) => /^openclaw:/.test(signature) && signature !== "openclaw:unknown")
    || item.suggested_wiki_kind === "preference"
    || item.suggested_wiki_kind === "decision"
    || item.suggested_wiki_kind === "pitfall"
    || item.suggested_wiki_kind === "known_fix"
  );
  const actionability = /##\s+(Fix|Steps|Procedure|Decision|Applicability|Reusable Lessons)\b/i.test(body)
    && /\b(use this|when|refresh|retry|run|send|avoid|verify|check|should|must|fix|decision)\b/i.test(body);
  const verificationOrLesson = /##\s+(Verification|Reusable Lessons)\b/i.test(body)
    && /\b(verify|test|passed|fixed|resolved|lesson|remember|prefer|should|must|avoid|run|check|sync|re-run)\b/i.test(body);
  const referenceOnly = /\b(official documentation|official docs|api reference|reference documentation|session initialization metadata|session boot|boot configuration|skill registry|sandbox mode|approval policy)\b/i.test(evidenceText)
    && !hasConcreteExperienceTerms(evidenceText);

  return [
    { id: "experience_signal", ok: experienceSignal, message: experienceSignal ? "durable experience signal present" : "missing durable experience signal" },
    { id: "actionability", ok: actionability, message: actionability ? "agent actionability present" : "missing when-to-use or what-to-do guidance" },
    { id: "verification_or_lesson", ok: verificationOrLesson, message: verificationOrLesson ? "verification or reusable lesson present" : "missing verification or reusable lesson" },
    { id: "not_reference_only", ok: !referenceOnly, message: referenceOnly ? "reference-only or metadata-only evidence" : "not reference-only evidence" },
  ];
}

function proposalFromAiJson(cluster: WikiEvidenceCluster, evidence: WikiEvidenceItem[], json: unknown, now: string): CuratedWikiProposal {
  const record = json && typeof json === "object" ? json as Record<string, unknown> : {};
  const title = typeof record.title === "string" && record.title.trim() ? record.title.trim() : titleFromCluster(cluster);
  const summary = typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : evidence[0]?.summary ?? title;
  const pageKind = parseAiPageKind(record.page_kind, cluster.page_kind);
  const targetPath = typeof record.target_path === "string" && record.target_path.trim()
    ? record.target_path.trim()
    : cluster.target_path_hint ?? targetPathForCluster(pageKind, title);
  const rawBody = typeof record.body_markdown === "string" && record.body_markdown.trim()
    ? record.body_markdown.trim()
    : buildBody(cluster, evidence);
  const body = /^#\s+.+/m.test(rawBody) && /##\s+/.test(rawBody)
    ? rawBody
    : containsPrivateMaterial(rawBody)
      ? rawBody
      : buildBody(cluster, evidence);
  const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence)
    ? Math.max(0, Math.min(1, record.confidence))
    : cluster.confidence_hint;
  const riskNotes = Array.isArray(record.risk_notes)
    ? record.risk_notes.filter((item): item is string => typeof item === "string")
    : [];

  const guards = [
    { id: "path", ok: isAllowedWikiPatchPath(targetPath), message: isAllowedWikiPatchPath(targetPath) ? "allowed stable knowledge path" : "unsafe target path" },
    { id: "privacy", ok: !containsPrivateMaterial(body), message: containsPrivateMaterial(body) ? "private material detected" : "no private material detected" },
    { id: "provenance", ok: cluster.source_refs.length > 0 && cluster.source_hashes.length > 0, message: "source provenance present" },
    { id: "body", ok: /^#\s+.+/m.test(body) && /##\s+/.test(body), message: /^#\s+.+/m.test(body) && /##\s+/.test(body) ? "wiki-shaped body" : "body missing headings" },
    ...proposalQualityGuards(body, evidence),
  ];

  return CuratedWikiProposalSchema.parse({
    id: makeId("wiki-curated", `${targetPath}:${computeHash(cluster.source_hashes.join("|"))}`),
    protocol_version: PROTOCOL_VERSION,
    type: "wiki_curated_proposal",
    target_path: targetPath,
    action: proposalAction(pageKind),
    page_kind: pageKind,
    scope: cluster.scope,
    title,
    summary,
    body_markdown: body,
    source_refs: cluster.source_refs,
    source_hashes: cluster.source_hashes,
    source_count: cluster.source_count,
    evidence_ids: cluster.evidence_ids,
    confidence,
    maturity: "draft",
    provenance: cluster.source_refs.map((sourceRef, index) => ({
      source_ref: sourceRef,
      source_hash: cluster.source_hashes[index] ?? cluster.source_hashes[0],
      excerpt: evidence.find((item) => item.source_ref === sourceRef)?.summary,
    })),
    review_hint: {
      why_review: cluster.reasons.join("; ") || "AI curator synthesized related evidence",
      suggested_decision: guards.every((guard) => guard.ok) ? "approve" : "edit",
      risk_notes: [...riskNotes, ...guards.filter((guard) => !guard.ok).map((guard) => guard.message)],
    },
    guards,
    created_at: now,
  });
}

export async function synthesizeCuratedWikiProposal(
  cluster: WikiEvidenceCluster,
  options: { evidence: WikiEvidenceItem[]; now?: string; client?: AiJsonClient },
): Promise<CuratedProposalResult> {
  const now = options.now ?? new Date().toISOString();
  try {
    let proposal: CuratedWikiProposal;
    if (options.client) {
      const prompt = buildWikiCuratorPrompt(cluster, options.evidence);
      const response = await options.client.generateJson({
        system: prompt.system,
        user: prompt.user,
        schemaName: "CuratedWikiProposalDraft",
        maxOutputBytes: 8192,
      });
      if (!response.ok) return { ok: false, category: "ai_error", error: response.error };
      proposal = proposalFromAiJson(cluster, options.evidence, response.json, now);
    } else {
      proposal = synthesizeDegradedProposal(cluster, options.evidence, now);
    }

    const failedGuard = proposal.guards.find((guard) => !guard.ok);
    if (failedGuard) {
      return {
        ok: false,
        category: failedGuard.id === "privacy" ? "privacy_error" : "guard_error",
        error: failedGuard.message,
      };
    }
    return { ok: true, proposal };
  } catch (error) {
    return {
      ok: false,
      category: "schema_error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function curateWiki(root: string, options: CurateWikiOptions): Promise<WikiCurationReport> {
  const now = options.now ?? new Date().toISOString();
  const aiConfig = await readAiProviderConfig(root);
  const degraded = Boolean(options.degraded);
  if (!degraded && !aiConfig && !options.aiClient) {
    const error = new Error("AI curator is not configured. Run praxisbase ai init or pass --degraded.");
    (error as Error & { code?: string }).code = "AI_CURATOR_NOT_CONFIGURED";
    throw error;
  }
  const aiClient = options.aiClient ?? (!degraded && aiConfig
    ? createOpenAiCompatibleJsonClient({
      config: aiConfig,
      env: options.env,
      fetchImpl: options.fetchImpl,
    })
    : undefined);

  const pool = await buildWikiEvidencePoolFromRoot(root);
  const minSourceCount = options.minSourceCount ?? 1;
  const clusters = clusterWikiEvidence(pool.items);
  const limit = typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit >= 0
    ? options.limit
    : undefined;
  const proposalClusters = sortProposalClusters(clusters.filter((cluster) => cluster.source_count >= minSourceCount));
  const evidenceById = new Map(pool.items.map((item) => [item.id, item]));
  const proposals: CuratedWikiProposal[] = [];
  let conflicts = 0;

  for (const cluster of proposalClusters) {
    if (limit !== undefined && proposals.length >= limit) break;
    const evidence = cluster.evidence_ids.map((id) => evidenceById.get(id)).filter((item): item is WikiEvidenceItem => Boolean(item));
    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now,
      client: aiClient,
    });
    if (result.ok) {
      proposals.push(result.proposal);
    } else {
      conflicts++;
    }
  }

  let written = 0;
  if (options.mode === "review") {
    for (const proposal of proposals) {
      await writeJson(root, `${protocolPaths.inboxProposals}/${proposal.id}.json`, proposal);
      written++;
    }
  }

  const report = WikiCurationReportSchema.parse({
    id: makeId("wiki-curation-report", now),
    protocol_version: PROTOCOL_VERSION,
    type: "wiki_curation_report",
    created_at: now,
    mode: options.mode,
    ai: {
      configured: Boolean(aiConfig || options.aiClient),
      mode: degraded ? "degraded" : "production",
      model: aiConfig?.model,
    },
    input_counts: {
      evidence_items: pool.items.length,
      filtered_noise: pool.filtered_noise,
      human_required: pool.human_required,
      rejected: pool.rejected,
      clusters: clusters.length,
    },
    output_counts: {
      curated_proposals: proposals.length,
      written_proposals: written,
      conflicts,
    },
    proposals: proposals.map((proposal) => ({
      id: proposal.id,
      target_path: proposal.target_path,
      title: proposal.title,
      source_count: proposal.source_count,
      confidence: proposal.confidence,
    })),
    warnings: [
      ...(degraded ? ["AI curator degraded mode is not production-ready."] : []),
      ...(minSourceCount > 1 ? [`min_source_count:${minSourceCount}`] : []),
      ...(typeof options.limit === "number" ? [`limit:${options.limit}`] : []),
    ],
  });
  await writeJson(root, `${REPORTS_WIKI_CURATION}/${report.id}.json`, report);
  return report;
}
