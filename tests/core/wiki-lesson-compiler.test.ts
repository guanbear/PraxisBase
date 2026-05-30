/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWikiEvidenceFromLessons,
  clusterWikiEvidence,
  synthesizeCuratedWikiProposal,
} from "@praxisbase/core";

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

test("lesson-derived wiki evidence allows abstracted personal-only lessons only in personal mode", () => {
  const personalOnlyLesson = {
    lesson_id: "lesson_private_route",
    claim: "Use a concrete private route for a concrete machine.",
    safe_claim: "Use the configured private route before operating on a personal remote machine.",
    problem: "Remote operations can target the wrong or unsafe route.",
    trigger: "Before operating on a personal remote machine.",
    action: "Use the configured private route and confirm the target before mutating the machine.",
    verification: "The route and target are confirmed before execution.",
    negative_case: "Do not publish concrete private route details into shared knowledge.",
    applies_to_agents: ["openclaw"],
    applies_to_systems: ["remote-access"],
    portability: "environment",
    privacy_tier: "personal_only",
    scope: "personal",
    confidence: 0.92,
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
      excerpt: "Use [REDACTED_REMOTE_COMMAND] through [REDACTED_HOSTNAME].",
      excerpt_hash: "sha256:e",
      span_kind: "bullet",
    }],
    redaction_notes: ["private remote wrapper command"],
    created_at: "2026-05-29T00:00:00.000Z",
  } as any;

  assert.equal(buildWikiEvidenceFromLessons([personalOnlyLesson]).length, 0);

  const personalEvidence = buildWikiEvidenceFromLessons([personalOnlyLesson], {
    authorityMode: "personal-local",
  });

  assert.equal(personalEvidence.length, 1);
  assert.equal(personalEvidence[0]!.privacy_verdict, "personal_only");
  assert.doesNotMatch(JSON.stringify(personalEvidence[0]), /root@|100\.95|U0AL|\/Users\/guanbear/);
});

test("lesson-derived wiki proposals render applicability and span provenance", async () => {
  const evidence = buildWikiEvidenceFromLessons([{
    lesson_id: "lesson_ack",
    claim: "Send ACK before slow work.",
    safe_claim: "Send ACK before slow work.",
    problem: "Slow tool work can leave users without timely feedback.",
    trigger: "Before tool, network, dispatch, or other work that may take more than a few seconds.",
    action: "Send a short acknowledgement before starting the slow operation.",
    verification: "The acknowledgement appears before the tool call in the transcript.",
    negative_case: "Do not stay silent while a long-running tool call is pending.",
    applies_to_agents: ["codex", "openclaw"],
    applies_to_systems: ["agent-runtime", "tooling"],
    portability: "universal",
    privacy_tier: "safe",
    scope: "personal",
    confidence: 0.92,
    cue_family: "native_memory",
    source_refs: ["source-inventory://openclaw/MEMORY.md"],
    source_hashes: ["sha256:m"],
    state: "wiki_ready",
    evidence_spans: [{
      source_item_id: "memory",
      source_ref: "source-inventory://openclaw/MEMORY.md",
      source_hash: "sha256:m",
      span_id: "ack-1",
      line_start: 12,
      line_end: 14,
      byte_start: 120,
      byte_end: 180,
      heading_path: ["Runtime"],
      excerpt: "Need tools or dispatch: send ACK first.",
      excerpt_hash: "sha256:e",
      span_kind: "bullet",
    }],
    redaction_notes: [],
    created_at: "2026-05-29T00:00:00.000Z",
  }]);
  const [cluster] = clusterWikiEvidence(evidence);

  const result = await synthesizeCuratedWikiProposal(cluster!, {
    evidence,
    now: "2026-05-29T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.match(result.proposal.body_markdown, /## Applicability/);
  assert.match(result.proposal.body_markdown, /Portability: universal/);
  assert.match(result.proposal.body_markdown, /Privacy: safe/);
  assert.match(result.proposal.body_markdown, /Agents: codex, openclaw/);
  assert.match(result.proposal.body_markdown, /Systems: agent-runtime, tooling/);
  assert.match(result.proposal.body_markdown, /## What To Do/);
  assert.match(result.proposal.body_markdown, /Send a short acknowledgement/);
  assert.match(result.proposal.body_markdown, /## Verify/);
  assert.match(result.proposal.body_markdown, /## Negative Cases/);
  assert.match(result.proposal.body_markdown, /## Span Provenance/);
  assert.match(result.proposal.body_markdown, /source-inventory:\/\/openclaw\/MEMORY\.md#ack-1/);
  assert.match(result.proposal.body_markdown, /lines 12-14/);
  assert.doesNotMatch(result.proposal.body_markdown, /ACK before tools/);
});
