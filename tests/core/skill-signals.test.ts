import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectSkillSignalsFromDistilledExperiences,
  collectSkillSignalsFromLessons,
  collectSkillSignalsFromStableWikiPages,
} from "@praxisbase/core/synthesis/skill-signals.js";
import type { DistilledExperience } from "@praxisbase/core/ai/distill.js";

function exp(overrides: Partial<DistilledExperience> = {}): DistilledExperience {
  return {
    source_ref: "raw-vault://codex/session-1",
    source_hash: "sha256:source1",
    chunk_hashes: ["sha256:chunk1"],
    agent: "codex",
    scope_hint: "personal",
    summary: "OpenClaw memory import works after exporting JSON and verifying hash.",
    problem: "Remote OpenClaw memory import needed a reusable flow.",
    actions: ["Export memory JSON.", "Verify hash.", "Import with PraxisBase."],
    failed_attempts: [],
    outcome: "success",
    verification: ["pnpm test passed"],
    reusable_lessons: ["Export memory, verify hash, then import as provenance-backed evidence."],
    risks: [],
    suggested_tags: ["openclaw"],
    suggested_wiki_kind: "procedure",
    skill_candidate: {
      should_create: true,
      title: "OpenClaw memory import operations",
      trigger: "Need to import OpenClaw memory into PraxisBase",
      procedure: ["Export memory JSON.", "Verify hash.", "Import with provenance."],
    },
    confidence: 0.91,
    ...overrides,
  };
}

describe("collectSkillSignalsFromDistilledExperiences", () => {
  it("collects successful explicit skill candidates", () => {
    const signals = collectSkillSignalsFromDistilledExperiences([exp()], { authorityMode: "personal-local" });
    assert.equal(signals.length, 1);
    assert.equal(signals[0].cue_family, "verified_fix");
  });

  it("filters failed, one-off, environment-only, negative, and team-incompatible signals", () => {
    const signals = collectSkillSignalsFromDistilledExperiences([
      exp({ outcome: "failed" }),
      exp({ skill_candidate: { should_create: true, title: "Fix PR 12345", trigger: "PR 12345 failed", procedure: ["Patch PR."] } }),
      exp({ summary: "API quota failed.", actions: ["Waited."], reusable_lessons: [], skill_candidate: { should_create: true, title: "API quota", trigger: "API quota failure", procedure: ["Wait."] } }),
      exp({ summary: "Tool X is broken.", reusable_lessons: ["Tool X is broken."], skill_candidate: { should_create: true, title: "Tool X broken", trigger: "Tool X broken", procedure: ["Do not use it."] } }),
      exp({ scope_hint: "personal" }),
    ], { authorityMode: "team-git" });
    assert.equal(signals.length, 0);
  });

  it("collects conservative skill signals from stable wiki procedures with provenance", () => {
    const signals = collectSkillSignalsFromStableWikiPages([{
      id: "page_openclaw_memory",
      slug: "openclaw-memory-import",
      title: "OpenClaw memory import",
      page_kind: "procedure",
      scope: "personal",
      source_ids: ["stable_kb:kb/procedures/openclaw-memory-import.md"],
      provenance_refs: [
        { uri: "raw-vault://codex/session-1", hash: "sha256:source1" },
        { uri: "raw-vault://codex/session-2", hash: "sha256:source2" },
      ],
      body_markdown: [
        "# OpenClaw memory import",
        "",
        "## When To Use",
        "Use when importing OpenClaw memory into PraxisBase.",
        "",
        "## Procedure",
        "1. Export memory JSON.",
        "2. Verify hash.",
        "3. Import with provenance.",
        "",
        "## Verification",
        "- Daily smoke passed.",
      ].join("\n"),
    }], { authorityMode: "personal-local" });

    assert.equal(signals.length, 2);
    assert.equal(signals[0].cue_family, "wiki_procedure");
    assert.equal(signals[0].related_wiki_paths[0], "openclaw-memory-import");
  });

  it("does not collect team signals from personal stable wiki pages", () => {
    const signals = collectSkillSignalsFromStableWikiPages([{
      id: "page_personal",
      slug: "personal-only",
      title: "Personal only",
      page_kind: "procedure",
      scope: "personal",
      source_ids: ["stable_kb:kb/procedures/personal-only.md"],
      provenance_refs: [{ uri: "raw-vault://codex/session-1", hash: "sha256:source1" }],
      body_markdown: "## When To Use\nPersonal workflow.\n\n## Procedure\n1. Do it.\n",
    }], { authorityMode: "team-git" });
    assert.equal(signals.length, 0);
  });

  it("collects skill signals from skill-ready lessons", () => {
    const signals = collectSkillSignalsFromLessons([{
      lesson_id: "lesson_ack",
      state: "skill_ready",
      safe_claim: "Send a brief ACK before long-running tool work.",
      claim: "Send a brief ACK before long-running tool work.",
      problem: "The user sees silence during slow work.",
      trigger: "Before long-running tool work.",
      action: "Send a short acknowledgement before using tools.",
      verification: "ACK was sent before the tool call.",
      negative_case: "Do not stay silent.",
      applies_to_agents: ["codex"],
      applies_to_systems: ["agent-runtime"],
      portability: "agent_family",
      privacy_tier: "safe",
      scope: "personal",
      confidence: 0.93,
      cue_family: "native_memory",
      source_refs: ["source-inventory://codex/MEMORY.md"],
      source_hashes: ["sha256:m"],
      evidence_spans: [],
      redaction_notes: [],
      created_at: "2026-05-29T00:00:00.000Z",
    } as any], { authorityMode: "personal-local" });

    assert.equal(signals.length, 1);
    assert.match(signals[0].procedure.join(" "), /ack/i);
  });
});
