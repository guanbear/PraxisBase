import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { personalCommand } from "@praxisbase/cli/commands/personal.js";
import { sourceCommand } from "@praxisbase/cli/commands/source.js";

describe("personal command", () => {
  it("initializes personal mode through bootstrap with agent access assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-personal-init-"));
    const home = await mkdtemp(join(tmpdir(), "praxisbase-personal-home-"));
    await mkdir(join(home, ".codex/sessions"), { recursive: true });

    const output = await personalCommand(root, "init", {
      agent: "codex",
      json: true,
      homeDir: home,
      now: "2026-05-25T00:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.command, "personal init");
    assert.equal(parsed.bootstrap.mode, "personal");
    assert.ok(parsed.bootstrap.sources_added >= 1);
    assert.ok(parsed.bootstrap.skill_path);
    assert.ok(parsed.next.some((command: string) => command.includes("praxisbase personal run --open")));
    assert.ok(parsed.next.some((command: string) => command.includes("--with-agentmemory")));

    const skill = await readFile(join(root, ".praxisbase/agent-tools/skills/praxisbase/SKILL.md"), "utf8");
    assert.match(skill, /praxisbase personal init/);
    assert.match(skill, /--with-agentmemory/);
  });

  it("connects codex, openclaw, and agentmemory sources with simple defaults", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-personal-connect-"));

    const codex = JSON.parse(await personalCommand(root, "connect", {
      target: "codex",
      path: "~/.codex/sessions",
      json: true,
    }));
    const openclaw = JSON.parse(await personalCommand(root, "connect", {
      target: "openclaw",
      path: "~/.openclaw/reports",
      json: true,
    }));
    const agentmemory = JSON.parse(await personalCommand(root, "connect", {
      target: "agentmemory",
      url: "http://localhost:3111",
      bearerTokenEnv: "AGENTMEMORY_TOKEN",
      json: true,
    }));

    assert.equal(codex.source.name, "personal-codex");
    assert.equal(codex.source.agent, "codex");
    assert.equal(codex.source.parser, "codex-session");
    assert.equal(openclaw.source.name, "personal-openclaw");
    assert.equal(openclaw.source.agent, "openclaw");
    assert.equal(openclaw.source.parser, "openclaw-log");
    assert.equal(agentmemory.source.name, "personal-agentmemory");
    assert.equal(agentmemory.source.agent, "agentmemory");
    assert.equal(agentmemory.source.bearer_token_env, "AGENTMEMORY_TOKEN");
  });

  it("doctors personal mode with AI, source, site, and AgentMemory checks", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-personal-doctor-"));
    await mkdir(join(root, "dist"), { recursive: true });
    await writeFile(join(root, "dist/index.html"), "<html></html>", "utf8");
    await sourceCommand(root, "add", {
      name: "personal-agentmemory",
      agent: "agentmemory",
      type: "agentmemory",
      scope: "personal",
      url: "http://localhost:3111",
      json: true,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ status: "ok" }))) as typeof fetch;
    try {
      const output = await personalCommand(root, "doctor", { json: true });
      const parsed = JSON.parse(output);
      assert.equal(parsed.ok, true);
      assert.ok(parsed.checks.some((check: { id: string; ok: boolean }) => check.id === "sources" && check.ok));
      assert.ok(parsed.checks.some((check: { id: string; ok: boolean }) => check.id === "site" && check.ok));
      assert.ok(parsed.checks.some((check: { id: string; ok: boolean }) => check.id === "agentmemory:personal-agentmemory:health" && check.ok));
      assert.ok(parsed.checks.some((check: { id: string; ok: boolean }) => check.id === "agentmemory:personal-agentmemory:smart_search" && check.ok));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("runs personal daily, writes agent access assets, and opens the generated site when requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-personal-run-"));
    const opened: string[] = [];

    const output = await personalCommand(root, "run", {
      agent: "codex",
      degraded: true,
      limit: 0,
      open: true,
      json: true,
      now: "2026-05-25T01:00:00.000Z",
      openImpl: async (path) => {
        opened.push(path);
      },
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.authority_mode, "personal-local");
    assert.ok(parsed.report.outputs.includes("dist/index.html"));
    assert.equal(parsed.opened, true);
    assert.equal(opened.length, 1);
    assert.ok(opened[0].endsWith("dist/index.html"));
    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.match(index, /Latest Daily Experience/);
    assert.match(index, /Context Economy/);
    await readFile(join(root, ".praxisbase/agent-tools/manifest.json"), "utf8");
    await readFile(join(root, ".praxisbase/agent-tools/skills/praxisbase/SKILL.md"), "utf8");
  });

  it("prints a personal schedule without installing it", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-personal-schedule-"));
    const output = await personalCommand(root, "schedule", { print: true, json: true });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.installed, false);
    assert.match(parsed.cron, /praxisbase personal run --json/);
    assert.match(parsed.launchd, /praxisbase personal run --json/);
  });
});
