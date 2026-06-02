import { z } from "zod";
import { readText } from "../store/file-store.js";
import type { WikiSource } from "./model.js";

export const WIKI_FILTER_RULES_PATH = ".praxisbase/filter-rules.yaml";

const FilterActionSchema = z.enum(["exclude", "human_required", "include"]);

const FilterWhenSchema = z.object({
  agent: z.string().optional(),
  kind: z.string().optional(),
  json_type: z.string().optional(),
  contains_any: z.array(z.string()).default([]),
  contains_all: z.array(z.string()).default([]),
  contains_structural_key: z.string().optional(),
  signal_any: z.array(z.string()).default([]),
  source_ref_contains: z.string().optional(),
  path_contains: z.string().optional(),
});

const FilterRuleSchema = z.object({
  id: z.string().min(1),
  action: FilterActionSchema,
  when: FilterWhenSchema,
});

const FilterRulesSchema = z.object({
  rules: z.array(FilterRuleSchema).default([]),
});

export type WikiFilterRule = z.infer<typeof FilterRuleSchema>;
export type WikiFilterDecision =
  | { action: "none" }
  | { action: "exclude" | "human_required" | "include"; rule_id: string };

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScalar(line: string): [string, string] | undefined {
  const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
  if (!match) return undefined;
  return [match[1], unquote(match[2])];
}

function parseInlineList(value: string): string[] | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return undefined;
  return trimmed.slice(1, -1).split(",").map((item) => unquote(item)).filter(Boolean);
}

export function parseWikiFilterRulesYaml(text: string): WikiFilterRule[] {
  const rules: Array<{ id?: string; action?: string; when: Record<string, string | string[]> }> = [];
  let current: { id?: string; action?: string; when: Record<string, string | string[]> } | undefined;
  let inWhen = false;
  let listKey: string | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "");
    if (!line.trim()) continue;
    const trimmed = line.trim();
    if (trimmed === "rules:") continue;

    if (/^-\s+/.test(trimmed)) {
      const item = trimmed.replace(/^-\s+/, "");
      if (current && inWhen && listKey) {
        const existing = current.when[listKey];
        const values = Array.isArray(existing) ? existing : [];
        values.push(unquote(item));
        current.when[listKey] = values;
        continue;
      }

      current = { when: {} };
      rules.push(current);
      inWhen = false;
      listKey = undefined;
      const scalar = parseScalar(item);
      if (scalar) current[scalar[0] as "id" | "action"] = scalar[1];
      continue;
    }

    if (!current) continue;
    if (trimmed === "when:") {
      inWhen = true;
      listKey = undefined;
      continue;
    }

    const scalar = parseScalar(trimmed);
    if (!scalar) continue;
    const [key, value] = scalar;
    const inlineList = parseInlineList(value);
    if (inWhen) {
      if (inlineList) {
        current.when[key] = inlineList;
        listKey = undefined;
      } else if (value === "") {
        current.when[key] = [];
        listKey = key;
      } else {
        current.when[key] = value;
        listKey = undefined;
      }
    } else {
      current[key as "id" | "action"] = value;
      listKey = undefined;
    }
  }

  return FilterRulesSchema.parse({ rules }).rules;
}

export async function readWikiFilterRules(root: string): Promise<WikiFilterRule[]> {
  try {
    return parseWikiFilterRulesYaml(await readText(root, WIKI_FILTER_RULES_PATH));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }
}

function textForSource(source: WikiSource): string {
  return [source.title, source.summary, source.body].filter(Boolean).join("\n");
}

function sourceJsonType(source: WikiSource): string | undefined {
  const text = textForSource(source).trim();
  const match = text.match(/^\s*\{[\s\S]*"type"\s*:\s*"([^"]+)"/);
  return match?.[1];
}

function sourceAgent(source: WikiSource): string | undefined {
  const explicit = (source as WikiSource & { agent?: string }).agent;
  if (explicit) return explicit;
  const ref = `${source.source_ref ?? ""}\n${source.path ?? ""}\n${source.id}`.toLowerCase();
  if (ref.includes("codex")) return "codex";
  if (ref.includes("openclaw")) return "openclaw";
  if (ref.includes("claude-code")) return "claude-code";
  return undefined;
}

export function inferExperienceSignals(source: WikiSource): string[] {
  const text = textForSource(source).toLowerCase();
  const signals = new Set<string>();
  if (/\b(fixed|resolved|passed|verified|validated|修复|解决|通过|验证)\b/i.test(text)) signals.add("verified_fix");
  if (/\b(user preference|preference|以后|记住|不要|优先|下次)\b/i.test(text)) signals.add("durable_user_preference");
  if (/\b(failed attempt|failed|did not work|失败|踩坑)\b/i.test(text)) signals.add("failed_attempt");
  if (/\b(decision|decided|决定|方案|取舍)\b/i.test(text)) signals.add("project_decision");
  if (/\b(pitfall|avoid|风险|坑|避免)\b/i.test(text)) signals.add("pitfall");
  if (/\b(test|pnpm|pytest|build|lint|acceptance|smoke)\b/i.test(text)) signals.add("workflow_result");
  return Array.from(signals).sort();
}

function includesAll(text: string, values: string[]): boolean {
  return values.every((value) => text.includes(value.toLowerCase()));
}

function includesAny(text: string, values: string[]): boolean {
  return values.length === 0 || values.some((value) => text.includes(value.toLowerCase()));
}

function matchesRule(source: WikiSource, rule: WikiFilterRule): boolean {
  const when = rule.when;
  const text = textForSource(source).toLowerCase();
  const sourceRef = (source.source_ref ?? "").toLowerCase();
  const path = (source.path ?? "").toLowerCase();
  if (when.agent && sourceAgent(source) !== when.agent) return false;
  if (when.kind && source.kind !== when.kind) return false;
  if (when.json_type && sourceJsonType(source) !== when.json_type) return false;
  if (when.contains_structural_key && !text.includes(`"${when.contains_structural_key.toLowerCase()}"`)) return false;
  if (when.source_ref_contains && !sourceRef.includes(when.source_ref_contains.toLowerCase())) return false;
  if (when.path_contains && !path.includes(when.path_contains.toLowerCase())) return false;
  if (!includesAny(text, when.contains_any)) return false;
  if (!includesAll(text, when.contains_all)) return false;
  if (when.signal_any.length > 0) {
    const signals = new Set(inferExperienceSignals(source));
    if (!when.signal_any.some((signal) => signals.has(signal))) return false;
  }
  return true;
}

export function decideWikiFilter(source: WikiSource, rules: WikiFilterRule[]): WikiFilterDecision {
  for (const rule of rules) {
    if (matchesRule(source, rule)) return { action: rule.action, rule_id: rule.id };
  }
  return { action: "none" };
}
