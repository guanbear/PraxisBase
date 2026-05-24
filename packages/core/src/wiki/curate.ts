import { readFile } from "node:fs/promises";
import { join } from "node:path";
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
import { buildWikiCuratorPrompt, type SynthesisContext, type StructuredLink, type MergeCandidate } from "./curator-prompt.js";
import { decideWikiFilter, readWikiFilterRules, type WikiFilterRule } from "./filter-rules.js";
import { assessWikiPromotionQuality } from "./promotion-quality.js";
import {
  CuratedWikiProposalSchema,
  WikiCurationReportSchema,
  WikiEvidenceClusterSchema,
  WikiEvidenceItemSchema,
  WikiObservationSchema,
  type CuratedWikiProposal,
  type WikiCurationReport,
  type WikiEvidenceCluster,
  type WikiEvidenceItem,
  type WikiObservation,
  type WikiPagePlan,
  type WikiPagePlanAction,
} from "./curation-model.js";
import { buildWikiTopics, loadExistingWikiPages, planWikiPages } from "./topic-planner.js";
import { buildWikiRelationshipPlans } from "./relationship-planner.js";

const REPORTS_WIKI_CURATION = ".praxisbase/reports/wiki-curation";

function countPagePlansByAction(plans: WikiPagePlan[]): { create: number; update: number; merge: number; supersede: number; archive: number } {
  const byAction = { create: 0, update: 0, merge: 0, supersede: 0, archive: 0 };
  for (const plan of plans) {
    byAction[plan.action]++;
  }
  return byAction;
}

function countDuplicateSourceHashGroups(plans: WikiPagePlan[]): number {
  return plans.filter((p) => p.action === "merge").length;
}

function zeroFloor(value: number): number {
  return Math.max(0, value);
}

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
  aiTimeoutMs?: number;
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

function hasExplicitUserExperienceMarker(text: string): boolean {
  return /\b(user preference|user asked|user reported|feedback|acceptance test|bug fix|fixed|resolved|workaround|repair loop|delegated work|ack timing)\b|用户|反馈|修复|验证|失败/i.test(text);
}

function isAgentInstructionConfigNoise(text: string): boolean {
  const instructionContext = /\b(base instructions|filesystem sandbox|sandbox mode|sandbox_mode|approval policy|approval_policy|approval policies|collaboration mode|collaboration_mode|tool usage policies|skill registry|personality configuration|frontend design rules|editing constraints|session metadata|system instructions|available skills|file system permissions)\b/i.test(text);
  const agentConfigTopic = /\b(?:codex|agent|session|system).{0,80}\b(?:initialization|configuration|best practices|base instructions|session boot|session environment|session metadata)\b/i.test(text)
    || /\bSystem configuration and base instructions for a Codex CLI agent session\b/i.test(text)
    || /\bN\/A\s*-\s*Initializing agent session environment\b/i.test(text);
  return agentConfigTopic
    && instructionContext
    && !hasExplicitUserExperienceMarker(text);
}

function isOperationalNoiseSource(source: WikiSource): boolean {
  const bodyText = [source.summary, source.body].filter(Boolean).join("\n").trim();
  const text = textForSource(source);
  const ref = [source.source_ref, source.path].filter(Boolean).join("\n");
  if (!text) return true;
  if (isAgentInstructionConfigNoise(text)) return true;
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

function normalizeEvidenceText(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\[score=[^\]]+\]/gi, " ")
    .replace(/##\s+Promoted From Short-Term Memory\s*\([^)]+\)/gi, "\n")
    .replace(/\s+-\s+-\s+/g, "\n")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function cleanEvidenceLine(line: string): string {
  return line
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^Summary:\s*/i, "")
    .replace(/\[score=[^\]]+\]/gi, "")
    .trim();
}

