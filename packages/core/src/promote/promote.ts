import type { Proposal, Review } from "../protocol/schemas.js";
import { readText, writeText, isStableKnowledgePath, safePath } from "../store/file-store.js";
import { shouldAutoMergeReview } from "../review/risk.js";
import { appearsToBeRawLog } from "../protocol/redact.js";
import { promotionTimeGuard } from "../wiki/promotion-quality.js";

export interface PromotionError extends Error {
  code: "unsafe_path" | "raw_log_content" | "review_not_approved" | "quality_gate_failure";
}

function hasHeading(content: string, heading: string): boolean {
  return new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "im").test(content);
}

function promotedPageQualityScore(content: string): number {
  let score = 0;
  if (/^#\s+.+/m.test(content)) score += 1;
  if (hasHeading(content, "When to Use") || hasHeading(content, "Applicability")) score += 1;
  if (hasHeading(content, "Symptoms or Context") || hasHeading(content, "Symptoms") || hasHeading(content, "Context")) score += 1;
  if (hasHeading(content, "Procedure") || hasHeading(content, "Steps") || hasHeading(content, "What To Do") || hasHeading(content, "Fix") || hasHeading(content, "Operating Rule")) score += 1;
  if (hasHeading(content, "Verify") || hasHeading(content, "Verification")) score += 1;
  if (hasHeading(content, "Reusable Lessons")) score += 1;
  if (hasHeading(content, "Provenance") || hasHeading(content, "Sources")) score += 1;
  if (hasHeading(content, "Related Wiki Pages")) score += 1;
  if (hasHeading(content, "Failed Attempts")) score -= 1;

  const bulletLines = content
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter((line) => line.length > 0);
  const duplicateBullets = bulletLines.length - new Set(bulletLines.map((line) => line.toLowerCase())).size;
  if (duplicateBullets > 0) score -= Math.min(2, duplicateBullets);
  return score;
}

async function assertNoStableKnowledgeDowngrade(root: string, patchPath: string, nextContent: string): Promise<void> {
  if (!patchPath.startsWith("kb/")) return;
  let existing: string;
  try {
    existing = await readText(root, patchPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  const existingError = promotionTimeGuard(existing);
  if (existingError) return;
  const previousScore = promotedPageQualityScore(existing);
  const nextScore = promotedPageQualityScore(nextContent);
  if (previousScore >= 6 && nextScore < previousScore) {
    const err = new Error(
      `Refusing to promote lower-quality rewrite over existing stable page: previous_score=${previousScore} next_score=${nextScore}`
    ) as PromotionError;
    err.code = "quality_gate_failure";
    throw err;
  }
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

  await assertNoStableKnowledgeDowngrade(root, patchPath, content);

  await writeText(root, patchPath, content);
}
