import assert from "node:assert/strict";
import test from "node:test";
import {
  selectSessionExperienceEvents,
  sessionPreSummaryCacheKey,
} from "@praxisbase/core";
import type { EvidenceSpan } from "@praxisbase/core";

function span(id: string, excerpt: string, kind: EvidenceSpan["span_kind"] = "json_message"): EvidenceSpan {
  return {
    source_item_id: "session-1",
    source_ref: "raw-vault://codex/session-1",
    source_hash: "sha256:session",
    span_id: id,
    line_start: 1,
    line_end: 1,
    byte_start: 0,
    byte_end: excerpt.length,
    heading_path: [],
    excerpt,
    excerpt_hash: `sha256:${id}`,
    span_kind: kind,
  };
}

test("session pre-summary keeps corrections, failures, fixes, decisions, and verification", () => {
  const selected = selectSessionExperienceEvents([
    span("system", "System instructions: You are Codex. Tool schemas and policy follow."),
    span("schema", "Tool schema properties arguments description required enum object string number", "tool_call"),
    span("correction", "User correction: do not claim dispatch succeeded unless spawn evidence exists."),
    span("failure", "Command failed with timeout while running OpenClaw dispatch.", "tool_result"),
    span("fix", "Patched the delegate runner to fail closed and report the real status."),
    span("verify", "Verification passed: pnpm test -- tests/core/openclaw.test.ts.", "tool_result"),
    span("decision", "Decision: keep PB as the authority and use GBrain only as retrieval backend."),
    span("long", "Build output:\n" + "all good\n".repeat(200), "tool_result"),
    span("metadata", "{\"type\":\"session_meta\",\"cwd\":\"/repo\",\"model\":\"x\"}"),
  ]);

  assert.deepEqual(selected.map((item) => item.span.span_id), [
    "correction",
    "failure",
    "fix",
    "verify",
    "decision",
  ]);
  assert.ok(selected.every((item) => item.reason.length > 0));
  assert.ok(selected.every((item) => item.span.source_ref === "raw-vault://codex/session-1"));
});

test("session pre-summary keeps long output only when it contains a failure cue", () => {
  const selected = selectSessionExperienceEvents([
    span("long-fail", "stderr:\n" + "noise\n".repeat(200) + "ERROR failed because auth expired", "tool_result"),
  ]);

  assert.deepEqual(selected.map((item) => item.span.span_id), ["long-fail"]);
});

test("session pre-summary cache key is deterministic and identity-sensitive", () => {
  const base = {
    sourceHash: "sha256:source",
    parserIdentity: "parser-v1",
    reducerIdentity: "reducer-v1",
    promptVersion: "session-presummary-v1",
    modelId: "glm-4.7",
    privacyProfile: "developer-default",
    agent: "codex",
  };

  const first = sessionPreSummaryCacheKey(base);
  const second = sessionPreSummaryCacheKey({ ...base });
  const changed = sessionPreSummaryCacheKey({ ...base, modelId: "glm-5.1" });

  assert.equal(first, second);
  assert.notEqual(first, changed);
  assert.match(first, /^session-presummary-v1:codex:sha256-[a-f0-9]{16}$/);
});
