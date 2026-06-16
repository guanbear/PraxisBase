import { readText } from "../store/file-store.js";
import { protocolPaths } from "../protocol/paths.js";

export type ProjectLanguage = "en" | "zh-CN";

export interface ProjectLanguageConfig {
  uiLanguage: ProjectLanguage;
  contentLanguage: ProjectLanguage;
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

  try {
    const config = await readText(root, protocolPaths.config);
    fileLanguage = normalizeLanguage(yamlScalar(config, "language"));
    fileUiLanguage = normalizeLanguage(yamlScalar(config, "ui_language"));
    fileContentLanguage = normalizeLanguage(yamlScalar(config, "content_language"));
  } catch {
    // Missing project config is valid for tests and lightweight consumers.
  }

  const base = envLanguage ?? fileLanguage ?? "en";
  return {
    uiLanguage: envUiLanguage ?? fileUiLanguage ?? base,
    contentLanguage: envContentLanguage ?? fileContentLanguage ?? base,
  };
}
