import { readText } from "../store/file-store.js";
import { protocolPaths } from "../protocol/paths.js";

export type ProjectLanguage = "en" | "zh-CN";

export interface ProjectLanguageConfig {
  uiLanguage: ProjectLanguage;
  contentLanguage: ProjectLanguage;
  knowledge: ProjectKnowledgeConfig;
}

export interface ProjectReviewUiConfig {
  reviewApiBase: string;
  writeback: "local" | "gitlab" | string;
}

export type KnowledgeProfile = "default" | "openclaw" | "container-repair" | "k8s" | string;

export interface ProjectKnowledgeConfig {
  profile: KnowledgeProfile;
  bases: ProjectKnowledgeBaseConfig[];
  promptInstruction?: string;
  curationIncludeAutoReleased: boolean;
  filterRules: string[];
}

export type KnowledgeFilterMode = "balanced" | "allowlist";

export interface ProjectKnowledgeBaseConfig {
  id: string;
  label?: string;
  profile?: KnowledgeProfile;
  promptInstruction?: string;
  filterMode: KnowledgeFilterMode;
  filterRules: string[];
}

interface RawKnowledgeBaseConfig {
  id: string;
  label?: string;
  profile?: string;
  promptInstruction?: string;
  filterMode?: string;
  filterRules?: string[];
}

function normalizeLanguage(value: unknown): ProjectLanguage | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace("_", "-");
  if (normalized === "zh" || normalized === "zh-cn" || normalized === "cn" || normalized === "chinese") return "zh-CN";
  if (normalized === "en" || normalized === "en-us" || normalized === "english") return "en";
  return undefined;
}

