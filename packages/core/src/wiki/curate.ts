import { readFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { makeId, computeHash, slugifyId } from "../protocol/id.js";
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
import { replaceBodyProvenanceSection } from "./provenance-consistency.js";
import { hasAgentUseGuidance, renderAgentUseSection, replaceOrInsertAgentUseSection } from "./agent-use.js";
import {
  CuratedWikiProposalSchema,
  WikiCurationReportSchema,
  WikiEvidenceClusterSchema,
  WikiEvidenceItemSchema,
  WikiObservationSchema,
  WikiSourceSummarySchema,
  type CuratedWikiProposal,
  type WikiCurationReport,
  type WikiEvidenceCluster,
  type WikiEvidenceItem,
  type WikiObservation,
  type WikiPagePlan,
  type WikiPagePlanAction,
  type WikiTopic,
} from "./curation-model.js";
import { buildWikiTopics, loadExistingWikiPages, planWikiPages } from "./topic-planner.js";
import { buildWikiRelationshipPlans, type WikiRelationshipPlan, type RelationshipWikiPage } from "./relationship-planner.js";
import { reviewWikiCandidateSemanticallyDetailed, type ExistingWikiPageRef, type SemanticWikiReview } from "./semantic-review.js";
import { decideSemanticWikiAction } from "./semantic-review-policy.js";

const REPORTS_WIKI_CURATION = ".praxisbase/reports/wiki-curation";
const REPORTS_WIKI_SOURCE_SUMMARIES = ".praxisbase/reports/wiki-source-summaries";

async function writeWikiSourceSummaries(root: string, input: {
  evidence: WikiEvidenceItem[];
  observations: WikiObservation[];
  topics: WikiTopic[];
  now: string;
}): Promise<void> {
  const observationsByEvidence = new Map<string, WikiObservation[]>();
  for (const obs of input.observations) {
    const bucket = observationsByEvidence.get(obs.evidence_id) ?? [];
    bucket.push(obs);
    observationsByEvidence.set(obs.evidence_id, bucket);
  }
  const topicKeysByObservation = new Map<string, string[]>();
  for (const topic of input.topics) {
    for (const observationId of topic.observation_ids) {
      const bucket = topicKeysByObservation.get(observationId) ?? [];
      bucket.push(topic.topic_key);
      topicKeysByObservation.set(observationId, bucket);
    }
  }

  for (const item of input.evidence) {
    const observationsForItem = observationsByEvidence.get(item.id) ?? [];
    const topicKeys = Array.from(new Set(observationsForItem.flatMap((obs) => topicKeysByObservation.get(obs.id) ?? []))).sort();
    const summaryId = makeId("source-summary", item.id);
    const summary = WikiSourceSummarySchema.parse({
      id: summaryId,
      type: "wiki_source_summary",
      source_id: item.id,
      source_ref: item.source_ref,
      source_hash: item.source_hash,
      source_kind: item.kind,
      scope: item.scope,
      summary: item.summary,
      entities: Array.from(new Set(observationsForItem.flatMap((obs) => obs.entities))).sort(),
      topics: Array.from(new Set(observationsForItem.flatMap((obs) => obs.topics))).sort(),
      observation_ids: observationsForItem.map((obs) => obs.id).sort(),
      topic_keys: topicKeys,
      privacy_verdict: item.privacy_verdict,
      contributed_to_pages: [],
      created_at: input.now,
    });
    await writeJson(root, `${REPORTS_WIKI_SOURCE_SUMMARIES}/${summaryId}.json`, summary);
  }
}

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

function wikiSlugFromTargetPath(path: string, title: string): string {
  const parts = path.split("/");
  const leaf = parts[parts.length - 1] ?? title;
  const withoutExtension = leaf === "SKILL.md"
    ? parts[parts.length - 2] ?? title
    : leaf.replace(/\.md$/i, "");
  return makeWikiSlug(withoutExtension || title);
}

function isLowRiskPlannedPageKind(kind: WikiTopic["page_kind"]): boolean {
  return kind === "known_fix" || kind === "procedure" || kind === "pitfall" || kind === "note";
}

function isLikelyStablePlannedTopic(topic: WikiTopic): boolean {
  return isLowRiskPlannedPageKind(topic.page_kind)
    && topic.source_count >= 2
    && topic.confidence >= 0.82;
}

function plannedRelationshipPages(topics: WikiTopic[], pagePlans: WikiPagePlan[]): RelationshipWikiPage[] {
  const topicByKey = new Map(topics.map((topic) => [topic.topic_key, topic]));
  const pages: RelationshipWikiPage[] = [];
  for (const plan of pagePlans) {
    if (plan.action !== "create") continue;
    const topic = topicByKey.get(plan.topic_key);
    if (!topic) continue;
    if (!isLikelyStablePlannedTopic(topic)) continue;
    pages.push({
      id: topic.id,
      path: plan.target_path,
      title: plan.canonical_title,
      slug: wikiSlugFromTargetPath(plan.target_path, plan.canonical_title),
      page_kind: topic.page_kind,
      scope: topic.scope,
      source_hashes: topic.source_hashes,
      entities: topic.entities,
    });
  }
  return pages;
}

function relationshipsBetweenPlannedPages(topics: WikiTopic[], pagePlans: WikiPagePlan[]): WikiRelationshipPlan[] {
  const createTopicIds = new Set(
    pagePlans
      .filter((plan) => plan.action === "create")
      .map((plan) => topics.find((topic) => topic.topic_key === plan.topic_key && isLikelyStablePlannedTopic(topic))?.id)
      .filter((id): id is string => Boolean(id)),
  );
  if (createTopicIds.size < 2) return [];
  const plannedPages = plannedRelationshipPages(topics, pagePlans);
  return buildWikiRelationshipPlans({
    topics: topics.filter((topic) => createTopicIds.has(topic.id)),
    existingPages: plannedPages,
  }).filter((plan) =>
    plan.topic_id !== plan.target_page_id
    && createTopicIds.has(plan.topic_id)
    && createTopicIds.has(plan.target_page_id),
  );
}

function addRelationshipLinksToPagePlans(pagePlans: WikiPagePlan[], topics: WikiTopic[], relationships: WikiRelationshipPlan[]): WikiPagePlan[] {
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const relsByTopicKey = new Map<string, WikiRelationshipPlan[]>();
  for (const rel of relationships) {
    const topic = topicById.get(rel.topic_id);
    if (!topic) continue;
    const bucket = relsByTopicKey.get(topic.topic_key) ?? [];
    bucket.push(rel);
    relsByTopicKey.set(topic.topic_key, bucket);
  }

  return pagePlans.map((plan) => {
    const rels = relsByTopicKey.get(plan.topic_key) ?? [];
    if (rels.length === 0) return plan;
    return {
      ...plan,
      required_links: uniq([
        ...plan.required_links,
        ...rels.filter((rel) => rel.required_link).map((rel) => rel.target_slug),
      ]),
      related_paths: uniq([
        ...plan.related_paths,
        ...rels.filter((rel) => !rel.required_link && rel.strength === "related").map((rel) => rel.target_path),
      ]),
    };
  });
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
  concurrency?: number;
  aiClient?: AiJsonClient;
  semanticReview?: {
    enabled?: boolean;
    client?: AiJsonClient;
    maxOutputBytes?: number;
  };
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  aiTimeoutMs?: number;
  onProgress?: (progress: WikiCurationProgress) => void | Promise<void>;
}

export type CuratedProposalResult =
  | { ok: true; proposal: CuratedWikiProposal }
  | { ok: false; category: "ai_error" | "schema_error" | "guard_error" | "privacy_error"; error: string };

export interface WikiCurationProgress {
  stage: "synthesis";
  completed: number;
  total: number;
  proposals: number;
  conflicts: number;
  topic_key: string;
}

function normalizeConcurrency(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(16, Math.floor(value)));
}

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
    if (!kind) {
      if (source.kind === "stable_kb" || source.kind === "skill") filteredNoise++;
      continue;
    }
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
  const text = evidence.map((item) => [item.title, item.summary, ...item.actions, ...item.verification, ...item.reusable_lessons].join(" ")).join(" ");
  if (/\bopenclaw\b/i.test(text) && /\bauth\b/i.test(text) && /\brefresh\b/i.test(text)) {
    return "OpenClaw auth refresh repair";
  }
  if (/\bopenclaw\b/i.test(text) && /\back\b/i.test(text) && /\b(timing|silent|dispatch|long)\b/i.test(text)) {
    return "ACK timing before long-running agent work";
  }
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
  const symptom = summaryLines.find((line) => /\b(failed|failure|error|slow|reported|missing|timeout|stuck)\b|反馈|没有|不能|失败|超时|慢/i.test(line))
    ?? summaryLines[0]
    ?? evidence[0].title;
  const whenToUse = summaryLines
    .find((line) => /\b(fail|failure|error|timeout|stuck|slow|expired|missing|silent|change|restart|auth|login|sync|dispatch|配置|失败|超时|重启|认证|登录)\b/i.test(line))
    ?? symptom
    ?? title;

  return [
    `# ${title}`,
    "",
    "## When to Use",
    `Use this when ${whenToUse.replace(/[.。]\s*$/, "")}.`,
    "",
    "## Symptoms",
    symptom,
    "",
    "## What To Do",
    ...(actions.length > 0 ? actions.map((action) => `- ${action}`) : ["- Review the provenance and apply the repeated successful action."]),
    "",
    ...(failed.length > 0 ? ["## Failed Attempts", ...failed.map((item) => `- ${item}`), ""] : []),
    "## Verify",
    ...(verification.length > 0 ? verification.map((item) => `- ${item}`) : ["- Re-run the failing workflow and confirm the original symptom is gone."]),
    "",
    "## Reusable Lessons",
    ...(lessons.length > 0 ? lessons.map((item) => `- ${item}`) : ["- Keep this page updated when the same signature appears again."]),
    "",
    renderAgentUseSection({
      title,
      whenToUse,
      actions,
      verification,
    }),
    "",
    "## Provenance",
    ...cluster.source_refs.map((ref, index) => `- ${ref} (${cluster.source_hashes[index] ?? "unknown-hash"})`),
    "",
  ].join("\n");
}