function readableTitleCandidate(text: string): string | undefined {
  const firstLine = cleanEvidenceLine(text).split(/\r?\n/)[0]?.trim();
  if (!firstLine || looksMachineGeneratedTitle(firstLine) || /^(Suggested Wiki Kind|Confidence):\s*/i.test(firstLine)) return undefined;
  const shortened = firstLine
    .replace(/,\s+(?:focusing|specifically|identifying|where|with)\b[\s\S]*$/i, "")
    .replace(/\s+and\s+verified\b[\s\S]*$/i, "")
    .replace(/[.:;,\s]+$/g, "")
    .trim();
  if (shortened.length < 8 || looksMachineGeneratedTitle(shortened)) return undefined;
  return shortened.length <= 96 ? shortened : shortened.slice(0, 96).replace(/\s+\S*$/, "").trim();
}

function readableTitleFromEvidence(evidence: WikiEvidenceItem[]): string | undefined {
  for (const item of evidence) {
    const candidates = [
      item.title,
      item.summary,
      ...item.actions,
      ...item.verification,
      ...item.reusable_lessons,
    ];
    for (const candidate of candidates) {
      const title = readableTitleCandidate(candidate);
      if (title) return title;
    }
  }
  return undefined;
}

function sentences(text: string): string[] {
  return normalizeEvidenceText(text)
    .split(/(?:\r?\n|[.;]\s+)/)
    .map(cleanEvidenceLine)
    .filter((part) => !/^(Suggested Wiki Kind|Confidence):\s*/i.test(part))
    .filter((part) => part.length > 0);
}

