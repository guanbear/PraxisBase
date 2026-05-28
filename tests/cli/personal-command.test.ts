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
    assert.ok(parsed.next.some((command: string) => command.includes("praxisbase gbrain init")));
    assert.ok(parsed.next.some((command: string) => command.includes("gbrain serve")));

    const skill = await readFile(join(root, ".praxisbase/agent-tools/skills/praxisbase/SKILL.md"), "utf8");
    assert.match(skill, /praxisbase personal init/);
    assert.match(skill, /GBrain MCP is the default broad brain lookup path/);
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
      assert.ok(parsed.checks.some((check: { id: string; ok: boolean; message: string }) => check.id === "gbrain" && !check.ok && /GBrain/.test(check.message)));
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
    assert.equal(parsed.next_actions.status, "no_stable_changes");
    assert.equal(parsed.next_actions.counts.privacy_required, 0);
    assert.ok(parsed.next_actions.commands.some((command: string) => command.includes("personal run --open")));
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

  it("lists, pins, forgets, and rebuilds personal profile facets", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-personal-profile-"));
    await mkdir(join(root, ".praxisbase/personal"), { recursive: true });
    await writeFile(join(root, ".praxisbase/personal/facets.jsonl"), [
      JSON.stringify({
        facet_class: "tooling",
        key: "npm",
        value: "Prefers npm scripts for verification.",
        evidence_count: 3,
        evidence_refs: ["session:1"],
      }),
      JSON.stringify({
        facet_class: "style",
        key: "concise",
        value: "Prefers concise updates.",
        evidence_count: 1,
      }),
    ].join("\n") + "\n", "utf8");

    const listed = JSON.parse(await personalCommand(root, "profile", {
      profileAction: "list",
      json: true,
    }));
    assert.equal(listed.ok, true);
    assert.equal(listed.facets.length, 2);
    assert.match(listed.next, /personal profile pin/);

    const pinned = JSON.parse(await personalCommand(root, "profile", {
      profileAction: "pin",
      profileKey: "tooling/npm",
      json: true,
    }));
    assert.equal(pinned.ok, true);
    assert.equal(pinned.pinned, "tooling/npm");
    assert.match(pinned.next, /personal profile rebuild --json/);

    const facetsAfterPin = (await readFile(join(root, ".praxisbase/personal/facets.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(facetsAfterPin.find((facet) => facet.facet_class === "tooling" && facet.key === "npm").user_override, "pinned");
    assert.match(await readFile(join(root, ".praxisbase/personal/profile.md"), "utf8"), /Prefers npm scripts/);

    const forgotten = JSON.parse(await personalCommand(root, "profile", {
      profileAction: "forget",
      profileKey: "tooling/npm",
      json: true,
    }));
    assert.equal(forgotten.ok, true);
    assert.equal(forgotten.forgotten, "tooling/npm");

    const rebuilt = JSON.parse(await personalCommand(root, "profile", {
      profileAction: "rebuild",
      json: true,
    }));
    assert.equal(rebuilt.ok, true);
    assert.equal(rebuilt.facets_count, 2);
    assert.equal(rebuilt.profile_path, ".praxisbase/personal/profile.md");

    const added = JSON.parse(await personalCommand(root, "profile", {
      profileAction: "add",
      profileValue: "以后默认用 pnpm 跑测试",
      json: true,
    }));
    assert.equal(added.ok, true);
    assert.equal(added.added, 1);
    assert.match(await readFile(join(root, ".praxisbase/personal/profile.md"), "utf8"), /pnpm/);

    const missing = JSON.parse(await personalCommand(root, "profile", {
      profileAction: "pin",
      profileKey: "tooling/missing",
      json: true,
    }));
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "FACET_NOT_FOUND");
  });

  it("connects claude-code source with correct parser and default path", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-personal-connect-claude-"));
    const result = JSON.parse(await personalCommand(root, "connect", {
      target: "claude-code",
      json: true,
    }));

    assert.equal(result.source.name, "personal-claude-code");
    assert.equal(result.source.agent, "claude-code");
    assert.equal(result.source.parser, "claude-code-session");
    assert.equal(result.source.source_type, "local");
    assert.equal(result.source.scope_default, "personal");
    assert.equal(result.source.path, "~/.claude/transcripts");
  });

  it("connects opencode source with correct parser and default path", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-personal-connect-opencode-"));
    const result = JSON.parse(await personalCommand(root, "connect", {
      target: "opencode",
      json: true,
    }));

    assert.equal(result.source.name, "personal-opencode");
    assert.equal(result.source.agent, "opencode");
    assert.equal(result.source.parser, "opencode-session");
    assert.equal(result.source.source_type, "local");
    assert.equal(result.source.scope_default, "personal");
    assert.equal(result.source.path, "~/.local/share/opencode/log");
  });

  it("connects claude-code source with custom path", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-personal-connect-claude-custom-"));
    const result = JSON.parse(await personalCommand(root, "connect", {
      target: "claude-code",
      path: "/custom/claude/sessions",
      json: true,
    }));

    assert.equal(result.source.path, "/custom/claude/sessions");
    assert.equal(result.source.parser, "claude-code-session");
  });

  it("rejects invalid connect targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-personal-connect-invalid-"));
    const output = await personalCommand(root, "connect", {
      target: "invalid-agent" as any,
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "PERSONAL_CONNECT_INVALID");
  });
});
