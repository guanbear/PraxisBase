/// <reference types="node" />

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyLessonState,
  dedupeLessons,
  loadLessonStateCache,
  lessonStableKey,
  rankLessonsForRuntime,
  rankLessonsForWiki,
  updateLessonUserOverride,
  upsertLessonToCache,
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

test("dedupeLessons merges semantic duplicates beyond stable key", () => {
  const first = makeLesson({
    lesson_id: "self-test",
    safe_claim: "Run a self-test after changing code.",
    problem: "Untested code changes can regress behavior.",
    trigger: "After code changes.",
    action: "Run the relevant self-test.",
    applies_to_systems: ["testing"],
    source_refs: ["a"],
    source_hashes: ["sha256:a"],
    confidence: 0.86,
  });
  const second = makeLesson({
    lesson_id: "verify",
    safe_claim: "Verify modified code before handing it back.",
    problem: "Untested code changes can regress behavior.",
    trigger: "After code changes.",
    action: "Run focused verification tests.",
    applies_to_systems: ["testing"],
    source_refs: ["b"],
    source_hashes: ["sha256:b"],
    confidence: 0.92,
  });

  const deduped = dedupeLessons([first, second]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]!.lesson_id, "verify");
  assert.deepEqual(deduped[0]!.source_refs.sort(), ["a", "b"]);
  assert.deepEqual(deduped[0]!.source_hashes.sort(), ["sha256:a", "sha256:b"]);
});

test("dedupeLessons routes contradictory same-topic lessons to human_required", () => {
  const runTests = makeLesson({
    lesson_id: "run-tests",
    safe_claim: "Run a self-test after code changes.",
    problem: "Untested code changes can regress behavior.",
    trigger: "After code changes.",
    action: "Run the relevant self-test.",
    negative_case: "Do not skip verification.",
    applies_to_systems: ["testing"],
  });
  const skipTests = makeLesson({
    lesson_id: "skip-tests",
    safe_claim: "Skip self-tests for small code changes.",
    problem: "Untested code changes can regress behavior.",
    trigger: "After code changes.",
    action: "Do not run the relevant self-test.",
    negative_case: "Avoid spending time on focused verification.",
    applies_to_systems: ["testing"],
    confidence: 0.95,
  });

  const deduped = dedupeLessons([runTests, skipTests]);

  assert.equal(deduped.length, 2);
  assert.deepEqual(deduped.map((lesson) => lesson.state), ["human_required", "human_required"]);
});

test("dedupeLessons keeps different same-topic actions separate when not contradictory", () => {
  const confirmTarget = makeLesson({
    lesson_id: "confirm-target",
    safe_claim: "Confirm target machine before remote operations.",
    problem: "Remote operations can affect the wrong machine.",
    trigger: "Before remote operations.",
    action: "Confirm the target machine.",
    applies_to_systems: ["remote-ops"],
  });
  const usePrivateRoute = makeLesson({
    lesson_id: "private-route",
    safe_claim: "Use the configured private route for Mac mini access.",
    problem: "Remote operations can affect the wrong machine.",
    trigger: "Before remote operations.",
    action: "Use the configured private route.",
    applies_to_systems: ["remote-ops"],
  });

  const deduped = dedupeLessons([confirmTarget, usePrivateRoute]);

  assert.equal(deduped.length, 2);
  assert.deepEqual(deduped.map((lesson) => lesson.lesson_id).sort(), ["confirm-target", "private-route"]);
});

