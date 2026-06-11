import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { teamCommand } from "@praxisbase/cli/commands/team.js";

describe("team command", () => {
  it("returns a team release audit JSON report", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-team-release-audit-"));

    const output = await teamCommand(root, "release-audit", {
      json: true,
      now: "2026-06-03T11:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.type, "team_release_audit_report");
    assert.equal(parsed.ok, false);
    assert.equal(parsed.team_ga, "fail");
    assert.equal(parsed.k8s_bundle_ga, "not_run");
    assert.equal(parsed.incident_episode_intake_ga, "not_run");
    assert.equal(parsed.k8s_boundary_ga, "not_run");
    assert.ok(Array.isArray(parsed.blocking_reasons));
    assert.ok(parsed.warnings.includes("k8s_domain_not_enabled"));
  });
});
