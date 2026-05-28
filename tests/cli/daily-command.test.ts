import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sourceCommand } from "@praxisbase/cli/commands/source.js";
import { dailyCommand, type DailyCommandOptions } from "@praxisbase/cli/commands/daily.js";
import { PROTOCOL_VERSION } from "@praxisbase/core/protocol/types.js";
import { CuratedWikiProposalSchema, type CuratedWikiProposal } from "@praxisbase/core/wiki/curation-model.js";

function promotableWikiBody(): string {
  return `# OpenClaw auth expired recovery

## When to Use

Use this when OpenClaw repair agents report expired Claude authentication during memory sync.

## Symptoms or Context

- OpenClaw reports that Claude authentication expired.
- The repair loop retries without refreshing credentials.

## Procedure

1. Refresh Claude login before restarting the OpenClaw repair loop.
2. Re-run the failed memory sync after login is healthy.
3. Keep the generated lesson as a stable personal known fix.

## Verification

- The OpenClaw repair loop completes after login refresh.
- The agent memory sync no longer reports an expired authentication state.

## Reusable Lessons

- Treat auth refresh as a prerequisite before retrying OpenClaw memory sync.

## Related Wiki Pages

- [[openclaw-auth-expired]]

## Provenance

- codex:session:1 sha256:a
- openclaw:memory:2 sha256:b
`;
}

