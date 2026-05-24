import { computeHash } from "../protocol/id.js";
import type { ContextReducerRule } from "../protocol/schemas.js";

export const REDUCER_VERSION = "context-reducer-v1";

export const MIN_REDUCE_INPUT_BYTES = 512;
export const MIN_USEFUL_REDUCTION_RATIO = 0.95;

export const FILE_INSPECTION_COMMANDS = new Set([
  "cat", "sed", "head", "tail", "nl", "bat", "batcat", "jq", "yq",
]);

function baseCommand(argv: string[] | undefined): string | undefined {
  if (!argv || argv.length === 0) return undefined;
  return argv[0];
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function isFileInspectionCommand(argv: string[] | undefined, command: string | undefined): boolean {
  if (argv && argv.length > 0 && FILE_INSPECTION_COMMANDS.has(argv[0])) return true;
  if (command) {
    const first = command.trim().split(/\s+/)[0];
    if (first && FILE_INSPECTION_COMMANDS.has(first)) return true;
  }
  return false;
}

export interface RuleMatchResult {
  rule: ContextReducerRule;
  specificity: number;
}

export function computeSpecificity(rule: ContextReducerRule, input: {
  command?: string;
  cmd?: string;
  argv?: string[];
  source_metadata?: Record<string, unknown>;
}): number {
  let score = (rule.priority ?? 0) * 1000;

  const effectiveCommand = input.command ?? input.cmd;
  const effectiveArgv = input.argv;

  if (rule.tool_match) {
    const base = baseCommand(effectiveArgv);
    if (base && base === rule.tool_match) {
      score += 500;
    } else if (effectiveCommand) {
      const first = effectiveCommand.trim().split(/\s+/)[0];
      if (first === rule.tool_match) score += 500;
    }
  }

  if (rule.argv_include && rule.argv_include.length > 0 && effectiveArgv) {
    const argvStr = effectiveArgv.join(" ");
    for (const pattern of rule.argv_include) {
      if (argvStr.includes(pattern)) score += 50;
    }
  }

  if (rule.command_include && rule.command_include.length > 0 && effectiveCommand) {
    for (const pattern of rule.command_include) {
      if (effectiveCommand.includes(pattern)) score += 100;
    }
  }

  if (rule.source_match && input.source_metadata) {
    for (const [key, value] of Object.entries(rule.source_match)) {
      if (input.source_metadata[key] === value) score += 30;
    }
  }

  return score;
}

export function matchRule(
  rules: ContextReducerRule[],
  input: {
    text: string;
    command?: string;
    cmd?: string;
    argv?: string[];
    exit_code?: number | null;
    source_metadata?: Record<string, unknown>;
    source_ref?: string;
    source_hash?: string;
  },
): RuleMatchResult | null {
  const inputBytes = Buffer.byteLength(input.text, "utf8");

  const candidates: Array<RuleMatchResult> = [];
  const effectiveCommand = input.command ?? input.cmd;
  const effectiveArgv = input.argv;

  for (const rule of rules) {
    if (rule.argv_exclude && rule.argv_exclude.length > 0 && effectiveArgv) {
      const argvStr = effectiveArgv.join(" ");
      if (rule.argv_exclude.some((p) => argvStr.includes(p))) continue;
    }

    if (rule.command_exclude && rule.command_exclude.length > 0 && effectiveCommand) {
      if (rule.command_exclude.some((p) => effectiveCommand.includes(p))) continue;
    }

    if (rule.source_match && !input.source_metadata) {
      continue;
    }

    if (rule.source_match && input.source_metadata) {
      let mismatch = false;
      for (const [key, value] of Object.entries(rule.source_match)) {
        if (input.source_metadata[key] !== value) {
          mismatch = true;
          break;
        }
      }
      if (mismatch) continue;
    }

    if (rule.requires_command && !effectiveArgv && !effectiveCommand) {
      continue;
    }

    if (rule.tool_match) {
      const base = baseCommand(effectiveArgv);
      const commandBase = effectiveCommand?.trim().split(/\s+/)[0];
      if (base !== rule.tool_match && commandBase !== rule.tool_match) continue;
    }

    if (rule.argv_include && rule.argv_include.length > 0) {
      if (!effectiveArgv && !effectiveCommand) continue;
      const argvStr = effectiveArgv ? effectiveArgv.join(" ") : "";
      const hasMatch = argvStr
        ? rule.argv_include.some((p) => argvStr.includes(p))
        : effectiveCommand
          ? rule.argv_include.some((p) => effectiveCommand.includes(p))
          : false;
      if (!hasMatch) continue;
    }

    if (rule.command_include && rule.command_include.length > 0) {
      if (!effectiveCommand) continue;
      if (!rule.command_include.some((p) => effectiveCommand.includes(p))) continue;
    }

    if (rule.content_pattern) {
      try {
        const re = new RegExp(rule.content_pattern, "u");
        if (!re.test(input.text)) continue;
      } catch {
        continue;
      }
    }

    const specificity = computeSpecificity(rule, {
      command: input.command,
      cmd: input.cmd,
      argv: input.argv,
      source_metadata: input.source_metadata,
    });

    candidates.push({ rule, specificity });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.specificity !== a.specificity) return b.specificity - a.specificity;
    return a.rule.id.localeCompare(b.rule.id);
  });

  return candidates[0];
}

