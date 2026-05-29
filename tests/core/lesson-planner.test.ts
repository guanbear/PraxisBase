/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { planLessonSpans } from "@praxisbase/core";

test("memory spans survive small budgets before newer logs", () => {
  const memorySpan = {
    source_item_id: "memory",
    source_ref: "source-inventory://openclaw/MEMORY.md",
    source_hash: "sha256:m",
    span_id: "memory-ack",
    line_start: 2,
    line_end: 2,
    byte_start: 10,
    byte_end: 60,
    heading_path: ["Running"],
    excerpt: "Need ACK before long dispatch tasks.",
    excerpt_hash: "sha256:me",
    span_kind: "bullet" as const,
  };
  const logSpan = {
    ...memorySpan,
    source_item_id: "log",
    source_ref: "source-inventory://openclaw/new.log",
    span_id: "log-1",
    excerpt: "Smoke ran.",
    excerpt_hash: "sha256:le",
  };
  const selected = planLessonSpans(
    [
      {
        source_item_id: "log",
        source_kind: "session",
        authority_hint: "session_transcript",
        content_spans: [logSpan],
      } as any,
      {
        source_item_id: "memory",
        source_kind: "memory_file",
        authority_hint: "agent_native_memory",
        content_spans: [memorySpan],
      } as any,
    ],
    { maxSpans: 1 },
  );

  assert.equal(selected[0].span_id, "memory-ack");
});
