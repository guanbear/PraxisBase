/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyLessonState,
  dedupeLessons,
  lessonStableKey,
  rankLessonsForRuntime,
  rankLessonsForWiki,
} from "@praxisbase/core";

function makeLesson(overrides: Record<string, unknown> = {}) {
  return {
    lesson_id: "lesson",
    claim: "Confirm target machine before restart.",
    safe_claim: "Confirm target machine before restart.",
    problem: "Remote commands can affect the wrong machine.",
    trigger: "Before restart.",
    action: "Check target.",
    verification: "Target confirmed.",
    negative_case: "Do not assume the host.",
    applies_to_agents: ["openclaw"],
    applies_to_systems: ["remote-ops"],
    portability: "agent_family",
    privacy_tier: "safe",
    scope: "personal",
    confidence: 0.92,
    cue_family: "native_memory",
    source_refs: ["a"],
    source_hashes: ["sha256:a"],
    evidence_spans: [{}],
    redaction_notes: [],
    created_at: "2026-05-29T00:00:00.000Z",
    ...overrides,
  } as any;
}

test("safe high confidence lesson becomes active personal", () => {
  const state = classifyLessonState(
    makeLesson({ confidence: 0.88, verification: undefined, negative_case: undefined }),
    { mode: "personal-local", sourceCount: 1, verified: true },
  );
  assert.equal(state, "active_personal");
});

test("forgotten lesson remains forgotten", () => {
  const state = classifyLessonState(
    makeLesson({ privacy_tier: "safe" }),
    { mode: "personal-local", userState: "forgotten" },
  );
  assert.equal(state, "forgotten");
});

test("rejected lesson remains rejected regardless of confidence", () => {
  const state = classifyLessonState(
    makeLesson({ privacy_tier: "safe", confidence: 0.99 }),
    { mode: "personal-local", userState: "rejected" },
  );
  assert.equal(state, "rejected");
});

test("lesson stable key is deterministic", () => {
  const first = makeLesson({ applies_to_systems: ["b", "a"] });
  const second = makeLesson({ applies_to_systems: ["a", "b"] });
  assert.equal(lessonStableKey(first), lessonStableKey(second));
});

test("lesson stable key dedupes different evidence claims for the same structured lesson", () => {
  assert.equal(
    lessonStableKey(makeLesson({ safe_claim: "ACK before slow dispatch from MEMORY.md." })),
    lessonStableKey(makeLesson({ safe_claim: "ACK before slow network call from session log." })),
  );
});

test("lesson stable key differs for different structured lessons", () => {
  assert.notEqual(
    lessonStableKey(makeLesson({ safe_claim: "Confirm target machine before restart." })),
    lessonStableKey(makeLesson({
      safe_claim: "Run self-test after code changes.",
      problem: "Untested changes can regress behavior.",
      trigger: "After code changes.",
      action: "Run the relevant self-test.",
      applies_to_systems: ["testing"],
    })),
  );
});

test("dedupeLessons keeps strongest lesson by state", () => {
  const candidate = makeLesson({ lesson_id: "candidate", state: "candidate", confidence: 0.95 });
  const wikiReady = makeLesson({ lesson_id: "wiki", state: "wiki_ready", confidence: 0.9 });
  const deduped = dedupeLessons([candidate, wikiReady]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]!.lesson_id, "wiki");
});

test("dedupeLessons keeps highest confidence within same state", () => {
  const low = makeLesson({ lesson_id: "low", state: "candidate", confidence: 0.6 });
  const high = makeLesson({ lesson_id: "high", state: "candidate", confidence: 0.8 });
  const deduped = dedupeLessons([low, high]);
  assert.equal(deduped[0]!.lesson_id, "high");
});

test("rankLessonsForWiki filters to wiki_ready and skill_ready", () => {
  const ranked = rankLessonsForWiki([
    makeLesson({ lesson_id: "candidate", state: "candidate", confidence: 1 }),
    makeLesson({ lesson_id: "wiki", state: "wiki_ready", confidence: 0.9 }),
    makeLesson({ lesson_id: "skill", state: "skill_ready", confidence: 0.8 }),
  ]);
  assert.deepEqual(ranked.map((lesson) => lesson.lesson_id), ["skill", "wiki"]);
});

test("rankLessonsForRuntime filters to active_personal first", () => {
  const ranked = rankLessonsForRuntime([
    makeLesson({ lesson_id: "candidate", state: "candidate", confidence: 1 }),
    makeLesson({ lesson_id: "active", state: "active_personal", confidence: 0.7 }),
    makeLesson({ lesson_id: "human", state: "human_required", confidence: 1 }),
  ]);
  assert.deepEqual(ranked.map((lesson) => lesson.lesson_id), ["active", "candidate"]);
});
