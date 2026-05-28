import { z } from "zod";
import type { AiJsonClient } from "../ai/client.js";
import type { CuratedWikiProposal, WikiPromotionQualityAssessment } from "./curation-model.js";

export const SemanticWikiReviewSchema = z.object({
  type: z.literal("semantic_wiki_review"),
  candidate_id: z.string(),
  target_path: z.string(),
  decision: z.enum(["promote", "revise", "merge", "reject", "needs_human"]),
  quality_score: z.number().min(0).max(1),
  long_term_agent_value: z.boolean(),
  is_run_report_summary: z.boolean(),
  is_raw_or_near_raw_copy: z.boolean(),
  is_actionable: z.boolean(),
  is_reusable: z.boolean(),
  evidence_support: z.enum(["none", "weak", "partial", "strong"]),
  should_merge_with: z.string().nullable(),
  revision_required: z.boolean(),
  fatal_issues: z.array(z.string()),
  missing_requirements: z.array(z.string()),
  reason: z.string(),
  reviewed_at: z.string(),
});

export type SemanticWikiReview = z.infer<typeof SemanticWikiReviewSchema>;

const VALID_DECISIONS = new Set(["promote", "revise", "merge", "reject", "needs_human"]);
const VALID_EVIDENCE = new Set(["none", "weak", "partial", "strong"]);

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1";
  return false;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [];
}

function toDecision(value: unknown): SemanticWikiReview["decision"] | null {
  if (typeof value === "string" && VALID_DECISIONS.has(value)) return value as SemanticWikiReview["decision"];
  return null;
}

function toEvidenceSupport(value: unknown): SemanticWikiReview["evidence_support"] {
  if (typeof value === "string" && VALID_EVIDENCE.has(value)) return value as SemanticWikiReview["evidence_support"];
  return "none";
}

function reviewObjectFromProviderResponse(value: Record<string, unknown>): Record<string, unknown> {
  if (toDecision(value.decision)) return value;
  for (const key of ["expected_schema", "answer"] as const) {
    const nested = value[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const candidate = reviewObjectFromProviderResponse(nested as Record<string, unknown>);
      if (toDecision(candidate.decision)) return candidate;
    }
  }
  return value;
}

export function normalizeSemanticWikiReview(
  raw: string,
  candidateId: string,
  targetPath: string,
): SemanticWikiReview | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const obj = reviewObjectFromProviderResponse(parsed as Record<string, unknown>);
  const decision = toDecision(obj.decision);
  if (!decision) return null;

  const shouldMerge = obj.should_merge_with;
  const normalizedMerge = shouldMerge == null ? null : String(shouldMerge);

  return {
    type: "semantic_wiki_review",
    candidate_id: candidateId,
    target_path: targetPath,
    decision,
    quality_score: clampScore(obj.quality_score),
    long_term_agent_value: toBoolean(obj.long_term_agent_value),
    is_run_report_summary: toBoolean(obj.is_run_report_summary),
    is_raw_or_near_raw_copy: toBoolean(obj.is_raw_or_near_raw_copy),
    is_actionable: toBoolean(obj.is_actionable),
    is_reusable: toBoolean(obj.is_reusable),
    evidence_support: toEvidenceSupport(obj.evidence_support),
    should_merge_with: normalizedMerge,
    revision_required: toBoolean(obj.revision_required),
    fatal_issues: toStringArray(obj.fatal_issues),
    missing_requirements: toStringArray(obj.missing_requirements),
    reason: typeof obj.reason === "string" ? obj.reason : "",
    reviewed_at: typeof obj.reviewed_at === "string" ? obj.reviewed_at : new Date().toISOString(),
  };
}

export interface ExistingWikiPageRef {
  slug: string;
  path: string;
  title: string;
}

