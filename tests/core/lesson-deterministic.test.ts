/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSourceInventory, extractDeterministicLessons } from "@praxisbase/core";

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
  assert.doesNotMatch(lessons[0]!.safe_claim, /Need tools/);
  assert.equal(lessons[0]!.evidence_spans[0]!.span_id, "s1");
});

test("uses a structured safe claim instead of raw candidate evidence", () => {
  const span = makeSpan("Candidate: route=delegate dispatch was slow and needed ACK first.");

  const lessons = extractDeterministicLessons([span], options);

  assert.equal(lessons.length, 1);
  assert.doesNotMatch(lessons[0]!.safe_claim, /Candidate|route=delegate/);
  assert.match(lessons[0]!.safe_claim, /acknowledgement|ACK/i);
});

test("skips raw OpenClaw candidate corpus noise", () => {
  const span = makeSpan([
    "- Candidate: - Candidate: User: route=direct | worker_pool=octoclaw-main | task_class=main_direct",
    "Conversation info (untrusted metadata): ```json { \"message_id\": \"1776570461.813469\" }",
    "- confidence: 0.00 - evidence: memory/.dreams/session-corpus/2026-04-19.txt:307-307",
    "- recalls: 0 - status: staged - Candidate: User: route=direct",
    "Mac mini Tailscale private route was mentioned in the raw transcript.",
  ].join(" "));

  const lessons = extractDeterministicLessons([span], options);

  assert.equal(lessons.length, 0);
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

test("extracts generic memory-first cue families without AI", () => {
  const spans = [
    makeSpan("User preference: use rg before grep when searching code.", "pref"),
    makeSpan("Never run git reset --hard without explicit approval.", "veto"),
    makeSpan("Decision: GitLab is the team authority for shared knowledge.", "decision"),
    makeSpan("TODO unresolved: add SSH remote OpenClaw fetch retry.", "unresolved"),
    makeSpan("Reflection: raw logs bury durable memory unless distilled into MEMORY.md.", "reflection"),
    makeSpan("Repeated failure: OpenClaw dispatch failed until runner presence was checked.", "repeat"),
    makeSpan("Tool sequence: run source doctor, fetch memory, daily run, then verify site.", "sequence"),
    makeSpan("Verified fix: restored memory recall and pnpm check passed.", "verified"),
  ];

  const lessons = extractDeterministicLessons(spans, options);

  assert.equal(lessons.length, 8);
  assert.deepEqual(
    lessons.map((lesson) => lesson.cue_family),
    [
      "explicit_user",
      "explicit_user",
      "reflection",
      "reflection",
      "reflection",
      "repeated_failure",
      "tool_sequence",
      "verified_fix",
    ],
  );
  assert.deepEqual(lessons.map((lesson) => lesson.evidence_spans[0]!.span_id), [
    "pref",
    "veto",
    "decision",
    "unresolved",
    "reflection",
    "repeat",
    "sequence",
    "verified",
  ]);
  assert.ok(lessons.find((lesson) => lesson.evidence_spans[0]!.span_id === "veto")!.negative_case);
  assert.match(lessons.find((lesson) => lesson.evidence_spans[0]!.span_id === "sequence")!.action, /sequence|steps/i);
});

test("extracts OpenHuman-style trajectory transcript cues after source inventory parsing", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-m25-openhuman-style-"));
  const dir = join(root, "sessions");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "trajectory.jsonl"), [
    JSON.stringify({
      type: "message",
      role: "assistant",
      content: "Reflection: repeated OpenClaw dispatch failure was traced to missing runner presence checks.",
    }),
    JSON.stringify({
      type: "tool_call",
      tool: "shell",
      arguments: { cmd: "praxisbase source doctor --json && praxisbase memory fetch --json" },
    }),
    JSON.stringify({
      type: "tool_result",
      tool: "shell",
      result: "Tool sequence: run source doctor, fetch memory, run daily, then verify the generated site.",
    }),
    JSON.stringify({
      type: "message",
      role: "assistant",
      summary: "Verified fix: remote OpenClaw memory fetch retry restored ingest and pnpm check passed.",
    }),
  ].join("\n"), "utf8");

  const inventory = await buildSourceInventory(root, {
    agent: "openhuman",
    path: dir,
    scope: "personal",
    origin: "local",
  });
  const spans = inventory.flatMap((item) => item.content_spans);

  const lessons = extractDeterministicLessons(spans, {
    ...options,
    agent: "openhuman",
    scope: "personal",
  });

  assert.ok(spans.some((span) => span.span_kind === "tool_call"));
  assert.ok(spans.some((span) => span.span_kind === "tool_result"));
  assert.deepEqual(
    lessons.map((lesson) => lesson.cue_family),
    ["repeated_failure", "tool_sequence", "verified_fix"],
  );
  assert.ok(lessons.every((lesson) => lesson.source_refs[0]!.startsWith("source-inventory://openhuman/")));
});