async function writeAutoPromotableWikiCandidate(
  root: string,
  overrides: Partial<CuratedWikiProposal> = {},
): Promise<void> {
  await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
  const proposal = CuratedWikiProposalSchema.parse({
    id: "wiki-curated-openclaw-auth",
    protocol_version: PROTOCOL_VERSION,
    type: "wiki_curated_proposal",
    target_path: "kb/known-fixes/openclaw-auth-expired.md",
    action: "create",
    page_kind: "known_fix",
    scope: "personal",
    title: "OpenClaw auth expired recovery",
    summary: "Refresh login before retrying OpenClaw memory sync.",
    body_markdown: promotableWikiBody(),
    source_refs: ["codex:session:1", "openclaw:memory:2"],
    source_hashes: ["sha256:a", "sha256:b"],
    source_count: 2,
    evidence_ids: ["ev_1", "ev_2"],
    confidence: 0.94,
    maturity: "draft",
    provenance: [
      { source_ref: "codex:session:1", source_hash: "sha256:a" },
      { source_ref: "openclaw:memory:2", source_hash: "sha256:b" },
    ],
    review_hint: {
      why_review: "Low-risk personal known fix with verification and provenance.",
      suggested_decision: "approve",
      risk_notes: ["semantic_review:promote", "semantic_score:0.91"],
    },
    guards: [
      { id: "path", ok: true, message: "allowed" },
      { id: "experience_signal", ok: true, message: "durable experience signal present" },
      { id: "actionability", ok: true, message: "agent actionability present" },
      { id: "verification_or_lesson", ok: true, message: "verification or reusable lesson present" },
      { id: "not_reference_only", ok: true, message: "not reference-only evidence" },
    ],
    created_at: "2026-05-21T00:00:00.000Z",
    ...overrides,
  });
  await writeFile(join(root, ".praxisbase/inbox/proposals/wiki-curated-openclaw-auth.json"), JSON.stringify(proposal, null, 2), "utf8");
}

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

  it("runs a personal daily loop from an SSH OpenClaw source", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-daily-ssh-"));
    await sourceCommand(root, "add", {
      name: "remote-openclaw",
      agent: "openclaw",
      type: "ssh",
      host: "root@example.com",
      path: "/root/.openclaw/praxisbase/latest.json",
      scope: "personal",
      json: true,
    });

    const output = await dailyCommand(root, "run", {
      mode: "personal",
      degraded: true,
      limit: 1,
      runCommand: async (command, args) => {
        assert.equal(command, "ssh");
        assert.deepEqual(args, ["root@example.com", "cat", "/root/.openclaw/praxisbase/latest.json"]);
        return JSON.stringify({
          items: [{ id: "ssh-one", summary: "Remote OpenClaw repaired gateway auth failure and verified the agent reply.", signature: "openclaw:ssh-one" }],
        });
      },
      json: true,
      now: "2026-05-21T01:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.sources[0].name, "remote-openclaw");
    assert.equal(parsed.report.sources[0].source_type, "ssh");
    assert.equal(parsed.report.sources[0].imported, 1);
  });

  it("imports an explicitly configured GBrain source as PB evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-daily-gbrain-source-"));
    await sourceCommand(root, "add", {
      name: "gbrain-praxisbase",
      agent: "generic",
      type: "gbrain",
      remote: "openclaw auth",
      scope: "personal",
      json: true,
    });
    const calls: Array<{ command: string; args: string[] }> = [];

    const output = await dailyCommand(root, "run", {
      mode: "personal",
      degraded: true,
      gbrainRunCommand: async (command, args) => {
        calls.push({ command, args });
        return {
          stdout: JSON.stringify({
            results: [{
              slug: "openclaw-auth-refresh",
              chunk_text: "Refresh OpenClaw auth before retrying memory sync.",
              score: 0.91,
            }],
          }),
          stderr: "",
        };
      },
      json: true,
      now: "2026-05-21T01:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.sources[0].source_type, "gbrain");
    assert.equal(parsed.report.sources[0].enveloped, 1);
    assert.ok(parsed.report.sources[0].warnings.some((warning: string) => warning.includes("gbrain_source_imported_as_evidence")));
    assert.deepEqual(calls[0].args, ["query", "openclaw auth", "--limit", "20", "--source-id", "gbrain-praxisbase", "--json"]);
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

  it("publishes newly promoted stable personal wiki pages to GBrain when requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-daily-gbrain-"));
    await writeAutoPromotableWikiCandidate(root);
    const calls: Array<{ command: string; args: string[] }> = [];
    const options: DailyCommandOptions & {
      publishGbrain: boolean;
      gbrainRunCommand: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
    } = {
      mode: "personal",
      degraded: true,
      buildSite: true,
      publishGbrain: true,
      gbrainRunCommand: async (command, args) => {
        calls.push({ command, args });
        return { stdout: JSON.stringify({ ok: true, slug: args[args.indexOf("--slug") + 1] }), stderr: "" };
      },
      json: true,
      now: "2026-05-21T01:00:00.000Z",
    };

    const output = await dailyCommand(root, "run", options);
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.changed_stable_knowledge, true);
    assert.equal(parsed.report.brain_backends.gbrain.enabled, true);
    assert.equal(parsed.report.brain_backends.gbrain.publish_status, "completed");
    assert.equal(parsed.report.brain_backends.gbrain.exported, 1);
    assert.ok(calls.some((call) => call.command === "gbrain" && call.args.includes("capture")));
    assert.ok(parsed.next_actions.commands.some((command: string) => command.includes("praxisbase gbrain export --mode personal --write --json")));
  });

  it("blocks team GBrain publish unless team export is explicitly allowed", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-daily-gbrain-team-"));
    const options: DailyCommandOptions & {
      publishGbrain: boolean;
      gbrainRunCommand: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
    } = {
      mode: "team-git",
      degraded: true,
      buildSite: true,
      publishGbrain: true,
      gbrainRunCommand: async () => {
        throw new Error("team publish should be blocked before GBrain is called");
      },
      json: true,
      now: "2026-05-21T01:00:00.000Z",
    };

    const output = await dailyCommand(root, "run", options);
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.brain_backends.gbrain.enabled, true);
    assert.equal(parsed.report.brain_backends.gbrain.publish_status, "blocked");
    assert.ok(parsed.report.brain_backends.gbrain.errors.some((error: string) => error.includes("GBRAIN_TEAM_EXPORT_BLOCKED")));
  });

  it("keeps promoted PB knowledge when GBrain publish fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-daily-gbrain-fail-"));
    await writeAutoPromotableWikiCandidate(root);

    const output = await dailyCommand(root, "run", {
      mode: "personal",
      degraded: true,
      buildSite: true,
      publishGbrain: true,
      gbrainRunCommand: async () => {
        throw new Error("gbrain capture unavailable");
      },
      json: true,
      now: "2026-05-21T01:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.changed_stable_knowledge, true);
    assert.equal(parsed.report.brain_backends.gbrain.publish_status, "failed");
    assert.ok(parsed.report.warnings.some((warning: string) => warning.includes("gbrain_publish")));
    assert.match(await readFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), "utf8"), /OpenClaw auth expired recovery/);
  });
});
