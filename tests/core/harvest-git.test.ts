import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  executeTeamGitAction,
  planTeamGitAction,
} from "@praxisbase/core/experience/git-workflow.js";
import { runHarvest } from "@praxisbase/core/experience/harvest.js";

describe("team git workflow", () => {
  it("requires branch when committing on protected branch", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-git-"));
    await assert.rejects(
      () => planTeamGitAction(root, {
        team: true,
        commit: true,
        currentBranch: "main",
      }),
      /HARVEST_BRANCH_REQUIRED/
    );
  });

  it("requires commit before push", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-git-"));
    await assert.rejects(
      () => planTeamGitAction(root, {
        team: true,
        push: true,
        currentBranch: "harvest/test",
      }),
      /HARVEST_COMMIT_REQUIRED/
    );
  });

  it("executes branch checkout, commit, and push through an injected runner", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-git-exec-"));
    const calls: string[] = [];
    const result = await executeTeamGitAction(root, {
      authorityMode: "team-git",
      branch: "harvest/openclaw-prod",
      shouldCommit: true,
      shouldPush: true,
      shouldCreatePr: false,
      message: "chore: harvest openclaw-prod",
      warnings: [],
    }, async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (args.includes("rev-parse")) return "abc123\n";
      return "";
    });

    assert.equal(result.committed, true);
    assert.equal(result.pushed, true);
    assert.equal(result.commit_sha, "abc123");
    assert.ok(calls.some((call) => call === "git checkout -B harvest/openclaw-prod"));
    assert.ok(calls.some((call) => call === "git add ."));
    assert.ok(calls.some((call) => call === "git commit -m chore: harvest openclaw-prod"));
    assert.ok(calls.some((call) => call === "git push -u origin harvest/openclaw-prod"));
  });

  it("records git execution in harvest reports", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-git-report-"));
    const calls: string[] = [];
    const report = await runHarvest(root, {
      team: true,
      branch: "harvest/test",
      commit: true,
      push: true,
      currentBranchForTests: "main",
      runGitCommandForTests: async (command, args) => {
        calls.push([command, ...args].join(" "));
        if (args.includes("rev-parse")) return "def456\n";
        return "";
      },
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(report.git?.branch, "harvest/test");
    assert.equal(report.git?.committed, true);
    assert.equal(report.git?.pushed, true);
    assert.equal(report.git?.commit_sha, "def456");
    assert.ok(calls.some((call) => call === "git checkout -B harvest/test"));
  });
});
