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

  it("filters Codex session metadata while keeping task experience", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-codex-meta-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session.jsonl"), [
      JSON.stringify({
        timestamp: "2026-05-21T00:00:00.000Z",
        type: "session_meta",
        payload: {
          cwd: "/workspace/app",
          base_instructions: { text: "You are Codex. Follow sandbox_mode and approval_policy." },
          sandbox_mode: "danger-full-access",
        },
      }),
      JSON.stringify({
        timestamp: "2026-05-21T00:05:00.000Z",
        type: "message",
        payload: {
          role: "assistant",
          content: "Implemented PraxisBase wiki page navigation and pnpm test passed.",
        },
      }),
    ].join("\n"), "utf8");
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

    assert.equal(result.scanned, 2);
    assert.equal(result.fetched, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.envelopes.length, 1);
    assert.match(result.envelopes[0].redacted_summary, /Implemented PraxisBase wiki page navigation/);
    assert.equal(result.envelopes[0].redacted_summary.includes("base_instructions"), false);
    assert.equal(result.envelopes[0].redacted_summary.includes("sandbox_mode"), false);
  });

  it("summarizes Codex JSONL from user and assistant task turns only", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-codex-turns-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session.jsonl"), [
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "Generate final reports and run tests." }],
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "# AGENTS.md instructions\n<INSTRUCTIONS>Implement tasks autonomously.</INSTRUCTIONS>" }],
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Fix PraxisBase homepage links and Codex memory extraction." }],
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Updated dashboard links, filtered Codex startup noise, and pnpm check passed." }],
        },
      }),
    ].join("\n"), "utf8");
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

    assert.equal(result.envelopes.length, 2);
    const summaries = result.envelopes.map((envelope) => envelope.redacted_summary).join("\n");
    assert.match(summaries, /Fix PraxisBase homepage links/);
    assert.match(summaries, /Updated dashboard links/);
    assert.equal(summaries.includes("Generate final reports"), false);
    assert.equal(summaries.includes("AGENTS.md instructions"), false);
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

  it("checks out configured git refs before reading source files", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-git-ref-"));
    const repo = join(root, "source-repo");
    await mkdir(join(repo, ".praxisbase/sources/openclaw-answer-bot"), { recursive: true });
    await execFileAsync("git", ["init", "-q"], { cwd: repo });
    await execFileAsync("git", ["config", "user.name", "test"], { cwd: repo });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
    await execFileAsync("git", ["checkout", "-b", "openclaw-ingest/answer-bot"], { cwd: repo });
    await writeFile(
      join(repo, ".praxisbase/sources/openclaw-answer-bot/pm-memory.jsonl"),
      JSON.stringify({
        id: "chunk-1",
        source_ref: "openclaw://answer-bot/pm.sqlite/chunks/chunk-1",
        summary: "OpenClaw answer bot remembered branch-exported Feishu support guidance.",
      }) + "\n",
      "utf8",
    );
    await execFileAsync("git", ["add", "."], { cwd: repo });
    await execFileAsync("git", ["commit", "-q", "-m", "seed export"], { cwd: repo });

    const source = await addExperienceSource(root, {
      name: "openclaw-answer-bot",
      agent: "openclaw",
      sourceType: "git",
      channel: "feishu",
      scopeDefault: "team",
      repo,
      ref: "openclaw-ingest/answer-bot",
      path: ".praxisbase/sources/openclaw-answer-bot/pm-memory.jsonl",
      now: "2026-06-15T00:00:00.000Z",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "team-git",
      now: "2026-06-15T01:00:00.000Z",
      runCommand: async (command, args) => {
        const { stdout } = await execFileAsync(command, args, { maxBuffer: 16 * 1024 * 1024 });
        return stdout;
      },
    });

    assert.equal(result.status, "partial");
    assert.equal(result.fetched, 1);
    assert.equal(result.humanRequired, 1);
    assert.match(result.envelopes[0].redacted_summary, /branch-exported Feishu support/);
  });

  it("excludes OpenClaw dreaming SQLite chunks before privacy triage", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-openclaw-sqlite-dream-"));
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
        ('dream-1', 'memory/dreaming/light/2026-05-29.md', 'memory', 1, 4, 'hash-dream', 'text-embedding', 'Candidate: Assistant replay validation failed. evidence: memory/.dreams/session-corpus/2026-05-29.txt:1-1', '[]', 1770000002),
        ('memory-1', 'memory/2026-04-30.md', 'memory', 5, 7, 'hash-memory', 'text-embedding', 'Run self-test after changing OpenClaw code.', '[]', 1770000001);
    `]);
    const source = await addExperienceSource(root, {
      name: "local-openclaw-memory",
      agent: "openclaw",
      sourceType: "local",
      scopeDefault: "personal",
      path: dbPath,
      now: "2026-05-30T00:00:00.000Z",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "personal-local",
      now: "2026-05-30T01:00:00.000Z",
    });

    assert.equal(result.scanned, 1);
    assert.equal(result.fetched, 1);
    assert.equal(result.envelopes.length, 1);
    assert.match(result.envelopes[0].redacted_summary, /self-test/);
    assert.equal(result.envelopes[0].source_ref.includes("dreaming"), false);
  });

  it("excludes trusted remote OpenClaw dreaming export items before privacy triage", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-remote-openclaw-dream-"));
    const source = await addExperienceSource(root, {
      name: "guanzhicheng-openclaw",
      agent: "openclaw",
      sourceType: "ssh",
      scopeDefault: "personal",
      host: "root@example.test",
      path: "/root/.openclaw/praxisbase/latest.json",
      privacyTrust: "trusted_personal_remote",
      now: "2026-05-30T00:00:00.000Z",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "personal-local",
      now: "2026-05-30T01:00:00.000Z",
      runCommand: async () => JSON.stringify({
        items: [
          {
            id: "dream-1",
            source_ref: "openclaw-ssh://guanzhicheng/memory/dreaming/light/2026-05-19.md:168:182",
            summary: "Candidate: Assistant nightly follow-up failed. confidence: 0.58 evidence: memory/.dreams/session-corpus/2026-05-18.txt:9-9 status: staged",
          },
          {
            id: "memory-1",
            source_ref: "openclaw-ssh://guanzhicheng/memory/2026-04-30.md:1:3",
            summary: "Run self-test after changing OpenClaw code and report the verification result.",
          },
        ],
      }),
    });

    assert.equal(result.scanned, 2);
    assert.equal(result.fetched, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.envelopes.length, 1);
    assert.equal(result.envelopes[0].source_ref, "openclaw-ssh://guanzhicheng/memory/2026-04-30.md:1:3");
    assert.equal(result.envelopes[0].redacted_summary.includes("Candidate:"), false);
  });

  it("dispatches agentmemory source type to the dedicated adapter", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-agentmemory-"));
    const source = await addExperienceSource(root, {
      name: "test-agentmemory",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:9090",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "personal-local",
      now: "2026-05-25T01:00:00.000Z",
      fetchImpl: (async (input) => {
        if (String(input).includes("health")) {
          return new Response(JSON.stringify({ status: "ok" }));
        }
        return new Response(JSON.stringify({
          memories: [{ id: "mem-1", title: "AgentMemory test record", content: "Useful experience about debugging" }],
        }));
      }) as typeof fetch,
    });

    assert.equal(result.status, "completed");
    assert.equal(result.envelopes.length, 1);
    assert.equal(result.envelopes[0].agent, "agentmemory");
    assert.match(result.envelopes[0].source_ref, /^agentmemory:\/\/memories\//);
  });

  it("blocks agentmemory personal-scope sources in team-git mode through resolveExperienceSource", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-agentmemory-team-"));
    const source = await addExperienceSource(root, {
      name: "test-agentmemory",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:9090",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "team-git",
    });

    assert.equal(result.status, "failed");
    assert.equal(result.envelopes.length, 0);
    assert.ok(result.warnings.some((warning) => warning.includes("personal_agentmemory_blocked_in_team_mode")));
  });

  it("resolves local OpenCode sessions with correct source refs", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-opencode-"));
    const sessions = join(root, "opencode-sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.log"), [
      "Goal: implement feature X",
      "pnpm build",
      "ERROR: type mismatch in src/foo.ts",
      "Fix: corrected type annotation",
      "Verification: pnpm test passed",
      "Lesson: always check return types",
    ].join("\n"), "utf8");
    const source = await addExperienceSource(root, {
      name: "local-opencode",
      agent: "opencode",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-28T00:00:00.000Z",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "personal-local",
      now: "2026-05-28T01:00:00.000Z",
    });

    assert.equal(result.status, "completed");
    assert.equal(result.fetched, 1);
    assert.equal(result.envelopes.length, 1);
    assert.equal(result.envelopes[0].agent, "opencode");
    assert.match(result.envelopes[0].source_ref, /^raw-vault:\/\/opencode\//);
    assert.ok(!result.envelopes[0].source_ref.includes("openclaw"), "OpenCode refs must not use OpenClaw namespace");
    assert.equal(result.envelopes[0].privacy.verdict, "allow");
  });

  it("resolves local Claude Code sessions with logs source refs", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-claude-local-"));
    const sessions = join(root, "claude-sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.md"), [
      "Goal: fix database migration issue",
      "pnpm migrate",
      "ERROR: column already exists",
      "Fix: added IF NOT EXISTS check",
      "Verification: pnpm test passed",
      "Lesson: use idempotent migrations",
    ].join("\n"), "utf8");
    const source = await addExperienceSource(root, {
      name: "local-claude",
      agent: "claude-code",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-28T00:00:00.000Z",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "personal-local",
      now: "2026-05-28T01:00:00.000Z",
    });

    assert.equal(result.status, "completed");
    assert.equal(result.fetched, 1);
    assert.equal(result.envelopes.length, 1);
    assert.equal(result.envelopes[0].agent, "claude-code");
    assert.match(result.envelopes[0].source_ref, /^logs:\/\/local-claude\//);
    assert.ok(!result.envelopes[0].source_ref.includes("openclaw"), "Claude Code refs must not use OpenClaw namespace");
  });

  it("preserves structured Codex trajectory fields without carrying raw transcripts", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-codex-trajectory-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session.json"), JSON.stringify({
      id: "codex-structured-1",
      summary: "Implemented SkillClaw-inspired context ranking and pnpm test passed.",
      raw_transcript: "RAW TRANSCRIPT MUST NOT BE WRITTEN",
      raw_log: "RAW LOG MUST NOT BE WRITTEN",
      trajectory_steps: [
        { goal: "rank context", action: "added source metadata", tool: "apply_patch", outcome: "success" },
      ],
      tool_outcomes: [
        { tool: "pnpm test", result_category: "success", verification_marker: true },
      ],
      read_skills: ["skills/openclaw/auth/SKILL.md"],
      modified_skills: ["skills/openclaw/auth/SKILL.md"],
      injected_context: ["kb/procedures/openclaw-auth-refresh.md"],
      verification_events: ["pnpm test passed"],
      skill_effectiveness_hints: ["helped"],
    }), "utf8");
    const source = await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-29T00:00:00.000Z",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "personal-local",
      now: "2026-05-29T01:00:00.000Z",
    });

    assert.equal(result.status, "completed");
    assert.equal(result.envelopes.length, 1);
    const envelope = result.envelopes[0] as typeof result.envelopes[number] & { raw_transcript?: string; raw_log?: string };
    assert.deepEqual(envelope.trajectory_steps, [
      { goal: "rank context", action: "added source metadata", tool: "apply_patch", outcome: "success" },
    ]);
    assert.deepEqual(envelope.tool_outcomes, [
      { tool: "pnpm test", result_category: "success", verification_marker: true },
    ]);
    assert.deepEqual(envelope.read_skills, ["skills/openclaw/auth/SKILL.md"]);
    assert.deepEqual(envelope.modified_skills, ["skills/openclaw/auth/SKILL.md"]);
    assert.deepEqual(envelope.injected_context, ["kb/procedures/openclaw-auth-refresh.md"]);
    assert.deepEqual(envelope.verification_events, ["pnpm test passed"]);
    assert.deepEqual(envelope.skill_effectiveness_hints, ["helped"]);
    assert.equal(envelope.raw_transcript, undefined);
    assert.equal(envelope.raw_log, undefined);
  });

  it("maps Claude Code and OpenCode structured summaries into bounded trajectory envelopes", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-agent-trajectory-"));
    const sessions = join(root, "agent-sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session.jsonl"), [
      JSON.stringify({
        id: "claude-structured-1",
        summary: "Claude Code fixed schema drift and pnpm build passed.",
        steps: [
          { action: "inspect schema", tool: "rg", outcome: "success" },
          { action: "patch parser", tool: "apply_patch", outcome: "success" },
        ],
        tools: [
          { name: "pnpm build", status: "success", verification: true },
        ],
        skills_read: ["skills/schema-drift/SKILL.md"],
      }),
      JSON.stringify({
        id: "opencode-structured-1",
        summary: "OpenCode implemented adapter mapping and pnpm test passed.",
        trajectory: [
          { goal: "adapter mapping", action: "preserve structured fields", tool: "apply_patch", outcome: "success" },
        ],
        tool_results: [
          { tool: "pnpm test", result: "success", verification_marker: true },
        ],
        context_injected: ["kb/procedures/source-adapters.md"],
        verification: ["pnpm test passed"],
      }),
    ].join("\n"), "utf8");
    const claude = await addExperienceSource(root, {
      name: "local-claude",
      agent: "claude-code",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-29T00:00:00.000Z",
    });
    const opencode = await addExperienceSource(root, {
      name: "local-opencode",
      agent: "opencode",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-29T00:00:00.000Z",
    });

    const claudeResult = await resolveExperienceSource(root, claude, {
      authorityMode: "personal-local",
      now: "2026-05-29T01:00:00.000Z",
    });
    const opencodeResult = await resolveExperienceSource(root, opencode, {
      authorityMode: "personal-local",
      now: "2026-05-29T01:00:00.000Z",
    });

    assert.equal(claudeResult.envelopes[0].trajectory_steps?.[0]?.action, "inspect schema");
    assert.equal(claudeResult.envelopes[0].tool_outcomes?.[0]?.tool, "pnpm build");
    assert.deepEqual(claudeResult.envelopes[0].read_skills, ["skills/schema-drift/SKILL.md"]);
    assert.equal(opencodeResult.envelopes[1].trajectory_steps?.[0]?.goal, "adapter mapping");
    assert.equal(opencodeResult.envelopes[1].tool_outcomes?.[0]?.verification_marker, true);
    assert.deepEqual(opencodeResult.envelopes[1].injected_context, ["kb/procedures/source-adapters.md"]);
    assert.deepEqual(opencodeResult.envelopes[1].verification_events, ["pnpm test passed"]);
  });

  it("maps OpenClaw staged envelopes into bounded trajectory fields", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-adapter-openclaw-trajectory-"));
    const sessions = join(root, "openclaw-staging");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "stage.json"), JSON.stringify({
      id: "openclaw-stage-1",
      summary: "OpenClaw repaired auth expiry and smoke verification passed.",
      stages: [
        { stage: "diagnosis", action: "detected auth expiry", tool: "logs", result: "success" },
        { stage: "repair", action: "refreshed credentials", tool: "openclaw", result: "success" },
      ],
      verification: ["smoke verification passed"],
      used_skills: ["skills/openclaw/auth-refresh/SKILL.md"],
    }), "utf8");
    const source = await addExperienceSource(root, {
      name: "local-openclaw",
      agent: "openclaw",
      sourceType: "local",
      scopeDefault: "project",
      path: sessions,
      now: "2026-05-29T00:00:00.000Z",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "personal-local",
      now: "2026-05-29T01:00:00.000Z",
    });

    assert.equal(result.envelopes.length, 1);
    assert.deepEqual(result.envelopes[0].trajectory_steps, [
      { goal: "diagnosis", action: "detected auth expiry", tool: "logs", outcome: "success" },
      { goal: "repair", action: "refreshed credentials", tool: "openclaw", outcome: "success" },
    ]);
    assert.deepEqual(result.envelopes[0].verification_events, ["smoke verification passed"]);
    assert.deepEqual(result.envelopes[0].read_skills, ["skills/openclaw/auth-refresh/SKILL.md"]);
  });
});
