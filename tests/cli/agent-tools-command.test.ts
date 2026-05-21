import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL_VERSION } from "@praxisbase/core/protocol/types.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { agentToolsCommand } from "@praxisbase/cli/commands/agent-tools.js";

describe("agent-tools generate", () => {
  it("generates manifest.json and SKILL.md for codex agent", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-agent-tools-cli-"));

    const output = await agentToolsCommand(root, "generate", {
      agent: "codex",
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.manifest.type, "agent_tool_manifest");
    assert.equal(parsed.manifest.protocol_version, PROTOCOL_VERSION);

    const manifestPath = join(root, protocolPaths.agentToolsManifest);
    const manifestStat = await stat(manifestPath);
    assert.ok(manifestStat.isFile(), "manifest.json must exist");

    const manifestContent = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifestContent.type, "agent_tool_manifest");

    const skillPath = join(root, ".praxisbase/agent-tools/skills/praxisbase/SKILL.md");
    const skillStat = await stat(skillPath);
    assert.ok(skillStat.isFile(), "SKILL.md must exist");
  });

  it("Skill contains required sections and tool references", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-agent-tools-cli-"));

    await agentToolsCommand(root, "generate", {
      agent: "codex",
      json: true,
    });

    const skillPath = join(root, ".praxisbase/agent-tools/skills/praxisbase/SKILL.md");
    const skillContent = await readFile(skillPath, "utf8");

    assert.ok(skillContent.includes("context get"), "Skill must reference context get");
    assert.ok(skillContent.includes("harvest"), "Skill must reference harvest");
    assert.ok(skillContent.includes("capture finish"), "Skill must reference capture finish");
    assert.ok(skillContent.includes("wiki build-site"), "Skill must reference wiki build-site");
    assert.ok(skillContent.includes("review") && skillContent.includes("promote"), "Skill must mention review/promote gate");
  });

  it("generates Skill for opencode agent", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-agent-tools-cli-"));

    const output = await agentToolsCommand(root, "generate", {
      agent: "opencode",
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);

    const skillPath = join(root, ".praxisbase/agent-tools/skills/praxisbase/SKILL.md");
    const skillStat = await stat(skillPath);
    assert.ok(skillStat.isFile(), "SKILL.md must exist for opencode");
  });
});

describe("agent-tools manifest", () => {
  it("returns existing manifest as JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-agent-tools-cli-"));

    await agentToolsCommand(root, "generate", { agent: "codex", json: true });

    const output = await agentToolsCommand(root, "manifest", { json: true });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.manifest.type, "agent_tool_manifest");
    assert.ok(parsed.manifest.tools.length >= 7, "manifest must have at least 7 tools");
  });

  it("returns error when manifest does not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-agent-tools-cli-"));

    await assert.rejects(
      () => agentToolsCommand(root, "manifest", { json: true }),
      /not found|ENOENT|no agent tool manifest/i
    );
  });
});