function normalizeStructuredLink(link: string | StructuredLink): StructuredLink {
  if (typeof link === "object") return link;
  const slug = link.split("/").pop()?.replace(/\.md$/i, "") ?? link;
  return { slug, label: slug, path: link, reason: "required_link" };
}

function extractBodyWikilinkSlugs(body: string): Set<string> {
  const slugs = new Set<string>();
  for (const match of body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
    slugs.add(match[1].trim().toLowerCase());
  }
  return slugs;
}

function stripDisallowedWikilinks(body: string, disallowedSlugs: Set<string>): string {
  if (disallowedSlugs.size === 0) return body;
  const lines = body.split(/\r?\n/);
  const output: string[] = [];
  let sectionHeading: string | undefined;
  let sectionLines: string[] = [];

  const flushRelatedSection = () => {
    if (!sectionHeading) return;
    const kept = sectionLines.filter((line) => {
      const slugs = Array.from(line.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g))
        .map((match) => match[1].trim().toLowerCase());
      return slugs.length === 0 || slugs.some((slug) => !disallowedSlugs.has(slug));
    });
    if (kept.some((line) => /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.test(line))) {
      output.push(sectionHeading, ...kept);
    }
    sectionHeading = undefined;
    sectionLines = [];
  };

  for (const line of lines) {
    if (/^##\s+Related Wiki Pages\b/i.test(line)) {
      flushRelatedSection();
      sectionHeading = line;
      sectionLines = [];
      continue;
    }
    if (sectionHeading && /^##\s+/.test(line)) {
      flushRelatedSection();
      output.push(line);
      continue;
    }
    if (sectionHeading) {
      sectionLines.push(line);
      continue;
    }
    output.push(line);
  }
  flushRelatedSection();

  return output.join("\n").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, rawSlug: string, rawLabel?: string) => {
    const slug = rawSlug.trim().toLowerCase();
    if (!disallowedSlugs.has(slug)) return match;
    return (rawLabel ?? rawSlug).trim();
  });
}

