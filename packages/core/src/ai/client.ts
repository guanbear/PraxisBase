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
  if (typeof (json as { output_text?: unknown }).output_text === "string") {
    return (json as { output_text: string }).output_text;
  }
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  if (typeof message?.content === "string") return message.content;
  return undefined;
}

function parseProviderJsonText(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return parseOpenAiSseText(trimmed);
  }
}

function parseOpenAiSseText(text: string): unknown | undefined {
  const chunks: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") continue;
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      continue;
    }
    const choice = (json as { choices?: Array<{ delta?: { content?: unknown }, message?: { content?: unknown } }> }).choices?.[0];
    const deltaContent = choice?.delta?.content;
    const messageContent = choice?.message?.content;
    if (typeof deltaContent === "string") chunks.push(deltaContent);
    else if (typeof messageContent === "string") chunks.push(messageContent);
    else {
      const outputText = (json as { output_text?: unknown }).output_text;
      if (typeof outputText === "string") chunks.push(outputText);
    }
  }
  if (chunks.length === 0) return undefined;
  return { choices: [{ message: { content: chunks.join("") } }] };
}

function shouldDisableThinking(config: AiProviderConfig): boolean {
  return /^glm-(?:4\.7|5\.1)\b/i.test(config.model.trim());
}

function providerTimeoutError(timeoutMs: number): Error {
  return new Error(`AI provider request timed out after ${timeoutMs}ms`);
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number.parseFloat(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(10_000, seconds * 1000);
    const dateMs = Date.parse(retryAfter);
    if (Number.isFinite(dateMs)) return Math.max(0, Math.min(10_000, dateMs - Date.now()));
  }
  return Math.min(2_000, 250 * (2 ** attempt));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal.aborted) return Promise.reject(providerTimeoutError(0));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function createOpenAiCompatibleJsonClient(options: OpenAiCompatibleJsonClientOptions): AiJsonClient {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = 3;

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
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
                if (attempt < maxAttempts - 1 && isRetryableHttpStatus(response.status)) {
                  await sleep(retryDelayMs(response, attempt), controller.signal);
                  continue;
                }
                throw new Error(`HTTP_STATUS:${response.status}`);
              }

              const text = await response.text();
              const parsed = parseProviderJsonText(text);
              if (parsed === undefined) throw new Error("NON_JSON_RESPONSE");
              return parsed;
            }
            throw new Error("HTTP_STATUS:429");
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
