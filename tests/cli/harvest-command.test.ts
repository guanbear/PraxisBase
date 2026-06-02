import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { harvestCommand } from "@praxisbase/cli/commands/harvest.js";
import { addRemoteSource } from "@praxisbase/core/experience/remote-sources.js";

describe("harvest CLI command", () => {
  it("harvests an OpenClaw export and builds the site", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-harvest-"));
    const exportPath = join(root, "openclaw-export.json");
    await writeFile(exportPath, JSON.stringify({
      items: [{ id: "one", summary: "OpenClaw detected Claude auth expired.", signature: "openclaw:claude-auth-expired" }],
    }));
    const output = await harvestCommand(root, {
      openclawExports: [exportPath],
      buildSite: true,
      json: true,
    });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.changed_stable_knowledge, false);
    assert.ok(parsed.report.quality_findings >= 0);
    assert.ok(parsed.report.outputs.some((output: string) => output.startsWith(".praxisbase/reports/wiki-quality/")));
    await assert.doesNotReject(() => stat(join(root, "dist/index.html")));
  });

  it("returns JSON error details for unsafe promotion flags", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-harvest-error-"));
    const output = await harvestCommand(root, {
      autoPromote: true,
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "HARVEST_AUTO_REVIEW_REQUIRED");
  });

  it("returns JSON error details for missing team branch", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-harvest-branch-error-"));
    const output = await harvestCommand(root, {
      team: true,
      commit: true,
      currentBranchForTests: "main",
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "HARVEST_BRANCH_REQUIRED");
  });

  it("harvests a registered SSH OpenClaw remote through the CLI", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-harvest-ssh-"));
    await addRemoteSource(root, {
      name: "openclaw-ssh",
      sourceType: "ssh",
      agent: "openclaw",
      host: "root@example.com",
      path: "~/.openclaw/exports/latest.json",
      now: "2026-05-26T00:00:00.000Z",
    });

    const output = await harvestCommand(root, {
      remote: ["openclaw-ssh"],
      runRemoteCommandForTests: async (command, args) => {
        assert.equal(command, "ssh");
        assert.deepEqual(args, ["root@example.com", "cat", "~/.openclaw/exports/latest.json"]);
        return JSON.stringify({
          items: [{ id: "ssh-one", summary: "SSH remote OpenClaw export summary", signature: "openclaw:ssh-one" }],
        });
      },
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.sources[0].name, "openclaw-ssh");
    assert.equal(parsed.report.sources[0].source_type, "ssh");
    assert.equal(parsed.report.sources[0].imported, 1);
  });
});
