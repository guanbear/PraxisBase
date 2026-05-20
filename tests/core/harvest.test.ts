import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runHarvest } from "@praxisbase/core/experience/harvest.js";

describe("runHarvest", () => {
  it("harvests an OpenClaw export without changing stable knowledge", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-export-"));
    const exportPath = join(root, "openclaw-export.json");
    await writeFile(exportPath, JSON.stringify({
      items: [{
        id: "remote-auth-expired-1",
        summary: "OpenClaw detected Claude auth expired and asked the user to login again.",
        signature: "openclaw:claude-auth-expired",
        raw_log: "RAW LOG MUST NOT BE WRITTEN",
      }],
    }));

    const report = await runHarvest(root, {
      openclawExports: [exportPath],
      buildSite: true,
      json: true,
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(report.authority_mode, "personal-local");
    assert.equal(report.sources[0].imported, 1);
    assert.equal(report.changed_stable_knowledge, false);
    await assert.doesNotReject(() => stat(join(root, "dist/index.html")));
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
    const rawReport = await readFile(join(root, ".praxisbase/reports/harvest", `${report.id}.json`), "utf8");
    assert.equal(rawReport.includes("RAW LOG MUST NOT BE WRITTEN"), false);
  });

  it("harvests local Codex sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-codex-"));
    const source = join(root, "session.txt");
    await writeFile(source, "Implemented wiki compile workflow. pnpm check passed.");
    const report = await runHarvest(root, {
      codexSources: [source],
      buildSite: true,
      now: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(report.sources[0].agent, "codex");
    assert.equal(report.sources[0].imported, 1);
  });
});
