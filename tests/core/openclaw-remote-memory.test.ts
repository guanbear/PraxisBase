import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AgentMemoryFetchReportSchema,
  OpenClawRemoteDoctorReportSchema,
  OpenClawRemoteMemoryEnvelopeSchema,
  protocolPaths,
} from "@praxisbase/core";

describe("OpenClaw remote memory protocol", () => {
  it("exposes M12.1 paths and validates remote schemas", () => {
    assert.equal(protocolPaths.stagingOpenClaw, ".praxisbase/staging/openclaw");
    assert.equal(protocolPaths.reportsMemoryFetch, ".praxisbase/reports/memory-fetch");
    assert.equal(protocolPaths.runsMemoryFetch, ".praxisbase/runs/memory-fetch");

    const envelope = OpenClawRemoteMemoryEnvelopeSchema.parse({
      id: "openclaw-remote_remote-auth-expired-1",
      protocol_version: "0.1",
      type: "openclaw_remote_memory",
      provider: "exported-json",
      remote_id: "remote-auth-expired-1",
      source_ref: "openclaw://exported-json/remote-auth-expired-1",
      source_hash: "sha256:abc",
      redacted_summary: "OpenClaw detected Claude auth expired.",
      signature: "openclaw:claude-auth-expired",
      fetched_at: "2026-05-20T00:00:00.000Z",
      warnings: [],
    });
    assert.equal(envelope.provider, "exported-json");

    const fetchReport = AgentMemoryFetchReportSchema.parse({
      id: "memory-fetch_openclaw_exported-json",
      protocol_version: "0.1",
      type: "agent_memory_fetch_report",
      agent: "openclaw",
      provider: "exported-json",
      runtime_mode: "source",
      fetched: 1,
      staged: 1,
      duplicates: 0,
      skipped: 0,
      unsafe: 0,
      outputs: [".praxisbase/staging/openclaw/openclaw-remote_remote-auth-expired-1.json"],
      warnings: [],
      changed_stable_knowledge: false,
      created_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(fetchReport.changed_stable_knowledge, false);

    const doctor = OpenClawRemoteDoctorReportSchema.parse({
      id: "openclaw-remote-doctor_openclaw-api",
      protocol_version: "0.1",
      type: "openclaw_remote_doctor_report",
      provider: "openclaw-api",
      runtime_mode: "source",
      ok: false,
      checks: [
        { id: "openclaw-token", ok: false, severity: "error", message: "OPENCLAW_TOKEN is not set." },
      ],
      warnings: ["OPENCLAW_TOKEN is not set."],
      created_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(doctor.ok, false);
  });
});
