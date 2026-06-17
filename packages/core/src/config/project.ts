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
  promptInstruction?: string;
  curationIncludeAutoReleased: boolean;
  filterRules: string[];
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
  let fileKnowledgePrompt: string | undefined;
  let fileCurationIncludeAutoReleased: boolean | undefined;
  let fileFilterRules: string[] = [];

  try {
    const config = await readText(root, protocolPaths.config);
    fileLanguage = normalizeLanguage(yamlScalar(config, "language"));
    fileUiLanguage = normalizeLanguage(yamlScalar(config, "ui_language"));
    fileContentLanguage = normalizeLanguage(yamlScalar(config, "content_language"));
    fileKnowledgeProfile = yamlScalar(config, "knowledge_profile") ?? yamlScalar(config, "knowledge_source");
    fileKnowledgePrompt = yamlScalar(config, "knowledge_prompt") ?? yamlScalar(config, "profile_prompt");
    fileCurationIncludeAutoReleased = normalizeBoolean(yamlScalar(config, "curation_include_auto_released"));
    fileFilterRules = yamlList(config, "knowledge_filter_rules");
  } catch {
    // Missing project config is valid for tests and lightweight consumers.
  }

  const base = envLanguage ?? fileLanguage ?? "en";
  const envProfile = env.PRAXISBASE_KNOWLEDGE_PROFILE?.trim();
  const envPrompt = env.PRAXISBASE_PROFILE_PROMPT?.trim();
  const envIncludeAutoReleased = normalizeBoolean(env.PRAXISBASE_CURATION_INCLUDE_AUTO_RELEASED);
  return {
    uiLanguage: envUiLanguage ?? fileUiLanguage ?? base,
    contentLanguage: envContentLanguage ?? fileContentLanguage ?? base,
    knowledge: {
      profile: envProfile || fileKnowledgeProfile || "default",
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