function relationshipLinksFromContext(context: SynthesisContext | undefined, includeSuggested: boolean): StructuredLink[] {
  if (!context) return [];
  const bodyLinks = new Map<string, StructuredLink>();
  for (const link of context.requiredLinks.map(normalizeStructuredLink)) {
    bodyLinks.set(link.slug.toLowerCase(), link);
  }
  if (includeSuggested) {
    for (const link of (context.suggestedLinks ?? []).slice(0, 3)) {
      bodyLinks.set(link.slug.toLowerCase(), link);
    }
  }
  return Array.from(bodyLinks.values());
}

function ensureRelatedLinksSection(body: string, context?: SynthesisContext): string {
  const existingSlugs = extractBodyWikilinkSlugs(body);
  const suppliedSuggested = (context?.suggestedLinks ?? []).map(normalizeStructuredLink);
  const hasContextLink = [
    ...(context?.requiredLinks ?? []).map(normalizeStructuredLink),
    ...suppliedSuggested,
  ].some((link) => existingSlugs.has(link.slug.toLowerCase()));
  const contextLinks = relationshipLinksFromContext(context, existingSlugs.size === 0 || !hasContextLink);
  if (contextLinks.length === 0) return body;
  const missing = contextLinks.filter((link) => !existingSlugs.has(link.slug.toLowerCase()));
  if (missing.length === 0) return body;
  const relatedLines = [
    "",
    "## Related Wiki Pages",
    ...missing.map((link) => `- [[${link.slug}|${link.label}]] - ${link.reason}`),
  ];
  return `${body.replace(/\s+$/, "")}\n${relatedLines.join("\n")}\n`;
}

function ensureProvenanceSection(body: string, cluster: WikiEvidenceCluster): string {
  return replaceBodyProvenanceSection(
    body,
    cluster.source_refs.map((ref, index) => ({
      uri: ref,
      hash: cluster.source_hashes[index] ?? "unknown-hash",
    })),
  );
}

