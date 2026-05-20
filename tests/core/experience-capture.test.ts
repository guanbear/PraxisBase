import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CaptureRecordSchema,
  AdapterProfileSchema,
  NativeMemorySourceSchema,
  MemoryImportReportSchema,
  MemoryRefreshPlanSchema,
  ContextStageSchema,
  ContextRequestSchema,
  ContextResponseSchema,
  StructuredErrorSchema,
  ScopeSchema,
} from "@praxisbase/core/protocol/schemas.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { finishCapture } from "@praxisbase/core/experience/capture.js";
import { validateRawRef } from "@praxisbase/core/experience/raw-vault.js";
import { PraxisBaseError } from "@praxisbase/core/experience/errors.js";

describe("M0 experience schemas", () => {
  it("validates capture records with raw-vault artifact refs", () => {
    const parsed = CaptureRecordSchema.parse({
      id: "capture_20260519_codex_001",
      protocol_version: "0.1",
      type: "capture_record",
      agent: "codex",
      workspace: "/repo",
      scope_hint: "project",
      result: "success",
      triggers: ["task_finish", "git_diff_changed"],
      signals: { has_git_diff: true, tests_passed: true, user_correction: false, used_praxisbase_context: true },
      artifacts: [{
        kind: "transcript",
        source_ref: "raw-vault://codex/session-abc",
        source_hash: "sha256:abc",
        redacted_summary: "Implemented a repair.",
      }],
      created_at: "2026-05-19T00:00:00Z",
    });
    assert.equal(parsed.scope_hint, "project");
    assert.equal(parsed.artifacts.length, 1);
    assert.equal(parsed.artifacts[0].source_ref, "raw-vault://codex/session-abc");
  });

  it("rejects capture records without artifact refs", () => {
    assert.throws(() => CaptureRecordSchema.parse({
      id: "capture_bad",
      protocol_version: "0.1",
      type: "capture_record",
      agent: "codex",
      workspace: "/repo",
      scope_hint: "project",
      result: "success",
      triggers: ["task_finish"],
      signals: {},
      artifacts: [],
      created_at: "2026-05-19T00:00:00Z",
    }));
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
    assert.ok(parsed.instruction_files.includes("AGENTS.md"));
  });

  it("validates native memory source schemas", () => {
    const parsed = NativeMemorySourceSchema.parse({
      agent: "hermes",
      kind: "skill_summary",
      source_ref: "raw-vault://hermes/skill-auth-repair",
      source_hash: "sha256:hermes1",
      redacted_summary: "Hermes synthesized an auth repair skill.",
      scope_hint: "personal",
      created_at: "2026-05-19T00:00:00Z",
    });
    assert.equal(parsed.kind, "skill_summary");
    assert.equal(parsed.scope_hint, "personal");
  });

  it("validates memory import report schemas", () => {
    const parsed = MemoryImportReportSchema.parse({
      id: "mir_20260519_hermes",
      protocol_version: "0.1",
      type: "memory_import_report",
      agent: "hermes",
      imported_sources: 1,
      changed_stable_knowledge: false,
      default_scope: "personal",
      created_at: "2026-05-19T00:00:00Z",
    });
    assert.equal(parsed.changed_stable_knowledge, false);
    assert.equal(parsed.imported_sources, 1);
  });

  it("validates memory refresh plan schemas", () => {
    const parsed = MemoryRefreshPlanSchema.parse({
      agent: "codex",
      target: "instruction-snippet",
      writes_native_memory: false,
      outputs: [{
        kind: "install_snippet",
        target_path: "AGENTS.md",
        source_refs: ["kb/known-fixes/openclaw-auth-expired.md"],
      }],
    });
    assert.equal(parsed.writes_native_memory, false);
    assert.equal(parsed.outputs.length, 1);
  });

  it("validates context request and response schemas", () => {
    const req = ContextRequestSchema.parse({
      agent: "codex",
      workspace: "/repo",
      stage: "diagnosis",
      query: "openclaw auth expired",
      max_bytes: 16384,
    });
    assert.equal(req.stage, "diagnosis");

    const res = ContextResponseSchema.parse({
      stage: "diagnosis",
      agent: "codex",
      items: [],
      citations: ["kb/known-fixes/openclaw-auth-expired.md"],
      warnings: [],
      truncated: false,
      budget: 16384,
    });
    assert.equal(res.citations.length, 1);
  });

  it("validates context stage enum", () => {
    const stages = ContextStageSchema.options;
    assert.deepEqual(stages, ["diagnosis", "repair", "verification", "proposal"]);
  });

  it("structured errors are machine-readable", () => {
    const error = StructuredErrorSchema.parse({
      ok: false,
      code: "RAW_ARTIFACT_REJECTED",
      message: "Raw transcript must not be committed to Git.",
      retryable: false,
      details: { path: "kb/session.md" },
    });
    assert.equal(error.ok, false);
    assert.equal(error.retryable, false);
    assert.equal(error.code, "RAW_ARTIFACT_REJECTED");
  });

  it("rejects structured errors with ok: true", () => {
    assert.throws(() => StructuredErrorSchema.parse({
      ok: true,
      code: "SOME_CODE",
      message: "msg",
      retryable: false,
    }));
  });
});

