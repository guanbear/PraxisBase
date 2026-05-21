import {
  doctorAiProvider,
  writeAiProviderConfig,
  type AiProviderConfig,
} from "@praxisbase/core/ai/config.js";

export interface AiCommandOptions {
  provider?: "openai-compatible";
  model?: string;
  baseUrl?: string;
  baseUrlEnv?: string;
  apiKeyEnv?: string;
  json?: boolean;
  env?: Record<string, string | undefined>;
}

function unsupportedProvider(provider: string | undefined, json: boolean): string {
  const payload = {
    ok: false,
    code: "AI_PROVIDER_UNSUPPORTED",
    message: `Unsupported AI provider: ${provider ?? ""}`,
  };
  if (json) return JSON.stringify(payload, null, 2);
  return payload.message;
}

function formatInit(config: AiProviderConfig, json: boolean): string {
  if (json) return JSON.stringify({ ok: true, config }, null, 2);
  return `AI provider config written: ${config.provider} ${config.model}`;
}

export async function aiCommand(root: string, subcommand: string, options: AiCommandOptions): Promise<string> {
  if (subcommand === "init") {
    if (options.provider !== "openai-compatible") {
      return unsupportedProvider(options.provider, options.json ?? false);
    }
    if (!options.model) {
      throw new Error("ai init requires --model <model>.");
    }
    const config = await writeAiProviderConfig(root, {
      provider: options.provider,
      model: options.model,
      baseUrl: options.baseUrl,
      baseUrlEnv: options.baseUrlEnv,
      apiKeyEnv: options.apiKeyEnv,
    });
    return formatInit(config, options.json ?? false);
  }

  if (subcommand === "doctor") {
    const report = await doctorAiProvider(root, options.env);
    if (options.json) return JSON.stringify({ ok: true, report }, null, 2);
    return report.ok
      ? "AI provider is ready"
      : `AI provider is not ready: ${report.checks.filter((check) => !check.ok).map((check) => check.message).join("; ")}`;
  }

  throw new Error(`Unknown subcommand "ai ${subcommand}". Use "ai init" or "ai doctor".`);
}
