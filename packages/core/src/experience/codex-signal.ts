type JsonRecord = Record<string, unknown>;

const TASK_PATTERNS = [
  /\b(?:implement(?:ed|ing)?|fix(?:ed|ing)?|change(?:d|s)?|add(?:ed|ing)?|update(?:d|s|ing)?|remove(?:d|ing)?|create(?:d|s|ing)?|refactor(?:ed|ing)?|debug(?:ged|ging)?|diagnos(?:ed|ing)|configure(?:d|s|ing)?|generate(?:d|s|ing)?|build(?:s|ing)?|test(?:ed|ing)?|verif(?:ied|y|ying)|ran)\b/i,
  /\b(?:pnpm|npm|yarn|bun|node|pytest|cargo|go)\s+(?:check|test|build|install|run|lint|typecheck)\b/i,
  /\btests?\s+(?:pass(?:ed)?|fail(?:ed)?|failing)\b/i,
  /(?:实现|修复|调整|更新|新增|删除|重构|排查|定位|验证|测试|通过|失败|提交|生成|构建|部署)/,
];

const SENSITIVE_PATTERNS = [
  /\b(?:token|api[_-]?key|secret|password|passwd|credential|authorization|bearer)\b/i,
  /(?:密钥|令牌|密码|凭证)/,
];

const NOISE_KEYS = new Set([
  "approval_policy",
  "base_instructions",
  "cli_version",
  "cwd",
  "environment_context",
  "id",
  "model_provider",
  "originator",
  "sandbox_mode",
  "source",
  "timestamp",
  "tools",
  "type",
]);

const TEXT_KEYS = new Set([
  "content",
  "message",
  "output",
  "raw_log",
  "redacted_summary",
  "summary",
  "text",
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 8 || value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item, depth + 1));
  if (!isRecord(value)) return [];
  if (value.type === "session_meta") return [];

  const direct: string[] = [];
  for (const key of TEXT_KEYS) {
    if (key in value) {
      direct.push(...collectStrings(value[key], depth + 1));
    }
  }
  if (direct.length > 0) return direct;

  const strings: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (NOISE_KEYS.has(key)) continue;
    strings.push(...collectStrings(child, depth + 1));
  }
  return strings;
}

function looksInjectedContext(text: string): boolean {
  return text.includes("AGENTS.md instructions")
    || text.includes("<INSTRUCTIONS>")
    || text.includes("<skills_instructions>")
    || text.includes("<environment_context>")
    || text.includes("Available skills");
}

function extractMessageTexts(value: unknown, depth = 0): { sawMessage: boolean; texts: string[] } {
  if (depth > 8 || value === null || value === undefined) {
    return { sawMessage: false, texts: [] };
  }
  if (Array.isArray(value)) {
    const nested = value.map((item) => extractMessageTexts(item, depth + 1));
    return {
      sawMessage: nested.some((item) => item.sawMessage),
      texts: nested.flatMap((item) => item.texts),
    };
  }
  if (!isRecord(value)) {
    return { sawMessage: false, texts: [] };
  }
  if (value.type === "session_meta") {
    return { sawMessage: true, texts: [] };
  }
  if (typeof value.role === "string" && "content" in value) {
    const role = value.role;
    const text = collectStrings(value.content)
      .map((item) => item.trim())
      .filter(Boolean)
      .join("\n");
    if ((role === "user" || role === "assistant") && text && !looksInjectedContext(text)) {
      return { sawMessage: true, texts: [text] };
    }
    return { sawMessage: true, texts: [] };
  }

  if (isRecord(value.payload)) {
    return extractMessageTexts(value.payload, depth + 1);
  }
  if (Array.isArray(value.messages)) {
    return extractMessageTexts(value.messages, depth + 1);
  }
  return { sawMessage: false, texts: [] };
}

export function extractCodexExperienceText(item: unknown, fallbackText = ""): string {
  if (isRecord(item) && item.type === "session_meta") return "";
  const messages = extractMessageTexts(item);
  if (messages.sawMessage) {
    return messages.texts.join("\n");
  }
  const text = collectStrings(item)
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");
  return text || fallbackText;
}

export function hasCodexTaskExperienceSignal(text: string): boolean {
  return TASK_PATTERNS.some((pattern) => pattern.test(text));
}

export function hasCodexSensitiveSignal(text: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

export function isCodexSessionNoise(item: unknown, fallbackText = ""): boolean {
  if (isRecord(item) && item.type === "session_meta") return true;
  const text = extractCodexExperienceText(item, fallbackText).toLowerCase();
  if (!text.trim()) return true;
  const looksLikeStartupContext = text.includes("base_instructions")
    || text.includes("sandbox_mode")
    || text.includes("approval_policy")
    || text.includes("model_provider");
  return looksLikeStartupContext && !hasCodexTaskExperienceSignal(text);
}

export function isUsefulCodexExperience(item: unknown, fallbackText = ""): boolean {
  if (isCodexSessionNoise(item, fallbackText)) return false;
  const text = extractCodexExperienceText(item, fallbackText);
  return hasCodexTaskExperienceSignal(text) || hasCodexSensitiveSignal(text);
}
