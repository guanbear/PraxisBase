import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  doctorAiProvider,
  readAiProviderConfig,
  writeAiProviderConfig,
} from "@praxisbase/core/ai/config.js";

describe("AI provider config", () => {
  it("writes non-secret provider metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-ai-config-"));

    const config = await writeAiProviderConfig(root, {
      provider: "openai-compatible",
      model: "gpt-test",
    });

    assert.equal(config.provider, "openai-compatible");
    assert.equal(config.model, "gpt-test");
    assert.equal(config.api_key_env, "PRAXISBASE_LLM_API_KEY");
    assert.equal(config.base_url_env, "PRAXISBASE_LLM_BASE_URL");
    assert.equal(config.default_temperature, 0);
    assert.equal(config.max_input_bytes, 24576);
    assert.equal(config.max_output_bytes, 8192);
    assert.equal(config.ai_timeout_ms, 90_000);

    const raw = await readFile(join(root, ".praxisbase/ai/config.json"), "utf8");
    assert.doesNotMatch(raw, /secret-value/);
    assert.doesNotMatch(raw, /sk-test/);
    assert.deepEqual(await readAiProviderConfig(root), config);
  });

  it("supports local OpenAI-compatible endpoint and custom API key env names", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-ai-config-custom-env-"));

    const config = await writeAiProviderConfig(root, {
      provider: "openai-compatible",
      model: "glm-5.1",
      apiKeyEnv: "ZAI_API_KEY",
      baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    });

    assert.equal(config.api_key_env, "ZAI_API_KEY");
    assert.equal(config.base_url, "https://open.bigmodel.cn/api/coding/paas/v4");

    const noKey = await doctorAiProvider(root, {});
    assert.equal(noKey.ok, false);
    assert.ok(noKey.checks.some((check) => check.id === "ai-api-key" && check.message === "ZAI_API_KEY is not set."));

    const ready = await doctorAiProvider(root, {
      ZAI_API_KEY: "secret-value",
    });
    assert.equal(ready.ok, true);
    assert.ok(ready.checks.some((check) => check.id === "ai-base-url" && check.ok === true));
    assert.doesNotMatch(JSON.stringify(ready), /secret-value/);
  });

  it("stores stage-specific models without duplicating provider secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-ai-config-staged-"));

    const config = await writeAiProviderConfig(root, {
      provider: "openai-compatible",
      model: "GLM-5.1",
      distillModel: "GLM-4.7",
      curationModel: "GLM-5.1",
      apiKeyEnv: "ZAI_API_KEY",
    });

    assert.equal(config.model, "GLM-5.1");
    assert.equal(config.distill_model, "GLM-4.7");
    assert.equal(config.curation_model, "GLM-5.1");
    assert.equal(config.api_key_env, "ZAI_API_KEY");
    const raw = await readFile(join(root, ".praxisbase/ai/config.json"), "utf8");
    assert.doesNotMatch(raw, /secret-value|sk-/);
  });

  it("rejects unsupported providers", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-ai-config-provider-"));

    await assert.rejects(
      () => writeAiProviderConfig(root, {
        provider: "anthropic" as "openai-compatible",
        model: "claude-test",
      }),
      /Unsupported AI provider/
    );
  });

  it("doctor reports missing config and missing env without secret leakage", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-ai-doctor-"));

    const missing = await doctorAiProvider(root, {
      PRAXISBASE_LLM_API_KEY: "secret-value",
    });
    assert.equal(missing.ok, false);
    assert.ok(missing.checks.some((check) => check.id === "ai-config" && check.ok === false));
    assert.doesNotMatch(JSON.stringify(missing), /secret-value/);

    await writeAiProviderConfig(root, {
      provider: "openai-compatible",
      model: "gpt-test",
    });

    const noKey = await doctorAiProvider(root, {});
    assert.equal(noKey.ok, false);
    assert.ok(noKey.checks.some((check) => check.id === "ai-api-key" && check.ok === false));

    const ready = await doctorAiProvider(root, {
      PRAXISBASE_LLM_API_KEY: "secret-value",
      PRAXISBASE_LLM_BASE_URL: "https://llm.example.test/v1",
    });
    assert.equal(ready.ok, true);
    assert.ok(ready.checks.some((check) => check.id === "ai-api-key" && check.ok === true));
    assert.ok(ready.checks.some((check) => check.id === "ai-base-url" && check.ok === true));
    assert.doesNotMatch(JSON.stringify(ready), /secret-value/);
  });
});
