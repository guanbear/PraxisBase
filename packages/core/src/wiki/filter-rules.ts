import { z } from "zod";
import { readText } from "../store/file-store.js";
import type { ProjectKnowledgeBaseConfig, ProjectKnowledgeConfig } from "../config/project.js";
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
  knowledge_base: z.string().optional(),
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

export type KnowledgeBaseFilterDecision =
  | { action: "none"; knowledge_base: string; filter_mode: "balanced" | "allowlist"; matched_rule?: string; reason?: string }
  | { action: "exclude" | "human_required" | "include"; rule_id: string; knowledge_base: string; filter_mode: "balanced" | "allowlist"; reason: string };

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

function normalizedBaseId(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/_/g, "-");
  return normalized || undefined;
}

export function inferWikiSourceKnowledgeBase(source: WikiSource): string {
  const explicit = normalizedBaseId((source as WikiSource & { knowledge_base?: string; knowledge_source?: string }).knowledge_base)
    ?? normalizedBaseId((source as WikiSource & { knowledge_base?: string; knowledge_source?: string }).knowledge_source);
  if (explicit) return explicit;
  const text = [
    source.source_ref,
    source.path,
    source.title,
    source.summary,
    source.body,
  ].filter(Boolean).join("\n").toLowerCase();
  if (/\bk8s\b|kubernetes|oomkilled|crashloop|pod\b|kubectl/.test(text)) return "k8s";
  if (/openclaw|octoclaw|answer-bot|gateway|pairing|crabwalk|requiremention|sessiontarget/.test(text)) return "openclaw";
  if (/container|docker|imagepullbackoff|runtime/.test(text)) return "container-repair";
  if (/feishu|lark/.test(text)) return "feishu";
  if (/codex/.test(text)) return "codex";
  return "default";
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
  if (when.knowledge_base && inferWikiSourceKnowledgeBase(source) !== normalizedBaseId(when.knowledge_base)) return false;
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

function textForKnowledgeRule(source: WikiSource): string {
  return [source.title, source.summary, source.body].filter(Boolean).join("\n").toLowerCase();
}

function isGreetingOnlySource(source: WikiSource): boolean {
  const text = textForKnowledgeRule(source)
    .replace(/[`*_#>\-\s，。,.!！?？:：;；~～]/g, "")
    .trim();
  if (!text) return true;
  if (text.length > 28) return false;
  return /^(hi|hello|hey|ok|okay|thanks|thankyou|你好|您好|在吗|收到|好的|好|谢谢|辛苦了|早|早上好|晚上好|测试)$/.test(text);
}

function hasOpenClawRepairSignal(text: string): boolean {
  return /\b(openclaw|gateway|feishu|webui|cron|sessiontarget|payload\.kind|pairing|crabwalk|plugin|requiremention|access not configured|connection refused|models?|status|tui|kimi)\b/i.test(text)
    && /\b(fix|fixed|repair|recover|restart|retry|verify|check|update|enable|approve|workaround|failed|failure|stuck|timeout|root cause)\b|修复|解决|处理|排查|重启|检查|验证|失败|报错|根因|现象|授权|配对|更新|启用|已知问题|磁盘|内存|空间|不回复|无响应/i.test(text);
}

function hasOpenClawQaPolicySignal(text: string): boolean {
  return /\b(openclaw|feishu|model|models|skills?|tui|kimi|claude code|l2|data|security)\b/i.test(text)
    && /固定口径|统一答|统一回答|怎么回答|优先让|不要|转给|mention|保密|涉密|数据安全|问答|回答|policy|rule|guidance|escalat/i.test(text);
}

function hasVerificationOrEscalationSignal(text: string): boolean {
  return /\b(verify|verification|check|smoke|health|ready|readiness|passed|escalate|mention|owner|handoff)\b|验证|检查|健康|通过|升级|转给|负责人|人工|确认|复现|影响范围/i.test(text);
}

function hasK8sRepairSignal(text: string): boolean {
  return /\b(k8s|kubernetes|pod|container|kubectl|deployment|oomkilled|crashloop|imagepullbackoff|node)\b/i.test(text)
    && /\b(fix|repair|restart|rollback|scale|describe|logs|events|verify|check|failed|failure)\b|修复|排查|重启|回滚|扩缩容|检查|验证|失败|报错/i.test(text);
}

function hasContainerRepairSignal(text: string): boolean {
  return /\b(container|docker|image|runtime|cgroup|oom|disk|volume)\b/i.test(text)
    && /\b(fix|repair|restart|pull|rollback|verify|check|failed|failure)\b|修复|排查|重启|拉取|回滚|检查|验证|失败|报错/i.test(text);
}

function namedKnowledgeRuleMatches(rule: string, source: WikiSource, base: ProjectKnowledgeBaseConfig): boolean {
  const normalized = rule.trim().toLowerCase().replace(/_/g, "-");
  const text = textForKnowledgeRule(source);
  if (normalized === "reject-greeting-only") return isGreetingOnlySource(source);
  if (normalized === "keep-openclaw-repair" || normalized === "keep-repair-actions") return hasOpenClawRepairSignal(text);
  if (normalized === "keep-openclaw-qa-policy") return hasOpenClawQaPolicySignal(text);
  if (normalized === "keep-verification-or-escalation") return hasVerificationOrEscalationSignal(text)
    && (base.id !== "openclaw" || /openclaw|feishu|gateway|bot|机器人|模型|授权|配对/i.test(text));
  if (normalized === "keep-k8s-repair") return hasK8sRepairSignal(text);
  if (normalized === "keep-container-repair") return hasContainerRepairSignal(text);
  return false;
}

function isRejectRule(rule: string): boolean {
  return rule.trim().toLowerCase().replace(/_/g, "-").startsWith("reject-");
}

function isKeepRule(rule: string): boolean {
  return rule.trim().toLowerCase().replace(/_/g, "-").startsWith("keep-");
}

export function decideKnowledgeBaseFilter(source: WikiSource, config?: ProjectKnowledgeConfig): KnowledgeBaseFilterDecision {
  const knowledgeBase = inferWikiSourceKnowledgeBase(source);
  const base = config?.bases.find((item) => item.id === knowledgeBase)
    ?? config?.bases.find((item) => item.id === "default")
    ?? config?.bases[0];
  const filterMode = base?.filterMode ?? "balanced";
  const rules = base?.filterRules ?? config?.filterRules ?? [];

  for (const rule of rules.filter(isRejectRule)) {
    if (namedKnowledgeRuleMatches(rule, source, base ?? { id: knowledgeBase, filterMode, filterRules: [] })) {
      return { action: "exclude", rule_id: rule, knowledge_base: knowledgeBase, filter_mode: filterMode, reason: `matched ${rule}` };
    }
  }

  const keepRules = rules.filter(isKeepRule);
  for (const rule of keepRules) {
    if (namedKnowledgeRuleMatches(rule, source, base ?? { id: knowledgeBase, filterMode, filterRules: [] })) {
      return { action: "include", rule_id: rule, knowledge_base: knowledgeBase, filter_mode: filterMode, reason: `matched ${rule}` };
    }
  }

  if (filterMode === "allowlist" && keepRules.length > 0) {
    return {
      action: "exclude",
      rule_id: `${knowledgeBase}:allowlist-default`,
      knowledge_base: knowledgeBase,
      filter_mode: filterMode,
      reason: "no keep rule matched",
    };
  }

  return { action: "none", knowledge_base: knowledgeBase, filter_mode: filterMode };
}
