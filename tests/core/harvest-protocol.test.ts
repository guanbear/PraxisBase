import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HarvestReportSchema,
  RemoteSourceConfigSchema,
  protocolPaths,
} from "@praxisbase/core";

describe("harvest protocol", () => {
  it("exposes harvest paths and validates schemas", () => {
    assert.equal(protocolPaths.remotes, ".praxisbase/remotes");
    assert.equal(protocolPaths.reportsHarvest, ".praxisbase/reports/harvest");
    assert.equal(protocolPaths.runsHarvest, ".praxisbase/runs/harvest");
    assert.equal(protocolPaths.stagingRemoteImports, ".praxisbase/staging/remote-imports");
    assert.equal(protocolPaths.cacheRemotes, ".praxisbase/cache/remotes");

    const remote = RemoteSourceConfigSchema.parse({
      id: "remote_openclaw-prod",
      protocol_version: "0.1",
      type: "remote_source_config",
      name: "openclaw-prod",
      source_type: "git",
      agent: "openclaw",
      repo: "git@example.com:org/openclaw-export-private.git",
      path: "exports/openclaw-prod/latest.json",
      created_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(remote.source_type, "git");

    const report = HarvestReportSchema.parse({
      id: "harvest_openclaw-prod",
      protocol_version: "0.1",
      type: "harvest_report",
      authority_mode: "team-git",
      mode: "write",
      sources: [{
        name: "openclaw-prod",
        agent: "openclaw",
        source_type: "git",
        status: "completed",
        scanned: 0,
        fetched: 1,
        imported: 1,
        duplicates: 0,
        skipped: 0,
        unsafe: 0,
        warnings: [],
      }],
      proposal_candidates: 1,
      graph_nodes: 0,
      graph_broken_links: 0,
      site_pages: 1,
      context_items: 0,
      git: { branch: "harvest/openclaw-prod", committed: true, pushed: false },
      outputs: ["dist/index.html"],
      warnings: [],
      changed_stable_knowledge: false,
      created_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(report.changed_stable_knowledge, false);
  });
});