describe("M0 experience paths", () => {
  it("has outbox captures path", () => {
    assert.equal(protocolPaths.outboxCaptures, ".praxisbase/outbox/captures");
  });

  it("has reports paths for distill, context, memory", () => {
    assert.equal(protocolPaths.reportsDistill, ".praxisbase/reports/distill");
    assert.equal(protocolPaths.reportsContext, ".praxisbase/reports/context");
    assert.equal(protocolPaths.reportsMemory, ".praxisbase/reports/memory");
  });

  it("has runs paths for capture, distill, memory-import", () => {
    assert.equal(protocolPaths.runsCapture, ".praxisbase/runs/capture");
    assert.equal(protocolPaths.runsDistill, ".praxisbase/runs/distill");
    assert.equal(protocolPaths.runsMemoryImport, ".praxisbase/runs/memory-import");
  });

  it("has adapters and raw vault paths", () => {
    assert.equal(protocolPaths.adapters, ".praxisbase/adapters");
    assert.equal(protocolPaths.memoryRefresh, ".praxisbase/memory-refresh");
    assert.equal(protocolPaths.rawVaultRefs, ".praxisbase/raw-vault/refs");
  });
});

describe("M1 raw vault ref validation", () => {
  it("allows raw-vault:// refs", () => {
    assert.equal(validateRawRef("raw-vault://codex/session-1"), null);
  });

  it("allows log:// refs", () => {
    assert.equal(validateRawRef("log://openclaw/sandbox-1"), null);
  });

  it("allows artifact:// refs", () => {
    assert.equal(validateRawRef("artifact://ci/build-1"), null);
  });

  it("allows file-ref:// refs", () => {
    assert.equal(validateRawRef("file-ref:///tmp/output.log"), null);
  });

  it("allows ci-artifact:// refs", () => {
    assert.equal(validateRawRef("ci-artifact://pipeline/123"), null);
  });

  it("rejects kb/ refs with RAW_ARTIFACT_REJECTED", () => {
    const err = validateRawRef("kb/raw-transcript.md");
    assert.ok(err);
    assert.equal(err.code, "RAW_ARTIFACT_REJECTED");
  });

  it("rejects skills/ refs with RAW_ARTIFACT_REJECTED", () => {
    const err = validateRawRef("skills/repair/SKILL.md");
    assert.ok(err);
    assert.equal(err.code, "RAW_ARTIFACT_REJECTED");
  });

  it("rejects dist/ refs with RAW_ARTIFACT_REJECTED", () => {
    const err = validateRawRef("dist/repair-bundles/bundle.json");
    assert.ok(err);
    assert.equal(err.code, "RAW_ARTIFACT_REJECTED");
  });

  it("rejects unknown schemes", () => {
    const err = validateRawRef("https://example.com/raw.txt");
    assert.ok(err);
    assert.equal(err.code, "RAW_ARTIFACT_REJECTED");
  });
});

