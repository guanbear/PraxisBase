import type { AiJsonClient } from "../ai/client.js";
import { SemanticSkillReviewSchema, type SemanticSkillReview, type SkillSynthesisCandidate } from "./skill-model.js";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function bool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1";
  return false;
}

function score(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function compactDecision(value: unknown): SemanticSkillReview["decision"] | unknown {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "approve" || normalized === "approved" || normalized === "approve_candidate") return "approve_candidate";
  if (normalized === "edit" || normalized === "revise" || normalized === "needs_changes") return "revise";
  if (normalized === "merge" || normalized === "update" || normalized === "merge_or_update_existing") return "merge_or_update_existing";
  if (normalized === "reject" || normalized === "rejected") return "reject";
  if (normalized === "needs_human" || normalized === "human" || normalized === "manual_review") return "needs_human";
  return undefined;
}

function defaultScoreForDecision(decision: unknown, hasChecks: boolean, failedChecks: string[]): number {
  if (typeof decision === "string") {
    if (decision === "reject") return 0.25;
    if (decision === "needs_human" || decision === "revise" || decision === "merge_or_update_existing") return 0.68;
    if (decision === "approve_candidate") return failedChecks.length === 0 ? 0.86 : 0.68;
  }
  if (!hasChecks) return 0.5;
  return failedChecks.length === 0 ? 0.86 : 0.68;
}

function checkValue(checks: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    if (typeof checks[key] === "boolean") return checks[key];
  }
  return undefined;
}

function failedCompactChecks(checks: Record<string, unknown>): string[] {
  return Object.entries(checks)
    .filter(([, value]) => value === false)
    .map(([key]) => key);
}

function semanticFieldsFromCompactReview(raw: Record<string, unknown>): Record<string, unknown> {
  const checks = raw.checks && typeof raw.checks === "object" && !Array.isArray(raw.checks)
    ? raw.checks as Record<string, unknown>
    : {};
  const failedChecks = failedCompactChecks(checks);
  const hasChecks = Object.keys(checks).length > 0;
  const classLevel = checkValue(checks, ["class_level", "durable_class-level_skill", "durable_class_level_skill"]);
  const actionable = checkValue(checks, ["actionable", "actionable_procedure"]);
  const reusable = checkValue(checks, ["reusable", "verified_and_reusable"]);
  const safe = checkValue(checks, ["safe_for_future_agents"]);
  const decision = raw.decision ?? compactDecision(raw.answer);
  const evidenceSupport = typeof raw.evidence_support === "string"
    ? raw.evidence_support
    : Object.keys(checks).length > 0
      ? failedChecks.length === 0 ? "strong" : "partial"
      : undefined;

  return {
    ...raw,
    decision,
    quality_score: raw.quality_score ?? defaultScoreForDecision(decision, hasChecks, failedChecks),
    class_level: raw.class_level ?? classLevel,
    actionable: raw.actionable ?? actionable,
    reusable: raw.reusable ?? reusable,
    safe_for_future_agents: raw.safe_for_future_agents ?? safe,
    evidence_support: evidenceSupport,
    fatal_issues: raw.fatal_issues ?? [],
    missing_requirements: raw.missing_requirements ?? failedChecks,
    reason: raw.reason ?? (raw.answer ? `Compact answer-only semantic skill review: ${String(raw.answer)}.` : undefined),
    should_update_existing: raw.should_update_existing ?? null,
  };
}

export function normalizeSemanticSkillReview(value: unknown, candidate: SkillSynthesisCandidate, now: string): SemanticSkillReview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = semanticFieldsFromCompactReview(value as Record<string, unknown>);
  const parsed = SemanticSkillReviewSchema.safeParse({
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `semantic_skill_review_${candidate.id}`,
    type: "semantic_skill_review",
    candidate_id: candidate.id,
    target_path: candidate.target_path,
    decision: raw.decision,
    quality_score: score(raw.quality_score),
    class_level: bool(raw.class_level),
    actionable: bool(raw.actionable),
    reusable: bool(raw.reusable),
    safe_for_future_agents: raw.safe_for_future_agents === undefined ? true : bool(raw.safe_for_future_agents),
    evidence_support: typeof raw.evidence_support === "string" ? raw.evidence_support : "none",
    should_update_existing: typeof raw.should_update_existing === "string" ? raw.should_update_existing : null,
    fatal_issues: asStringArray(raw.fatal_issues),
    missing_requirements: asStringArray(raw.missing_requirements),
    reason: typeof raw.reason === "string" && raw.reason.trim() ? raw.reason : "No semantic skill review reason provided.",
    reviewed_at: typeof raw.reviewed_at === "string" ? raw.reviewed_at : now,
  });
  return parsed.success ? parsed.data : null;
}

