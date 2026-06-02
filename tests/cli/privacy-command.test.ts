import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { privacyCommand } from "@praxisbase/cli/commands/privacy.js";
import { writeAiProviderConfig } from "@praxisbase/core";

describe("privacy CLI command", () => {
  it("runs privacy triage with JSON output", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-privacy-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    const dir = join(root, ".praxisbase/exceptions/human-required");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "exception.json"), JSON.stringify({
      id: "exception",
      protocol_version: "0.1",
      type: "exception_record",
      category: "human_required",
      source_id: "source_exception",
      reason: "Experience privacy verdict human_required: private_material_detected",
      details: {
        agent: "codex",
        channel: "local",
        scope_hint: "personal",
        source_ref: "raw-vault://codex/session",
        source_hash: "sha256:session",
        redacted_summary: "Fixed a local OpenClaw workflow and verified it.",
      },
      created_at: "2026-05-22T00:00:00.000Z",
    }, null, 2), "utf8");

    const output = await privacyCommand(root, "triage", {
      mode: "personal",
      autoRelease: true,
      json: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson() {
          return {
            ok: true,
            json: {
              classification: "safe_personal_experience",
              confidence: 0.9,
              rationale: "Safe personal workflow experience.",
              suggested_redactions: [],
            },
          };
        },
      },
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.type, "privacy_triage_report");
    assert.equal(parsed.report.summary.auto_released, 1);
  });

  it("prints privacy triage progress when requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-privacy-progress-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    const dir = join(root, ".praxisbase/exceptions/human-required");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "exception.json"), JSON.stringify({
      id: "exception",
      protocol_version: "0.1",
      type: "exception_record",
      category: "human_required",
      source_id: "source_exception",
      reason: "Experience privacy verdict human_required: private_material_detected",
      details: {
        agent: "codex",
        channel: "local",
        scope_hint: "personal",
        source_ref: "raw-vault://codex/session",
        source_hash: "sha256:session",
        redacted_summary: "Fixed a local OpenClaw workflow and verified it.",
      },
      created_at: "2026-05-22T00:00:00.000Z",
    }, null, 2), "utf8");
    const progress: string[] = [];

    const output = await privacyCommand(root, "triage", {
      mode: "personal",
      autoRelease: true,
      aiConcurrency: 2,
      progress: true,
      progressSink: (line) => progress.push(line),
      json: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson() {
          return {
            ok: true,
            json: {
              classification: "safe_personal_experience",
              confidence: 0.9,
              rationale: "Safe personal workflow experience.",
              suggested_redactions: [],
            },
          };
        },
      },
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.ok(progress.some((line) => line.includes("[praxisbase privacy] status=running")));
    assert.ok(progress.some((line) => line.includes("[praxisbase privacy] status=completed")));
  });
});
