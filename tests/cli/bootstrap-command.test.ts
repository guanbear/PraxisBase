import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bootstrapCommand } from "@praxisbase/cli/commands/bootstrap.js";

describe("bootstrap command", () => {
  it("bootstraps personal mode with safe source discovery and an agent skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-bootstrap-root-"));
    const home = await mkdtemp(join(tmpdir(), "praxisbase-bootstrap-home-"));
    await mkdir(join(home, ".codex/sessions"), { recursive: true });
    await mkdir(join(home, ".codex-cli-cliproxyapi/sessions"), { recursive: true });
    await mkdir(join(home, ".openclaw/memory"), { recursive: true });
    await writeFile(join(home, ".openclaw/memory/main.sqlite"), "", "utf8");

    const output = await bootstrapCommand(root, "personal", {
      agent: "codex",
      installSkill: true,
      json: true,
      homeDir: home,
      now: "2026-05-21T00:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.sources_added, 3);
    assert.ok(parsed.sources_discovered.some((source: { path: string }) => source.path === "~/.codex/sessions"));
    assert.ok(parsed.sources_discovered.some((source: { path: string }) => source.path === "~/.codex-cli-cliproxyapi/sessions"));
    assert.ok(parsed.sources_discovered.some((source: { path: string }) => source.path === "~/.openclaw/memory/main.sqlite"));
    assert.ok(!JSON.stringify(parsed).includes(home), "result should not expose absolute home paths");
    assert.ok(parsed.next.some((command: string) => command.includes("praxisbase ai doctor")));
    assert.ok(parsed.next.some((command: string) => command.includes("praxisbase daily run --mode personal")));
    assert.ok(parsed.next.some((command: string) => command.includes("open dist/index.html")));
    assert.ok(parsed.next.some((command: string) => command.includes("praxisbase context get")));
    assert.ok(parsed.next.some((command: string) => command.includes("praxisbase gbrain init")));
    assert.ok(parsed.next.some((command: string) => command.includes("gbrain serve")));
    assert.ok(parsed.next.some((command: string) => command.includes('"command":"gbrain"')));

    const sourceFiles = await readdir(join(root, ".praxisbase/sources"));
    assert.ok(sourceFiles.some((file) => file.includes("local-codex-sessions")));
    assert.ok(sourceFiles.some((file) => file.includes("local-codex-cliproxyapi-sessions")));
    const openclawFile = sourceFiles.find((file) => file.includes("local-openclaw-memory"));
    assert.ok(openclawFile);
    const openclawSource = JSON.parse(await readFile(join(root, ".praxisbase/sources", openclawFile), "utf8"));
    assert.equal(openclawSource.path, "~/.openclaw/memory/main.sqlite");

    const skill = await readFile(join(root, ".praxisbase/agent-tools/skills/praxisbase/SKILL.md"), "utf8");
    assert.match(skill, /praxisbase ai init/);
    assert.match(skill, /praxisbase ai doctor/);
    assert.match(skill, /praxisbase daily run --mode personal/);
    assert.match(skill, /dist\/index.html/);
    assert.match(skill, /GBrain MCP is the default broad brain lookup path/);
    assert.match(skill, /human-required|Human|required/i);
  });

  it("discovers Claude Code and OpenCode source paths when present", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-bootstrap-claude-opencode-"));
    const home = await mkdtemp(join(tmpdir(), "praxisbase-bootstrap-home-co-"));
    await mkdir(join(home, ".codex/sessions"), { recursive: true });
    await mkdir(join(home, ".claude/transcripts"), { recursive: true });
    await mkdir(join(home, ".local/share/opencode/log"), { recursive: true });

    const output = await bootstrapCommand(root, "personal", {
      agent: "opencode",
      installSkill: true,
      json: true,
      homeDir: home,
      now: "2026-05-28T00:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.ok(parsed.sources_added >= 3, `expected >= 3 sources, got ${parsed.sources_added}`);
    assert.ok(parsed.sources_discovered.some((source: { path: string }) => source.path === "~/.codex/sessions"));
    assert.ok(parsed.sources_discovered.some((source: { path: string }) => source.path === "~/.claude/transcripts"));
    assert.ok(parsed.sources_discovered.some((source: { path: string }) => source.path === "~/.local/share/opencode/log"));

    const sourceFiles = await readdir(join(root, ".praxisbase/sources"));
    const claudeFile = sourceFiles.find((file) => file.includes("local-claude-code-transcripts"));
    assert.ok(claudeFile, "should have Claude Code source file");
    const claudeSource = JSON.parse(await readFile(join(root, ".praxisbase/sources", claudeFile!), "utf8"));
    assert.equal(claudeSource.agent, "claude-code");
    assert.equal(claudeSource.parser, "claude-code-session");

    const opencodeFile = sourceFiles.find((file) => file.includes("local-opencode-log"));
    assert.ok(opencodeFile, "should have OpenCode source file");
    const opencodeSource = JSON.parse(await readFile(join(root, ".praxisbase/sources", opencodeFile!), "utf8"));
    assert.equal(opencodeSource.agent, "opencode");
    assert.equal(opencodeSource.parser, "opencode-session");
  });

  it("does not add Claude Code or OpenCode sources when paths do not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-bootstrap-no-claude-opencode-"));
    const home = await mkdtemp(join(tmpdir(), "praxisbase-bootstrap-home-no-co-"));
    await mkdir(join(home, ".codex/sessions"), { recursive: true });

    const output = await bootstrapCommand(root, "personal", {
      agent: "codex",
      installSkill: false,
      json: true,
      homeDir: home,
      now: "2026-05-28T00:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.ok(!parsed.sources_discovered.some((source: { path: string }) => source.path === "~/.claude/transcripts"), "should not discover missing Claude Code path");
    assert.ok(!parsed.sources_discovered.some((source: { path: string }) => source.path === "~/.local/share/opencode/log"), "should not discover missing OpenCode path");
  });
});