function ensureReusableLessonsSection(body: string, evidence: WikiEvidenceItem[]): string {
  if (/^##\s+Reusable Lessons\b/im.test(body)) return body;
  const lessons = uniq(evidence.flatMap((item) => item.reusable_lessons)).slice(0, 5);
  if (lessons.length === 0) {
    const actions = uniq(evidence.flatMap((item) => item.actions)).slice(0, 3);
    lessons.push(...actions.map((action) => `When the same symptom recurs, ${action}.`));
  }
  if (lessons.length === 0) return body;
  const lines = [
    "",
    "## Reusable Lessons",
    ...lessons.map((lesson) => `- ${lesson}`),
  ];
  return `${body.replace(/\s+$/, "")}\n${lines.join("\n")}\n`;
}

function ensureAgentUseSection(body: string, cluster: WikiEvidenceCluster, evidence: WikiEvidenceItem[]): string {
  if (hasAgentUseGuidance(body)) return body;
  const actions = uniq(evidence.flatMap((item) => item.actions)).slice(0, 5);
  const verification = uniq(evidence.flatMap((item) => item.verification)).slice(0, 4);
  const summaryLines = evidence.flatMap((item) => (item.problem ?? item.summary).split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const whenToUse = summaryLines
    .find((line) => /\b(fail|failure|error|timeout|stuck|slow|expired|missing|silent|change|restart|auth|login|sync|dispatch|配置|失败|超时|重启|认证|登录)\b/i.test(line))
    ?? summaryLines[0]
    ?? cluster.normalized_title;
  const section = renderAgentUseSection({
    title: titleFromCluster(cluster),
    whenToUse,
    actions,
    verification,
  });
  return replaceOrInsertAgentUseSection(body, section);
}

function normalizeMarkdownBulletArtifacts(body: string): string {
  const lines = body.split("\n");
  let inCodeBlock = false;
  return lines.map((line) => {
    if (/^\s*```/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    if (inCodeBlock) return line;
    return line.replace(/^(\s*)n([*+-]\s{2,})/, "$1$2");
  }).join("\n");
}

function repairWikiBody(body: string, cluster: WikiEvidenceCluster, evidence: WikiEvidenceItem[], context?: SynthesisContext): string {
  if (containsPrivateMaterial(body)) return body;
  const normalizedBody = normalizeMarkdownBulletArtifacts(body);
  return ensureProvenanceSection(
    ensureAgentUseSection(
      ensureReusableLessonsSection(
        ensureRelatedLinksSection(normalizedBody, context),
        evidence,
      ),
      cluster,
      evidence,
    ),
    cluster,
  );
}

function proposalAction(pageKind: WikiEvidenceCluster["page_kind"], planAction?: WikiPagePlanAction): CuratedWikiProposal["action"] {
  if (planAction === "update") return pageKind === "skill" ? "skill_update" : "update";
  if (planAction === "merge") return "update";
  if (planAction === "supersede") return "supersede";
  if (planAction === "archive") return "archive";
  return pageKind === "skill" ? "skill_create" : "create";
}

function wikiCuratedProposalId(...parts: string[]): string {
  const material = parts.join(":");
  const digest = computeHash(material).replace(/^sha256:/, "").slice(0, 16);
  const slug = slugifyId(material).slice(0, 96).replace(/-+$/g, "") || "proposal";
  return makeId("wiki-curated", `${slug}-${digest}`);
}

function synthesizeDegradedProposal(cluster: WikiEvidenceCluster, evidence: WikiEvidenceItem[], now: string, planAction?: WikiPagePlanAction, context?: SynthesisContext): CuratedWikiProposal {
  const title = titleFromCluster(cluster);
  const targetPath = cluster.target_path_hint ?? targetPathForCluster(cluster.page_kind, title);
  const body = repairWikiBody(buildBody(cluster, evidence), cluster, evidence, context);
  const guards = [
    { id: "path", ok: isAllowedWikiPatchPath(targetPath), message: isAllowedWikiPatchPath(targetPath) ? "allowed stable knowledge path" : "unsafe target path" },
    { id: "privacy", ok: !containsPrivateMaterial(body), message: containsPrivateMaterial(body) ? "private material detected" : "no private material detected" },
    { id: "provenance", ok: cluster.source_refs.length > 0 && cluster.source_hashes.length > 0, message: "source provenance present" },
    ...proposalQualityGuards(body, evidence),
  ];
  return CuratedWikiProposalSchema.parse({
    id: wikiCuratedProposalId(targetPath, cluster.source_hashes.join("|")),
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
    lifecycle: "active",
    last_confirmed_at: now,
    supersedes: [],
    superseded_by: null,
    relationship_types: [],
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
  const bodyContent = body.replace(/^#{1,6}\s+.+$/gm, " ");
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
  const actionability = /##\s+(Fix|Steps|Procedure|Decision|Operating Rule|Applicability|When to Use|What To Do|Reusable Lessons)\b/i.test(body)
    && /\b(use this|when|refresh|retry|run|send|avoid|verify|check|should|must|fix|decision)\b/i.test(bodyContent);
  const verificationOrLesson = /##\s+(Verification|Verify|Reusable Lessons)\b/i.test(body)
    && /\b(verify|test|passed|fixed|resolved|lesson|remember|prefer|should|must|avoid|run|check|sync|re-run)\b/i.test(bodyContent);
  const referenceOnly = /\b(official documentation|official docs|api reference|reference documentation|session initialization metadata|session boot|boot configuration|skill registry|sandbox mode|approval policy)\b/i.test(evidenceText)
    && !hasConcreteExperienceTerms(evidenceText);

  return [
    { id: "experience_signal", ok: experienceSignal, message: experienceSignal ? "durable experience signal present" : "missing durable experience signal" },
    { id: "actionability", ok: actionability, message: actionability ? "agent actionability present" : "missing when-to-use or what-to-do guidance" },
    { id: "verification_or_lesson", ok: verificationOrLesson, message: verificationOrLesson ? "verification or reusable lesson present" : "missing verification or reusable lesson" },
    { id: "not_reference_only", ok: !referenceOnly, message: referenceOnly ? "reference-only or metadata-only evidence" : "not reference-only evidence" },
  ];
}

function proposalFromAiJson(cluster: WikiEvidenceCluster, evidence: WikiEvidenceItem[], json: unknown, now: string, planAction?: WikiPagePlanAction, context?: SynthesisContext): CuratedWikiProposal {
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
  const bodyBeforeRepair = isAcceptableAiBody(rawBody)
    ? rawBody
    : containsPrivateMaterial(rawBody)
      ? rawBody
      : buildBody(cluster, evidence, title);
  const body = repairWikiBody(bodyBeforeRepair, cluster, evidence, context);
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
    id: wikiCuratedProposalId(targetPath, cluster.source_hashes.join("|")),
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
    lifecycle: "active",
    last_confirmed_at: now,
    supersedes: [],
    superseded_by: null,
    relationship_types: [],
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
      proposal = proposalFromAiJson(cluster, options.evidence, response.json, now, planAction, options.synthesisContext);
    } else {
      proposal = synthesizeDegradedProposal(cluster, options.evidence, now, planAction, options.synthesisContext);
    }

    let failedGuard = proposal.guards.find((guard) => !guard.ok);
    if (failedGuard && failedGuard.id !== "privacy" && failedGuard.id !== "path") {
      const fallback = synthesizeDegradedProposal(cluster, options.evidence, now, planAction, options.synthesisContext);
      const fallbackFailedGuard = fallback.guards.find((guard) => !guard.ok);
      if (!fallbackFailedGuard) {
        proposal = fallback;
        failedGuard = undefined;
      }
    }
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

function proposalSlug(proposal: CuratedWikiProposal): string {
  return wikiSlugFromTargetPath(proposal.target_path, proposal.title).toLowerCase();
}

function proposalPageKindRank(kind: CuratedWikiProposal["page_kind"]): number {
  if (kind === "known_fix") return 7;
  if (kind === "procedure") return 6;
  if (kind === "pitfall") return 5;
  if (kind === "decision") return 4;
  if (kind === "skill") return 3;
  if (kind === "preference") return 2;
  if (kind === "incident") return 1;
  return 0;
}

function failedGuardCount(proposal: CuratedWikiProposal): number {
  return proposal.guards.filter((guard) => !guard.ok).length;
}

function compareProposalQuality(a: CuratedWikiProposal, b: CuratedWikiProposal): number {
  return b.source_count - a.source_count
    || b.confidence - a.confidence
    || proposalPageKindRank(b.page_kind) - proposalPageKindRank(a.page_kind)
    || failedGuardCount(a) - failedGuardCount(b)
    || a.title.localeCompare(b.title)
    || a.id.localeCompare(b.id);
}

function dedupeProposalsByTargetPath(proposals: CuratedWikiProposal[]): CuratedWikiProposal[] {
  const byTarget = new Map<string, CuratedWikiProposal>();
  for (const proposal of proposals) {
    const existing = byTarget.get(proposal.target_path);
    if (!existing || compareProposalQuality(proposal, existing) < 0) {
      byTarget.set(proposal.target_path, proposal);
    }
  }
  return Array.from(byTarget.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function sanitizeProposalRelationships(proposal: CuratedWikiProposal, allowedTargetSlugs: Set<string>): CuratedWikiProposal {
  const relationshipSlugs = new Set<string>();
  for (const page of proposal.related_pages ?? []) relationshipSlugs.add(page.slug.toLowerCase());
  for (const link of proposal.required_links ?? []) relationshipSlugs.add(link.slug.toLowerCase());
  for (const link of proposal.suggested_links ?? []) relationshipSlugs.add(link.slug.toLowerCase());
  const disallowedSlugs = new Set(Array.from(relationshipSlugs).filter((slug) => !allowedTargetSlugs.has(slug)));
  if (disallowedSlugs.size === 0) return proposal;

  const relatedPages = proposal.related_pages?.filter((page) => allowedTargetSlugs.has(page.slug.toLowerCase()));
  const requiredLinks = proposal.required_links?.filter((link) => allowedTargetSlugs.has(link.slug.toLowerCase()));
  const suggestedLinks = proposal.suggested_links?.filter((link) => allowedTargetSlugs.has(link.slug.toLowerCase()));

  return CuratedWikiProposalSchema.parse({
    ...proposal,
    body_markdown: stripDisallowedWikilinks(proposal.body_markdown, disallowedSlugs),
    ...(relatedPages && relatedPages.length > 0 ? { related_pages: relatedPages } : { related_pages: undefined }),
    ...(requiredLinks && requiredLinks.length > 0 ? { required_links: requiredLinks } : { required_links: undefined }),
    ...(suggestedLinks && suggestedLinks.length > 0 ? { suggested_links: suggestedLinks } : { suggested_links: undefined }),
  });
}

async function removeStaleGeneratedWikiProposalFiles(root: string, proposals: CuratedWikiProposal[]): Promise<void> {
  const currentIds = new Set(proposals.map((proposal) => proposal.id));
  if (currentIds.size === 0) return;

  let files: string[];
  try {
    files = await readdir(join(root, protocolPaths.inboxProposals));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const path = join(root, protocolPaths.inboxProposals, file);
    let existing: unknown;
    try {
      existing = JSON.parse(await readFile(path, "utf-8"));
    } catch {
      continue;
    }
    const record = existing && typeof existing === "object" ? existing as { id?: unknown; type?: unknown } : {};
    if (record.type === "wiki_curated_proposal" || record.type === "wiki_proposal_candidate") {
      const isCurrentCanonicalFile = typeof record.id === "string" && currentIds.has(record.id) && file === `${record.id}.json`;
      if (isCurrentCanonicalFile) continue;
      try {
        await unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
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

  const semanticReviewEnabled = Boolean(options.semanticReview?.enabled);
  const effectiveReviewClient = options.semanticReview?.client ?? (() => {
    if (!semanticReviewEnabled || degraded || !runtimeAiConfig) return undefined;
    const reviewModel = runtimeAiConfig.review_model ?? runtimeAiConfig.curation_model ?? runtimeAiConfig.model;
    const reviewAiConfig = { ...runtimeAiConfig, model: reviewModel };
    return createOpenAiCompatibleJsonClient({
      config: reviewAiConfig,
      env: options.env,
      fetchImpl: options.fetchImpl,
    });
  })();

  const pool = await buildWikiEvidencePoolFromRoot(root);
  const minSourceCount = options.minSourceCount ?? 1;

  const observations = buildWikiObservationsFromEvidence(pool.items);
  const topics = buildWikiTopics(observations);

  await writeWikiSourceSummaries(root, { evidence: pool.items, observations, topics, now });

  const existingPages = await loadExistingWikiPages(root);
  const existingRelationshipPlans = buildWikiRelationshipPlans({ topics, existingPages });
  const initialPagePlans = planWikiPages(topics, existingPages, { relationships: existingRelationshipPlans });
  const plannedRelationshipPlans = relationshipsBetweenPlannedPages(topics, initialPagePlans);
  const relationshipPlans = [
    ...existingRelationshipPlans,
    ...plannedRelationshipPlans,
  ].sort((a, b) =>
    a.topic_id.localeCompare(b.topic_id)
    || a.target_title.localeCompare(b.target_title)
    || a.target_path.localeCompare(b.target_path),
  );
  const pagePlans = addRelationshipLinksToPagePlans(initialPagePlans, topics, plannedRelationshipPlans);
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
  const concurrency = normalizeConcurrency(options.concurrency);
  const maxSynthesisAttempts = limit === undefined
    ? sortedPlans.length
    : Math.min(sortedPlans.length, limit + Math.max(limit, concurrency, 4));
  const synthesisPlans = sortedPlans.slice(0, maxSynthesisAttempts);
  const synthesizedProposalEntries: Array<{ index: number; proposal: CuratedWikiProposal }> = [];
  let conflicts = 0;
  let completedSyntheses = 0;
  let nextPlanIndex = 0;

  const processPlan = async (plan: WikiPagePlan, planIndex: number): Promise<void> => {
    if (limit !== undefined && synthesizedProposalEntries.length >= limit) return;

    const topic = topicByKey.get(plan.topic_key);
    if (!topic) return;

    const planObservations = topic.observation_ids
      .map((id) => observationById.get(id))
      .filter((observation): observation is WikiObservation => Boolean(observation));
    const planEvidence = planObservations
      .map((observation) => evidenceById.get(observation.evidence_id))
      .filter((item): item is WikiEvidenceItem => Boolean(item));

    if (topic.source_count < minSourceCount) return;

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
      const proposal = CuratedWikiProposalSchema.parse({
          ...result.proposal,
          ...(relatedPages.length > 0 ? { related_pages: relatedPages } : {}),
          ...(structuredRequiredLinks.length > 0 ? { required_links: structuredRequiredLinks } : {}),
          ...(structuredSuggestedLinks.length > 0 ? { suggested_links: structuredSuggestedLinks } : {}),
          ...(mergeCandidates.length > 0 ? { merge_candidates: mergeCandidates } : {}),
          ...(uniqueRelationshipReasons.length > 0 ? { relationship_reasons: uniqueRelationshipReasons } : {}),
          relationship_types: result.proposal.relationship_types ?? [],
        });
      if (limit === undefined || synthesizedProposalEntries.length < limit) {
        synthesizedProposalEntries.push({ index: planIndex, proposal });
      }
    } else {
      conflicts++;
    }
    completedSyntheses++;
    await options.onProgress?.({
      stage: "synthesis",
      completed: completedSyntheses,
      total: synthesisPlans.length,
      proposals: Math.min(synthesizedProposalEntries.length, limit ?? Number.POSITIVE_INFINITY),
      conflicts,
      topic_key: plan.topic_key,
    });
  };

  const runWorker = async (): Promise<void> => {
    while (nextPlanIndex < synthesisPlans.length) {
      if (limit !== undefined && synthesizedProposalEntries.length >= limit) return;
      const planIndex = nextPlanIndex;
      nextPlanIndex++;
      await processPlan(synthesisPlans[planIndex], planIndex);
    }
  };

  if (limit !== 0) {
    const workerCount = limit === undefined
      ? Math.min(concurrency, synthesisPlans.length)
      : Math.min(concurrency, limit, synthesisPlans.length);
    await Promise.all(Array.from(
      { length: workerCount },
      () => runWorker(),
    ));
  }

  const synthesizedProposals = dedupeProposalsByTargetPath(synthesizedProposalEntries
    .sort((a, b) => a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.proposal));

  let qualityHardBlockCount = 0;
  let qualityHumanRequiredCount = 0;
  const proposals: CuratedWikiProposal[] = [];
  const finalAssessments = new Map<string, ReturnType<typeof assessWikiPromotionQuality>>();
  const assessProposal = (proposal: CuratedWikiProposal) => {
    const planForTarget = pagePlans.find((plan) =>
      plan.target_path === proposal.target_path || plan.existing_path === proposal.target_path,
    );
    const relatedPaths = uniq([
      ...(proposal.related_pages ?? []).map((page) => page.path),
      ...(proposal.suggested_links ?? []).map((link) => link.path),
    ]);
    return assessWikiPromotionQuality(proposal, {
      otherProposals: synthesizedProposals,
      existingPageFound: Boolean(
        (proposal.action === "create" || proposal.action === "skill_create")
        && planForTarget
        && planForTarget.action !== "create",
      ),
      relatedPaths,
      relatedPages: proposal.related_pages,
      requiredLinks: proposal.required_links,
      mergeCandidates: proposal.merge_candidates,
      relationshipReasons: proposal.relationship_reasons,
      minSourceCount,
    });
  };
  const initialAssessments = new Map<string, ReturnType<typeof assessWikiPromotionQuality>>();
  for (const proposal of synthesizedProposals) {
    initialAssessments.set(proposal.id, assessProposal(proposal));
  }
  const allowedTargetSlugs = new Set(existingPages.map((page) => page.slug.toLowerCase()));
  for (const proposal of synthesizedProposals) {
    const assessment = initialAssessments.get(proposal.id);
    if (assessment && assessment.hard_blocks.length === 0 && assessment.human_required.length === 0) {
      allowedTargetSlugs.add(proposalSlug(proposal));
    }
  }
  for (const proposal of synthesizedProposals) {
    const initialAssessment = initialAssessments.get(proposal.id);
    if (initialAssessment && initialAssessment.hard_blocks.length > 0) {
      qualityHardBlockCount++;
      continue;
    }
    const sanitizedProposal = sanitizeProposalRelationships(proposal, allowedTargetSlugs);
    const assessment = assessProposal(sanitizedProposal);
    if (assessment.hard_blocks.length > 0) {
      qualityHardBlockCount++;
      continue;
    }
    finalAssessments.set(sanitizedProposal.id, assessment);
    const riskNotes = [
      ...sanitizedProposal.review_hint.risk_notes,
      ...assessment.human_required.map((reason) => `quality_human_required:${reason}`),
    ];
    if (assessment.human_required.length > 0) qualityHumanRequiredCount++;
    proposals.push({
      ...sanitizedProposal,
      review_hint: {
        ...sanitizedProposal.review_hint,
        risk_notes: riskNotes,
        suggested_decision: assessment.human_required.length > 0 ? "edit" : sanitizedProposal.review_hint.suggested_decision,
      },
    });
  }

  const semanticReviewCounts = {
    enabled: semanticReviewEnabled,
    reviewed: 0,
    promote: 0,
    merge: 0,
    revise: 0,
    reject: 0,
    needs_human: 0,
    unavailable: 0,
  };
  const semanticReviewedProposals: CuratedWikiProposal[] = [];

  if (semanticReviewEnabled) {
    const reviewClient = effectiveReviewClient;
    const maxOutputBytes = options.semanticReview?.maxOutputBytes;
    const existingPageRefs: ExistingWikiPageRef[] = existingPages.map((page) => ({
      slug: page.slug,
      path: page.path,
      title: page.title,
    }));

    for (const proposal of proposals) {
      const assessment = finalAssessments.get(proposal.id);
      if (assessment && assessment.hard_blocks.length > 0) {
        semanticReviewedProposals.push(proposal);
        continue;
      }

      let review: SemanticWikiReview | null = null;
      let unavailableReason: string | null = null;
      if (reviewClient) {
        const result = await reviewWikiCandidateSemanticallyDetailed(proposal, {
          client: reviewClient,
          existingPages: existingPageRefs,
          qualityAssessment: assessment ?? {
            topic_key: proposal.id,
            hard_blocks: [],
            human_required: [],
            passed: true,
          },
          maxOutputBytes,
        });
        if (result.ok) review = result.review;
        else unavailableReason = result.reason;
      } else {
        unavailableReason = "semantic_review_unavailable:no_client";
      }

      if (review) {
        semanticReviewCounts.reviewed++;
      } else {
        semanticReviewCounts.unavailable++;
      }

      const arbitration = decideSemanticWikiAction({
        proposal: {
          id: proposal.id,
          action: proposal.action,
          scope: proposal.scope,
          source_count: proposal.source_count,
          page_kind: proposal.page_kind,
          title: proposal.title,
        },
        assessment: assessment ?? {
          topic_key: proposal.id,
          hard_blocks: [],
          human_required: [],
          passed: true,
        },
        review: review ?? undefined,
      });

      const semanticRiskNotes: string[] = [];
      if (review) {
        semanticRiskNotes.push(`semantic_review:${review.decision}`);
        semanticRiskNotes.push(`semantic_score:${review.quality_score}`);
        semanticRiskNotes.push(`semantic_reason:${review.reason}`);
      } else {
        semanticRiskNotes.push("semantic_review:unavailable");
        if (unavailableReason) semanticRiskNotes.push(unavailableReason);
      }

      switch (arbitration.action) {
        case "write_candidate": {
          semanticReviewCounts.promote++;
          semanticReviewedProposals.push({
            ...proposal,
            review_hint: {
              ...proposal.review_hint,
              risk_notes: [...proposal.review_hint.risk_notes, ...semanticRiskNotes],
            },
          });
          break;
        }
        case "reject": {
          semanticReviewCounts.reject++;
          break;
        }
        case "needs_human": {
          semanticReviewCounts.needs_human++;
          semanticReviewedProposals.push({
            ...proposal,
            review_hint: {
              ...proposal.review_hint,
              risk_notes: [...proposal.review_hint.risk_notes, ...semanticRiskNotes, "semantic_review:needs_human"],
              suggested_decision: "edit",
            },
          });
          break;
        }
        case "rewrite_as_merge": {
          const targetPath = review?.should_merge_with?.trim();
          const target = targetPath ? existingPageRefs.find((page) => page.path === targetPath || page.slug === targetPath) : undefined;
          if (!targetPath || !target) {
            semanticReviewCounts.needs_human++;
            semanticReviewedProposals.push({
              ...proposal,
              review_hint: {
                ...proposal.review_hint,
                risk_notes: [
                  ...proposal.review_hint.risk_notes,
                  ...semanticRiskNotes,
                  "semantic_review:needs_human",
                  `semantic_merge_target_unresolved:${targetPath ?? "missing"}`,
                ],
                suggested_decision: "edit",
              },
            });
            break;
          }
          semanticReviewCounts.merge++;
          semanticReviewedProposals.push(CuratedWikiProposalSchema.parse({
            ...proposal,
            id: wikiCuratedProposalId(target.path, "semantic-merge", proposal.id),
            target_path: target.path,
            action: proposal.page_kind === "skill" ? "skill_update" : "update",
            merge_candidates: [
              ...(proposal.merge_candidates ?? []),
              { title: target.title, path: target.path, reason: "semantic_review_merge" },
            ],
            review_hint: {
              ...proposal.review_hint,
              risk_notes: [
                ...proposal.review_hint.risk_notes,
                ...semanticRiskNotes,
                "semantic_review:merge",
                `semantic_merge_target:${target.path}`,
              ],
              suggested_decision: "merge",
            },
          }));
          break;
        }
        case "retry_synthesis": {
          semanticReviewCounts.revise++;
          semanticReviewCounts.needs_human++;
          semanticReviewedProposals.push({
            ...proposal,
            review_hint: {
              ...proposal.review_hint,
              risk_notes: [...proposal.review_hint.risk_notes, ...semanticRiskNotes, "semantic_review:revise"],
              suggested_decision: "edit",
            },
          });
          break;
        }
      }
    }
  }

  const finalProposals = semanticReviewEnabled ? semanticReviewedProposals : proposals;

  let written = 0;
  if (options.mode === "review") {
    await removeStaleGeneratedWikiProposalFiles(root, finalProposals);
    for (const proposal of finalProposals) {
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
      curated_proposals: finalProposals.length,
      written_proposals: written,
      conflicts,
    },
    ...(semanticReviewEnabled ? { semantic_review: semanticReviewCounts } : {}),
    compiler_counts: {
      observations: observations.length,
      topics: topics.length,
      page_plans_by_action: pagePlansByAction,
      duplicate_source_hash_groups: duplicateSourceHashGroups,
      hard_blocks: qualityHardBlockCount,
      human_required_quality: qualityHumanRequiredCount,
      relationship_counts: relationshipCounts,
    },
    proposals: finalProposals.map((proposal) => ({
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