describe("M1 finishCapture", () => {
  it("writes a capture record to outbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-capture-"));
    const result = await finishCapture(root, {
      agent: "codex",
      workspace: root,
      result: "success",
      triggers: ["task_finish", "tests_run"],
      artifact: {
        kind: "transcript",
        sourceRef: "raw-vault://codex/session-1",
        sourceHash: "sha256:session1",
        redactedSummary: "Fixed a failing test.",
      },
    });

    assert.match(result.id, /^capture_/);
    assert.match(result.path, /\.praxisbase\/outbox\/captures\/capture_/);

    const saved = JSON.parse(await readFile(join(root, result.path), "utf8"));
    assert.equal(saved.type, "capture_record");
    assert.equal(saved.agent, "codex");
    assert.equal(saved.result, "success");
    assert.equal(saved.artifacts.length, 1);
    assert.equal(saved.artifacts[0].source_ref, "raw-vault://codex/session-1");
  });

  it("rejects raw artifact paths under kb/", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-capture-"));
    await assert.rejects(
      () => finishCapture(root, {
        agent: "codex",
        workspace: root,
        result: "success",
        triggers: ["task_finish"],
        artifact: {
          kind: "transcript",
          sourceRef: "kb/raw-transcript.md",
          sourceHash: "sha256:bad",
          redactedSummary: "Raw transcript.",
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof PraxisBaseError);
        assert.equal(err.code, "RAW_ARTIFACT_REJECTED");
        return true;
      },
    );

    const captures = await readdir(join(root, ".praxisbase", "outbox", "captures")).catch(() => []);
    assert.equal(captures.length, 0);
  });

  it("rejects raw artifact paths under skills/", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-capture-"));
    await assert.rejects(
      () => finishCapture(root, {
        agent: "codex",
        workspace: root,
        result: "success",
        triggers: [],
        artifact: {
          kind: "transcript",
          sourceRef: "skills/repair/skill.md",
          sourceHash: "sha256:bad2",
          redactedSummary: "Skill content.",
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof PraxisBaseError);
        assert.equal(err.code, "RAW_ARTIFACT_REJECTED");
        return true;
      },
    );
  });

  it("defaults scope_hint to personal", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-capture-"));
    const result = await finishCapture(root, {
      agent: "codex",
      workspace: root,
      result: "success",
      artifact: {
        kind: "transcript",
        sourceRef: "raw-vault://codex/session-default-scope",
        sourceHash: "sha256:scope",
        redactedSummary: "Test.",
      },
    });

    const saved = JSON.parse(await readFile(join(root, result.path), "utf8"));
    assert.equal(saved.scope_hint, "personal");
  });

  it("accepts scopeHint org and writes scope_hint: org", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-capture-"));
    const result = await finishCapture(root, {
      agent: "codex",
      workspace: root,
      result: "success",
      scopeHint: "org",
      artifact: {
        kind: "transcript",
        sourceRef: "raw-vault://codex/session-org",
        sourceHash: "sha256:org",
        redactedSummary: "Org-level work.",
      },
    });

    const saved = JSON.parse(await readFile(join(root, result.path), "utf8"));
    assert.equal(saved.scope_hint, "org");
  });

  it("uses custom scope_hint when provided", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-capture-"));
    const result = await finishCapture(root, {
      agent: "codex",
      workspace: root,
      result: "success",
      scopeHint: "team",
      artifact: {
        kind: "transcript",
        sourceRef: "raw-vault://codex/session-team",
        sourceHash: "sha256:team",
        redactedSummary: "Team work.",
      },
    });

    const saved = JSON.parse(await readFile(join(root, result.path), "utf8"));
    assert.equal(saved.scope_hint, "team");
  });

  it("uses idempotency key for deterministic id", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-capture-"));
    const result = await finishCapture(root, {
      agent: "codex",
      workspace: root,
      result: "success",
      idempotencyKey: "deterministic-test-key",
      artifact: {
        kind: "transcript",
        sourceRef: "raw-vault://codex/session-idem",
        sourceHash: "sha256:idem",
        redactedSummary: "Idempotent.",
      },
    });

    const result2 = await finishCapture(root, {
      agent: "codex",
      workspace: root,
      result: "success",
      idempotencyKey: "deterministic-test-key",
      artifact: {
        kind: "transcript",
        sourceRef: "raw-vault://codex/session-idem-2",
        sourceHash: "sha256:idem2",
        redactedSummary: "Same idempotency key.",
      },
    });

    assert.equal(result.id, result2.id);
  });
});

