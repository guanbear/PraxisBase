import { appearsToBeRawLog } from "../protocol/redact.js";
import { redactLessonText } from "./lesson-privacy.js";

function concreteSecretReasons(text: string): string[] {
  const reasons: string[] = [];
  const add = (reason: string): void => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (/BEGIN PRIVATE KEY/i.test(text)) add("private_key_detected");
  if (/\bAKIA[A-Z0-9]{12,}\b/.test(text)) add("aws_access_key_detected");
  if (/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i.test(text)) add("bearer_token_detected");
  if (/\b(?:token|cookie|secret|password|passwd|credential|authorization|auth(?:entication)? header|api[_-]?key|access[_-]?token|secret[_-]?key)s?\b\s*(?:[:=]|is|was|as)\s*["'`]?[^\s"'`,;]{6,}/i.test(text)) {
    add("credential_value_detected");
  }
  for (const match of text.matchAll(/\b(?:token|cookie|secret|password|passwd|credential)s?\b\s+["'`]?([A-Za-z0-9._~+/=-]{12,})/gi)) {
    const value = match[1] ?? "";
    if (/[0-9._~+/=-]/.test(value)) {
      add("credential_value_detected");
      break;
    }
  }
  return reasons;
}

export function stableOutputLeakReasons(text: string): string[] {
  const reasons: string[] = [];
  if (appearsToBeRawLog(text)) reasons.push("raw_log_content");
  const redacted = redactLessonText(text);
  for (const reason of redacted.reasons) {
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  for (const reason of concreteSecretReasons(text)) {
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  return reasons;
}

export function isStableOutputExportSafe(text: string): boolean {
  return stableOutputLeakReasons(text).length === 0;
}