export function isFileInspection(argv: string[] | undefined, command: string | undefined): boolean {
  return isFileInspectionCommand(argv, command);
}

export function computeRuleSetHash(rules: ContextReducerRule[]): string {
  const payload = rules
    .map((rule) => stableStringify(rule))
    .sort()
    .join("|");
  return computeHash(payload);
}

export function validateRules(rules: ContextReducerRule[]): { valid: ContextReducerRule[]; warnings: string[] } {
  const valid: ContextReducerRule[] = [];
  const warnings: string[] = [];

  for (const rule of rules) {
    let ruleValid = true;
    for (const action of rule.actions) {
      if (
        (action.type === "drop_lines_matching" || action.type === "preserve_sections_matching") &&
        action.pattern
      ) {
        try {
          new RegExp(action.pattern, "u");
        } catch {
          warnings.push(`invalid_regex: rule ${rule.id} action ${action.type} pattern "${action.pattern}"`);
          ruleValid = false;
        }
      }
      if (action.type === "preserve_sections_matching" && action.section_pattern) {
        try {
          new RegExp(action.section_pattern, "u");
        } catch {
          warnings.push(`invalid_regex: rule ${rule.id} action preserve_sections_matching section_pattern "${action.section_pattern}"`);
          ruleValid = false;
        }
      }
    }
    if (rule.content_pattern) {
      try {
        new RegExp(rule.content_pattern, "u");
      } catch {
        warnings.push(`invalid_regex: rule ${rule.id} content_pattern "${rule.content_pattern}"`);
        ruleValid = false;
      }
    }
    if (ruleValid) valid.push(rule);
  }

  return { valid, warnings };
}

