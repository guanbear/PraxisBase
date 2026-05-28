import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AiJsonClient } from "@praxisbase/core/ai/client.js";
import {
  createPayloadPreSummarySession,
  preSummarizePayload,
} from "@praxisbase/core/experience/payload-presummary.js";

function client(json: unknown, calls = { count: 0 }): AiJsonClient {
  return {
    async generateJson() {
      calls.count++;
      return { ok: true, json };
    },
  };
}

describe("payload pre-summary", () => {
  it("passes through payloads below the lower threshold without calling AI", async () => {
    const calls = { count: 0 };
    const result = await preSummarizePayload({
      text: "small payload",
      sourceRef: "raw-vault://small",
      sourceHash: "sha256:small",
      authorityMode: "personal-local",
      client: client({ summary: "unused", provenance: ["raw-vault://small"] }, calls),
      policy: { enabled: true, lowerThresholdBytes: 1000, upperThresholdBytes: 10_000 },
    });

    assert.equal(result.status, "passed_through");
    assert.equal(result.text, "small payload");
    assert.equal(calls.count, 0);
  });

  it("passes through payloads above the upper threshold without calling AI", async () => {
    const calls = { count: 0 };
    const result = await preSummarizePayload({
      text: "x".repeat(2000),
      sourceRef: "raw-vault://large",
      sourceHash: "sha256:large",
      authorityMode: "personal-local",
      client: client({ summary: "unused", provenance: ["raw-vault://large"] }, calls),
      policy: { enabled: true, lowerThresholdBytes: 100, upperThresholdBytes: 1000 },
    });

    assert.equal(result.status, "passed_through");
    assert.ok(result.warnings.includes("payload_above_presummary_upper_threshold"));
    assert.equal(calls.count, 0);
  });

  it("returns a provenance-backed shrinking summary", async () => {
    const result = await preSummarizePayload({
      text: "OpenClaw auth failed. ".repeat(200),
      sourceRef: "raw-vault://auth",
      sourceHash: "sha256:auth",
      authorityMode: "personal-local",
      client: client({
        summary: "OpenClaw auth failed; refresh token and verify smoke.",
        provenance: ["raw-vault://auth", "sha256:auth"],
      }),
      policy: { enabled: true, lowerThresholdBytes: 100, upperThresholdBytes: 10_000 },
      modelId: "glm-4.7",
      promptId: "payload-presummary-v1",
    });

    assert.equal(result.status, "summarized");
    assert.match(result.text, /refresh token/);
    assert.equal(result.model_id, "glm-4.7");
    assert.equal(result.prompt_id, "payload-presummary-v1");
    assert.ok(result.summary_bytes < result.original_bytes);
  });

  it("discards summaries that are not smaller", async () => {
    const text = "OpenClaw auth failed. ".repeat(20);
    const result = await preSummarizePayload({
      text,
      sourceRef: "raw-vault://auth",
      sourceHash: "sha256:auth",
      authorityMode: "personal-local",
      client: client({
        summary: `${text}${text}`,
        provenance: ["raw-vault://auth"],
      }),
      policy: { enabled: true, lowerThresholdBytes: 10, upperThresholdBytes: 10_000 },
    });

    assert.equal(result.status, "discarded");
    assert.ok(result.warnings.includes("summary_not_smaller"));
    assert.equal(result.text, text);
  });

  it("discards summaries that still contain privacy-unsafe material", async () => {
    const text = "OpenClaw auth failed. ".repeat(20);
    const result = await preSummarizePayload({
      text,
      sourceRef: "raw-vault://auth",
      sourceHash: "sha256:auth",
      authorityMode: "personal-local",
      client: client({
        summary: "Refresh token sk-secretsecretsecret before smoke.",
        provenance: ["raw-vault://auth"],
      }),
      policy: { enabled: true, lowerThresholdBytes: 10, upperThresholdBytes: 10_000 },
    });

    assert.equal(result.status, "discarded");
    assert.ok(result.warnings.includes("summary_privacy_unsafe"));
  });

  it("fails fast when the pre-summary call exceeds timeout", async () => {
    const slowClient: AiJsonClient = {
      async generateJson() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { ok: true, json: { summary: "late", provenance: ["raw-vault://slow"] } };
      },
    };
    const result = await preSummarizePayload({
      text: "slow payload ".repeat(20),
      sourceRef: "raw-vault://slow",
      sourceHash: "sha256:slow",
      authorityMode: "personal-local",
      client: slowClient,
      policy: { enabled: true, lowerThresholdBytes: 10, upperThresholdBytes: 10_000, timeoutMs: 1 },
    });

    assert.equal(result.status, "failed");
    assert.ok(result.warnings.includes("payload_presummary_timeout"));
  });

  it("opens a three-failure breaker for the session", async () => {
    const session = createPayloadPreSummarySession({ failureBreaker: 3 });
    const failingClient: AiJsonClient = {
      async generateJson() {
        return { ok: false, error: "timeout" };
      },
    };

    for (let i = 0; i < 3; i++) {
      const result = await preSummarizePayload({
        text: "failure payload ".repeat(20),
        sourceRef: `raw-vault://fail-${i}`,
        sourceHash: `sha256:fail-${i}`,
        authorityMode: "personal-local",
        client: failingClient,
        session,
        policy: { enabled: true, lowerThresholdBytes: 10, upperThresholdBytes: 10_000 },
      });
      assert.equal(result.status, "failed");
    }

    const skipped = await preSummarizePayload({
      text: "another payload ".repeat(20),
      sourceRef: "raw-vault://skipped",
      sourceHash: "sha256:skipped",
      authorityMode: "personal-local",
      client: failingClient,
      session,
      policy: { enabled: true, lowerThresholdBytes: 10, upperThresholdBytes: 10_000 },
    });
    assert.equal(skipped.status, "passed_through");
    assert.ok(skipped.warnings.includes("payload_presummary_breaker_open"));
  });

  it("is disabled for team stable-write paths unless policy explicitly enables team mode", async () => {
    const calls = { count: 0 };
    const result = await preSummarizePayload({
      text: "team payload ".repeat(100),
      sourceRef: "raw-vault://team",
      sourceHash: "sha256:team",
      authorityMode: "team-git",
      client: client({ summary: "unused", provenance: ["raw-vault://team"] }, calls),
      policy: { enabled: true, lowerThresholdBytes: 10, upperThresholdBytes: 10_000 },
    });

    assert.equal(result.status, "passed_through");
    assert.ok(result.warnings.includes("payload_presummary_disabled_for_team"));
    assert.equal(calls.count, 0);
  });
});
