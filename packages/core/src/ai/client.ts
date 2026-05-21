import type { AiProviderConfig } from "./config.js";

export interface AiJsonClient {
  generateJson(input: {
    system: string;
    user: string;
    schemaName: string;
    maxOutputBytes: number;
  }): Promise<{ ok: true; json: unknown } | { ok: false; error: string }>;
}

export interface OpenAiCompatibleJsonClientOptions {
  config: AiProviderConfig;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

function providerEndpoint(config: AiProviderConfig, env: Record<string, string | undefined>): string {
  const baseUrl = env[config.base_url_env] ?? "https://api.openai.com/v1";
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function extractContent(json: unknown): string | undefined {
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  if (typeof message?.content === "string") return message.content;
  return undefined;
}

export function createOpenAiCompatibleJsonClient(options: OpenAiCompatibleJsonClientOptions): AiJsonClient {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async generateJson(input) {
      const apiKey = env[options.config.api_key_env];
      if (!apiKey) {
        return { ok: false, error: `${options.config.api_key_env} is not set` };
      }

      const response = await fetchImpl(providerEndpoint(options.config, env), {
        method: "POST",
        headers: {
          "authorization": `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: options.config.model,
          temperature: options.config.default_temperature,
          response_format: { type: "json_object" },
          max_tokens: Math.max(256, Math.ceil(input.maxOutputBytes / 4)),
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
        }),
      });

      if (!response.ok) {
        return { ok: false, error: `AI provider request failed with HTTP ${response.status}` };
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        return { ok: false, error: "AI provider returned non-JSON response" };
      }

      const content = extractContent(raw);
      if (!content) {
        return { ok: false, error: `AI provider response did not include ${input.schemaName} JSON content` };
      }

      try {
        return { ok: true, json: JSON.parse(content) };
      } catch {
        return { ok: false, error: `AI provider returned invalid ${input.schemaName} JSON` };
      }
    },
  };
}
