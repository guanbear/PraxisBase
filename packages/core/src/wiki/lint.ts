import { normalize, isAbsolute } from "node:path";
import { appearsToBeRawLog } from "../protocol/redact.js";

export function isAllowedWikiPatchPath(relativePath: string): boolean {
  const normalized = normalize(relativePath);
  if (normalized.startsWith("..") || isAbsolute(normalized)) return false;

  if (/^kb\/(.+\/)?[^/]+\.md$/.test(normalized)) return true;
  if (/^skills\/(.+\/)?SKILL\.md$/.test(normalized)) return true;

  return false;
}

const PRIVATE_PATTERNS = [
  /\btoken\b/i,
  /\bcookie\b/i,
  /\bsecret\b/i,
  /\bpassword\b/i,
  /\bcredential\b/i,
  /BEGIN PRIVATE KEY/,
  /\bAKIA[A-Z0-9]{12,}\b/,
];

export function containsPrivateMaterial(text: string): boolean {
  for (const pattern of PRIVATE_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return appearsToBeRawLog(text);
}

export function validateBodyShrink(
  oldBody: string,
  newBody: string,
  action: "create" | "patch" | "archive" | "link"
): { ok: true } | { ok: false; reason: "body_shrink_violation"; ratio: number } {
  if (action === "archive" || action === "create" || action === "link") {
    return { ok: true };
  }

  if (oldBody.length === 0) return { ok: true };

  const ratio = newBody.length / oldBody.length;
  if (ratio >= 0.7) return { ok: true };

  return { ok: false, reason: "body_shrink_violation", ratio };
}