function yamlScalar(text: string, key: string): string | undefined {
  const pattern = new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, "m");
  const match = text.match(pattern);
  if (!match) return undefined;
  return match[1].replace(/^['\"]|['\"]$/g, "").trim();
}

function yamlList(text: string, key: string): string[] {
  const block = text.match(new RegExp(`^\\s*${key}\\s*:\\s*\\n((?:\\s+-\\s*.+\\n?)+)`, "m"));
  if (!block) return [];
  return block[1]
    .split(/\r?\n/)
    .map((line) => line.match(/^\s+-\s*(.+?)\s*$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/^['\"]|['\"]$/g, "").trim())
    .filter(Boolean);
}

function leadingSpaces(value: string): number {
  return value.match(/^\s*/)?.[0].length ?? 0;
}

function parseYamlListItemObject(item: string): [string, string] | undefined {
  const scalar = item.match(/^([A-Za-z0-9_-]+):\s*(.*?)\s*$/);
  if (!scalar) return undefined;
  return [scalar[1], scalar[2].replace(/^['\"]|['\"]$/g, "").trim()];
}

function yamlKnowledgeBases(text: string): RawKnowledgeBaseConfig[] {
  const lines = text.split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => /^\s*knowledge_bases\s*:\s*$/.test(line));
  if (keyIndex < 0) return [];
  const baseIndent = leadingSpaces(lines[keyIndex]);
  const result: RawKnowledgeBaseConfig[] = [];
  let current: RawKnowledgeBaseConfig | undefined;
  let listKey: "filterRules" | undefined;

  for (const rawLine of lines.slice(keyIndex + 1)) {
    const withoutComment = rawLine.replace(/\s+#.*$/, "");
    if (!withoutComment.trim()) continue;
    const indent = leadingSpaces(withoutComment);
    if (indent <= baseIndent) break;
    const trimmed = withoutComment.trim();

    if (trimmed.startsWith("- ")) {
      const item = trimmed.slice(2).trim();
      const objectEntry = parseYamlListItemObject(item);
      if (current && listKey && !objectEntry) {
        current[listKey] = [...(current[listKey] ?? []), item.replace(/^['\"]|['\"]$/g, "").trim()].filter(Boolean);
        continue;
      }
      if (objectEntry) {
        current = { id: "" };
        result.push(current);
        const [key, value] = objectEntry;
        if (key === "id") current.id = value;
        else if (key === "label") current.label = value;
        else if (key === "profile") current.profile = value;
        else if (key === "prompt" || key === "promptInstruction" || key === "prompt_instruction") current.promptInstruction = value;
        else if (key === "filter_mode" || key === "filterMode") current.filterMode = value;
        else if (key === "filter_rules" || key === "filterRules") current.filterRules = value ? [value] : [];
        listKey = undefined;
      } else {
        const id = item.replace(/^['\"]|['\"]$/g, "").trim();
        current = id ? { id } : undefined;
        if (current) result.push(current);
        listKey = undefined;
      }
      continue;
    }

    if (!current) continue;
    const scalar = parseYamlListItemObject(trimmed);
    if (!scalar) continue;
    const [key, value] = scalar;
    if (key === "id") current.id = value;
    else if (key === "label") current.label = value;
    else if (key === "profile") current.profile = value;
    else if (key === "prompt" || key === "promptInstruction" || key === "prompt_instruction") current.promptInstruction = value;
    else if (key === "filter_mode" || key === "filterMode") current.filterMode = value;
    else if (key === "filter_rules" || key === "filterRules") {
      current.filterRules = [];
      listKey = "filterRules";
    } else {
      listKey = undefined;
    }
  }

  return result.filter((item) => item.id.trim().length > 0);
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeKnowledgeBaseId(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

function normalizeFilterMode(value: string | undefined, profile: string): KnowledgeFilterMode {
  const normalized = value?.trim().toLowerCase().replace("_", "-");
  if (normalized === "allowlist" || normalized === "strict") return "allowlist";
  if (normalized === "balanced" || normalized === "default") return "balanced";
  return profile === "openclaw" || profile === "k8s" || profile === "container-repair" ? "allowlist" : "balanced";
}

function knowledgeBaseLabel(id: string): string {
  if (id === "openclaw") return "OpenClaw";
  if (id === "k8s") return "K8s";
  if (id === "container-repair") return "容器修复";
  if (id === "feishu") return "飞书";
  if (id === "codex") return "Codex";
  if (id === "default") return "默认";
  return id.split("-").map((part) => part ? part[0]!.toUpperCase() + part.slice(1) : part).join(" ");
}

function normalizeKnowledgeBases(
  values: string[],
  fallbackProfile: string,
  fallbackRules: string[] = [],
  rawConfigs: RawKnowledgeBaseConfig[] = [],
): ProjectKnowledgeBaseConfig[] {
  const configs: RawKnowledgeBaseConfig[] = rawConfigs.length > 0
    ? rawConfigs
    : (values.length > 0 ? values : [fallbackProfile]).map((id) => ({ id }));
  const seen = new Set<string>();
  const bases: ProjectKnowledgeBaseConfig[] = [];
  for (const value of configs) {
    const id = normalizeKnowledgeBaseId(value.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const profile = normalizeKnowledgeBaseId(value.profile ?? (id || fallbackProfile));
    const rules = value.filterRules?.length ? value.filterRules : fallbackRules;
    bases.push({
      id,
      label: value.label || knowledgeBaseLabel(id),
      profile,
      promptInstruction: value.promptInstruction,
      filterMode: normalizeFilterMode(value.filterMode, profile),
      filterRules: rules,
    });
  }
  return bases.length > 0
    ? bases
    : [{ id: "default", label: knowledgeBaseLabel("default"), profile: "default", filterMode: "balanced", filterRules: fallbackRules }];
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1", "on"].includes(normalized)) return true;
  if (["false", "no", "0", "off"].includes(normalized)) return false;
  return undefined;
}

export function knowledgeProfileInstruction(config: ProjectKnowledgeConfig): string | undefined {
  if (config.promptInstruction) return config.promptInstruction;
  if (config.profile === "openclaw") {
    return [
      "This knowledge base is for OpenClaw repair and Q&A robots.",
      "Extract operational repair experience: symptoms, root cause, exact action, verification command/result, escalation boundary, and when the lesson should not be reused.",
      "Prefer compact reusable Chinese guidance for robot operators over chat summaries.",
    ].join(" ");
  }
  if (config.profile === "container-repair" || config.profile === "k8s") {
    return [
      "This knowledge base is for container, Kubernetes, and runtime repair.",
      "Extract incident signatures, diagnostic commands, safe remediation steps, rollback checks, and post-repair verification.",
      "Avoid environment-specific identifiers unless they are already abstracted.",
    ].join(" ");
  }
  return undefined;
}

export function languageInstruction(language: ProjectLanguage): string {
  if (language === "zh-CN") {
    return "Use Simplified Chinese for titles, summaries, section headings, and reusable guidance. Keep code identifiers, commands, paths, model names, and product names unchanged.";
  }
  return "Use English for titles, summaries, section headings, and reusable guidance. Keep code identifiers, commands, paths, model names, and product names unchanged.";
}

export async function readProjectLanguageConfig(
  root: string,
  env: Record<string, string | undefined> = process.env,
): Promise<ProjectLanguageConfig> {
  const envLanguage = normalizeLanguage(env.PRAXISBASE_LANGUAGE);
  const envUiLanguage = normalizeLanguage(env.PRAXISBASE_UI_LANGUAGE);
  const envContentLanguage = normalizeLanguage(env.PRAXISBASE_CONTENT_LANGUAGE);
  let fileLanguage: ProjectLanguage | undefined;
  let fileUiLanguage: ProjectLanguage | undefined;
  let fileContentLanguage: ProjectLanguage | undefined;
  let fileKnowledgeProfile: string | undefined;
  let fileKnowledgeBases: string[] = [];
  let fileKnowledgeBaseConfigs: RawKnowledgeBaseConfig[] = [];
  let fileKnowledgePrompt: string | undefined;
  let fileCurationIncludeAutoReleased: boolean | undefined;
  let fileFilterRules: string[] = [];

  try {
    const config = await readText(root, protocolPaths.config);
    fileLanguage = normalizeLanguage(yamlScalar(config, "language"));
    fileUiLanguage = normalizeLanguage(yamlScalar(config, "ui_language"));
    fileContentLanguage = normalizeLanguage(yamlScalar(config, "content_language"));
    fileKnowledgeProfile = yamlScalar(config, "knowledge_profile") ?? yamlScalar(config, "knowledge_source");
    fileKnowledgeBases = yamlList(config, "knowledge_bases");
    fileKnowledgeBaseConfigs = yamlKnowledgeBases(config);
    fileKnowledgePrompt = yamlScalar(config, "knowledge_prompt") ?? yamlScalar(config, "profile_prompt");
    fileCurationIncludeAutoReleased = normalizeBoolean(yamlScalar(config, "curation_include_auto_released"));
    fileFilterRules = yamlList(config, "knowledge_filter_rules");
  } catch {
    // Missing project config is valid for tests and lightweight consumers.
  }

  const base = envLanguage ?? fileLanguage ?? "en";
  const envProfile = env.PRAXISBASE_KNOWLEDGE_PROFILE?.trim();
  const envKnowledgeBases = splitList(env.PRAXISBASE_KNOWLEDGE_BASES);
  const envPrompt = env.PRAXISBASE_PROFILE_PROMPT?.trim();
  const envIncludeAutoReleased = normalizeBoolean(env.PRAXISBASE_CURATION_INCLUDE_AUTO_RELEASED);
  const profile = envProfile || fileKnowledgeProfile || "default";
  return {
    uiLanguage: envUiLanguage ?? fileUiLanguage ?? base,
    contentLanguage: envContentLanguage ?? fileContentLanguage ?? base,
    knowledge: {
      profile,
      bases: normalizeKnowledgeBases(
        envKnowledgeBases.length > 0 ? envKnowledgeBases : fileKnowledgeBases,
        profile,
        fileFilterRules,
        envKnowledgeBases.length > 0 ? [] : fileKnowledgeBaseConfigs,
      ),
      promptInstruction: envPrompt || fileKnowledgePrompt,
      curationIncludeAutoReleased: envIncludeAutoReleased ?? fileCurationIncludeAutoReleased ?? true,
      filterRules: fileFilterRules,
    },
  };
}

export async function readProjectReviewUiConfig(
  root: string,
  env: Record<string, string | undefined> = process.env,
): Promise<ProjectReviewUiConfig> {
  let fileReviewApiBase: string | undefined;
  let fileWriteback: string | undefined;

  try {
    const config = await readText(root, protocolPaths.config);
    fileReviewApiBase = yamlScalar(config, "review_api_base");
    fileWriteback = yamlScalar(config, "review_writeback");
  } catch {
    // Missing project config is valid for tests and lightweight consumers.
  }

  return {
    reviewApiBase: env.PRAXISBASE_REVIEW_API_BASE?.trim() || fileReviewApiBase || "http://127.0.0.1:4174",
    writeback: env.PRAXISBASE_REVIEW_WRITEBACK?.trim() || fileWriteback || "local",
  };
}
