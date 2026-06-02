import { computeHash } from "../protocol/id.js";
import type { EvidenceSpan } from "./lesson-model.js";

export const SESSION_PRESUMMARY_PROMPT_VERSION = "session-presummary-v1";

export interface SelectedSessionExperienceEvent {
  span: EvidenceSpan;
  reason: string;
}

export interface SessionPreSummaryCacheKeyInput {
  sourceHash: string;
  parserIdentity: string;
  reducerIdentity: string;
  promptVersion: string;
  modelId: string;
  privacyProfile: string;
  agent: string;
}

const INCLUDE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(user correction|correction|preference|must|do not|don't|不要|必须|偏好)\b/i, "user_correction_or_preference"],
  [/\b(error|failed|failure|timeout|exception|stderr|regression|失败|报错|超时)\b/i, "failure_or_regression"],
  [/\b(fix|fixed|patched|repair|changed|updated|修复|修改|补丁)\b/i, "fix_or_repair"],
  [/\b(verify|verified|verification|test passed|tests passed|smoke passed|自测|验证|测试通过)\b/i, "verification"],
  [/\b(repeat|again|recurring|repeated|反复|再次|重复)\b/i, "repeated_signal"],
  [/\b(decision|rationale|because|chose|decide|决定|原因)\b/i, "decision_or_rationale"],
  [/\b(next time|lesson|pitfall|avoid|以后|教训|经验|避免)\b/i, "explicit_lesson"],
];

const EXCLUDE_PATTERNS = [
  /\b(system instructions?|developer instructions?|you are codex|tool schemas?|available tools|sandbox mode|approval policy)\b/i,
  /\b(session_meta|startup metadata|conversation info|model identity)\b/i,
  /\b(properties|arguments|enum|type schema|required|json schema)\b/i,
];

const FAILURE_CUE = /\b(error|failed|failure|timeout|exception|stderr|regression|失败|报错|超时)\b/i;
const LONG_OUTPUT_BYTES = 1_200;

function isExcluded(span: EvidenceSpan): boolean {
  const text = span.excerpt;
  if (EXCLUDE_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (Buffer.byteLength(text, "utf8") > LONG_OUTPUT_BYTES && !FAILURE_CUE.test(text)) return true;
  return false;
}

export function selectSessionExperienceEvents(spans: EvidenceSpan[]): SelectedSessionExperienceEvent[] {
  const selected: SelectedSessionExperienceEvent[] = [];
  const seen = new Set<string>();

  for (const span of spans) {
    if (isExcluded(span)) continue;
    const reasons = INCLUDE_PATTERNS
      .filter(([pattern]) => pattern.test(span.excerpt))
      .map(([, reason]) => reason);
    if (reasons.length === 0) continue;
    const key = `${span.source_ref}:${span.span_id}:${span.excerpt_hash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({ span, reason: reasons.join(",") });
  }

  return selected;
}

export function sessionPreSummaryCacheKey(input: SessionPreSummaryCacheKeyInput): string {
  const hash = computeHash(JSON.stringify({
    source_hash: input.sourceHash,
    parser_identity: input.parserIdentity,
    reducer_identity: input.reducerIdentity,
    prompt_version: input.promptVersion,
    model_id: input.modelId,
    privacy_profile: input.privacyProfile,
    agent: input.agent,
  })).replace(/^sha256:/, "").slice(0, 16);
  return `${input.promptVersion}:${input.agent}:sha256-${hash}`;
}
