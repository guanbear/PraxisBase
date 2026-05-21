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
    assert.match(skill, /human-required|Human|required/i);
  });
});
