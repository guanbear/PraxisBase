import type { SemanticSkillReview, SkillSynthesisCandidate } from "./skill-model.js";

export const SEMANTIC_SKILL_APPROVE_THRESHOLD = 0.86;

export interface SemanticSkillPolicyDecision {
  action: "write_candidate" | "retry_synthesis" | "reject" | "needs_human" | "rewrite_as_update";
  promotion_eligible: boolean;
  reason: string;
  review_notes: string[];
}

export function decideSemanticSkillAction(candidate: SkillSynthesisCandidate, review?: SemanticSkillReview): SemanticSkillPolicyDecision {
  const notes = [...candidate.review_hint.risk_notes];
  if (!candidate.target_path.startsWith("skills/") || candidate.target_path.includes("..")) {
    return { action: "reject", promotion_eligible: false, reason: "Unsafe skill target path.", review_notes: [...notes, "unsafe_target_path"] };
  }
  if (notes.includes("ambiguous_existing_skill_match")) {
    return { action: "needs_human", promotion_eligible: false, reason: "Ambiguous existing skill match requires human merge/update decision.", review_notes: notes };
  }
  if (!review) {
    return { action: "needs_human", promotion_eligible: false, reason: "Semantic skill review unavailable.", review_notes: [...notes, "semantic_skill_review:unavailable"] };
  }
  notes.push(`semantic_skill_review:${review.decision}`, `semantic_skill_score:${review.quality_score}`, `semantic_skill_reason:${review.reason}`);
  if (review.fatal_issues.length > 0 || !review.safe_for_future_agents) {
    return { action: "reject", promotion_eligible: false, reason: "Semantic skill review found fatal or unsafe issues.", review_notes: notes };
  }
  if (review.decision === "merge_or_update_existing" || review.should_update_existing) {
    return { action: "rewrite_as_update", promotion_eligible: false, reason: "Reviewer recommends updating an existing skill.", review_notes: notes };
  }
  if (review.decision === "reject") {
    return { action: "reject", promotion_eligible: false, reason: review.reason, review_notes: notes };
  }
  if (
    review.decision === "needs_human"
    || review.decision === "revise"
    || review.quality_score < SEMANTIC_SKILL_APPROVE_THRESHOLD
    || !review.class_level
    || !review.actionable
    || !review.reusable
    || review.evidence_support === "none"
    || review.evidence_support === "weak"
    || candidate.scope === "team"
    || candidate.scope === "org"
    || candidate.scope === "global"
  ) {
    return { action: "needs_human", promotion_eligible: false, reason: review.reason, review_notes: notes };
  }
  return {
    action: "write_candidate",
    promotion_eligible: false,
    reason: "Candidate approved for proposal queue; stable skill promotion still requires audit.",
    review_notes: notes,
  };
}
