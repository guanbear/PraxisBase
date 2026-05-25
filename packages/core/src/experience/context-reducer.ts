import { computeHash } from "../protocol/id.js";
import {
  REDUCER_VERSION,
  MIN_REDUCE_INPUT_BYTES,
  MIN_USEFUL_REDUCTION_RATIO,
  buildBuiltinRules,
  matchRule,
  validateRules,
  computeRuleSetHash,
  isFileInspection,
  type RuleMatchResult,
} from "./context-reducer-rules.js";
import type {
  ContextReducerRule,
  ContextReductionResult,
  NormalizedReducerInput,
  ContextEconomyReport,
} from "../protocol/schemas.js";
import { ContextReducerRuleSchema } from "../protocol/schemas.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { makeId } from "../protocol/id.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { protocolPaths } from "../protocol/paths.js";

export {
  REDUCER_VERSION,
  MIN_REDUCE_INPUT_BYTES,
  MIN_USEFUL_REDUCTION_RATIO,
  buildBuiltinRules,
  validateRules,
  computeRuleSetHash,
} from "./context-reducer-rules.js";

function utf8ByteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

function utf8SafeSlice(text: string, maxBytes: number): string {
  if (utf8ByteLength(text) <= maxBytes) return text;
  let byteLen = 0;
  let result = "";
  for (const char of text) {
    const charBytes = utf8ByteLength(char);
    if (byteLen + charBytes > maxBytes) break;
    byteLen += charBytes;
    result += char;
  }
  return result;
}

export function normalizeReducerInput(input: NormalizedReducerInput): {
  text: string;
  command?: string;
  argv?: string[];
  exit_code?: number | null;
  source_metadata?: Record<string, unknown>;
  source_ref?: string;
  source_hash?: string;
} {
  const parts: string[] = [];
  if (input.stdout) parts.push(input.stdout);
  if (input.stderr) parts.push(input.stderr);
  if (input.combined_text) parts.push(input.combined_text);

  const text = parts.length > 0 ? parts.join("\n") : "";

  const command = input.command ?? input.cmd;
  const argv = input.argv;

  return {
    text,
    command,
    argv,
    exit_code: input.exit_code,
    source_metadata: input.source_metadata,
    source_ref: input.source_ref,
    source_hash: input.source_hash,
  };
}