export function buildSemanticWikiReviewPrompt(
  proposal: CuratedWikiProposal,
  existingPages: ReadonlyArray<ExistingWikiPageRef>,
  qualityAssessment?: WikiPromotionQualityAssessment,
): { system: string; user: string } {
  const systemLines = [
    "You are the PraxisBase wiki semantic reviewer.",
    "Return only strict JSON matching the expected_schema below.",
    "Do not rewrite the page. Judge its long-term utility for future agents.",
    "Do not invent missing evidence. Only PraxisBase provenance-bearing evidence (source summaries, distilled observations, or stable wiki pages with tracked source refs and hashes) can support promotion.",
    "Agentmemory sidecar retrieval hits are related context only. A sidecar hit can suggest a merge target or provide background, but it cannot support promotion unless the underlying material has been ingested into PraxisBase provenance envelopes or source summaries.",
    "Prefer merge/update over creating near-duplicate pages.",
    "Reject pages that are run reports, status updates, or cleaned evidence summaries without reusable guidance.",
    "Reject or flag pages with dangling fragments, empty sections, repeated headings, JSON-shaped bullets, or generic advice.",
    "Score rubric: 5 = durable, actionable, well-supported, reusable, linked/merge-aware; 4 = useful with minor weakness; 3 = plausible but needs human or merge; 2 = weak cleaned evidence or one-off report; 1 = malformed, unsupported, raw-ish, or not useful.",
    "Scores: >= 0.82 eligible for personal promote when all flags pass; 0.65-0.81 revise/needs_human/merge; < 0.65 reject unless human triage is requested.",
  ];

  const userObj: Record<string, unknown> = {
    expected_schema: {
      type: "semantic_wiki_review",
      candidate_id: proposal.id,
      target_path: proposal.target_path,
      decision: "promote | revise | merge | reject | needs_human",
      quality_score: "number 0..1",
      long_term_agent_value: "boolean",
      is_run_report_summary: "boolean",
      is_raw_or_near_raw_copy: "boolean",
      is_actionable: "boolean",
      is_reusable: "boolean",
      evidence_support: "none | weak | partial | strong",
      should_merge_with: "string | null",
      revision_required: "boolean",
      fatal_issues: ["string"],
      missing_requirements: ["string"],
      reason: "string",
      reviewed_at: "ISO datetime",
    },
    candidate_id: proposal.id,
    target_path: proposal.target_path,
    title: proposal.title,
    summary: proposal.summary,
    scope: proposal.scope,
    page_kind: proposal.page_kind,
    action: proposal.action,
    source_count: proposal.source_count,
    confidence: proposal.confidence,
    body_markdown: proposal.body_markdown,
    provenance: proposal.provenance,
    deterministic_gate: qualityAssessment
      ? {
          passed: qualityAssessment.passed,
          hard_blocks: qualityAssessment.hard_blocks,
          human_required: qualityAssessment.human_required,
        }
      : null,
    existing_pages: existingPages.map((p) => ({ slug: p.slug, path: p.path, title: p.title })),
  };

  return {
    system: systemLines.join("\n"),
    user: JSON.stringify(userObj, null, 2),
  };
}

export interface ReviewWikiCandidateOptions {
  client: AiJsonClient;
  existingPages: ReadonlyArray<ExistingWikiPageRef>;
  qualityAssessment?: WikiPromotionQualityAssessment;
  maxOutputBytes?: number;
}

export type SemanticWikiReviewResult =
  | { ok: true; review: SemanticWikiReview }
  | { ok: false; reason: string };

function sanitizeReviewFailureReason(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? "unknown_error");
  const compact = raw
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return (compact || "unknown_error").slice(0, 200);
}

function wikiReviewUnavailableReason(kind: "client_exception" | "provider_error" | "invalid_response", value?: unknown): string {
  if (value === undefined) return `semantic_review_unavailable:${kind}`;
  return `semantic_review_unavailable:${kind}:${sanitizeReviewFailureReason(value)}`;
}

export async function reviewWikiCandidateSemanticallyDetailed(
  proposal: CuratedWikiProposal,
  options: ReviewWikiCandidateOptions,
): Promise<SemanticWikiReviewResult> {
  const { client, existingPages, qualityAssessment, maxOutputBytes = 4096 } = options;
  const prompt = buildSemanticWikiReviewPrompt(proposal, existingPages, qualityAssessment);

  let result: { ok: true; json: unknown } | { ok: false; error: string };
  try {
    result = await client.generateJson({
      system: prompt.system,
      user: prompt.user,
      schemaName: "semantic_wiki_review",
      maxOutputBytes,
    });
  } catch (error) {
    return { ok: false, reason: wikiReviewUnavailableReason("client_exception", error) };
  }

  if (!result.ok) return { ok: false, reason: wikiReviewUnavailableReason("provider_error", result.error) };

  const rawJson = result.json;
  const rawStr = typeof rawJson === "string" ? rawJson : JSON.stringify(rawJson);
  const review = normalizeSemanticWikiReview(rawStr, proposal.id, proposal.target_path);
  return review ? { ok: true, review } : { ok: false, reason: wikiReviewUnavailableReason("invalid_response") };
}

export async function reviewWikiCandidateSemantically(
  proposal: CuratedWikiProposal,
  options: ReviewWikiCandidateOptions,
): Promise<SemanticWikiReview | null> {
  const result = await reviewWikiCandidateSemanticallyDetailed(proposal, options);
  return result.ok ? result.review : null;
}
