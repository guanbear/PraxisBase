import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeSemanticSkillReview, reviewSkillCandidateSemantically } from "@praxisbase/core/synthesis/skill-review.js";
import type { SkillSynthesisCandidate } from "@praxisbase/core/synthesis/skill-model.js";
import { PROTOCOL_VERSION } from "@praxisbase/core";

const now = "2026-05-26T00:00:00.000Z";
const candidate: SkillSynthesisCandidate = {
  id: "skill_candidate_1",
  protocol_version: PROTOCOL_VERSION,
  type: "skill_synthesis_candidate",
  action: "skill_create",
  scope: "personal",
  target_path: "skills/openclaw/openclaw-memory-operations/SKILL.md",
  target_skill: "OpenClaw memory operations",
  title: "OpenClaw memory operations",
  summary: "Reusable memory operations.",
  body_markdown: "# Skill",
  source_refs: ["raw-vault://codex/1"],
  source_hashes: ["sha256:1"],
  evidence_ids: ["sha256:c1"],
  source_count: 2,
  confidence: 0.91,
  ladder_choice: "skill_create",
  existing_skill_path: null,
  related_wiki_paths: [],
  review_hint: { suggested_decision: "approve", risk_notes: [] },
  created_at: now,
};

function raw(overrides = {}) {
  return {
    decision: "approve_candidate",
    quality_score: 0.91,
    class_level: true,
    actionable: true,
    reusable: true,
    safe_for_future_agents: true,
    evidence_support: "strong",
    should_update_existing: null,
    fatal_issues: [],
    missing_requirements: [],
    reason: "Good.",
    reviewed_at: now,
    ...overrides,
  };
}

describe("semantic skill review", () => {
  it("normalizes valid decisions and rejects malformed payloads", () => {
    assert.equal(normalizeSemanticSkillReview(raw({ decision: "revise" }), candidate, now)?.decision, "revise");
    assert.equal(normalizeSemanticSkillReview(raw({ decision: "merge_or_update_existing" }), candidate, now)?.decision, "merge_or_update_existing");
    assert.equal(normalizeSemanticSkillReview(raw({ decision: "reject" }), candidate, now)?.decision, "reject");
    assert.equal(normalizeSemanticSkillReview(raw({ decision: "needs_human" }), candidate, now)?.decision, "needs_human");
    assert.equal(normalizeSemanticSkillReview({ decision: "bad" }, candidate, now), null);
  });

  it("returns null when the AI client fails", async () => {
    const review = await reviewSkillCandidateSemantically({
      candidate,
      now,
      client: { async generateJson() { return { ok: false, error: "timeout" }; } },
    });
    assert.equal(review, null);
  });
});
