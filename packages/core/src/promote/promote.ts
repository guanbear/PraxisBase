import type { Proposal, Review } from "../protocol/schemas.js";
import { writeText, isStableKnowledgePath, safePath } from "../store/file-store.js";
import { shouldAutoMergeReview } from "../review/risk.js";
import { appearsToBeRawLog } from "../protocol/redact.js";
import { promotionTimeGuard } from "../wiki/promotion-quality.js";

export interface PromotionError extends Error {
  code: "unsafe_path" | "raw_log_content" | "review_not_approved" | "quality_gate_failure";
}

export async function promoteApprovedProposal(
  root: string,
  input: { proposal: Proposal; review: Review }
): Promise<void> {
  if (!shouldAutoMergeReview(input.review)) {
    const err = new Error(
      `Review is not eligible for auto-merge: decision=${input.review.decision} risk=${input.review.risk}`
    ) as PromotionError;
    err.code = "review_not_approved";
    throw err;
  }

  const patchPath = input.proposal.patch.path;

  try {
    safePath(root, patchPath);
  } catch {
    const err = new Error(`Path traversal rejected: ${patchPath}`) as PromotionError;
    err.code = "unsafe_path";
    throw err;
  }

  if (!isStableKnowledgePath(patchPath)) {
    const err = new Error(
      `Proposal patch path is outside stable knowledge: ${patchPath}`
    ) as PromotionError;
    err.code = "unsafe_path";
    throw err;
  }

  const content = input.proposal.patch.content;

  if (patchPath.startsWith("kb/") && appearsToBeRawLog(content)) {
    const err = new Error(
      "Refusing to promote raw log content into kb/ — store only references, hashes, and summaries"
    ) as PromotionError;
    err.code = "raw_log_content";
    throw err;
  }

  const qualityError = promotionTimeGuard(content);
  if (qualityError) {
    const err = new Error(qualityError) as PromotionError;
    err.code = "quality_gate_failure";
    throw err;
  }

  await writeText(root, patchPath, content);
}
