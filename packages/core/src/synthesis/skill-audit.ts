import { readdir } from "node:fs/promises";
import { protocolPaths } from "../protocol/paths.js";
import type { Proposal } from "../protocol/schemas.js";
import { readJson } from "../store/file-store.js";
import { SemanticSkillReviewSchema, SkillPromotionAuditSchema, type SkillPromotionAudit } from "./skill-model.js";

export interface SkillPromotionAuditValidation {
  ok: boolean;
  reasons: string[];
}

function proposalSourceHashes(proposal: Proposal): Set<string> {
  return new Set([
    proposal.evidence.source_hash,
    ...Array.from(proposal.patch.content.matchAll(/\bsha256:[A-Za-z0-9._:-]+\b/g)).map((match) => match[0]),
  ]);
}

export function validateSkillPromotionAuditForProposal(
  value: unknown,
  proposal: Proposal,
): SkillPromotionAuditValidation {
  const parsed = SkillPromotionAuditSchema.safeParse(value);
  if (!parsed.success) return { ok: false, reasons: ["invalid_audit_schema"] };
  const audit = parsed.data;
  const reasons: string[] = [];
  if (audit.proposal_id !== proposal.id) reasons.push("proposal_id_mismatch");
  if (audit.candidate_id !== proposal.id && audit.candidate_id !== proposal.target_id) reasons.push("candidate_id_mismatch");
  if (audit.target_path !== proposal.patch.path) reasons.push("target_path_mismatch");
  if (proposal.target_type !== "skill" || !proposal.patch.path.startsWith("skills/")) reasons.push("not_skill_promotion");
  const sourceHashes = proposalSourceHashes(proposal);
  if (!audit.source_hashes.some((hash) => sourceHashes.has(hash))) reasons.push("source_hash_mismatch");
  if (audit.scope !== proposal.scope) reasons.push("scope_mismatch");
  return { ok: reasons.length === 0, reasons };
}

export async function findApprovedSkillPromotionAudit(root: string, proposal: Proposal): Promise<SkillPromotionAudit | null> {
  let files: string[];
  try {
    files = await readdir(`${root}/${protocolPaths.inboxReviews}`);
  } catch {
    return null;
  }

  const values: unknown[] = [];
  for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
    try {
      values.push(await readJson<unknown>(root, `${protocolPaths.inboxReviews}/${file}`));
    } catch {
      continue;
    }
  }

  const semanticReviews = values
    .map((value) => SemanticSkillReviewSchema.safeParse(value))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data);

  for (const value of values) {
    const parsed = SkillPromotionAuditSchema.safeParse(value);
    if (!parsed.success) continue;
    const validation = validateSkillPromotionAuditForProposal(parsed.data, proposal);
    if (!validation.ok) continue;
    const semanticReview = semanticReviews.find((review) => review.id === parsed.data.semantic_review_id);
    if (!semanticReview) continue;
    if (semanticReview.candidate_id !== proposal.id && semanticReview.candidate_id !== proposal.target_id) continue;
    if (semanticReview.target_path !== proposal.patch.path) continue;
    if (semanticReview.decision !== "approve_candidate") continue;
    if (semanticReview.fatal_issues.length > 0 || !semanticReview.safe_for_future_agents) continue;
    return parsed.data;
  }
  return null;
}
