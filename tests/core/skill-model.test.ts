import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SemanticSkillReviewSchema,
  SkillPromotionAuditSchema,
  SkillSynthesisCandidateSchema,
  SkillSynthesisReportSchema,
} from "@praxisbase/core/synthesis/skill-model.js";
import { PROTOCOL_VERSION } from "@praxisbase/core";

const now = "2026-05-26T00:00:00.000Z";

function candidate(overrides = {}) {
  return {
    id: "skill_candidate_1",
    protocol_version: PROTOCOL_VERSION,
    type: "skill_synthesis_candidate",
    action: "skill_create",
    scope: "personal",
    target_path: "skills/openclaw/openclaw-memory-operations/SKILL.md",
    target_skill: "OpenClaw memory operations",
    title: "OpenClaw memory operations",
    summary: "Reusable OpenClaw memory import operations.",
    body_markdown: "# OpenClaw memory operations\n\n## When To Use\nUse for memory import.\n\n## Procedure\n1. Export memory.\n\n## Verification\n- Verify hash.\n\n## Pitfalls\n- Avoid raw logs.\n\n## Do Not Use When\n- One-off.\n\n## Related Wiki Pages\n- None.\n\n## Provenance\n- raw-vault://codex/1",
    source_refs: ["raw-vault://codex/1"],
    source_hashes: ["sha256:abc"],
    evidence_ids: ["sha256:chunk"],
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

describe("skill synthesis schemas", () => {
  it("parses valid candidate, semantic review, report, and audit records", () => {
    assert.equal(SkillSynthesisCandidateSchema.parse(candidate()).type, "skill_synthesis_candidate");
    assert.equal(SemanticSkillReviewSchema.parse({
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
      reason: "Class-level reusable skill.",
      reviewed_at: now,
    }).decision, "approve_candidate");
    assert.equal(SkillSynthesisReportSchema.parse({
      id: "skill_synthesis_1",
      protocol_version: PROTOCOL_VERSION,
      type: "skill_synthesis_report",
      authority_mode: "personal-local",
      mode: "review",
      enabled: true,
      signals: 2,
      rejected_signals: 1,
      clusters: 1,
      candidates: 1,
      reviewed: 1,
      approved: 1,
      rejected: 0,
      needs_human: 0,
      skipped: 0,
      outputs: [],
      warnings: [],
      created_at: now,
    }).rejected_signals, 1);
    assert.equal(SkillPromotionAuditSchema.parse({
      id: "audit_1",
      protocol_version: PROTOCOL_VERSION,
      type: "skill_promotion_audit",
      proposal_id: "proposal_1",
      candidate_id: "skill_candidate_1",
      target_path: "skills/openclaw/openclaw-memory-operations/SKILL.md",
      scope: "personal",
      decision: "approved",
      reviewer: { kind: "user", id: "local-user" },
      semantic_review_id: "semantic_skill_review_1",
      source_hashes: ["sha256:abc"],
      created_at: now,
    }).decision, "approved");
    assert.equal(SkillPromotionAuditSchema.parse({
      id: "audit_support_1",
      protocol_version: PROTOCOL_VERSION,
      type: "skill_promotion_audit",
      proposal_id: "proposal_support_1",
      candidate_id: "skill_candidate_support_1",
      target_path: "skills/openclaw/openclaw-memory-operations/references/import-checklist.md",
      scope: "personal",
      decision: "approved",
      reviewer: { kind: "user", id: "local-user" },
      semantic_review_id: "semantic_skill_review_support_1",
      source_hashes: ["sha256:abc"],
      created_at: now,
    }).target_path, "skills/openclaw/openclaw-memory-operations/references/import-checklist.md");
  });

  it("rejects missing provenance, unsafe action paths, and invalid support file paths", () => {
    assert.throws(() => SkillSynthesisCandidateSchema.parse(candidate({ source_hashes: [] })));
    assert.throws(() => SkillSynthesisCandidateSchema.parse(candidate({ target_path: "../skills/bad/SKILL.md" })));
    assert.throws(() => SkillSynthesisCandidateSchema.parse(candidate({
      action: "skill_support_file",
      existing_skill_path: "skills/openclaw/openclaw-memory-operations/SKILL.md",
      target_path: "skills/openclaw/openclaw-memory-operations/tmp/raw.log",
    })));
  });
});
