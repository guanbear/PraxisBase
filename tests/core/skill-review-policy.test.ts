import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideSemanticSkillAction } from "@praxisbase/core/synthesis/skill-review-policy.js";
import type { SkillSynthesisCandidate, SemanticSkillReview } from "@praxisbase/core/synthesis/skill-model.js";
import { PROTOCOL_VERSION } from "@praxisbase/core";

const now = "2026-05-26T00:00:00.000Z";

function candidate(overrides: Partial<SkillSynthesisCandidate> = {}): SkillSynthesisCandidate {
  return {
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
    ...overrides,
  };
}

function review(overrides: Partial<SemanticSkillReview> = {}): SemanticSkillReview {
  return {
    type: "semantic_skill_review",
    candidate_id: "skill_candidate_1",
    target_path: "skills/openclaw/openclaw-memory-operations/SKILL.md",
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

describe("decideSemanticSkillAction", () => {
  it("approves only reviewed candidate queue writes, not stable promotion", () => {
    const decision = decideSemanticSkillAction(candidate(), review());
    assert.equal(decision.action, "write_candidate");
    assert.equal(decision.promotion_eligible, false);
  });

  it("blocks unsafe, low-score, non-class, ambiguous, and team cases", () => {
    assert.equal(decideSemanticSkillAction(candidate({ target_path: "../bad" }), review()).action, "reject");
    assert.equal(decideSemanticSkillAction(candidate(), review({ quality_score: 0.85 })).action, "needs_human");
    assert.equal(decideSemanticSkillAction(candidate(), review({ class_level: false })).action, "needs_human");
    assert.equal(decideSemanticSkillAction(candidate({ review_hint: { suggested_decision: "merge", risk_notes: ["ambiguous_existing_skill_match"] } }), review()).action, "needs_human");
    assert.equal(decideSemanticSkillAction(candidate({ scope: "team" }), review()).action, "needs_human");
  });

  it("rewrites as update when reviewer suggests existing skill", () => {
    assert.equal(decideSemanticSkillAction(candidate(), review({ should_update_existing: "skills/openclaw/existing/SKILL.md" })).action, "rewrite_as_update");
  });

  it("does not allow shape-invalid candidates even when semantic review approves", () => {
    const decision = decideSemanticSkillAction(candidate({
      review_hint: {
        suggested_decision: "edit",
        risk_notes: ["skill_shape_invalid:malformed_procedure_heading"],
      },
    }), review());
    assert.equal(decision.action, "needs_human");
    assert.equal(decision.promotion_eligible, false);
    assert.ok(decision.review_notes.includes("skill_shape_invalid:malformed_procedure_heading"));
  });
});
