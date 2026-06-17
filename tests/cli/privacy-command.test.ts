import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

  it("auto releases team privacy items when AI can produce a safe sanitized summary", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-privacy-team-redact-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    const dir = join(root, ".praxisbase/exceptions/human-required");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "exception.json"), JSON.stringify({
      id: "exception",
      protocol_version: "0.1",
      type: "exception_record",
      category: "human_required",
      source_id: "source_exception",
      reason: "Experience privacy verdict human_required: feishu_channel_team_review_first",
      details: {
        agent: "openclaw",
        channel: "feishu",
        scope_hint: "team",
        source_ref: "openclaw://answer-bot/chunks/team-login",
        source_hash: "sha256:team-login",
        redacted_summary: "用户在团队会话里提供了账号和登录材料，机器人完成一次浏览器登录协助，并记录了不能沉淀原始账号信息。",
      },
      created_at: "2026-06-16T00:00:00.000Z",
    }, null, 2), "utf8");

    const output = await privacyCommand(root, "triage", {
      mode: "team-git",
      teamAutoReview: true,
      json: true,
      now: "2026-06-16T10:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "TeamPrivacyReleaseSummary") {
            return {
              ok: true,
              json: {
                release_summary: "当团队会话里的登录类求助包含账号或验证材料时，只沉淀通用处理流程，不保留账号、凭证、链接或原始对话。机器人应要求用户提供脱敏错误现象，完成协助后只记录是否完成、如何验证以及后续如何避免复用原始身份材料。",
                reusable_lesson: "登录或授权类求助只能沉淀脱敏流程、验证方法和风险边界，不能沉淀账号或凭证材料。",
                residual_risk: "原始会话仍需留在隐私队列或原始库，不进入稳定知识。",
              },
            };
          }
          return {
            ok: true,
            json: {
              classification: "real_private_material",
              confidence: 0.91,
              rationale: "The source contains real account material, but a reusable operational lesson can be released after full sanitization.",
              suggested_redactions: ["Remove account identifiers", "Remove raw login material"],
            },
          };
        },
      },
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.summary.auto_released, 1);
    assert.equal(parsed.report.items[0].decision, "auto_released");
    assert.match(parsed.report.items[0].release_summary, /只沉淀通用处理流程/);
    const exception = JSON.parse(await readFile(join(dir, "exception.json"), "utf8"));
    assert.equal(exception.details.triage.decision, "auto_released");
    assert.equal(exception.details.triage.auto_review_policy, "team-ai-redacted-sensitive-v1");
    assert.match(exception.details.triage.release_summary, /不保留账号、凭证/);
  });

  it("records manual privacy review decisions", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-privacy-review-"));
    const dir = join(root, ".praxisbase/exceptions/human-required");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "exception.json"), JSON.stringify({
      id: "exception",
      protocol_version: "0.1",
      type: "exception_record",
      category: "human_required",
      source_id: "source_exception",
      reason: "Experience privacy verdict human_required: feishu_channel_team_review_first",
      details: {
        agent: "openclaw",
        channel: "feishu",
        scope_hint: "team",
        source_ref: "openclaw://answer-bot/chunks/manual",
        source_hash: "sha256:manual",
        redacted_summary: "修复机器人静默时先检查触发资格和网关健康。",
      },
      created_at: "2026-06-16T00:00:00.000Z",
    }, null, 2), "utf8");

    const output = await privacyCommand(root, "review", {
      id: "exception",
      decision: "auto_released",
      json: true,
      now: "2026-06-16T10:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    const exception = JSON.parse(await readFile(join(dir, "exception.json"), "utf8"));
    assert.equal(exception.details.triage.decision, "auto_released");
    assert.equal(exception.details.triage.reviewer_id, "praxisbase-cli");
  });
});
