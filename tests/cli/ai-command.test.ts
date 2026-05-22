import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aiCommand } from "@praxisbase/cli/commands/ai.js";

describe("ai CLI command", () => {
  it("initializes AI config as JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-ai-init-"));

    const output = await aiCommand(root, "init", {
      provider: "openai-compatible",
      model: "gpt-test",
      json: true,
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.config.provider, "openai-compatible");
    assert.equal(parsed.config.model, "gpt-test");
    assert.equal(parsed.config.api_key_env, "PRAXISBASE_LLM_API_KEY");
  });

  it("initializes AI config with custom endpoint and API key env", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-ai-init-custom-"));

    const output = await aiCommand(root, "init", {
      provider: "openai-compatible",
      model: "glm-5.1",
      apiKeyEnv: "ZAI_API_KEY",
      baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
      aiTimeoutMs: 15_000,
      json: true,
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.config.api_key_env, "ZAI_API_KEY");
    assert.equal(parsed.config.base_url, "https://open.bigmodel.cn/api/coding/paas/v4");
    assert.equal(parsed.config.ai_timeout_ms, 15_000);
  });

  it("initializes AI config with stage-specific models", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-ai-init-staged-"));

    const output = await aiCommand(root, "init", {
      provider: "openai-compatible",
      model: "GLM-5.1",
      distillModel: "GLM-4.7",
      curationModel: "GLM-5.1",
      apiKeyEnv: "ZAI_API_KEY",
      json: true,
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.config.model, "GLM-5.1");
    assert.equal(parsed.config.distill_model, "GLM-4.7");
    assert.equal(parsed.config.curation_model, "GLM-5.1");
    assert.equal(parsed.config.api_key_env, "ZAI_API_KEY");
  });

  it("doctor reports readiness without leaking secret env values", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-ai-doctor-"));
    await aiCommand(root, "init", {
      provider: "openai-compatible",
      model: "gpt-test",
      json: true,
    });

    const output = await aiCommand(root, "doctor", {
      env: {
        PRAXISBASE_LLM_API_KEY: "secret-value",
        PRAXISBASE_LLM_BASE_URL: "https://llm.example.test/v1",
      },
      json: true,
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.ok, true);
    assert.doesNotMatch(output, /secret-value/);
  });

  it("rejects unsupported providers", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-ai-provider-"));

    const output = await aiCommand(root, "init", {
      provider: "anthropic" as "openai-compatible",
      model: "claude-test",
      json: true,
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "AI_PROVIDER_UNSUPPORTED");
  });
});
