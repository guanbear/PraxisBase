import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOpenAiCompatibleJsonClient, PROTOCOL_VERSION } from "@praxisbase/core";
import type { AiProviderConfig } from "@praxisbase/core/ai/config.js";

function config(model: string): AiProviderConfig {
  return {
    protocol_version: PROTOCOL_VERSION,
    type: "ai_provider_config",
    provider: "openai-compatible",
    model,
    base_url_env: "PRAXISBASE_LLM_BASE_URL",
    api_key_env: "PRAXISBASE_LLM_API_KEY",
    default_temperature: 0,
    max_input_bytes: 24576,
    max_output_bytes: 8192,
    ai_timeout_ms: 90_000,
  };
}

describe("OpenAI-compatible AI client", () => {
  it("disables GLM-5.1 thinking so JSON content is returned outside reasoning", async () => {
    let requestBody: unknown;
    const client = createOpenAiCompatibleJsonClient({
      config: config("GLM-5.1"),
      env: {
        PRAXISBASE_LLM_API_KEY: "test-key",
        PRAXISBASE_LLM_BASE_URL: "https://llm.example.test/v1",
      },
      fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          choices: [{ message: { content: "{\"ok\":true}" } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    const result = await client.generateJson({
      system: "Return JSON only.",
      user: "Return ok.",
      schemaName: "Probe",
      maxOutputBytes: 256,
    });

    assert.deepEqual(result, { ok: true, json: { ok: true } });
    assert.deepEqual((requestBody as { thinking?: unknown }).thinking, { type: "disabled" });
  });

  it("disables GLM-4.7 thinking so JSON content is returned outside reasoning", async () => {
    let requestBody: unknown;
    const client = createOpenAiCompatibleJsonClient({
      config: config("GLM-4.7"),
      env: {
        PRAXISBASE_LLM_API_KEY: "test-key",
        PRAXISBASE_LLM_BASE_URL: "https://llm.example.test/v1",
      },
      fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          choices: [{ message: { content: "{\"ok\":true}" } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    const result = await client.generateJson({
      system: "Return JSON only.",
      user: "Return ok.",
      schemaName: "Probe",
      maxOutputBytes: 256,
    });

    assert.deepEqual(result, { ok: true, json: { ok: true } });
    assert.deepEqual((requestBody as { thinking?: unknown }).thinking, { type: "disabled" });
  });

  it("aborts slow provider requests with a bounded timeout", async () => {
    const client = createOpenAiCompatibleJsonClient({
      config: { ...config("GLM-5.1"), ai_timeout_ms: 5 },
      env: {
        PRAXISBASE_LLM_API_KEY: "test-key",
        PRAXISBASE_LLM_BASE_URL: "https://llm.example.test/v1",
      },
      fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal;
        return await new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        });
      },
    });

    const result = await client.generateJson({
      system: "Return JSON only.",
      user: "Return ok.",
      schemaName: "Probe",
      maxOutputBytes: 256,
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /timed out/i);
  });

  it("retries retryable provider rate limits before returning JSON", async () => {
    let attempts = 0;
    const client = createOpenAiCompatibleJsonClient({
      config: config("GLM-4.7"),
      env: {
        PRAXISBASE_LLM_API_KEY: "test-key",
        PRAXISBASE_LLM_BASE_URL: "https://llm.example.test/v1",
      },
      fetchImpl: async () => {
        attempts++;
        if (attempts === 1) {
          return new Response(JSON.stringify({ error: "rate limited" }), {
            status: 429,
            headers: { "retry-after": "0" },
          });
        }
        return new Response(JSON.stringify({
          choices: [{ message: { content: "{\"ok\":true}" } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    const result = await client.generateJson({
      system: "Return JSON only.",
      user: "Return ok.",
      schemaName: "Probe",
      maxOutputBytes: 256,
    });

    assert.equal(attempts, 2);
    assert.deepEqual(result, { ok: true, json: { ok: true } });
  });

  it("aborts slow provider response bodies with the same timeout", async () => {
    const client = createOpenAiCompatibleJsonClient({
      config: { ...config("GLM-5.1"), ai_timeout_ms: 5 },
      env: {
        PRAXISBASE_LLM_API_KEY: "test-key",
        PRAXISBASE_LLM_BASE_URL: "https://llm.example.test/v1",
      },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => await new Promise<unknown>(() => undefined),
      } as Response),
    });

    const result = await client.generateJson({
      system: "Return JSON only.",
      user: "Return ok.",
      schemaName: "Probe",
      maxOutputBytes: 256,
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /timed out/i);
  });
});
