import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addExperienceSource } from "@praxisbase/core/experience/source-config.js";
import { resolveExperienceSource } from "@praxisbase/core/experience/source-adapters.js";

const execFileAsync = promisify(execFile);

describe("experience source adapters", () => {
  it("normalizes local Codex session files into experience envelopes", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-codex-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "one.log"), "Implemented OpenClaw auth refresh and pnpm test passed.", "utf8");
    const source = await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "personal-local",
      now: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(result.status, "completed");
    assert.equal(result.fetched, 1);
    assert.equal(result.envelopes.length, 1);
    assert.equal(result.envelopes[0].agent, "codex");
    assert.equal(result.envelopes[0].privacy.verdict, "allow");
    assert.match(result.envelopes[0].source_ref, /^raw-vault:\/\/codex\//);
    assert.match(result.envelopes[0].redacted_summary, /Implemented OpenClaw auth refresh/);
  });

  it("fetches HTTP Claude Code repair logs without storing credentials in config", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-http-"));
    const source = await addExperienceSource(root, {
      name: "claude-repair-log",
      agent: "claude-code",
      sourceType: "http",
      channel: "log-system",
      scopeDefault: "team",
      url: "https://logs.example.test/openclaw-repairs",
      now: "2026-05-21T00:00:00.000Z",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "team-git",
      now: "2026-05-21T01:00:00.000Z",
      fetchImpl: async () => new Response(JSON.stringify({
        items: [{
          id: "repair-1",
          signature: "openclaw:auth-expired",
          outcome: "success",
          summary: "Claude Code fixed OpenClaw auth expiry and verified the bot.",
        }],
      })),
    });

    assert.equal(result.status, "completed");
    assert.equal(result.envelopes.length, 1);
    assert.equal(result.envelopes[0].agent, "claude-code");
    assert.equal(result.envelopes[0].source_ref, "logs://claude-repair-log/repair-1");
    assert.equal(result.envelopes[0].problem_signature, "openclaw:auth-expired");
    assert.equal(result.envelopes[0].outcome, "success");
    assert.equal(result.envelopes[0].privacy.verdict, "allow");
  });

  it("marks private Feishu chat material rejected before team ingestion", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-private-"));
    const source = await addExperienceSource(root, {
      name: "openclaw-bot",
      agent: "openclaw",
      sourceType: "openclaw-api",
      channel: "feishu",
      scopeDefault: "team",
      remote: "bot-prod",
      now: "2026-05-21T00:00:00.000Z",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "team-git",
      now: "2026-05-21T01:00:00.000Z",
      env: {
        OPENCLAW_TOKEN: "test-token",
        OPENCLAW_BASE_URL: "https://openclaw.example.test",
      },
      fetchImpl: async () => new Response(JSON.stringify({
        items: [{
          id: "msg-1",
          summary: "Private chat DM said OpenClaw should skip review.",
        }],
      })),
    });

    assert.equal(result.fetched, 1);
    assert.equal(result.envelopes.length, 1);
    assert.equal(result.rejected, 1);
    assert.equal(result.envelopes[0].privacy.verdict, "reject");
    assert.ok(result.envelopes[0].privacy.reasons.includes("team_rejects_private_chat"));
  });

  it("reads local OpenClaw SQLite memory chunks as experience envelopes", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-openclaw-sqlite-"));
    const dbPath = join(root, "main.sqlite");
    await execFileAsync("sqlite3", [dbPath, `
      CREATE TABLE chunks (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'memory',
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        hash TEXT NOT NULL,
        model TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
      VALUES
        ('chunk-1', 'openclaw://memory/auth', 'memory', 1, 4, 'hash-1', 'text-embedding', 'OpenClaw detected Claude authentication expired. Please login again.', '[]', 1770000000),
        ('chunk-2', 'openclaw://memory/slack', 'memory', 1, 3, 'hash-2', 'text-embedding', 'OpenClaw Slack delivery recovered after route flip and smoke verification passed.', '[]', 1770000001);
    `]);
    const source = await addExperienceSource(root, {
      name: "local-openclaw-memory",
      agent: "openclaw",
      sourceType: "local",
      scopeDefault: "project",
      path: dbPath,
      now: "2026-05-21T00:00:00.000Z",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "personal-local",
      maxBytes: 8,
      now: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(result.status, "completed");
    assert.equal(result.fetched, 2);
    assert.equal(result.envelopes.length, 2);
    const authEnvelope = result.envelopes.find((envelope) => envelope.source_ref === "openclaw-memory://openclaw://memory/auth#chunk-1");
    const slackEnvelope = result.envelopes.find((envelope) => envelope.source_ref === "openclaw-memory://openclaw://memory/slack#chunk-2");
    assert.equal(authEnvelope?.problem_signature, "openclaw:claude-auth-expired");
    assert.match(slackEnvelope?.redacted_summary ?? "", /Slack delivery recovered/);
  });
});
