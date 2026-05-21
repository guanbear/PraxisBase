import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addExperienceSource } from "@praxisbase/core/experience/source-config.js";
import { runDailyExperience } from "@praxisbase/core/experience/daily.js";
import { protocolPaths } from "@praxisbase/core";

describe("runDailyExperience", () => {
  it("runs the personal daily loop from configured sources into wiki proposals", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-personal-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Implemented OpenClaw auth refresh and pnpm test passed.", "utf8");
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(report.authority_mode, "personal-local");
    assert.equal(report.sources.length, 1);
    assert.equal(report.sources[0].enveloped, 1);
    assert.equal(report.sources[0].imported, 1);
    assert.equal(report.proposal_candidates, 1);
    assert.equal(report.changed_stable_knowledge, false);
    assert.ok(report.outputs.some((output) => output.startsWith(protocolPaths.reportsDaily)));
    assert.ok(report.outputs.some((output) => output.startsWith(protocolPaths.stagingExperienceEnvelopes)));
  });

  it("keeps personal material out of team daily ingestion", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-team-privacy-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Implemented OpenClaw auth refresh.", "utf8");
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    const report = await runDailyExperience(root, {
      authorityMode: "team-git",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(report.sources[0].rejected, 1);
    assert.equal(report.sources[0].imported, 0);
    assert.equal(report.proposal_candidates, 0);
    await assert.rejects(() => stat(join(root, ".praxisbase/raw-vault/refs")), { code: "ENOENT" });
    const exceptions = await readdir(join(root, ".praxisbase/exceptions/human-required"));
    assert.equal(exceptions.length, 1);
    const exception = await readFile(join(root, ".praxisbase/exceptions/human-required", exceptions[0]), "utf8");
    assert.match(exception, /team_rejects_personal_scope/);
  });
});
