import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { harvestCommand } from "@praxisbase/cli/commands/harvest.js";

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
    await assert.doesNotReject(() => stat(join(root, "dist/index.html")));
  });
});