describe("M0 scope schema accepts org", () => {
  it("accepts org as a valid scope", () => {
    const parsed = ScopeSchema.parse("org");
    assert.equal(parsed, "org");
  });

  it("capture record with org scope_hint passes validation", () => {
    const parsed = CaptureRecordSchema.parse({
      id: "capture_org_test",
      protocol_version: "0.1",
      type: "capture_record",
      agent: "codex",
      workspace: "/repo",
      scope_hint: "org",
      result: "success",
      triggers: [],
      signals: {},
      artifacts: [{
        kind: "transcript",
        source_ref: "raw-vault://codex/org-session",
        source_hash: "sha256:org",
        redacted_summary: "Org-level capture.",
      }],
      created_at: "2026-05-19T00:00:00Z",
    });
    assert.equal(parsed.scope_hint, "org");
  });
});

describe("M0 adapter profile requires artifact paths", () => {
  it("rejects adapter profile with neither transcript_paths nor raw_artifact_paths", () => {
    assert.throws(() => AdapterProfileSchema.parse({
      agent: "codex",
      instruction_files: ["AGENTS.md"],
      transcript_paths: [],
      raw_artifact_paths: [],
      workspace_markers: [".git"],
      capture: { default_triggers: ["task_finish"] },
      context: { default_stages: ["diagnosis"] },
      privacy: { redaction_profile: "developer-default" },
    }));
  });

  it("accepts adapter profile with transcript_paths only", () => {
    const parsed = AdapterProfileSchema.parse({
      agent: "codex",
      instruction_files: ["AGENTS.md"],
      transcript_paths: ["~/.codex/sessions"],
      raw_artifact_paths: [],
      workspace_markers: [".git"],
      capture: { default_triggers: ["task_finish"] },
      context: { default_stages: ["diagnosis"] },
      privacy: { redaction_profile: "developer-default" },
    });
    assert.equal(parsed.transcript_paths.length, 1);
  });

  it("accepts adapter profile with raw_artifact_paths only", () => {
    const parsed = AdapterProfileSchema.parse({
      agent: "codex",
      instruction_files: ["AGENTS.md"],
      transcript_paths: [],
      raw_artifact_paths: ["/tmp/artifacts"],
      workspace_markers: [".git"],
      capture: { default_triggers: ["task_finish"] },
      context: { default_stages: ["diagnosis"] },
      privacy: { redaction_profile: "developer-default" },
    });
    assert.equal(parsed.raw_artifact_paths.length, 1);
  });

  it("rejects adapter profile with invalid default_stages", () => {
    assert.throws(() => AdapterProfileSchema.parse({
      agent: "codex",
      instruction_files: ["AGENTS.md"],
      transcript_paths: ["~/.codex/sessions"],
      raw_artifact_paths: [],
      workspace_markers: [".git"],
      capture: { default_triggers: ["task_finish"] },
      context: { default_stages: ["diagnosis", "invalid_stage"] },
      privacy: { redaction_profile: "developer-default" },
    }));
  });
});

describe("M1 raw vault rejects stable paths inside allowed schemes", () => {
  it("rejects file-ref://kb/raw.md", () => {
    const err = validateRawRef("file-ref://kb/raw.md");
    assert.ok(err);
    assert.equal(err.code, "RAW_ARTIFACT_REJECTED");
  });

  it("rejects file-ref://./skills/raw.md", () => {
    const err = validateRawRef("file-ref://./skills/raw.md");
    assert.ok(err);
    assert.equal(err.code, "RAW_ARTIFACT_REJECTED");
  });

  it("rejects raw-vault://kb/secrets/transcript.txt", () => {
    const err = validateRawRef("raw-vault://kb/secrets/transcript.txt");
    assert.ok(err);
    assert.equal(err.code, "RAW_ARTIFACT_REJECTED");
  });

  it("rejects artifact://dist/repair-bundles/bundle.json", () => {
    const err = validateRawRef("artifact://dist/repair-bundles/bundle.json");
    assert.ok(err);
    assert.equal(err.code, "RAW_ARTIFACT_REJECTED");
  });

  it("allows file-ref:// with safe path", () => {
    const err = validateRawRef("file-ref:///tmp/output.log");
    assert.equal(err, null);
  });
});
