/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseWikiSemanticInput,
  canSkillSignalPromote,
  rankContextAuthority,
  type ContextAuthority,
} from "@praxisbase/core";

test("wiki-ready lessons outrank legacy distilled summaries", () => {
  const decision = chooseWikiSemanticInput({
    source_ref: "source-inventory://openclaw/MEMORY.md",
    lesson_clusters: [
      {
        state: "wiki_ready",
        lessons: [{ safe_claim: "Confirm target machine before restart." }],
      },
    ],
    legacy_distilled: [{ summary: "Restart issue happened once." }],
    degraded: false,
  });

  assert.equal(decision.kind, "lesson_cluster");
  assert.equal(decision.reason, "wiki_ready_lesson_cluster");
});

test("skill candidate cannot promote from one-off summary alone", () => {
  const allowed = canSkillSignalPromote({
    skill_ready_lessons: [],
    stable_wiki_pages: [],
    legacy_distilled: [{ summary: "A skill might help." }],
    sidecar_hits: [{ source: "gbrain" }],
  });

  assert.equal(allowed.ok, false);
  assert.match(allowed.reason, /lesson-state authority/);
});

test("runtime authority ranks stable PB before lessons and sidecars", () => {
  const ranked = rankContextAuthority([
    { id: "gbrain-1", authority: "gbrain_sidecar" },
    { id: "lesson-1", authority: "active_personal_lesson" },
    { id: "skill-1", authority: "promoted_skill" },
    { id: "page-1", authority: "stable_pb_page" },
  ] satisfies Array<{ id: string; authority: ContextAuthority }>);

  assert.deepEqual(
    ranked.map((item) => item.id),
    ["page-1", "skill-1", "lesson-1", "gbrain-1"],
  );
});
