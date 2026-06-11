import type { AiJsonClient } from "../ai/client.js";
import { utf8ByteLength } from "./context-juice.js";

export interface PayloadPreSummaryPolicy {
  enabled: boolean;
  lowerThresholdBytes?: number;
  upperThresholdBytes?: number;
  maxCalls?: number;
  timeoutMs?: number;
  allowTeamStableWrites?: boolean;
}

export interface PayloadPreSummarySession {
  calls: number;
  failures: number;
  failureBreaker: number;
}

export interface PayloadPreSummaryInput {
  text: string;
  sourceRef: string;
  sourceHash: string;
  authorityMode: "personal-local" | "team-git";
  client?: AiJsonClient;
  policy?: PayloadPreSummaryPolicy;
  session?: PayloadPreSummarySession;
  modelId?: string;
  promptId?: string;
}

export interface PayloadPreSummaryResult {
  status: "summarized" | "passed_through" | "discarded" | "failed";
  text: string;
  original_bytes: number;
  summary_bytes: number;
  saved_bytes: number;
  source_ref: string;
  source_hash: string;
  model_id?: string;
  prompt_id?: string;
  warnings: string[];
}

const DEFAULT_LOWER_THRESHOLD_BYTES = 24 * 1024;
const DEFAULT_UPPER_THRESHOLD_BYTES = 512 * 1024;
const DEFAULT_MAX_CALLS = 20;
const DEFAULT_FAILURE_BREAKER = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const PRIVACY_UNSAFE_RE = /(sk-[A-Za-z0-9_-]{12,}|api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9_-]{12,}|token\s*[:=]\s*['"]?[A-Za-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

export function createPayloadPreSummarySession(options: { failureBreaker?: number } = {}): PayloadPreSummarySession {
  return {
    calls: 0,
    failures: 0,
    failureBreaker: options.failureBreaker ?? DEFAULT_FAILURE_BREAKER,
  };
}

function passThrough(input: PayloadPreSummaryInput, warnings: string[] = []): PayloadPreSummaryResult {
  const bytes = utf8ByteLength(input.text);
  return {
    status: "passed_through",
    text: input.text,
    original_bytes: bytes,
    summary_bytes: bytes,
    saved_bytes: 0,
    source_ref: input.sourceRef,
    source_hash: input.sourceHash,
    model_id: input.modelId,
    prompt_id: input.promptId,
    warnings,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function normalizeSummaryJson(value: unknown): { summary?: string; provenance: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { provenance: [] };
  const record = value as Record<string, unknown>;
  return {
    summary: typeof record.summary === "string" ? record.summary.trim() : undefined,
    provenance: [
      ...stringArray(record.provenance),
      ...stringArray(record.source_refs),
      ...stringArray(record.source_hashes),
    ],
  };
}

function buildPayloadPreSummaryPrompt(input: PayloadPreSummaryInput): { system: string; user: string } {
  return {
    system: [
      "Summarize oversized agent payloads for PraxisBase review and distill.",
      "Return strict JSON with summary and provenance arrays.",
      "Preserve failures, fixes, verification, source refs, and source hashes.",
      "Do not include secrets, raw credentials, cookies, tokens, or private keys.",
    ].join(" "),
    user: JSON.stringify({
      task: "Create a shorter provenance-backed evidence surrogate.",
      required_json: {
        summary: "short summary that preserves reusable experience",
        provenance: ["source_ref and source_hash values used"],
      },
      source_ref: input.sourceRef,
      source_hash: input.sourceHash,
      text: input.text,
    }, null, 2),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("payload_presummary_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function preSummarizePayload(input: PayloadPreSummaryInput): Promise<PayloadPreSummaryResult> {
  const policy = input.policy ?? { enabled: false };
  const originalBytes = utf8ByteLength(input.text);
  const lower = policy.lowerThresholdBytes ?? DEFAULT_LOWER_THRESHOLD_BYTES;
  const upper = policy.upperThresholdBytes ?? DEFAULT_UPPER_THRESHOLD_BYTES;
  const session = input.session ?? createPayloadPreSummarySession();

  if (!policy.enabled) return passThrough(input, ["payload_presummary_disabled"]);
  if (input.authorityMode === "team-git" && policy.allowTeamStableWrites !== true) {
    return passThrough(input, ["payload_presummary_disabled_for_team"]);
  }
  if (!input.client) return passThrough(input, ["payload_presummary_no_ai_client"]);
  if (session.failures >= session.failureBreaker) return passThrough(input, ["payload_presummary_breaker_open"]);
  if (session.calls >= (policy.maxCalls ?? DEFAULT_MAX_CALLS)) return passThrough(input, ["payload_presummary_max_calls_reached"]);
  if (originalBytes < lower) return passThrough(input);
  if (originalBytes > upper) return passThrough(input, ["payload_above_presummary_upper_threshold"]);

  session.calls++;
  const prompt = buildPayloadPreSummaryPrompt(input);
  let response;
  try {
    response = await withTimeout(input.client.generateJson({
    system: prompt.system,
    user: prompt.user,
    schemaName: "payload_presummary",
    maxOutputBytes: Math.min(originalBytes, 16 * 1024),
    }), policy.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } catch (error) {
    session.failures++;
    return {
      ...passThrough(input, [error instanceof Error ? error.message : "payload_presummary_timeout"]),
      status: "failed",
    };
  }

  if (!response.ok) {
    session.failures++;
    return {
      ...passThrough(input, [`payload_presummary_failed:${response.error}`]),
      status: "failed",
    };
  }

  const normalized = normalizeSummaryJson(response.json);
  if (!normalized.summary) {
    return {
      ...passThrough(input, ["summary_empty_or_malformed"]),
      status: "discarded",
    };
  }
  if (!normalized.provenance.includes(input.sourceRef) && !normalized.provenance.includes(input.sourceHash)) {
    return {
      ...passThrough(input, ["summary_missing_provenance"]),
      status: "discarded",
    };
  }
  if (PRIVACY_UNSAFE_RE.test(normalized.summary)) {
    return {
      ...passThrough(input, ["summary_privacy_unsafe"]),
      status: "discarded",
    };
  }

  const summaryBytes = utf8ByteLength(normalized.summary);
  if (summaryBytes >= originalBytes) {
    return {
      ...passThrough(input, ["summary_not_smaller"]),
      status: "discarded",
    };
  }

  return {
    status: "summarized",
    text: normalized.summary,
    original_bytes: originalBytes,
    summary_bytes: summaryBytes,
    saved_bytes: originalBytes - summaryBytes,
    source_ref: input.sourceRef,
    source_hash: input.sourceHash,
    model_id: input.modelId,
    prompt_id: input.promptId,
    warnings: [],
  };
}
