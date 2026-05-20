import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AgentMemoryCandidateSchema,
  AgentMemoryIngestReportSchema,
  RealWikiSmokeReportSchema,
  protocolPaths,
} from "@praxisbase/core";

describe("agent memory ingestion protocol", () => {
  it("exposes M12 paths and validates report schemas", () => {
    assert.equal(protocolPaths.reportsMemoryIngest, ".praxisbase/reports/memory-ingest");
    assert.equal(protocolPaths.runsMemoryIngest, ".praxisbase/runs/memory-ingest");

    const candidate = AgentMemoryCandidateSchema.parse({
      id: "agent-memory-candidate_codex_session_1",
      agent: "codex",
      kind: "codex_session",
      source_path: "sessions/session-1.json",
      source_ref: "raw-vault://codex/session-1",
      source_hash: "sha256:session1",
      size_bytes: 128,
      warnings: [],
    });
    assert.equal(candidate.agent, "codex");

    const ingest = AgentMemoryIngestReportSchema.parse({
      id: "agent-memory-ingest_codex",
      protocol_version: "0.1",
      type: "agent_memory_ingest_report",
      agent: "codex",
      mode: "dry-run",
      scanned: 1,
      imported: 0,
      duplicates: 0,
      skipped: 0,
      unsafe: 0,
      outputs: [],
      warnings: [],
      changed_stable_knowledge: false,
      created_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(ingest.changed_stable_knowledge, false);

    const smoke = RealWikiSmokeReportSchema.parse({
      id: "real-wiki-smoke_codex",
      protocol_version: "0.1",
      type: "real_wiki_smoke_report",
      agent: "codex",
      imported: 1,
      duplicates: 0,
      unsafe: 0,
      proposal_candidates: 1,
      graph_nodes: 1,
      graph_broken_links: 0,
      site_pages: 1,
      context_items: 1,
      outputs: ["dist/index.html"],
      changed_stable_knowledge: false,
      created_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(smoke.type, "real_wiki_smoke_report");
  });
});
