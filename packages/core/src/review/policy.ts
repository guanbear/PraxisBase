import { z } from "zod";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { readJson, writeJson } from "../store/file-store.js";
import type { CuratedWikiProposal } from "../wiki/curation-model.js";

const REVIEW_POLICY_PATH = ".praxisbase/review-policy.json";

export const ReviewPolicySchema = z.object({
  protocol_version: z.literal(PROTOCOL_VERSION),
  type: z.literal("review_policy"),
  mode: z.enum(["personal", "team"]),
  auto_review: z.boolean(),
  auto_promote: z.enum(["off", "low_risk_personal_only", "low_risk_team_with_gate"]),
  require_human_for: z.array(z.string()).default([]),
  min_confidence: z.number().min(0).max(1),
  min_source_count_for_auto_promote: z.number().int().min(1),
});

export type ReviewPolicy = z.infer<typeof ReviewPolicySchema>;

export interface AutoReviewDecision {
  auto_review: boolean;
  auto_promote: boolean;
  human_required: boolean;
  reason: string;
  required_human_reasons: string[];
}

const DEFAULT_HUMAN_REASONS = [
  "secret_or_privacy_risk",
  "scope_escalation",
  "team_or_org_target",
  "updates_existing_stable_page",
  "low_confidence",
  "conflicting_evidence",
  "skill_or_policy_target",
  "destructive_or_archive_action",
];

export function defaultReviewPolicy(mode: "personal" | "team"): ReviewPolicy {
  return ReviewPolicySchema.parse({
    protocol_version: PROTOCOL_VERSION,
    type: "review_policy",
    mode,
    auto_review: true,
    auto_promote: mode === "personal" ? "low_risk_personal_only" : "off",
    require_human_for: DEFAULT_HUMAN_REASONS,
    min_confidence: mode === "personal" ? 0.82 : 0.9,
    min_source_count_for_auto_promote: 1,
  });
}

export async function writeReviewPolicy(root: string, mode: "personal" | "team"): Promise<ReviewPolicy> {
  const policy = defaultReviewPolicy(mode);
  await writeJson(root, REVIEW_POLICY_PATH, policy);
  return policy;
}

export async function readReviewPolicy(root: string): Promise<ReviewPolicy> {
  try {
    return ReviewPolicySchema.parse(await readJson(root, REVIEW_POLICY_PATH));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return defaultReviewPolicy("personal");
    throw error;
  }
}

function isLowRiskPersonalKind(kind: CuratedWikiProposal["page_kind"]): boolean {
  return kind === "known_fix" || kind === "procedure" || kind === "pitfall" || kind === "note";
}

export function decideAutoReview(proposal: CuratedWikiProposal, policy: ReviewPolicy): AutoReviewDecision {
  const reasons: string[] = [];
  if (proposal.guards.some((guard) => !guard.ok)) reasons.push("secret_or_privacy_risk");
  if (proposal.confidence < policy.min_confidence) reasons.push("low_confidence");
  if (policy.mode === "team" && (proposal.scope === "personal" || proposal.scope === "project")) reasons.push("scope_escalation");
  if (proposal.scope === "team" || proposal.scope === "org" || proposal.scope === "global") reasons.push("team_or_org_target");
  if (proposal.page_kind === "skill") reasons.push("skill_or_policy_target");
  if (proposal.action === "archive" || proposal.action === "supersede") reasons.push("destructive_or_archive_action");
  if (proposal.action === "update" || proposal.action === "skill_update") reasons.push("updates_existing_stable_page");
  if (proposal.review_hint.suggested_decision === "split" || proposal.review_hint.suggested_decision === "merge") {
    reasons.push("conflicting_evidence");
  }
  if (proposal.source_count < policy.min_source_count_for_auto_promote) reasons.push("low_source_count");

  const humanRequired = reasons.some((reason) => policy.require_human_for.includes(reason) || reason === "low_source_count");
  const autoReview = policy.auto_review;
  let autoPromote = false;
  let reason = humanRequired ? `Human review required: ${reasons.join(", ")}` : "Eligible for automated review.";

  if (!humanRequired && autoReview) {
    if (
      policy.auto_promote === "low_risk_personal_only"
      && (proposal.scope === "personal" || proposal.scope === "project")
      && isLowRiskPersonalKind(proposal.page_kind)
    ) {
      autoPromote = true;
      reason = "Low-risk personal proposal can auto-promote.";
    } else if (policy.auto_promote === "off" && policy.mode === "team") {
      reason = "Team auto-promotion disabled by default.";
    } else if (policy.auto_promote === "off") {
      reason = "Auto-promotion disabled by policy.";
    } else if (proposal.scope === "team") {
      reason = "Team proposal requires explicit promotion gate.";
    }
  }

  return {
    auto_review: autoReview,
    auto_promote: autoPromote,
    human_required: humanRequired,
    reason,
    required_human_reasons: reasons,
  };
}