function cleanEvidenceSummary(summary: string): string {
  const normalized = normalizeEvidenceText(summary);
  const explicitSummary = normalized.match(/(?:^|\n)Summary:\s*([\s\S]*?)(?=\n#{1,6}\s+|\n(?:Suggested Wiki Kind|Confidence):|$)/i)?.[1];
  const source = explicitSummary?.trim() ? explicitSummary : normalized;
  const lines = source
    .split(/\r?\n/)
    .map(cleanEvidenceLine)
    .filter((line) => line.length > 0)
    .filter((line) => !/^(Suggested Wiki Kind|Confidence):\s*/i.test(line))
    .filter((line) => !/^#{1,6}\s+/.test(line))
    .filter((line) => line.length > 0);
  return lines.slice(0, 3).join("\n") || normalizeEvidenceText(summary);
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

export function buildWikiEvidencePool(sources: WikiSource[], rules: WikiFilterRule[] = []): WikiEvidencePool {
  const items: WikiEvidenceItem[] = [];
  let filteredNoise = 0;
  let humanRequired = 0;
  let rejected = 0;

  for (const source of sources) {
    const kind = evidenceKindForSource(source);
    if (!kind) continue;
    const filter = decideWikiFilter(source, rules);
    if (filter.action === "exclude") {
      filteredNoise++;
      continue;
    }
    if (filter.action === "human_required") {
      humanRequired++;
      continue;
    }
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
    if (filter.action !== "include" && !hasUsefulExperienceSignal({
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
      summary: cleanEvidenceSummary(source.summary || source.title),
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
  return buildWikiEvidencePool(await collectWikiSources(root), await readWikiFilterRules(root));
}

const IGNORED_OBSERVATION_SIG_PREFIX = /^(capture|native_memory|episode|external_ref|proposal|review|skill|text):/;

function observationKindFromSuggested(suggested: WikiEvidenceItem["suggested_wiki_kind"]): WikiObservation["kind"] {
  if (suggested === "known_fix") return "fix";
  if (suggested === "skill") return "procedure";
  if (suggested === "procedure") return "procedure";
  if (suggested === "decision") return "decision";
  if (suggested === "pitfall") return "pitfall";
  if (suggested === "preference") return "preference";
  if (suggested === "incident") return "incident";
  if (suggested === "note") return "note";
  return "note";
}

function extractTopicsFromSignatures(signatures: string[]): string[] {
  return signatures.filter((sig) => !IGNORED_OBSERVATION_SIG_PREFIX.test(sig));
}

function extractEntitiesFromEvidence(signatures: string[], item: WikiEvidenceItem): string[] {
  const entities = new Set<string>();
  for (const sig of signatures) {
    if (!IGNORED_OBSERVATION_SIG_PREFIX.test(sig)) {
      const colonIndex = sig.indexOf(":");
      if (colonIndex > 0) {
        entities.add(sig.slice(0, colonIndex).toLowerCase());
      }
    }
  }
  const text = [item.title, item.summary, ...item.actions, ...item.verification, ...item.reusable_lessons].join(" ");
  if (/\bopenclaw\b/i.test(text)) entities.add("openclaw");
  if (/\bcodex\b/i.test(text)) entities.add("codex");
  if (/\back\b/i.test(text)) entities.add("ack");
  if (/\bstdin\b/i.test(text)) entities.add("stdin");
  if (/\bdelegat(?:ion|ed|ing)\b/i.test(text)) entities.add("delegation");
  return Array.from(entities).sort();
}

function computeObservationConfidence(item: WikiEvidenceItem): number {
  let confidence = 0.5;
  if (item.outcome === "success") confidence += 0.15;
  if (item.verification.length > 0) confidence += 0.15;
  if (item.reusable_lessons.length > 0) confidence += 0.1;
  return Math.min(1, Math.max(0, confidence));
}

export function buildWikiObservationsFromEvidence(items: WikiEvidenceItem[]): WikiObservation[] {
  return items.map((item) => {
    const topics = extractTopicsFromSignatures(item.signatures);
    const entities = extractEntitiesFromEvidence(item.signatures, item);
    const confidence = computeObservationConfidence(item);
    return WikiObservationSchema.parse({
      id: makeId("wiki-obs", item.id),
      evidence_id: item.id,
      source_ref: item.source_ref,
      source_hash: item.source_hash,
      agent: item.agent,
      scope: item.scope,
      kind: observationKindFromSuggested(item.suggested_wiki_kind),
      problem: item.problem ?? item.summary,
      action: item.actions[0],
      outcome: item.outcome,
      verification: item.verification[0],
      reusable_lesson: item.reusable_lessons[0],
      entities,
      topics,
      raw_excerpt: item.summary,
      confidence,
      privacy_verdict: item.privacy_verdict,
      filtered_out: false,
      created_at: item.created_at,
    });
  });
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

function titleForPagePlan(topic: { title: string }, evidence: WikiEvidenceItem[]): string {
  const signatures = evidence.flatMap((item) => item.signatures);
  if (signatures.includes("openclaw:auth-expired")) return "OpenClaw auth expired";
  return topic.title;
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

function buildBody(cluster: WikiEvidenceCluster, evidence: WikiEvidenceItem[], titleOverride?: string): string {
  const title = titleOverride ?? titleFromCluster(cluster);
  const actions = uniq(evidence.flatMap((item) => item.actions)).slice(0, 5);
  const failed = uniq(evidence.flatMap((item) => item.failed_attempts)).slice(0, 4);
  const verification = uniq(evidence.flatMap((item) => item.verification)).slice(0, 4);
  const lessons = uniq(evidence.flatMap((item) => item.reusable_lessons)).slice(0, 5);
  const summaryLines = evidence.flatMap((item) => (item.problem ?? item.summary).split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const problem = summaryLines.find((line) => /\b(failed|failure|error|slow|reported|missing|timeout|stuck)\b|反馈|没有|不能|失败|超时|慢/i.test(line))
    ?? summaryLines[0]
    ?? evidence[0].title;

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

function proposalAction(pageKind: WikiEvidenceCluster["page_kind"], planAction?: WikiPagePlanAction): CuratedWikiProposal["action"] {
  if (planAction === "update") return pageKind === "skill" ? "skill_update" : "update";
  if (planAction === "merge") return "update";
  if (planAction === "supersede") return "supersede";
  if (planAction === "archive") return "archive";
  return pageKind === "skill" ? "skill_create" : "create";
}

function synthesizeDegradedProposal(cluster: WikiEvidenceCluster, evidence: WikiEvidenceItem[], now: string, planAction?: WikiPagePlanAction): CuratedWikiProposal {
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
    action: proposalAction(cluster.page_kind, planAction),
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

function extractH1(body: string): string | undefined {
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function looksMachineGeneratedTitle(title: string | undefined): boolean {
  if (!title) return true;
  return /\bsha256\b/i.test(title)
    || /^wiki[-_]capture[-_]/i.test(title)
    || /^capture[-_]/i.test(title)
    || /^[a-f0-9]{16,}$/i.test(title);
}

function looksMachineGeneratedPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const slug = normalized.endsWith("/SKILL.md")
    ? normalized.split("/").slice(-2, -1)[0]
    : normalized.split("/").pop()?.replace(/\.md$/i, "");
  return looksMachineGeneratedTitle(slug);
}

function hasDuplicateCoreHeading(body: string): boolean {
  const counts = new Map<string, number>();
  for (const match of body.matchAll(/^##\s+(.+)$/gm)) {
    const normalized = match[1].trim().toLowerCase();
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return ["problem", "verification", "reusable lessons", "provenance", "sources"].some((heading) => (counts.get(heading) ?? 0) > 1);
}

function hasDuplicateH1(body: string): boolean {
  return (body.match(/^#\s+.+$/gm) ?? []).length > 1;
}

function containsCurationMetadata(body: string): boolean {
  return /^(Suggested Wiki Kind|Confidence|Summary):\s*/im.test(body);
}

function isAcceptableAiBody(body: string): boolean {
  return /^#\s+.+/m.test(body)
    && /##\s+/.test(body)
    && !looksMachineGeneratedTitle(extractH1(body))
    && !hasDuplicateH1(body)
    && !hasDuplicateCoreHeading(body)
    && !containsCurationMetadata(body);
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

function proposalFromAiJson(cluster: WikiEvidenceCluster, evidence: WikiEvidenceItem[], json: unknown, now: string, planAction?: WikiPagePlanAction): CuratedWikiProposal {
  const record = json && typeof json === "object" ? json as Record<string, unknown> : {};
  const rawBody = typeof record.body_markdown === "string" && record.body_markdown.trim()
    ? record.body_markdown.trim()
    : buildBody(cluster, evidence);
  const aiTitle = typeof record.title === "string" && record.title.trim() ? record.title.trim() : undefined;
  const bodyTitle = extractH1(rawBody);
  const evidenceTitle = readableTitleFromEvidence(evidence);
  const clusterTitle = titleFromCluster(cluster);
  const title = !looksMachineGeneratedTitle(aiTitle)
    ? aiTitle as string
    : !looksMachineGeneratedTitle(bodyTitle)
      ? bodyTitle as string
      : evidenceTitle ?? (!looksMachineGeneratedTitle(clusterTitle) ? clusterTitle : "Unclear wiki candidate");
  const summary = typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : evidence[0]?.summary ?? title;
  const pageKind = parseAiPageKind(record.page_kind, cluster.page_kind);
  const aiTargetPath = typeof record.target_path === "string" && record.target_path.trim()
    ? record.target_path.trim()
    : undefined;
  const hintedTargetPath = cluster.target_path_hint && !looksMachineGeneratedPath(cluster.target_path_hint)
    ? cluster.target_path_hint
    : undefined;
  const targetPath = planAction === "update" && hintedTargetPath
    ? hintedTargetPath
    : aiTargetPath && !isAllowedWikiPatchPath(aiTargetPath)
    ? aiTargetPath
    : aiTargetPath && !looksMachineGeneratedPath(aiTargetPath)
      ? aiTargetPath
      : hintedTargetPath ?? targetPathForCluster(pageKind, title);
  const body = isAcceptableAiBody(rawBody)
    ? rawBody
    : containsPrivateMaterial(rawBody)
      ? rawBody
      : buildBody(cluster, evidence, title);
  const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence)
    ? Math.max(0, Math.min(1, record.confidence))
    : cluster.confidence_hint;
  const riskNotes = Array.isArray(record.risk_notes)
    ? record.risk_notes.filter((item): item is string => typeof item === "string")
    : [];

  const guards = [
    { id: "path", ok: isAllowedWikiPatchPath(targetPath), message: isAllowedWikiPatchPath(targetPath) ? "allowed stable knowledge path" : "unsafe target path" },
    { id: "title", ok: !looksMachineGeneratedTitle(title) && title !== "Unclear wiki candidate", message: !looksMachineGeneratedTitle(title) && title !== "Unclear wiki candidate" ? "readable title" : "machine-generated title" },
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
    action: proposalAction(pageKind, planAction),
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
  options: { evidence: WikiEvidenceItem[]; now?: string; client?: AiJsonClient; synthesisContext?: SynthesisContext; planAction?: WikiPagePlanAction },
): Promise<CuratedProposalResult> {
  const now = options.now ?? new Date().toISOString();
  const planAction = options.planAction ?? options.synthesisContext?.pagePlanAction;
  try {
    let proposal: CuratedWikiProposal;
    if (options.client) {
      const prompt = buildWikiCuratorPrompt(cluster, options.evidence, options.synthesisContext);
      const response = await options.client.generateJson({
        system: prompt.system,
        user: prompt.user,
        schemaName: "CuratedWikiProposalDraft",
        maxOutputBytes: 8192,
      });
      if (!response.ok) return { ok: false, category: "ai_error", error: response.error };
      proposal = proposalFromAiJson(cluster, options.evidence, response.json, now, planAction);
    } else {
      proposal = synthesizeDegradedProposal(cluster, options.evidence, now, planAction);
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
  const runtimeAiConfig = aiConfig && typeof options.aiTimeoutMs === "number" && Number.isFinite(options.aiTimeoutMs) && options.aiTimeoutMs > 0
    ? { ...aiConfig, ai_timeout_ms: options.aiTimeoutMs }
    : aiConfig;
  const curationAiConfig = runtimeAiConfig
    ? { ...runtimeAiConfig, model: runtimeAiConfig.curation_model ?? runtimeAiConfig.model }
    : undefined;
  const aiClient = options.aiClient ?? (!degraded && runtimeAiConfig
    ? createOpenAiCompatibleJsonClient({
      config: curationAiConfig!,
      env: options.env,
      fetchImpl: options.fetchImpl,
    })
    : undefined);

  const pool = await buildWikiEvidencePoolFromRoot(root);
  const minSourceCount = options.minSourceCount ?? 1;

  const observations = buildWikiObservationsFromEvidence(pool.items);
  const topics = buildWikiTopics(observations);
  const existingPages = await loadExistingWikiPages(root);
  const relationshipPlans = buildWikiRelationshipPlans({ topics, existingPages });
  const pagePlans = planWikiPages(topics, existingPages, { relationships: relationshipPlans });
  const pagePlansByAction = countPagePlansByAction(pagePlans);
  const duplicateSourceHashGroups = countDuplicateSourceHashGroups(pagePlans);
  const topicsWithRelationships = new Set(relationshipPlans.map((plan) => plan.topic_id));
  const relationshipCounts = {
    required_links: pagePlans.reduce((sum, plan) => sum + plan.required_links.length, 0),
    suggested_links: pagePlans.reduce((sum, plan) => sum + plan.related_paths.length, 0),
    merge_plans: pagePlans.filter((plan) => plan.action === "merge").length,
    ambiguous_merge_targets: pagePlans.filter((plan) => plan.reasons.includes("ambiguous_merge_target")).length,
    isolated_topics: zeroFloor(topics.length - topicsWithRelationships.size),
    orphan_risk_after_plan: zeroFloor(topics.length - topicsWithRelationships.size),
  };

  const limit = typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit >= 0
    ? options.limit
    : undefined;
  const topicByKey = new Map(topics.map((topic) => [topic.topic_key, topic]));
  const observationById = new Map(observations.map((observation) => [observation.id, observation]));
  const evidenceById = new Map(pool.items.map((item) => [item.id, item]));
  const sortedPlans = pagePlans.slice().sort((a, b) => a.topic_key.localeCompare(b.topic_key));
  const synthesizedProposals: CuratedWikiProposal[] = [];
  let conflicts = 0;

  for (const plan of sortedPlans) {
    if (limit !== undefined && synthesizedProposals.length >= limit) break;

    const topic = topicByKey.get(plan.topic_key);
    if (!topic) continue;

    const planObservations = topic.observation_ids
      .map((id) => observationById.get(id))
      .filter((observation): observation is WikiObservation => Boolean(observation));
    const planEvidence = planObservations
      .map((observation) => evidenceById.get(observation.evidence_id))
      .filter((item): item is WikiEvidenceItem => Boolean(item));

    if (topic.source_count < minSourceCount) continue;

    const canonicalTitle = titleForPagePlan(topic, planEvidence);
    const plannedTargetPath = (plan.action === "update" || plan.action === "merge") && plan.existing_path
      ? plan.existing_path
      : targetPathForCluster(topic.page_kind, canonicalTitle);

    const topicRelPlans = relationshipPlans.filter((rp) => rp.topic_id === topic.id);
    const structuredRequiredLinks: StructuredLink[] = topicRelPlans
      .filter((rp) => plan.required_links.includes(rp.target_slug))
      .map((rp) => ({ slug: rp.target_slug, label: rp.suggested_label, path: rp.target_path, reason: rp.reasons.join(", ") }));
    const structuredSuggestedLinks: StructuredLink[] = topicRelPlans
      .filter((rp) => plan.related_paths.includes(rp.target_path))
      .map((rp) => ({ slug: rp.target_slug, label: rp.suggested_label, path: rp.target_path, reason: rp.reasons.join(", ") }));
    const mergeCandidates: MergeCandidate[] = topicRelPlans
      .filter((rp) => rp.merge_candidate)
      .map((rp) => ({ title: rp.target_title, path: rp.target_path, reason: rp.reasons.join(", ") }));
    const relatedPages = topicRelPlans.map((rp) => ({
      slug: rp.target_slug,
      path: rp.target_path,
      title: rp.target_title,
    }));
    const allRelationshipReasons = topicRelPlans.flatMap((rp) => rp.reasons);
    const uniqueRelationshipReasons = Array.from(new Set(allRelationshipReasons)).sort();

    const synthesisContext: SynthesisContext = {
      topicTitle: canonicalTitle,
      pageKind: topic.page_kind,
      observations: planObservations.map((observation) => ({
        summary: [
          observation.problem,
          observation.action ? `Action: ${observation.action}` : undefined,
          observation.verification ? `Verification: ${observation.verification}` : undefined,
          observation.reusable_lesson ? `Lesson: ${observation.reusable_lesson}` : undefined,
        ].filter(Boolean).join(" "),
        raw_excerpt: observation.raw_excerpt,
      })),
      relatedPages: (plan.related_paths ?? []).map((path) => ({ title: path, path })),
      requiredLinks: structuredRequiredLinks.length > 0
        ? structuredRequiredLinks
        : plan.required_links ?? [],
      suggestedLinks: structuredSuggestedLinks.length > 0 ? structuredSuggestedLinks : undefined,
      mergeCandidates: mergeCandidates.length > 0 ? mergeCandidates : undefined,
      relationshipReasons: uniqueRelationshipReasons.length > 0 ? uniqueRelationshipReasons : undefined,
      pagePlanAction: plan.action,
    };

    if ((plan.action === "update" || plan.action === "merge") && plan.existing_path) {
      try {
        synthesisContext.existingPageContent = await readFile(join(root, plan.existing_path), "utf-8");
      } catch {
        // Existing page may have moved or been deleted between planning and synthesis.
      }
    }

    const cluster = WikiEvidenceClusterSchema.parse({
      id: makeId("wiki-cluster", plan.topic_key),
      cluster_key: plan.topic_key,
      target_path_hint: plannedTargetPath,
      normalized_title: canonicalTitle,
      page_kind: topic.page_kind,
      scope: topic.scope,
      evidence_ids: planEvidence.map((item) => item.id).sort(),
      source_refs: topic.source_refs,
      source_hashes: topic.source_hashes,
      source_count: topic.source_count,
      signatures: uniq(planEvidence.flatMap((item) => item.signatures)),
      confidence_hint: topic.confidence,
      reasons: plan.reasons,
      conflicts: [],
    });

    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence: planEvidence,
      now,
      client: aiClient,
      synthesisContext,
      planAction: plan.action,
    });
    if (result.ok) {
      synthesizedProposals.push(CuratedWikiProposalSchema.parse({
        ...result.proposal,
        ...(relatedPages.length > 0 ? { related_pages: relatedPages } : {}),
        ...(structuredRequiredLinks.length > 0 ? { required_links: structuredRequiredLinks } : {}),
        ...(structuredSuggestedLinks.length > 0 ? { suggested_links: structuredSuggestedLinks } : {}),
        ...(mergeCandidates.length > 0 ? { merge_candidates: mergeCandidates } : {}),
        ...(uniqueRelationshipReasons.length > 0 ? { relationship_reasons: uniqueRelationshipReasons } : {}),
      }));
    } else {
      conflicts++;
    }
  }

  let qualityHardBlockCount = 0;
  let qualityHumanRequiredCount = 0;
  const proposals: CuratedWikiProposal[] = [];
  for (const proposal of synthesizedProposals) {
    const planForTarget = pagePlans.find((plan) =>
      plan.target_path === proposal.target_path || plan.existing_path === proposal.target_path,
    );
    const assessment = assessWikiPromotionQuality(proposal, {
      otherProposals: synthesizedProposals,
      existingPageFound: Boolean(
        (proposal.action === "create" || proposal.action === "skill_create")
        && planForTarget
        && planForTarget.action !== "create",
      ),
      relatedPaths: planForTarget?.related_paths ?? [],
      relatedPages: proposal.related_pages,
      requiredLinks: proposal.required_links,
      mergeCandidates: proposal.merge_candidates,
      relationshipReasons: proposal.relationship_reasons,
      minSourceCount,
    });
    if (assessment.hard_blocks.length > 0) {
      qualityHardBlockCount++;
      continue;
    }
    const riskNotes = [
      ...proposal.review_hint.risk_notes,
      ...assessment.human_required.map((reason) => `quality_human_required:${reason}`),
    ];
    if (assessment.human_required.length > 0) qualityHumanRequiredCount++;
    proposals.push({
      ...proposal,
      review_hint: {
        ...proposal.review_hint,
        risk_notes: riskNotes,
        suggested_decision: assessment.human_required.length > 0 ? "edit" : proposal.review_hint.suggested_decision,
      },
    });
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
      model: curationAiConfig?.model ?? aiConfig?.model,
    },
    input_counts: {
      evidence_items: pool.items.length,
      filtered_noise: pool.filtered_noise,
      human_required: pool.human_required,
      rejected: pool.rejected,
      clusters: topics.length,
    },
    output_counts: {
      curated_proposals: proposals.length,
      written_proposals: written,
      conflicts,
    },
    compiler_counts: {
      observations: observations.length,
      topics: topics.length,
      page_plans_by_action: pagePlansByAction,
      duplicate_source_hash_groups: duplicateSourceHashGroups,
      hard_blocks: qualityHardBlockCount,
      human_required_quality: qualityHumanRequiredCount,
      relationship_counts: relationshipCounts,
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
