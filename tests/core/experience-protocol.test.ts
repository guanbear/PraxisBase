import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AdapterProfileSchema,
  CaptureRecordSchema,
  ContextRequestSchema,
  ContextResponseSchema,
  MemoryImportReportSchema,
  MemoryRefreshPlanSchema,
  NativeMemorySourceSchema,
  ScopeSchema,
  StructuredErrorSchema,
} from "@praxisbase/core/protocol/schemas.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";

describe("multi-agent experience protocol schemas", () => {
  it("accepts org scope while keeping global compatibility", () => {
    assert.equal(ScopeSchema.parse("org"), "org");
    assert.equal(ScopeSchema.parse("global"), "global");
  });

  it("validates capture records with external artifact refs", () => {
    const parsed = CaptureRecordSchema.parse({
      id: "capture_20260520_codex",
      protocol_version: "0.1",
      type: "capture_record",
      agent: "codex",
      workspace: "/repo",
      scope_hint: "project",
      result: "success",
      triggers: ["task_finish", "tests_run"],
      signals: ["tests_passed"],
      artifacts: [
        {
          kind: "transcript",
          source_ref: "raw-vault://codex/session-1",
          source_hash: "sha256:session1",
          redacted_summary: "Fixed a project issue and tests passed.",
        },
      ],
      created_at: "2026-05-20T00:00:00Z",
    });

    assert.equal(parsed.type, "capture_record");
    assert.equal(parsed.artifacts[0].source_ref, "raw-vault://codex/session-1");
  });

  it("rejects capture records without artifact refs", () => {
    const result = CaptureRecordSchema.safeParse({
      id: "capture_missing_artifacts",
      protocol_version: "0.1",
      type: "capture_record",
      agent: "codex",
      workspace: "/repo",
      scope_hint: "project",
      result: "success",
      triggers: ["task_finish"],
      signals: [],
      artifacts: [],
      created_at: "2026-05-20T00:00:00Z",
    });

    assert.equal(result.success, false);
  });

  it("validates adapter profiles", () => {
    const parsed = AdapterProfileSchema.parse({
      agent: "codex",
      instruction_files: ["AGENTS.md"],
      transcript_paths: ["~/.codex/archived_sessions"],
      workspace_markers: ["AGENTS.md", ".git"],
      capture: { default_triggers: ["task_finish", "tests_run"] },
      context: { default_stages: ["diagnosis", "repair", "verification"] },
      privacy: { redaction_profile: "developer-default" },
    });

    assert.equal(parsed.agent, "codex");
    assert.ok(parsed.context.default_stages.includes("diagnosis"));
  });

  it("validates native memory source and import report schemas", () => {
    NativeMemorySourceSchema.parse({
      agent: "hermes",
      kind: "skill_summary",
      source_ref: "raw-vault://hermes/skill-auth-repair",
      source_hash: "sha256:hermes1",
      redacted_summary: "Hermes synthesized an auth repair skill.",
      scope_hint: "personal",
      created_at: "2026-05-20T00:00:00Z",
    });

    const report = MemoryImportReportSchema.parse({
      id: "memory_import_20260520",
      protocol_version: "0.1",
      type: "memory_import_report",
      agent: "hermes",
      imported_sources: 1,
      proposal_candidates: ["proposal_hermes_skill_auth_repair"],
      capture_candidates: [],
      default_scope: "personal",
      changed_stable_knowledge: false,
      warnings: [],
      created_at: "2026-05-20T00:00:00Z",
    });

    assert.equal(report.changed_stable_knowledge, false);
  });

  it("validates memory refresh plan schemas", () => {
    const parsed = MemoryRefreshPlanSchema.parse({
      agent: "codex",
      target: "instruction-snippet",
      writes_native_memory: false,
      outputs: [
        {
          kind: "install_snippet",
          target_path: "AGENTS.md",
          source_refs: ["kb/known-fixes/openclaw-auth-expired.md"],
        },
      ],
      created_at: "2026-05-20T00:00:00Z",
    });

    assert.equal(parsed.writes_native_memory, false);
  });

  it("validates context request and response schemas", () => {
    ContextRequestSchema.parse({
      agent: "codex",
      workspace: "/repo",
      stage: "diagnosis",
      query: "openclaw auth expired",
      max_bytes: 4096,
    });

    const response = ContextResponseSchema.parse({
      agent: "codex",
      stage: "diagnosis",
      items: [],
      citations: [{ id: "openclaw-auth-expired", path: "kb/known-fixes/openclaw-auth-expired.md" }],
      warnings: ["context_unavailable"],
      truncated: false,
      budget: { max_bytes: 4096, used_bytes: 256 },
    });

    assert.equal(response.stage, "diagnosis");
    assert.equal(response.citations.length, 1);
  });

  it("validates structured machine-readable errors", () => {
    const parsed = StructuredErrorSchema.parse({
      ok: false,
      code: "RAW_ARTIFACT_REJECTED",
      message: "Raw transcript must not be committed to Git.",
      retryable: false,
      details: { path: "kb/session.md" },
    });

    assert.equal(parsed.retryable, false);
  });
});

describe("multi-agent experience protocol paths", () => {
  it("exposes all M0 path surfaces", () => {
    assert.equal(protocolPaths.outboxCaptures, ".praxisbase/outbox/captures");
    assert.equal(protocolPaths.reportsDistill, ".praxisbase/reports/distill");
    assert.equal(protocolPaths.reportsContext, ".praxisbase/reports/context");
    assert.equal(protocolPaths.reportsMemory, ".praxisbase/reports/memory");
    assert.equal(protocolPaths.runsCapture, ".praxisbase/runs/capture");
    assert.equal(protocolPaths.runsDistill, ".praxisbase/runs/distill");
    assert.equal(protocolPaths.runsMemoryImport, ".praxisbase/runs/memory-import");
    assert.equal(protocolPaths.adapters, ".praxisbase/adapters");
    assert.equal(protocolPaths.memoryRefresh, ".praxisbase/memory-refresh");
    assert.equal(protocolPaths.rawVaultRefs, ".praxisbase/raw-vault/refs");
  });
});
