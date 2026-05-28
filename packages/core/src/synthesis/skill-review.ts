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

export function normalizeSemanticSkillReview(value: unknown, candidate: SkillSynthesisCandidate, now: string): SemanticSkillReview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
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
    role: "PraxisBase semantic skill reviewer",
    checks: [
      "durable class-level skill",
      "concrete trigger",
      "actionable procedure",
      "verified and reusable",
      "synthesized rather than raw transcript copy",
      "safe for future agents",
      "scope matches evidence",
    ],
    candidate,
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
      system: "You review PraxisBase skill candidates for safe future-agent use. Return strict JSON.",
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
