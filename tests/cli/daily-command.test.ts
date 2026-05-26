import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sourceCommand } from "@praxisbase/cli/commands/source.js";
import { dailyCommand } from "@praxisbase/cli/commands/daily.js";

describe("daily CLI command", () => {
  it("runs the personal daily loop with json output", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-daily-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Implemented OpenClaw auth refresh and pnpm test passed.", "utf8");
    await sourceCommand(root, "add", {
      name: "local-codex",
      agent: "codex",
      type: "local",
      path: sessions,
      scope: "personal",
      json: true,
    });

    const output = await dailyCommand(root, "run", {
      mode: "personal",
      degraded: true,
      json: true,
      now: "2026-05-21T01:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.type, "daily_experience_report");
    assert.equal(parsed.report.sources[0].imported, 1);
    assert.equal(parsed.report.ai_distill.production_ready, false);
    assert.equal(parsed.next_actions.status, "needs_review");
    assert.equal(parsed.next_actions.counts.review_required, 1);
    assert.ok(parsed.next_actions.commands.some((command: string) => command.includes("personal run --open")));
  });

  it("returns a JSON error when production AI is not configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-daily-ai-required-"));
    const output = await dailyCommand(root, "run", {
      mode: "personal",
      json: true,
      now: "2026-05-21T01:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "AI_DISTILL_NOT_CONFIGURED");
  });

  it("prints a simple schedule hint", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-daily-schedule-"));
    const output = await dailyCommand(root, "schedule", { json: true });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.match(parsed.gitlab, /PRAXISBASE_TASK=daily-harvest/);
  });

  it("initializes daily mode without installing a scheduler", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-daily-init-"));
    const output = await dailyCommand(root, "init", { mode: "personal", json: true });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.mode, "personal");
    assert.equal(parsed.installed, false);
    assert.match(parsed.next, /praxisbase source add/);
  });

  it("prints personal cron schedule text", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-daily-cron-"));
    const output = await dailyCommand(root, "schedule", { mode: "personal", runner: "cron", json: true });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.match(parsed.personal, /praxisbase daily run --mode personal/);
    assert.equal(parsed.installed, false);
  });

  it("passes noContextEconomy flag through to the daily experience runner", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-daily-no-ctx-econ-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Implemented OpenClaw auth refresh and pnpm test passed.", "utf8");
    await sourceCommand(root, "add", {
      name: "local-codex",
      agent: "codex",
      type: "local",
      path: sessions,
      scope: "personal",
      json: true,
    });

    const output = await dailyCommand(root, "run", {
      mode: "personal",
      degraded: true,
      noContextEconomy: true,
      json: true,
      now: "2026-05-21T01:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.ok(parsed.report.context_economy);
    assert.equal(parsed.report.context_economy.enabled, false);
    assert.equal(parsed.report.context_economy.rule_set_hash, "disabled");
  });

  it("passes semanticReview flag through to wiki curation", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-daily-semantic-review-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Implemented OpenClaw auth refresh and pnpm test passed.", "utf8");
    await sourceCommand(root, "add", {
      name: "local-codex",
      agent: "codex",
      type: "local",
      path: sessions,
      scope: "personal",
      json: true,
    });

    const output = await dailyCommand(root, "run", {
      mode: "personal",
      degraded: true,
      semanticReview: true,
      json: true,
      now: "2026-05-21T01:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.semantic_review.enabled, true);
  });

  it("streams progress lines to a sink when progress output is requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-daily-progress-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Implemented OpenClaw auth refresh and pnpm test passed.", "utf8");
    await sourceCommand(root, "add", {
      name: "local-codex",
      agent: "codex",
      type: "local",
      path: sessions,
      scope: "personal",
      json: true,
    });

    const lines: string[] = [];
    const output = await dailyCommand(root, "run", {
      mode: "personal",
      degraded: true,
      json: true,
      progress: true,
      progressSink: (line) => lines.push(line),
      now: "2026-05-21T01:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.ok(lines.some((line) => line.includes("stage=source")));
    assert.ok(lines.some((line) => line.includes("stage=wiki-curate")));
    assert.ok(lines.every((line) => line.includes("elapsed=")));
  });

  it("prints next actions in non-json output without exposing internal report paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-daily-next-actions-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Fixed OpenClaw auth after token=abc123456789 was printed.", "utf8");
    await sourceCommand(root, "add", {
      name: "local-codex",
      agent: "codex",
      type: "local",
      path: sessions,
      scope: "personal",
      json: true,
    });

    const output = await dailyCommand(root, "run", {
      mode: "personal",
      degraded: true,
      json: false,
      now: "2026-05-21T01:00:00.000Z",
    });

    assert.match(output, /Daily experience run complete:/);
    assert.match(output, /Next action:/);
    assert.match(output, /privacy triage/);
    assert.doesNotMatch(output, /\.praxisbase\/reports\//);
    assert.doesNotMatch(output, /\.praxisbase\/raw-vault\//);
  });
});
