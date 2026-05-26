import { z } from "zod";
import { ScopeSchema } from "../protocol/schemas.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";

const SAFE_RELATIVE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\/\/).+$/;
const STABLE_SKILL_PATH = /^skills\/[^/]+\/[^/]+\/SKILL\.md$/;
const SUPPORT_FILE_PATH = /^skills\/[^/]+\/[^/]+\/(references\/[^/]+\.md|templates\/[^/]+\.[A-Za-z0-9._-]+|scripts\/[^/]+\.[A-Za-z0-9._-]+)$/;
const SKILL_PROMOTION_PATH = /^skills\/[^/]+\/[^/]+\/(SKILL\.md|references\/[^/]+\.md|templates\/[^/]+\.[A-Za-z0-9._-]+|scripts\/[^/]+\.[A-Za-z0-9._-]+)$/;

function validSkillTarget(path: string, action: "skill_create" | "skill_update" | "skill_support_file"): boolean {
  if (!SAFE_RELATIVE_PATH.test(path)) return false;
  if (action === "skill_support_file") return SUPPORT_FILE_PATH.test(path);
  return STABLE_SKILL_PATH.test(path);
}

export const SkillSynthesisCandidateSchema = z.object({
  id: z.string().min(1),
  protocol_version: z.literal(PROTOCOL_VERSION),
  type: z.literal("skill_synthesis_candidate"),
  action: z.enum(["skill_create", "skill_update", "skill_support_file"]),
  scope: ScopeSchema,
  target_path: z.string().min(1),
  target_skill: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  body_markdown: z.string().min(1),
  source_refs: z.array(z.string().min(1)).min(1),
  source_hashes: z.array(z.string().min(1)).min(1),
  evidence_ids: z.array(z.string().min(1)).min(1),
  source_count: z.number().int().min(1),
  confidence: z.number().min(0).max(1),
  ladder_choice: z.enum(["skill_update_loaded", "skill_update_existing", "skill_support_file", "skill_create"]),
  existing_skill_path: z.string().nullable(),
  related_wiki_paths: z.array(z.string()).default([]),
  review_hint: z.object({
    suggested_decision: z.enum(["approve", "edit", "reject", "merge"]),
    risk_notes: z.array(z.string()).default([]),
  }),
  created_at: z.string().datetime(),
}).superRefine((candidate, ctx) => {
  if (!validSkillTarget(candidate.target_path, candidate.action)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["target_path"],
      message: "target_path must be a safe skill path; support files are limited to references/, templates/, or scripts/",
    });
  }
  if (candidate.action !== "skill_create" && !candidate.existing_skill_path) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["existing_skill_path"],
      message: "skill updates and support files must identify the existing skill",
    });
  }
});

export const SemanticSkillReviewSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.literal("semantic_skill_review"),
  candidate_id: z.string().min(1),
  target_path: z.string().min(1),
  decision: z.enum(["approve_candidate", "revise", "merge_or_update_existing", "reject", "needs_human"]),
  quality_score: z.number().min(0).max(1),
  class_level: z.boolean(),
  actionable: z.boolean(),
  reusable: z.boolean(),
  safe_for_future_agents: z.boolean(),
  evidence_support: z.enum(["none", "weak", "partial", "strong"]),
  should_update_existing: z.string().nullable(),
  fatal_issues: z.array(z.string()),
  missing_requirements: z.array(z.string()),
  reason: z.string().min(1),
  reviewed_at: z.string().datetime(),
}).superRefine((review, ctx) => {
  if (!SAFE_RELATIVE_PATH.test(review.target_path)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["target_path"], message: "target_path must be relative and safe" });
  }
});

export const SkillSynthesisReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: z.literal(PROTOCOL_VERSION),
  type: z.literal("skill_synthesis_report"),
  authority_mode: z.enum(["personal-local", "team-git"]),
  mode: z.enum(["dry-run", "review"]),
  enabled: z.boolean(),
  signals: z.number().int().nonnegative(),
  rejected_signals: z.number().int().nonnegative().default(0),
  clusters: z.number().int().nonnegative(),
  candidates: z.number().int().nonnegative(),
  reviewed: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  needs_human: z.number().int().nonnegative(),
  promoted: z.number().int().nonnegative().default(0),
  outputs: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
});

export const SkillPromotionAuditSchema = z.object({
  id: z.string().min(1),
  protocol_version: z.literal(PROTOCOL_VERSION),
  type: z.literal("skill_promotion_audit"),
  proposal_id: z.string().min(1),
  candidate_id: z.string().min(1),
  target_path: z.string().regex(SKILL_PROMOTION_PATH),
  scope: ScopeSchema,
  decision: z.enum(["approved", "rejected", "needs_changes"]),
  reviewer: z.object({
    kind: z.enum(["user", "team_git", "automation"]),
    id: z.string().min(1),
  }),
  semantic_review_id: z.string().min(1),
  source_hashes: z.array(z.string().min(1)).min(1),
  git: z.object({
    remote: z.string().optional(),
    branch: z.string().optional(),
    merge_request: z.string().optional(),
    commit: z.string().optional(),
  }).optional(),
  created_at: z.string().datetime(),
}).superRefine((audit, ctx) => {
  if (audit.decision !== "approved") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["decision"], message: "stable skill promotion requires approved audit decision" });
  }
  if ((audit.scope === "team" || audit.scope === "org" || audit.scope === "global") && audit.reviewer.kind !== "team_git") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reviewer", "kind"], message: "team/org/global skill promotion requires team_git review" });
  }
  if (audit.reviewer.kind === "team_git" && !audit.git?.merge_request && !audit.git?.commit) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["git"], message: "team_git review requires merge_request or commit metadata" });
  }
});

export type SkillSynthesisCandidate = z.infer<typeof SkillSynthesisCandidateSchema>;
export type SemanticSkillReview = z.infer<typeof SemanticSkillReviewSchema>;
export type SkillSynthesisReport = z.infer<typeof SkillSynthesisReportSchema>;
export type SkillPromotionAudit = z.infer<typeof SkillPromotionAuditSchema>;
