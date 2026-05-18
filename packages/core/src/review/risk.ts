import type { ProposalAction, RiskLevel, TargetType } from "../protocol/types.js";

export function classifyProposalRisk(input: { action: ProposalAction; target_type: TargetType }): RiskLevel {
  if (input.action === "archive") return "high";
  if (input.target_type === "policy" || input.target_type === "decision") return "high";
  if (input.target_type === "skill" && input.action !== "link") return "medium";
  if (input.target_type === "known_fix" || input.target_type === "procedure") return "medium";
  return "low";
}

export function shouldAutoMergeReview(input: {
  decision: "approve" | "reject" | "needs_human" | "conflict";
  risk: RiskLevel;
  confidence: number;
}): boolean {
  return input.decision === "approve" && input.risk !== "high" && input.confidence >= 0.75;
}
