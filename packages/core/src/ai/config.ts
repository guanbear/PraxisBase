import { z } from "zod";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { protocolPaths } from "../protocol/paths.js";
import { readJson, writeJson } from "../store/file-store.js";

export const AiProviderConfigSchema = z.object({
  protocol_version: z.literal(PROTOCOL_VERSION),
  type: z.literal("ai_provider_config"),
  provider: z.literal("openai-compatible"),
  model: z.string().min(1),
  distill_model: z.string().min(1).optional(),
  curation_model: z.string().min(1).optional(),
  base_url: z.string().url().optional(),
  base_url_env: z.string().min(1).default("PRAXISBASE_LLM_BASE_URL"),
  api_key_env: z.string().min(1).default("PRAXISBASE_LLM_API_KEY"),
  default_temperature: z.number().min(0).max(2),
  max_input_bytes: z.number().int().positive(),
  max_output_bytes: z.number().int().positive(),
  ai_timeout_ms: z.number().int().positive().default(90_000),
});

export type AiProviderConfig = z.infer<typeof AiProviderConfigSchema>;

export interface WriteAiProviderConfigInput {
  provider: "openai-compatible";
  model: string;
  distillModel?: string;
  curationModel?: string;
  baseUrl?: string;
  baseUrlEnv?: string;
  apiKeyEnv?: string;
  aiTimeoutMs?: number;
}

export interface AiDoctorCheck {
  id: string;
  ok: boolean;
  severity: "info" | "warning" | "error";
  message: string;
}

export interface AiDoctorReport {
  ok: boolean;
  checks: AiDoctorCheck[];
  provider?: AiProviderConfig["provider"];
  model?: string;
}

export async function writeAiProviderConfig(root: string, input: WriteAiProviderConfigInput): Promise<AiProviderConfig> {
  if (input.provider !== "openai-compatible") {
    throw new Error(`Unsupported AI provider: ${input.provider}`);
  }
  const config = AiProviderConfigSchema.parse({
    protocol_version: PROTOCOL_VERSION,
    type: "ai_provider_config",
    provider: input.provider,
    model: input.model,
    ...(input.distillModel ? { distill_model: input.distillModel } : {}),
    ...(input.curationModel ? { curation_model: input.curationModel } : {}),
    ...(input.baseUrl ? { base_url: input.baseUrl } : {}),
    base_url_env: input.baseUrlEnv ?? "PRAXISBASE_LLM_BASE_URL",
    api_key_env: input.apiKeyEnv ?? "PRAXISBASE_LLM_API_KEY",
    default_temperature: 0,
    max_input_bytes: 24576,
    max_output_bytes: 8192,
    ai_timeout_ms: input.aiTimeoutMs ?? 90_000,
  });
  await writeJson(root, protocolPaths.aiConfig, config);
  return config;
}

export async function readAiProviderConfig(root: string): Promise<AiProviderConfig | null> {
  try {
    return AiProviderConfigSchema.parse(await readJson(root, protocolPaths.aiConfig));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function doctorAiProvider(
  root: string,
  env: Record<string, string | undefined> = process.env,
): Promise<AiDoctorReport> {
  const checks: AiDoctorCheck[] = [];
  const config = await readAiProviderConfig(root);

  if (!config) {
    checks.push({
      id: "ai-config",
      ok: false,
      severity: "error",
      message: `AI provider config is missing at ${protocolPaths.aiConfig}. Run praxisbase ai init.`,
    });
    return { ok: false, checks };
  }

  checks.push({
    id: "ai-config",
    ok: true,
    severity: "info",
    message: `AI provider config found for ${config.provider}.`,
  });

  const apiKey = env[config.api_key_env];
  checks.push({
    id: "ai-api-key",
    ok: Boolean(apiKey),
    severity: apiKey ? "info" : "error",
    message: apiKey
      ? `${config.api_key_env} is set.`
      : `${config.api_key_env} is not set.`,
  });

  const baseUrl = config.base_url ?? env[config.base_url_env];
  if (baseUrl) {
    const ok = validUrl(baseUrl);
    checks.push({
      id: "ai-base-url",
      ok,
      severity: ok ? "info" : "error",
      message: ok
        ? `${config.base_url ? "base_url" : config.base_url_env} is a valid URL.`
        : `${config.base_url ? "base_url" : config.base_url_env} is not a valid URL.`,
    });
  } else {
    checks.push({
      id: "ai-base-url",
      ok: true,
      severity: "info",
      message: `${config.base_url_env} is not set; provider default will be used.`,
    });
  }

  return {
    ok: checks.every((check) => check.ok || check.severity !== "error"),
    checks,
    provider: config.provider,
    model: config.model,
  };
}
