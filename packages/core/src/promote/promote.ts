import type { Proposal, Review } from "../protocol/schemas.js";
import matter from "gray-matter";
import { readText, writeText, isStableKnowledgePath, safePath } from "../store/file-store.js";
import { shouldAutoMergeReview } from "../review/risk.js";
import { appearsToBeRawLog } from "../protocol/redact.js";
import { promotionTimeGuard } from "../wiki/promotion-quality.js";
import { findApprovedSkillPromotionAudit } from "../synthesis/skill-audit.js";
import { isStableKnowledgeRevoked } from "./revoke.js";

export interface PromotionError extends Error {
  code: "unsafe_path" | "raw_log_content" | "review_not_approved" | "quality_gate_failure" | "skill_promotion_audit_required" | "revoked_path";
}

function hasHeading(content: string, heading: string): boolean {
  return new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "im").test(content);
}

function isSkillSupportFilePath(path: string): boolean {
  return /^skills\/[^/]+\/[^/]+\/(references\/[^/]+\.md|templates\/[^/]+\.[A-Za-z0-9._-]+|scripts\/[^/]+\.[A-Za-z0-9._-]+)$/.test(path);
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

function wikiMetadata(content: string): { sourceCount?: number; sourceUris: string[]; type?: string; knowledgeType?: string } {
  const parsed = matter(content);
  const data = parsed.data as Record<string, unknown>;
  const sources = Array.isArray(data.sources) ? data.sources : [];
  const sourceUris = sources
    .map((source) => {
      if (source && typeof source === "object" && "uri" in source) {
        const uri = (source as { uri?: unknown }).uri;
        return typeof uri === "string" ? uri : undefined;
      }
      return undefined;
    })
    .filter((uri): uri is string => Boolean(uri));
  const sourceCount = typeof data.source_count === "number" && Number.isFinite(data.source_count)
    ? data.source_count
    : sourceUris.length > 0
      ? sourceUris.length
      : undefined;
  return {
    sourceCount,
    sourceUris,
    type: typeof data.type === "string" ? data.type : undefined,
    knowledgeType: typeof data.knowledge_type === "string" ? data.knowledge_type : undefined,
  };
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

  const previousMeta = wikiMetadata(existing);
  const nextMeta = wikiMetadata(nextContent);
  const previousSourceCount = previousMeta.sourceCount ?? 0;
  const nextSourceCount = nextMeta.sourceCount ?? 0;
  const previousSourceUriCount = previousMeta.sourceUris.length;
  const nextSourceUriCount = nextMeta.sourceUris.length;
  const previousType = previousMeta.knowledgeType ?? previousMeta.type;
  const nextType = nextMeta.knowledgeType ?? nextMeta.type;
  const typeChanged = Boolean(previousType && nextType && previousType !== nextType);

  if (previousSourceCount > 0 && nextSourceCount < previousSourceCount) {
    const err = new Error(
      `Refusing stable page metadata downgrade: source_count ${previousSourceCount} -> ${nextSourceCount}`
    ) as PromotionError;
    err.code = "quality_gate_failure";
    throw err;
  }

  if (previousSourceUriCount > 0 && nextSourceUriCount < previousSourceUriCount) {
    const err = new Error(
      `Refusing stable page metadata downgrade: sources ${previousSourceUriCount} -> ${nextSourceUriCount}`
    ) as PromotionError;
    err.code = "quality_gate_failure";
    throw err;
  }

  if (typeChanged) {
    const err = new Error(
      `Refusing stable page metadata downgrade: knowledge_type ${previousType} -> ${nextType}`
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

  if (await isStableKnowledgeRevoked(root, patchPath)) {
    const err = new Error(`Stable knowledge path has been revoked and will not be promoted again: ${patchPath}`) as PromotionError;
    err.code = "revoked_path";
    throw err;
  }

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

  if (patchPath.startsWith("skills/")) {
    const audit = await findApprovedSkillPromotionAudit(root, input.proposal);
    if (!audit) {
      const err = new Error(
        "Stable skill promotion requires an approved skill promotion audit; proposal/review approval alone is not enough."
      ) as PromotionError;
      err.code = "skill_promotion_audit_required";
      throw err;
    }
  }

  if ((patchPath.startsWith("kb/") || patchPath.startsWith("skills/")) && appearsToBeRawLog(content)) {
    const err = new Error(
      "Refusing to promote raw log content into stable knowledge — store only references, hashes, and summaries"
    ) as PromotionError;
    err.code = "raw_log_content";
    throw err;
  }

  if (!isSkillSupportFilePath(patchPath)) {
    const qualityError = promotionTimeGuard(content);
    if (qualityError) {
      const err = new Error(qualityError) as PromotionError;
      err.code = "quality_gate_failure";
      throw err;
    }
  }

  await assertNoStableKnowledgeDowngrade(root, patchPath, content);

  await writeText(root, patchPath, content);
}
