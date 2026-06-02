/// <reference types="node" />

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lessonCommand } from "@praxisbase/cli/commands/lesson.js";
import { writeAiProviderConfig } from "@praxisbase/core/ai/config.js";

describe("lesson CLI command", () => {
  it("extracts lessons from a local memory source", async () => {
    const root = await mkdtemp(join(tmpdir(), "pb-cli-lesson-"));
    const source = join(root, "openclaw");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "MEMORY.md"), [
      "# Memory",
      "- Need tools/network/dispatch or slow tasks: send a short ACK first.",
      "- Confirm target machine before restart.",
    ].join("\n"), "utf8");

    const output = await lessonCommand(root, "extract", {
      source,
      agent: "openclaw",
      scope: "personal",
      json: true,
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.ok(parsed.report.lessons.length >= 2);
  });

  it("runs golden validation", async () => {
    const output = await lessonCommand(process.cwd(), "golden", { json: true });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.results.every((result: { privateLeakCount: number }) => result.privateLeakCount === 0));
  });

  it("uses configured AI provider only when lesson extract --ai is explicit", async () => {
    const root = await mkdtemp(join(tmpdir(), "pb-cli-lesson-ai-"));
    const source = join(root, "openclaw");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "MEMORY.md"), [
      "# Memory",
      "- Need tools/network/dispatch or slow tasks: send a short ACK first.",
    ].join("\n"), "utf8");
    await writeAiProviderConfig(root, {
      provider: "openai-compatible",
      model: "test-model",
      baseUrl: "https://llm.example.test/v1",
      apiKeyEnv: "TEST_LLM_API_KEY",
    });

    let calls = 0;
    const output = await lessonCommand(root, "extract", {
      source,
      agent: "openclaw",
      scope: "personal",
      ai: true,
      env: { TEST_LLM_API_KEY: "test-key" },
      fetchImpl: async () => {
        calls++;
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                lessons: [{
                  claim: "Send ACK before slow OpenClaw work.",
                  safe_claim: "Send ACK before slow OpenClaw work.",
                  problem: "Slow work leaves users without feedback.",
                  trigger: "Before tool, network, dispatch, or long-running work.",
                  action: "Send a short acknowledgement before continuing.",
                  verification: "The acknowledgement appears before tool execution.",
                  negative_case: "Do not stay silent while starting slow work.",
                  applies_to_agents: ["openclaw"],
                  applies_to_systems: ["agent-runtime"],
                  portability: "agent_family",
                  privacy_tier: "safe",
                  scope: "personal",
                  confidence: 0.93,
                  cue_family: "llm_inferred",
                  evidence_span_ids: ["src_openclaw_openclaw-memory-md_span_1"],
                  redaction_notes: [],
                }],
              }),
            },
          }],
        }), { status: 200 });
      },
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(calls, 1);
    assert.equal(parsed.report.ai_lessons, 1);

    const cachedOutput = await lessonCommand(root, "extract", {
      source,
      agent: "openclaw",
      scope: "personal",
      ai: true,
      env: { TEST_LLM_API_KEY: "test-key" },
      fetchImpl: async () => {
        calls++;
        return new Response("{}");
      },
      json: true,
    });
    const cachedParsed = JSON.parse(cachedOutput);
    assert.equal(cachedParsed.report.ai_lessons, 1);
    assert.equal(calls, 1);

    calls = 0;
    await lessonCommand(root, "extract", {
      source,
      agent: "openclaw",
      scope: "personal",
      env: { TEST_LLM_API_KEY: "test-key" },
      fetchImpl: async () => {
        calls++;
        return new Response("{}");
      },
      json: true,
    });
    assert.equal(calls, 0);
  });

  it("requires AI config when lesson extract --ai is explicit", async () => {
    const root = await mkdtemp(join(tmpdir(), "pb-cli-lesson-ai-missing-"));
    const source = join(root, "openclaw");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "MEMORY.md"), "- Confirm target machine before restart.\n", "utf8");

    await assert.rejects(
      () => lessonCommand(root, "extract", {
        source,
        agent: "openclaw",
        scope: "personal",
        ai: true,
        json: true,
      }),
      /LESSON_AI_CONFIG_REQUIRED/,
    );
  });
});
