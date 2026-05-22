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
  const baseUrl = config.base_url ?? env[config.base_url_env] ?? "https://api.openai.com/v1";
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function extractContent(json: unknown): string | undefined {
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  if (typeof message?.content === "string") return message.content;
  return undefined;
}

function shouldDisableThinking(config: AiProviderConfig): boolean {
  return /^glm-5\.1\b/i.test(config.model.trim());
}

function providerTimeoutError(timeoutMs: number): Error {
  return new Error(`AI provider request timed out after ${timeoutMs}ms`);
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

      const timeoutMs = options.config.ai_timeout_ms;
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(providerTimeoutError(timeoutMs));
        }, timeoutMs);
      });
      let raw: unknown;
      try {
        raw = await Promise.race([
          (async () => {
            const response = await fetchImpl(providerEndpoint(options.config, env), {
              method: "POST",
              signal: controller.signal,
              headers: {
                "authorization": `Bearer ${apiKey}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: options.config.model,
                temperature: options.config.default_temperature,
                ...(shouldDisableThinking(options.config) ? { thinking: { type: "disabled" } } : {}),
                response_format: { type: "json_object" },
                max_tokens: Math.max(256, Math.ceil(input.maxOutputBytes / 4)),
                messages: [
                  { role: "system", content: input.system },
                  { role: "user", content: input.user },
                ],
              }),
            });

            if (!response.ok) {
              throw new Error(`HTTP_STATUS:${response.status}`);
            }

            try {
              return await response.json();
            } catch {
              throw new Error("NON_JSON_RESPONSE");
            }
          })(),
          timeoutPromise,
        ]);
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith("AI provider request timed out") || name === "AbortError" || controller.signal.aborted) {
          return { ok: false, error: `AI provider request timed out after ${timeoutMs}ms` };
        }
        if (message.startsWith("HTTP_STATUS:")) {
          return { ok: false, error: `AI provider request failed with HTTP ${message.replace("HTTP_STATUS:", "")}` };
        }
        if (message === "NON_JSON_RESPONSE") {
          return { ok: false, error: "AI provider returned non-JSON response" };
        }
        return { ok: false, error: `AI provider request failed: ${message}` };
      } finally {
        if (timeout) clearTimeout(timeout);
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