test("lesson cache preserves human_required contradiction state on upsert", () => {
  const humanRequired = makeLesson({ state: "human_required", privacy_tier: "safe" });
  const records = upsertLessonToCache([], humanRequired, "2026-05-29T00:00:00.000Z");

  assert.equal(records[0]!.state, "human_required");
  assert.equal(records[0]!.lesson.privacy_tier, "safe");
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

test("lesson cache increments observation count for repeated sightings", () => {
  const first = upsertLessonToCache([], makeLesson(), "2026-05-29T00:00:00.000Z");
  const second = upsertLessonToCache(first, makeLesson(), "2026-05-29T01:00:00.000Z");
  assert.equal(second[0]!.observation_count, 2);
  assert.equal(second[0]!.first_seen_at, "2026-05-29T00:00:00.000Z");
  assert.equal(second[0]!.last_seen_at, "2026-05-29T01:00:00.000Z");
});

test("lesson cache keeps forgotten rejected and dismissed records from resurrecting", () => {
  const now = "2026-05-29T00:00:00.000Z";
  const stableKey = lessonStableKey(makeLesson());

  for (const [override, expectedState] of [
    ["forget", "forgotten"],
    ["reject", "rejected"],
    ["dismiss", "forgotten"],
  ] as const) {
    const initial = upsertLessonToCache([], makeLesson(), now);
    const overridden = updateLessonUserOverride(initial, stableKey, override, "2026-05-29T00:01:00.000Z");
    const seenAgain = upsertLessonToCache(overridden, makeLesson(), "2026-05-29T00:02:00.000Z");
    assert.equal(seenAgain[0]!.state, expectedState);
    assert.equal(seenAgain[0]!.user_override, override);
  }
});

test("lesson cache pin override promotes a safe candidate", () => {
  const candidate = makeLesson({
    confidence: 0.4,
    verification: undefined,
    negative_case: undefined,
  });
  const stableKey = lessonStableKey(candidate);
  const initial = upsertLessonToCache([], candidate, "2026-05-29T00:00:00.000Z");
  assert.equal(initial[0]!.state, "candidate");

  const pinned = updateLessonUserOverride(initial, stableKey, "pin", "2026-05-29T00:01:00.000Z");
  assert.ok(["active_personal", "wiki_ready", "skill_ready"].includes(pinned[0]!.state));
  assert.equal(pinned[0]!.user_override, "pin");
});

test("lesson cache merges evidence refs and source hashes for stable duplicates", () => {
  const firstLesson = makeLesson({ source_refs: ["a"], source_hashes: ["sha256:a"] });
  const secondLesson = makeLesson({ source_refs: ["b"], source_hashes: ["sha256:b"] });

  const first = upsertLessonToCache([], firstLesson, "2026-05-29T00:00:00.000Z");
  const second = upsertLessonToCache(first, secondLesson, "2026-05-29T00:01:00.000Z");

  assert.deepEqual(second[0]!.evidence_refs.sort(), ["a", "b"]);
  assert.deepEqual(second[0]!.source_hashes.sort(), ["sha256:a", "sha256:b"]);
  assert.deepEqual(second[0]!.lesson.source_refs.sort(), ["a", "b"]);
  assert.deepEqual(second[0]!.lesson.source_hashes.sort(), ["sha256:a", "sha256:b"]);
});

test("lesson cache merges applies-to agents for repeated stable lessons", () => {
  const firstLesson = makeLesson({ applies_to_agents: ["openclaw"] });
  const secondLesson = makeLesson({ applies_to_agents: ["codex"] });

  const first = upsertLessonToCache([], firstLesson, "2026-05-29T00:00:00.000Z");
  const second = upsertLessonToCache(first, secondLesson, "2026-05-29T00:01:00.000Z");

  assert.deepEqual(second[0]!.lesson.applies_to_agents.sort(), ["codex", "openclaw"]);
  assert.equal(second[0]!.agent_count, 2);
});

test("lesson cache ignores corrupt persisted cache", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-lesson-state-corrupt-"));
  const cacheDir = join(root, ".praxisbase/cache/lesson-state");
  await mkdir(cacheDir, { recursive: true });
  await writeFile(join(cacheDir, "cache.json"), "{not-json", "utf8");

  const records = await loadLessonStateCache(root);
  assert.deepEqual(records, []);
});

test("lesson cache explicit pin resurrects forgotten record", () => {
  const now = "2026-05-29T00:00:00.000Z";
  const stableKey = lessonStableKey(makeLesson());
  const initial = upsertLessonToCache([], makeLesson(), now);
  const forgotten = updateLessonUserOverride(initial, stableKey, "forget", "2026-05-29T00:01:00.000Z");
  const pinned = updateLessonUserOverride(forgotten, stableKey, "pin", "2026-05-29T00:02:00.000Z");

  assert.ok(["active_personal", "wiki_ready", "skill_ready"].includes(pinned[0]!.state));
  assert.equal(pinned[0]!.user_override, "pin");
});