export function buildBuiltinRules(): ContextReducerRule[] {
  const raw: ContextReducerRule[] = [
    {
      id: "codex-session-default",
      family: "codex-session",
      priority: 5,
      confidence: 0.85,
      pass_through_file_inspection: true,
      source_match: { agent: "codex" },
      actions: [
        { type: "strip_ansi" },
        { type: "dedupe_adjacent_lines" },
        { type: "collapse_whitespace" },
        { type: "head_tail", head_lines: 80, tail_lines: 80 },
        { type: "drop_lines_matching", pattern: "^\\s*$" },
      ],
      preserve_failure_tail: true,
      preserve_failure_tail_lines: 40,
    },
    {
      id: "openclaw-log-default",
      family: "openclaw-log",
      priority: 5,
      confidence: 0.85,
      pass_through_file_inspection: true,
      source_match: { agent: "openclaw" },
      actions: [
        { type: "strip_ansi" },
        { type: "dedupe_adjacent_lines" },
        { type: "collapse_whitespace" },
        { type: "preserve_sections_matching", section_pattern: "(?:error|fix|task|goal|verification|lesson)" },
        { type: "head_tail", head_lines: 60, tail_lines: 60 },
        { type: "drop_lines_matching", pattern: "^\\s*$" },
      ],
      preserve_failure_tail: true,
      preserve_failure_tail_lines: 40,
    },
    {
      id: "command-output-default",
      family: "command-output",
      priority: 2,
      confidence: 0.8,
      requires_command: true,
      pass_through_file_inspection: true,
      actions: [
        { type: "strip_ansi" },
        { type: "dedupe_adjacent_lines" },
        { type: "collapse_whitespace" },
        { type: "head_tail", head_lines: 50, tail_lines: 50 },
        { type: "drop_lines_matching", pattern: "^\\s*$" },
      ],
      preserve_failure_tail: true,
      preserve_failure_tail_lines: 30,
    },
    {
      id: "test-output-default",
      family: "test-output",
      priority: 4,
      confidence: 0.9,
      pass_through_file_inspection: true,
      argv_include: ["test", "spec"],
      command_include: ["test", "spec", "jest", "mocha", "vitest", "pytest", "go test", "cargo test"],
      actions: [
        { type: "strip_ansi" },
        { type: "preserve_sections_matching", section_pattern: "(?:FAIL|PASS|Error|✓|✗|×|✔|failed|passed|tests?\\s)" },
        { type: "dedupe_adjacent_lines" },
        { type: "collapse_whitespace" },
        { type: "head_tail", head_lines: 30, tail_lines: 60 },
      ],
      preserve_failure_tail: true,
      preserve_failure_tail_lines: 50,
    },
    {
      id: "git-output-default",
      family: "git-output",
      priority: 4,
      confidence: 0.9,
      pass_through_file_inspection: true,
      argv_include: ["git"],
      command_include: ["git "],
      actions: [
        { type: "strip_ansi" },
        { type: "dedupe_adjacent_lines" },
        { type: "collapse_whitespace" },
        { type: "preserve_sections_matching", section_pattern: "(?:commit|branch|merge|conflict|error|fatal|changed|modified|deleted|new file)" },
        { type: "head_tail", head_lines: 40, tail_lines: 40 },
      ],
      preserve_failure_tail: true,
      preserve_failure_tail_lines: 30,
    },
    {
      id: "agentmemory-memory-default",
      family: "agentmemory-memory",
      priority: 3,
      confidence: 0.8,
      pass_through_file_inspection: true,
      source_match: { agent: "agentmemory" },
      actions: [
        { type: "strip_ansi" },
        { type: "collapse_whitespace" },
        { type: "preserve_sections_matching", section_pattern: "(?:title|content|concept|file|session|score|source|id)" },
        { type: "head_tail", head_lines: 60, tail_lines: 30 },
        { type: "drop_lines_matching", pattern: "^\\s*$" },
      ],
      preserve_failure_tail: false,
      preserve_failure_tail_lines: 30,
    },
    {
      id: "json-jsonl-default",
      family: "json-jsonl",
      priority: 1,
      confidence: 0.7,
      content_pattern: "^\\s*(?:\\{|\\[)",
      pass_through_file_inspection: true,
      actions: [
        { type: "dedupe_adjacent_lines" },
        { type: "head_tail", head_lines: 60, tail_lines: 60 },
      ],
      preserve_failure_tail: false,
      preserve_failure_tail_lines: 30,
    },
    {
      id: "generic-default",
      family: "generic",
      priority: 0,
      confidence: 0.5,
      pass_through_file_inspection: true,
      actions: [
        { type: "strip_ansi" },
        { type: "dedupe_adjacent_lines" },
        { type: "collapse_whitespace" },
        { type: "head_tail", head_lines: 40, tail_lines: 40 },
      ],
      preserve_failure_tail: false,
      preserve_failure_tail_lines: 30,
    },
  ];
  return raw;
}
