/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { buildWikiEvidenceFromLessons } from "@praxisbase/core";

test("lesson-derived wiki evidence is synthesized and span-cited", () => {
  const evidence = buildWikiEvidenceFromLessons([{
    lesson_id: "lesson_dispatch",
    claim: "Do not claim delegation succeeded until dispatch evidence exists.",
    safe_claim: "Do not claim delegation succeeded until dispatch evidence exists.",
    problem: "Delegation can fail silently.",
    trigger: "Before reporting delegated OpenClaw work.",
    action: "Check dispatch evidence and report failure honestly.",
    verification: "A dispatch id or worker result exists.",
    negative_case: "Do not pretend the delegate succeeded.",
    applies_to_agents: ["openclaw"],
    applies_to_systems: ["dispatch"],
    portability: "agent_family",
    privacy_tier: "safe",
    scope: "personal",
    confidence: 0.9,
    cue_family: "native_memory",
    source_refs: ["source-inventory://openclaw/MEMORY.md"],
    source_hashes: ["sha256:m"],
    state: "wiki_ready",
    evidence_spans: [{
      source_item_id: "memory",
      source_ref: "source-inventory://openclaw/MEMORY.md",
      source_hash: "sha256:m",
      span_id: "s1",
      line_start: 1,
      line_end: 1,
      byte_start: 0,
      byte_end: 80,
      heading_path: ["Dispatch"],
      excerpt: "fail-closed guard",
      excerpt_hash: "sha256:e",
      span_kind: "bullet",
    }],
    redaction_notes: [],
    created_at: "2026-05-29T00:00:00.000Z",
  }]);

  assert.match(evidence[0]!.summary, /delegation/i);
  assert.ok(evidence[0]!.reusable_lessons.length > 0);
  assert.match(evidence[0]!.signatures.join(" "), /lesson:/);
});

test("lesson-derived wiki evidence excludes candidates that are not wiki-ready", () => {
  const evidence = buildWikiEvidenceFromLessons([{
    lesson_id: "lesson_candidate",
    claim: "Send ACK before slow work.",
    safe_claim: "Send ACK before slow work.",
    problem: "Slow work can leave users without timely feedback.",
    trigger: "Before slow tool work.",
    action: "Send a short acknowledgement first.",
    verification: "The acknowledgement is emitted before the tool call.",
    negative_case: "Do not stay silent.",
    applies_to_agents: ["openclaw"],
    applies_to_systems: ["agent-runtime"],
    portability: "universal",
    privacy_tier: "safe",
    scope: "personal",
    confidence: 0.8,
    cue_family: "native_memory",
    source_refs: ["source-inventory://openclaw/MEMORY.md"],
    source_hashes: ["sha256:m"],
    state: "candidate",
    evidence_spans: [{
      source_item_id: "memory",
      source_ref: "source-inventory://openclaw/MEMORY.md",
      source_hash: "sha256:m",
      span_id: "s1",
      line_start: 1,
      line_end: 1,
      byte_start: 0,
      byte_end: 80,
      heading_path: ["Runtime"],
      excerpt: "Send ACK before slow work.",
      excerpt_hash: "sha256:e",
      span_kind: "bullet",
    }],
    redaction_notes: [],
    created_at: "2026-05-29T00:00:00.000Z",
  }]);

  assert.equal(evidence.length, 0);
});

test("lesson-derived wiki evidence excludes private or human-required stable lessons", () => {
  const base = {
    lesson_id: "lesson_private",
    claim: "Confirm private remote route.",
    safe_claim: "Confirm private remote route.",
    problem: "Remote access can leak private routing details.",
    trigger: "Before remote access.",
    action: "Use the private route.",
    verification: "The route is confirmed.",
    applies_to_agents: ["openclaw"],
    applies_to_systems: ["remote-access"],
    portability: "environment",
    scope: "personal",
    confidence: 0.9,
    cue_family: "native_memory",
    source_refs: ["source-inventory://openclaw/MEMORY.md"],
    source_hashes: ["sha256:m"],
    state: "wiki_ready",
    evidence_spans: [{
      source_item_id: "memory",
      source_ref: "source-inventory://openclaw/MEMORY.md",
      source_hash: "sha256:m",
      span_id: "s1",
      line_start: 1,
      line_end: 1,
      byte_start: 0,
      byte_end: 80,
      heading_path: ["Remote"],
      excerpt: "Use root@guanzhicheng.com through macmini-ssh.",
      excerpt_hash: "sha256:e",
      span_kind: "bullet",
    }],
    redaction_notes: [],
    created_at: "2026-05-29T00:00:00.000Z",
  } as any;

  const evidence = buildWikiEvidenceFromLessons([
    { ...base, privacy_tier: "personal_only" },
    { ...base, lesson_id: "lesson_human", privacy_tier: "human_required" },
    { ...base, lesson_id: "lesson_reject", privacy_tier: "reject" },
  ]);

  assert.equal(evidence.length, 0);
});
