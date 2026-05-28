import type {
  ContextJuiceBudgetResult,
  TrajectoryMicrocompactResult,
} from "../protocol/schemas.js";

export const CONTEXT_JUICE_VERSION = "context-juice-v1";
export const DEFAULT_SESSION_TOOL_OUTPUT_CAP_BYTES = 16 * 1024;
export const DEFAULT_SOURCE_FILE_CAP_BYTES = 64 * 1024;
export const DEFAULT_SIDECAR_HIT_CAP_BYTES = 8 * 1024;
export const DEFAULT_RECENT_RESULTS = 5;
export const MICROCOMPACT_PLACEHOLDER = "[Old tool result content cleared by praxisbase_context_juice]";

export interface SourceItemBudget {
  maxBytes: number;
  budgetId?: string;
  fullBodyAvailable?: boolean;
}

export interface SourceItemBudgetMetadata {
  sourceRef: string;
  sourceHash?: string;
}

export interface SourceItemBudgetResult extends ContextJuiceBudgetResult {
  text: string;
}

export interface TrajectoryEntry {
  id?: string;
  kind: string;
  content?: string;
  text?: string;
  body?: string;
  source_ref?: string;
  source_hash?: string;
  protected?: boolean;
  [key: string]: unknown;
}

export interface TrajectoryMicrocompactOptions {
  budgetId?: string;
  sourceRef: string;
  sourceHash?: string;
  recentResults?: number;
}

export interface TrajectoryMicrocompactOutput {
  entries: TrajectoryEntry[];
  report: TrajectoryMicrocompactResult;
}

const PROTECTED_KINDS = new Set(["failure", "fix", "verification", "lesson", "provenance"]);
const TOOL_RESULT_KINDS = new Set(["tool_result", "tool-results", "toolresults", "command_output"]);

export function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

export function utf8SafeSlice(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  if (utf8ByteLength(text) <= maxBytes) return text;

  let bytes = 0;
  let result = "";
  for (const char of text) {
    const charBytes = utf8ByteLength(char);
    if (bytes + charBytes > maxBytes) break;
    bytes += charBytes;
    result += char;
  }
  return result;
}

export function applySourceItemBudget(
  text: string,
  budget: SourceItemBudget,
  metadata: SourceItemBudgetMetadata,
): SourceItemBudgetResult {
  const budgetId = budget.budgetId ?? CONTEXT_JUICE_VERSION;
  const originalBytes = utf8ByteLength(text);
  const maxBytes = Math.max(0, budget.maxBytes);

  if (originalBytes <= maxBytes) {
    return {
      text,
      source_ref: metadata.sourceRef,
      source_hash: metadata.sourceHash,
      budget_id: budgetId,
      original_bytes: originalBytes,
      kept_bytes: originalBytes,
      saved_bytes: 0,
      truncated: false,
      full_body_available: budget.fullBodyAvailable ?? true,
      warnings: [],
    };
  }

  const prefix = utf8SafeSlice(text, maxBytes);
  const prefixBytes = utf8ByteLength(prefix);
  const droppedBytes = originalBytes - prefixBytes;
  const marker = `[... ${droppedBytes} bytes truncated by praxisbase_context_juice; use source_ref ${metadata.sourceRef} for full body ...]`;
  const output = prefix ? `${prefix}\n${marker}` : marker;
  const keptBytes = utf8ByteLength(output);

  return {
    text: output,
    source_ref: metadata.sourceRef,
    source_hash: metadata.sourceHash,
    budget_id: budgetId,
    original_bytes: originalBytes,
    kept_bytes: keptBytes,
    saved_bytes: Math.max(0, originalBytes - keptBytes),
    truncated: true,
    marker,
    full_body_available: budget.fullBodyAvailable ?? true,
    warnings: keptBytes > originalBytes ? ["truncation_marker_exceeds_saved_bytes"] : [],
  };
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(utf8ByteLength(text) / 4);
}

export function reserveOutputSpace(maxTokens: number, reservedOutputTokens: number): {
  max_tokens: number;
  reserved_output_tokens: number;
  available_input_tokens: number;
} {
  const safeMax = Math.max(0, Math.floor(maxTokens));
  const safeReserve = Math.max(0, Math.floor(reservedOutputTokens));
  return {
    max_tokens: safeMax,
    reserved_output_tokens: safeReserve,
    available_input_tokens: Math.max(0, safeMax - safeReserve),
  };
}

function entryTextKey(entry: TrajectoryEntry): "content" | "text" | "body" {
  if (typeof entry.content === "string") return "content";
  if (typeof entry.text === "string") return "text";
  return "body";
}

function isToolResult(entry: TrajectoryEntry): boolean {
  return TOOL_RESULT_KINDS.has(entry.kind.trim().toLowerCase());
}

function isProtectedSignal(entry: TrajectoryEntry): boolean {
  if (entry.protected === true) return true;
  const normalizedKind = entry.kind.trim().toLowerCase();
  return PROTECTED_KINDS.has(normalizedKind);
}

export function trajectoryMicrocompact(
  entries: readonly TrajectoryEntry[],
  options: TrajectoryMicrocompactOptions,
): TrajectoryMicrocompactOutput {
  const recentResults = Math.max(0, Math.floor(options.recentResults ?? DEFAULT_RECENT_RESULTS));
  const toolResultIndexes = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => isToolResult(entry))
    .map(({ index }) => index);
  const recentToolResultIndexes = new Set(toolResultIndexes.slice(-recentResults));

  let clearedEntries = 0;
  let protectedSignalCount = 0;
  let keptEntries = 0;

  const compacted = entries.map((entry, index) => {
    const protectedSignal = isProtectedSignal(entry);
    if (protectedSignal) protectedSignalCount++;

    const shouldClear =
      isToolResult(entry) &&
      !protectedSignal &&
      !recentToolResultIndexes.has(index);

    if (!shouldClear) {
      keptEntries++;
      return { ...entry };
    }

    const key = entryTextKey(entry);
    if (entry[key] === MICROCOMPACT_PLACEHOLDER) {
      keptEntries++;
      return { ...entry };
    }

    clearedEntries++;
    keptEntries++;
    return {
      ...entry,
      [key]: MICROCOMPACT_PLACEHOLDER,
    };
  });

  return {
    entries: compacted,
    report: {
      source_ref: options.sourceRef,
      source_hash: options.sourceHash,
      budget_id: options.budgetId ?? CONTEXT_JUICE_VERSION,
      original_entries: entries.length,
      kept_entries: keptEntries,
      cleared_entries: clearedEntries,
      protected_signal_count: protectedSignalCount,
      recent_results_kept: Math.min(recentResults, toolResultIndexes.length),
      idempotent: clearedEntries === 0,
      warnings: [],
    },
  };
}
