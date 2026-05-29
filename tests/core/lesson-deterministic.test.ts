/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import { extractDeterministicLessons } from "@praxisbase/core";

function makeSpan(excerpt: string, spanId = "s1") {
  return {
    source_item_id: "memory",
    source_ref: "source-inventory://openclaw/MEMORY.md",
    source_hash: "sha256:m",
    span_id: spanId,
    line_start: 1,
    line_end: 1,
    byte_start: 0,
    byte_end: 80,
    heading_path: ["UX"],
    excerpt,
    excerpt_hash: "sha256:e",
    span_kind: "bullet",
  } as any;
}

const options = {
  now: "2026-05-29T00:00:00.000Z",
  scope: "project",
  agent: "openclaw",
};

test("extracts explicit memory lesson with span provenance", () => {
  const span = makeSpan("Need tools/network/dispatch or slow tasks: send a short ACK first.");

  const lessons = extractDeterministicLessons([span], options);

  assert.equal(lessons.length, 1);
  assert.match(lessons[0]!.safe_claim, /ACK/i);
  assert.equal(lessons[0]!.evidence_spans[0]!.span_id, "s1");
});

test("skips weak smoke-only span", () => {
  const span = makeSpan("Smoke ran successfully.");

  const lessons = extractDeterministicLessons([span], options);

  assert.equal(lessons.length, 0);
});

test("extracts fail-closed honesty lesson", () => {
  const span = makeSpan("Fail-closed delegate guard must not pretend success.");

  const lessons = extractDeterministicLessons([span], options);

  assert.equal(lessons.length, 1);
  assert.match(lessons[0]!.problem, /honesty|success/i);
});

test("extracts memory truncation lesson", () => {
  const span = makeSpan("MEMORY.md above 12000 chars can be truncated during injection.");

  const lessons = extractDeterministicLessons([span], options);

  assert.equal(lessons.length, 1);
  assert.match(lessons[0]!.safe_claim, /truncat/i);
});

test("extracts target machine confirmation", () => {
  const span = makeSpan("Confirm target machine before restart.");

  const lessons = extractDeterministicLessons([span], options);

  assert.equal(lessons.length, 1);
  assert.match(lessons[0]!.action, /target/i);
});

test("skips generic run report", () => {
  const span = makeSpan("Build passed.");

  const lessons = extractDeterministicLessons([span], options);

  assert.equal(lessons.length, 0);
});
