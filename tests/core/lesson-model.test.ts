/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import {
  ExperienceLessonSchema,
  EvidenceSpanSchema,
} from "@praxisbase/core";

test("experience lesson requires portability privacy and evidence spans", () => {
  const span = EvidenceSpanSchema.parse({
    source_item_id: "src_openclaw_memory",
    source_ref: "file://openclaw/MEMORY.md",
    source_hash: "sha256:abc",
    span_id: "span_1",
    line_start: 10,
    line_end: 12,
    byte_start: 100,
    byte_end: 240,
    heading_path: ["Running", "Dispatch"],
    excerpt: "Long dispatch tasks need a brief ACK.",
    excerpt_hash: "sha256:def",
    span_kind: "bullet",
  });

  const lesson = ExperienceLessonSchema.parse({
    lesson_id: "lesson_ack",
    claim: "Send a brief ACK before long dispatch work.",
    safe_claim: "Send a brief ACK before long-running tool or dispatch work.",
    problem: "The user sees silence during slow work.",
    trigger:
      "A task needs tools, network, dispatch, or more than a few seconds.",
    action: "Reply with a short acknowledgement before continuing.",
    verification: "The agent sent an ACK before using tools.",
    negative_case: "Do not stay silent until the final answer.",
    applies_to_agents: ["openclaw", "codex"],
    applies_to_systems: ["agent-runtime"],
    portability: "agent_family",
    privacy_tier: "safe",
    scope: "personal",
    confidence: 0.91,
    cue_family: "native_memory",
    source_refs: [span.source_ref],
    source_hashes: [span.source_hash],
    evidence_spans: [span],
    redaction_notes: [],
    created_at: "2026-05-29T00:00:00.000Z",
  });

  assert.equal(lesson.portability, "agent_family");
  assert.equal(lesson.evidence_spans[0].span_id, "span_1");
});