export function buildSemanticSkillReviewPrompt(candidate: SkillSynthesisCandidate): string {
  return JSON.stringify({
    task: "Review one PraxisBase skill candidate for safe future-agent use.",
    output_rules: [
      "Return only the review JSON object.",
      "Do not include this task, output_rules, expected_schema, checks, or candidate in the output.",
      "Do not echo or rewrite the candidate.",
      "Use one concrete decision enum value, not a pipe-separated description.",
    ],
    expected_schema: {
      type: "semantic_skill_review",
      candidate_id: candidate.id,
      target_path: candidate.target_path,
      decision: "revise",
      quality_score: 0.68,
      class_level: true,
      actionable: true,
      reusable: true,
      safe_for_future_agents: true,
      evidence_support: "partial",
      should_update_existing: null,
      fatal_issues: [],
      missing_requirements: [],
      reason: "One or two sentences explaining the decision.",
      reviewed_at: new Date().toISOString(),
    },
    checks: [
      "durable class-level skill",
      "concrete trigger",
      "actionable procedure",
      "verified and reusable",
      "synthesized rather than raw transcript copy",
      "safe for future agents",
      "scope matches evidence",
    ],
    candidate_to_review: candidate,
  });
}

export type SemanticSkillReviewResult =
  | { ok: true; review: SemanticSkillReview }
  | { ok: false; reason: string };

function sanitizeReviewFailureReason(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? "unknown_error");
  const compact = raw
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return (compact || "unknown_error").slice(0, 200);
}

function skillReviewUnavailableReason(kind: "no_client" | "client_exception" | "provider_error" | "invalid_response", value?: unknown): string {
  if (value === undefined) return `semantic_skill_review_unavailable:${kind}`;
  return `semantic_skill_review_unavailable:${kind}:${sanitizeReviewFailureReason(value)}`;
}

export async function reviewSkillCandidateSemanticallyDetailed(input: {
  candidate: SkillSynthesisCandidate;
  client?: AiJsonClient;
  now: string;
}): Promise<SemanticSkillReviewResult> {
  if (!input.client) return { ok: false, reason: skillReviewUnavailableReason("no_client") };
  let response: { ok: true; json: unknown } | { ok: false; error: string };
  try {
    response = await input.client.generateJson({
      schemaName: "semantic_skill_review",
      system: [
        "You review PraxisBase skill candidates for safe future-agent use.",
        "Return only one strict JSON review object.",
        "The top-level output keys must be: type, candidate_id, target_path, decision, quality_score, class_level, actionable, reusable, safe_for_future_agents, evidence_support, should_update_existing, fatal_issues, missing_requirements, reason, reviewed_at.",
        "Do not echo the prompt, expected schema, checks, or candidate.",
      ].join(" "),
      user: buildSemanticSkillReviewPrompt(input.candidate),
      maxOutputBytes: 4096,
    });
  } catch (error) {
    return { ok: false, reason: skillReviewUnavailableReason("client_exception", error) };
  }
  if (!response.ok) return { ok: false, reason: skillReviewUnavailableReason("provider_error", response.error) };
  const review = normalizeSemanticSkillReview(response.json, input.candidate, input.now);
  return review ? { ok: true, review } : { ok: false, reason: skillReviewUnavailableReason("invalid_response") };
}

export async function reviewSkillCandidateSemantically(input: {
  candidate: SkillSynthesisCandidate;
  client?: AiJsonClient;
  now: string;
}): Promise<SemanticSkillReview | null> {
  const result = await reviewSkillCandidateSemanticallyDetailed(input);
  return result.ok ? result.review : null;
}
