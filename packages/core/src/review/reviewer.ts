import { PROTOCOL_VERSION } from "../protocol/types.js";
import type { Proposal, Review } from "../protocol/schemas.js";
import { classifyProposalRisk } from "./risk.js";

/**
 * Deterministic MVP reviewer: makes decisions based on risk, evidence, and verification.
 * In production this would be replaced by an AI reviewer agent.
 */
export function reviewProposal(proposal: Proposal): Review {
  const risk = classifyProposalRisk({ action: proposal.action, target_type: proposal.target_type });
  const hasVerification = proposal.evidence.verification.trim().length > 0;
  const hasEvidence = proposal.evidence.source_uri.trim().length > 0 && proposal.evidence.source_hash.trim().length > 0;
  const decision = risk === "high" || !hasVerification || !hasEvidence ? "needs_human" : "approve";

  return {
    id: `review_${proposal.id}`,
    protocol_version: PROTOCOL_VERSION,
    proposal_id: proposal.id,
    reviewer_id: "mvp-deterministic-reviewer",
    reviewer_model: "deterministic-v0",
    prompt_version: "review-v0.1",
    decision,
    risk,
    confidence: decision === "approve" ? 0.82 : 0.65,
    reasons:
      decision === "approve"
        ? ["Evidence and verification are present."]
        : ["Proposal is high risk or lacks evidence required for auto-merge."],
    required_checks: ["praxisbase check"],
    created_at: new Date().toISOString(),
  };
}