export function stripAnsi(text: string): string {
  const ANSI_RE = /[\u001b\u009b][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  return text.replace(ANSI_RE, "");
}

export function dropLinesMatching(text: string, pattern: string): string {
  let re: RegExp;
  try {
    re = new RegExp(pattern, "u");
  } catch {
    return text;
  }
  return text.split(/\r?\n/).filter((line) => !re.test(line)).join("\n");
}

export function dedupeAdjacentLines(text: string): string {
  const lines = text.split(/\r?\n/);
  const result: string[] = [];
  let prev: string | null = null;
  for (const line of lines) {
    if (line !== prev) {
      result.push(line);
      prev = line;
    }
  }
  return result.join("\n");
}

export function collapseWhitespace(text: string): string {
  return text.split(/\r?\n/).map((line) => line.replace(/[ \t]+/g, " ").trimEnd()).join("\n");
}

export function headTail(text: string, headLines: number, tailLines: number): string {
  const lines = text.split(/\r?\n/);
  if (lines.length <= headLines + tailLines) return text;
  const head = lines.slice(0, headLines);
  const tail = lines.slice(-tailLines);
  const omittedCount = lines.length - headLines - tailLines;
  return [...head, `... [${omittedCount} lines omitted] ...`, ...tail].join("\n");
}

export function preserveSectionsMatching(text: string, sectionPattern: string): string {
  let re: RegExp;
  try {
    re = new RegExp(sectionPattern, "iu");
  } catch {
    return text;
  }
  const lines = text.split(/\r?\n/);
  const preserved: string[] = [];
  for (const line of lines) {
    if (re.test(line)) {
      preserved.push(line);
    }
  }
  return preserved.join("\n");
}

export function truncate(text: string, maxBytes: number): string {
  return utf8SafeSlice(text, maxBytes);
}

export interface ExperienceFidelityCompressionResult {
  text: string;
  counters: Record<string, number>;
}

const EXPERIENCE_SIGNAL_RE = /(?:\b(?:goal|task|request|command|argv|exit_code|error|fail(?:ed|ure)?|exception|traceback|timeout|fix|fixed|repair|mitigation|restart|retry|verify|verification|smoke|test(?:s)?|passed|build|lint|lesson|preference|decision|provenance|source_ref|source_hash|capture|report id|run id|model|route|agent)\b|用户|目标|需求|修复|验证|经验|教训|决策|失败|错误|重启|回滚|通过|sha256:|[a-z][a-z0-9+.-]+:\/\/|\*\*\* (?:Add|Update|Delete) File:|^\s*(?:\$|pnpm|npm|node|git|python|pytest|cargo|go test|bun)\b)/iu;

const BOILERPLATE_RE = /(?:^Knowledge cutoff:|^Current date:|^You are (?:Codex|ChatGPT)|^# AGENTS\.md instructions|^Tool definitions:|^Available tools|^Filesystem sandboxing|^Approval policy|^<environment_context>|^<\/environment_context>|^<permissions instructions>|^<\/permissions instructions>|^\s*<(?:cwd|shell|current_date|timezone)>|^<!-- PRAXISBASE:|^# PraxisBase adapter instructions|^This agent is configured to work with PraxisBase|^## Capture triggers|^## Context stages|^## Privacy|^Redaction profile:)/iu;

function normalizedLineKey(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

export function preserveExperienceFidelity(
  text: string,
  options: { windowLines?: number; maxSections?: number } = {},
): ExperienceFidelityCompressionResult {
  const windowLines = options.windowLines ?? 2;
  const maxSections = options.maxSections ?? 120;
  const lines = text.split(/\r?\n/);
  const cleaned: string[] = [];
  const originalIndexes: number[] = [];
  const seenLineKeys = new Set<string>();
  let droppedBoilerplateLines = 0;
  let dedupedRepeatedBlocks = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const key = normalizedLineKey(line);
    if (!key) {
      cleaned.push(line);
      originalIndexes.push(index);
      continue;
    }
    if (BOILERPLATE_RE.test(line)) {
      droppedBoilerplateLines++;
      continue;
    }
    if (seenLineKeys.has(key)) {
      dedupedRepeatedBlocks++;
      continue;
    }
    seenLineKeys.add(key);
    cleaned.push(line);
    originalIndexes.push(index);
  }

  const signalIndexes: number[] = [];
  for (let index = 0; index < cleaned.length; index++) {
    if (EXPERIENCE_SIGNAL_RE.test(cleaned[index])) {
      signalIndexes.push(index);
    }
  }

  if (signalIndexes.length === 0) {
    const fallback = headTail(cleaned.join("\n"), 30, 30);
    return {
      text: fallback,
      counters: {
        preserved_signal_lines: 0,
        dropped_boilerplate_lines: droppedBoilerplateLines,
        deduped_repeated_blocks: dedupedRepeatedBlocks,
      },
    };
  }

  const keep = new Set<number>();
  for (const signalIndex of signalIndexes.slice(0, maxSections)) {
    const start = Math.max(0, signalIndex - windowLines);
    const end = Math.min(cleaned.length - 1, signalIndex + windowLines);
    for (let index = start; index <= end; index++) {
      const key = normalizedLineKey(cleaned[index]);
      if (!key && windowLines === 0) continue;
      keep.add(index);
    }
  }

  const ordered = Array.from(keep).sort((a, b) => a - b);
  const reduced: string[] = [];
  let previousOriginalIndex = -1;
  for (const index of ordered) {
    const originalIndex = originalIndexes[index];
    if (previousOriginalIndex >= 0 && originalIndex > previousOriginalIndex + 1) {
      reduced.push(`... [${originalIndex - previousOriginalIndex - 1} lines omitted] ...`);
    }
    reduced.push(cleaned[index]);
    previousOriginalIndex = originalIndex;
  }

  return {
    text: reduced.join("\n"),
    counters: {
      preserved_signal_lines: signalIndexes.length,
      dropped_boilerplate_lines: droppedBoilerplateLines,
      deduped_repeated_blocks: dedupedRepeatedBlocks,
    },
  };
}

function applyActions(
  text: string,
  rule: ContextReducerRule,
  isFailure: boolean,
): { text: string; counters: Record<string, number> } {
  let result = text;
  const counters: Record<string, number> = {};

  for (const action of rule.actions) {
    switch (action.type) {
      case "strip_ansi":
        result = stripAnsi(result);
        break;
      case "drop_lines_matching":
        if (action.pattern) {
          result = dropLinesMatching(result, action.pattern);
        }
        break;
      case "dedupe_adjacent_lines":
        result = dedupeAdjacentLines(result);
        break;
      case "collapse_whitespace":
        result = collapseWhitespace(result);
        break;
      case "head_tail":
        result = headTail(
          result,
          action.head_lines ?? 40,
          action.tail_lines ?? (isFailure && rule.preserve_failure_tail ? (rule.preserve_failure_tail_lines ?? 30) : 40),
        );
        break;
      case "preserve_sections_matching":
        if (action.section_pattern) {
          result = preserveSectionsMatching(result, action.section_pattern);
        }
        break;
      case "preserve_experience_fidelity": {
        const fidelity = preserveExperienceFidelity(result, {
          windowLines: action.window_lines,
          maxSections: action.max_sections,
        });
        result = fidelity.text;
        for (const [key, value] of Object.entries(fidelity.counters)) {
          counters[key] = (counters[key] ?? 0) + value;
        }
        break;
      }
      case "truncate":
        if (action.max_bytes) {
          result = truncate(result, action.max_bytes);
        }
        break;
    }
  }

  if (isFailure && rule.preserve_failure_tail) {
    const tailLines = rule.preserve_failure_tail_lines ?? 30;
    const lines = result.split(/\r?\n/);
    const tail = lines.slice(-tailLines);
    if (lines.length > tailLines) {
      const tailText = tail.join("\n");
      if (utf8ByteLength(tailText) > utf8ByteLength(result) * 0.5) {
        result = tailText;
      }
    }
  }

  return { text: result, counters };
}

export interface ReduceInputOptions {
  rules?: ContextReducerRule[];
  userRules?: ContextReducerRule[];
  projectRules?: ContextReducerRule[];
  minReduceInputBytes?: number;
  minUsefulReductionRatio?: number;
}

export function buildEffectiveReducerRules(options: Pick<ReduceInputOptions, "rules" | "userRules" | "projectRules"> = {}): {
  rules: ContextReducerRule[];
  warnings: string[];
} {
  const effectiveRules: ContextReducerRule[] = [...(options.rules ?? buildBuiltinRules())];
  const warnings: string[] = [];
  const userValidated = options.userRules ? validateRules(options.userRules) : { valid: [], warnings: [] };
  const projectValidated = options.projectRules ? validateRules(options.projectRules) : { valid: [], warnings: [] };
  warnings.push(...userValidated.warnings, ...projectValidated.warnings);
  overlayRulesById(effectiveRules, userValidated.valid);
  overlayRulesById(effectiveRules, projectValidated.valid);
  return { rules: effectiveRules, warnings };
}

export function contextReducerIdentitySalt(result: Pick<ContextReductionResult, "reducer_version" | "rule_set_hash" | "reduction_hash">): string {
  return `${result.reducer_version}:${result.rule_set_hash}:${result.reduction_hash}`;
}

export function reduceContext(
  input: NormalizedReducerInput,
  options: ReduceInputOptions = {},
): ContextReductionResult {
  const minInputBytes = options.minReduceInputBytes ?? MIN_REDUCE_INPUT_BYTES;
  const minUsefulRatio = options.minUsefulReductionRatio ?? MIN_USEFUL_REDUCTION_RATIO;

  const normalized = normalizeReducerInput(input);
  const originalText = normalized.text;
  const originalBytes = utf8ByteLength(originalText);
  const warnings: string[] = [];

  const effectiveRules = buildEffectiveReducerRules(options);
  warnings.push(...effectiveRules.warnings);
  const ruleSetHash = computeRuleSetHash(effectiveRules.rules);

  if (originalBytes < minInputBytes) {
    return buildPassThroughResult(originalText, originalBytes, ruleSetHash, normalized, warnings, "input_below_threshold");
  }

  const match = matchRule(effectiveRules.rules, normalized);
  if (!match) {
    return buildPassThroughResult(originalText, originalBytes, ruleSetHash, normalized, warnings, "no_matching_rule");
  }

  if (isFileInspection(normalized.argv, normalized.command) && match.rule.pass_through_file_inspection !== false) {
    return buildPassThroughResult(
      originalText,
      originalBytes,
      ruleSetHash,
      normalized,
      warnings,
      "file_inspection_pass_through",
      match,
    );
  }

  const isFailure = normalized.exit_code !== undefined && normalized.exit_code !== null && normalized.exit_code !== 0;
  const appliedActions = applyActions(originalText, match.rule, isFailure);
  let reducedText = appliedActions.text;

  if (!reducedText || reducedText.trim().length === 0) {
    const fallbackText = headTail(originalText, 40, 40);
    reducedText = collapseWhitespace(dedupeAdjacentLines(stripAnsi(fallbackText)));
  }

  const reducedBytes = utf8ByteLength(reducedText);

  const savedBytes = originalBytes - reducedBytes;
  const savedRatio = originalBytes > 0 ? reducedBytes / originalBytes : 1;

  if (savedRatio > minUsefulRatio) {
    return buildPassThroughResult(
      originalText,
      originalBytes,
      ruleSetHash,
      normalized,
      warnings,
      "reduction_not_beneficial",
      match,
    );
  }

  const reductionPayload = JSON.stringify({
    text: reducedText,
    rule_id: match.rule.id,
    rule_set_hash: ruleSetHash,
    source_ref: normalized.source_ref,
    source_hash: normalized.source_hash,
  });
  const reductionHash = computeHash(reductionPayload);

  return {
    applied: true,
    text: reducedText,
    original_bytes: originalBytes,
    reduced_bytes: reducedBytes,
    saved_bytes: savedBytes,
    saved_ratio: 1 - savedRatio,
    matched_rule_id: match.rule.id,
    matched_rule_family: match.rule.family,
    matched_rule_confidence: match.rule.confidence ?? 1,
    reducer_version: REDUCER_VERSION,
    rule_set_hash: ruleSetHash,
    reduction_hash: reductionHash,
    source_ref: normalized.source_ref,
    source_hash: normalized.source_hash,
    facts: buildFacts(normalized, isFailure),
    counters: {
      original_lines: originalText.split(/\r?\n/).length,
      reduced_lines: reducedText.split(/\r?\n/).length,
      ...appliedActions.counters,
    },
    warnings,
  };
}

function overlayRulesById(base: ContextReducerRule[], overlays: ContextReducerRule[]): void {
  for (const overlay of overlays) {
    const existingIndex = base.findIndex((rule) => rule.id === overlay.id);
    if (existingIndex >= 0) {
      base[existingIndex] = overlay;
    } else {
      base.push(overlay);
    }
  }
}

function buildPassThroughResult(
  originalText: string,
  originalBytes: number,
  ruleSetHash: string,
  normalized: ReturnType<typeof normalizeReducerInput>,
  warnings: string[],
  reason: string,
  match?: RuleMatchResult | null,
): ContextReductionResult {
  const isFailure = normalized.exit_code !== undefined && normalized.exit_code !== null && normalized.exit_code !== 0;
  return {
    applied: false,
    text: originalText,
    original_bytes: originalBytes,
    reduced_bytes: originalBytes,
    saved_bytes: 0,
    saved_ratio: 0,
    matched_rule_id: match?.rule.id ?? null,
    matched_rule_family: match?.rule.family ?? null,
    matched_rule_confidence: match ? (match.rule.confidence ?? 1) : null,
    reducer_version: REDUCER_VERSION,
    rule_set_hash: ruleSetHash,
    reduction_hash: computeHash(JSON.stringify({ pass_through: true, source_ref: normalized.source_ref, source_hash: normalized.source_hash, rule_set_hash: ruleSetHash })),
    source_ref: normalized.source_ref,
    source_hash: normalized.source_hash,
    facts: buildFacts(normalized, isFailure),
    counters: { original_lines: originalText.split(/\r?\n/).length },
    warnings: [...warnings, `pass_through: ${reason}`],
  };
}

function buildFacts(
  normalized: ReturnType<typeof normalizeReducerInput>,
  isFailure: boolean,
): Record<string, unknown> {
  return {
    command: normalized.command,
    argv: normalized.argv,
    exit_code: normalized.exit_code,
    is_failure: isFailure,
    source_ref: normalized.source_ref,
    source_hash: normalized.source_hash,
  };
}

export function buildContextEconomyReport(items: ContextReductionResult[], now?: string, extraWarnings: string[] = []): ContextEconomyReport {
  const createdAt = now ?? new Date().toISOString();
  let inputBytes = 0;
  let outputBytes = 0;
  let savedBytes = 0;
  let itemsReduced = 0;
  let itemsPassedThrough = 0;
  const ruleHits: Record<string, number> = {};
  const familyHits: Record<string, number> = {};
  const allWarnings: string[] = [];

  for (const item of items) {
    inputBytes += item.original_bytes;
    outputBytes += item.reduced_bytes;
    savedBytes += item.saved_bytes;

    if (item.applied) {
      itemsReduced++;
      if (item.matched_rule_id) {
        ruleHits[item.matched_rule_id] = (ruleHits[item.matched_rule_id] ?? 0) + 1;
      }
      if (item.matched_rule_family) {
        familyHits[item.matched_rule_family] = (familyHits[item.matched_rule_family] ?? 0) + 1;
      }
    } else {
      itemsPassedThrough++;
    }

    allWarnings.push(...item.warnings);
  }

  const ruleSetHash = items.length > 0 ? items[0].rule_set_hash : computeRuleSetHash(buildBuiltinRules());

  return {
    id: makeId("ctx-econ", createdAt.replace(/[^a-z0-9]/g, "").slice(0, 20)),
    protocol_version: PROTOCOL_VERSION,
    type: "context_economy_report",
    reducer_version: REDUCER_VERSION,
    rule_set_hash: ruleSetHash,
    items_seen: items.length,
    items_reduced: itemsReduced,
    items_passed_through: itemsPassedThrough,
    input_bytes: inputBytes,
    output_bytes: outputBytes,
    saved_bytes: savedBytes,
    rule_hits: ruleHits,
    family_hits: familyHits,
    warnings: Array.from(new Set([...extraWarnings, ...allWarnings])).sort(),
    created_at: createdAt,
  };
}

export interface LoadProjectRulesResult {
  rules: ContextReducerRule[];
  warnings: string[];
}

export async function loadProjectRules(root: string): Promise<LoadProjectRulesResult> {
  const path = join(root, protocolPaths.contextEconomyProjectRules);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { rules: [], warnings: [] };
    }
    return { rules: [], warnings: [`project_rules_read_error: ${error instanceof Error ? error.message : String(error)}`] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { rules: [], warnings: ["project_rules_parse_error: invalid JSON"] };
  }

  let rawRules: unknown[];
  if (Array.isArray(parsed)) {
    rawRules = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).rules)) {
    rawRules = (parsed as { rules: unknown[] }).rules;
  } else {
    return { rules: [], warnings: ["project_rules_format_error: expected { rules: [...] } or [...]"] };
  }

  const typed: ContextReducerRule[] = [];
  const schemaWarnings: string[] = [];
  rawRules.forEach((rule, index) => {
    const parsedRule = ContextReducerRuleSchema.safeParse(rule);
    if (parsedRule.success) {
      typed.push(parsedRule.data);
      return;
    }
    const message = parsedRule.error.issues.map((issue) => `${issue.path.join(".") || "rule"}: ${issue.message}`).join("; ");
    schemaWarnings.push(`project_rules_schema_error[${index}]: ${message}`);
  });

  const { valid, warnings } = validateRules(typed);
  warnings.unshift(...schemaWarnings);
  if (typed.length !== valid.length) {
    warnings.push(`project_rules_filtered: ${typed.length - valid.length} invalid rule(s) removed`);
  }

  return { rules: valid, warnings };
}
