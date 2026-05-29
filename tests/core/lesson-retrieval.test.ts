/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import {
  renderRuntimeLessonBlock,
  retrieveRuntimeLessons,
} from "@praxisbase/core";

test("runtime lesson block is bounded and lower authority", () => {
  const hits = retrieveRuntimeLessons([{
    lesson_id: "lesson_ack",
    safe_claim: "Send a brief ACK before long-running tool work.",
    claim: "Send a brief ACK before long-running tool work.",
    problem: "The user sees silence during slow work.",
    trigger: "Before long tool work.",
    action: "Send a short acknowledgement.",
    applies_to_agents: ["codex", "openclaw"],
    applies_to_systems: ["agent-runtime"],
    confidence: 0.9,
    privacy_tier: "safe",
    portability: "agent_family",
    scope: "personal",
    cue_family: "native_memory",
    source_refs: ["source-inventory://openclaw/MEMORY.md"],
    source_hashes: ["sha256:m"],
    state: "active_personal",
    evidence_spans: [],
    redaction_notes: [],
    created_at: "2026-05-29T00:00:00.000Z",
  } as any], { query: "openclaw long tool task", agent: "openclaw", maxHits: 3 });
  const block = renderRuntimeLessonBlock(hits, { maxBytes: 512 });
  assert.match(block, /Relevant PB Experience/);
  assert.match(block, /lower-authority/i);
  assert.match(block, /ACK/);
});

test("runtime lesson retrieval returns personal runtime-eligible lessons only", () => {
  const base = {
    lesson_id: "lesson_ack",
    safe_claim: "Send a brief ACK before long-running tool work.",
    claim: "Send a brief ACK before long-running tool work.",
    problem: "The user sees silence during slow work.",
    trigger: "Before long tool work.",
    action: "Send a short acknowledgement.",
    applies_to_agents: ["openclaw"],
    applies_to_systems: ["agent-runtime"],
    confidence: 0.9,
    privacy_tier: "safe",
    portability: "agent_family",
    scope: "personal",
    cue_family: "native_memory",
    source_refs: ["source-inventory://openclaw/MEMORY.md"],
    source_hashes: ["sha256:m"],
    evidence_spans: [],
    redaction_notes: [],
    created_at: "2026-05-29T00:00:00.000Z",
  } as any;

  const hits = retrieveRuntimeLessons([
    { ...base, lesson_id: "candidate", state: "candidate" },
    { ...base, lesson_id: "forgotten", state: "forgotten" },
    { ...base, lesson_id: "active", state: "active_personal" },
    { ...base, lesson_id: "wiki", state: "wiki_ready", confidence: 0.91 },
    { ...base, lesson_id: "skill", state: "skill_ready", confidence: 0.92 },
  ], { query: "openclaw tool", agent: "openclaw", maxHits: 10 });

  assert.deepEqual(hits.map((hit) => hit.lesson_id), ["active", "wiki", "skill"]);
});
