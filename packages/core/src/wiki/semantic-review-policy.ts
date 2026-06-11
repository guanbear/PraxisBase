import type { SemanticWikiReview } from "./semantic-review.js";
import type { WikiPromotionQualityAssessment } from "./curation-model.js";

export interface SemanticArbitrationProposal {
  id: string;
  action: string;
  scope: string;
  source_count: number;
  page_kind: string;
  title: string;
}

export interface SemanticArbitrationInput {
  proposal: SemanticArbitrationProposal;
  assessment: WikiPromotionQualityAssessment;
  review?: SemanticWikiReview;
  hasBeenRetried?: boolean;
}

export interface SemanticArbitrationResult {
  action: "write_candidate" | "retry_synthesis" | "reject" | "needs_human" | "rewrite_as_merge";
  reason: string;
  reviewNotes: string[];
}

const PERSONAL_SCOPES = new Set(["personal"]);
export const SEMANTIC_PROMOTE_THRESHOLD = 0.82;
const MIN_PROMOTE_SCORE = SEMANTIC_PROMOTE_THRESHOLD;

export function decideSemanticWikiAction(input: SemanticArbitrationInput): SemanticArbitrationResult {
  const { proposal, assessment, review, hasBeenRetried = false } = input;
  const notes: string[] = [];

  if (assessment.hard_blocks.length > 0) {
    return {
      action: "reject",
      reason: `Hard block prevents promotion: ${assessment.hard_blocks.join(", ")}`,
      reviewNotes: [`Hard block override: ${assessment.hard_blocks.join(", ")}`, ...notes],
    };
  }

  if (!review) {
    return {
      action: "needs_human",
      reason: "Semantic review unavailable; requires human decision.",
      reviewNotes: ["Semantic review unavailable; cannot auto-promote.", ...notes],
    };
  }

  if (review.decision === "reject") {
    return {
      action: "reject",
      reason: review.reason || "Reviewer rejected the candidate.",
      reviewNotes: [`Reviewer rejected: ${review.reason}`, ...notes],
    };
  }

  if (review.decision === "merge") {
    if (review.should_merge_with && review.should_merge_with.length > 0) {
      return {
        action: "rewrite_as_merge",
        reason: `Merge into ${review.should_merge_with}: ${review.reason}`,
        reviewNotes: [`Merge target: ${review.should_merge_with}`, review.reason, ...notes],
      };
    }
    return {
      action: "needs_human",
      reason: "Reviewer recommends merge but no valid target specified.",
      reviewNotes: ["Merge requested without resolvable target.", review.reason, ...notes],
    };
  }

  if (review.decision === "revise") {
    if (!hasBeenRetried) {
      return {
        action: "retry_synthesis",
        reason: `Revision required: ${review.missing_requirements.join("; ") || review.reason}`,
        reviewNotes: [`Synthesis retry allowed. Missing: ${review.missing_requirements.join("; ")}`, review.reason, ...notes],
      };
    }
    return {
      action: "needs_human",
      reason: `Revision still required after retry: ${review.reason}`,
      reviewNotes: ["Already retried synthesis once.", review.reason, ...notes],
    };
  }

  if (review.decision === "needs_human") {
    return {
      action: "needs_human",
      reason: review.reason || "Reviewer requests human decision.",
      reviewNotes: [review.reason, ...notes],
    };
  }

  if (review.decision === "promote") {
    if (!PERSONAL_SCOPES.has(proposal.scope)) {
      return {
        action: "needs_human",
        reason: `${proposal.scope} scope requires human review regardless of semantic score.`,
        reviewNotes: [`Scope ${proposal.scope} prevents auto-promotion.`, review.reason, ...notes],
      };
    }

    if (proposal.source_count < 2 && review.is_run_report_summary) {
      return {
        action: "needs_human",
        reason: "Single-source run-report summary cannot be auto-promoted as a new page.",
        reviewNotes: ["Run-report summary from single source; needs merge or human decision.", review.reason, ...notes],
      };
    }

    if (
      review.quality_score < MIN_PROMOTE_SCORE
      || !review.long_term_agent_value
      || !review.is_actionable
      || !review.is_reusable
      || review.fatal_issues.length > 0
    ) {
      const failures: string[] = [];
      if (review.quality_score < MIN_PROMOTE_SCORE) failures.push(`score ${review.quality_score} < ${MIN_PROMOTE_SCORE}`);
      if (!review.long_term_agent_value) failures.push("missing long_term_agent_value");
      if (!review.is_actionable) failures.push("not actionable");
      if (!review.is_reusable) failures.push("not reusable");
      if (review.fatal_issues.length > 0) failures.push(`fatal issues: ${review.fatal_issues.join(", ")}`);
      return {
        action: "needs_human",
        reason: `Promote conditions not met: ${failures.join("; ")}`,
        reviewNotes: [review.reason, ...failures, ...notes],
      };
    }

    return {
      action: "write_candidate",
      reason: `Semantic review passed (${review.quality_score}): ${review.reason}`,
      reviewNotes: [`Semantic promote score: ${review.quality_score}`, review.reason, ...notes],
    };
  }

  return {
    action: "needs_human",
    reason: "Unexpected reviewer decision.",
    reviewNotes: [`Unrecognized decision: ${review.decision}`, ...notes],
  };
}
