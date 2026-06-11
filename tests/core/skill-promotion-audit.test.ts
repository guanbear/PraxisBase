import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL_VERSION } from "@praxisbase/core";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { promoteApprovedProposal } from "@praxisbase/core/promote/promote.js";
import {
  findApprovedSkillPromotionAudit,
  validateSkillPromotionAuditForProposal,
} from "@praxisbase/core/synthesis/skill-audit.js";
import type { Proposal, Review } from "@praxisbase/core/protocol/schemas.js";
import type { SemanticSkillReview, SkillPromotionAudit } from "@praxisbase/core/synthesis/skill-model.js";

const now = "2026-05-26T00:00:00.000Z";

const proposal: Proposal = {
  id: "skill_candidate_1",
  protocol_version: PROTOCOL_VERSION,
  type: "knowledge_proposal",
  scope: "personal",
  action: "create",
  target_type: "skill",
  target_id: "openclaw-memory-operations",
  agent_id: "skill-synthesis",
  agent_type: "curator",
  environment_id: "local",
  run_id: "skill-synthesis-test",
  idempotency_key: "skill_candidate_1",
  evidence: {
    source_uri: "raw-vault://codex/session-1",
    source_hash: "sha256:abc",
    excerpt: "Repeated OpenClaw memory import repair.",
    repair_result: "success",
    verification: "Two successful distilled experiences.",
  },
  patch: {
    path: "skills/openclaw/openclaw-memory-operations/SKILL.md",
    content: [
      "---",
      "name: OpenClaw memory operations",
      "description: Import OpenClaw memory into PraxisBase with provenance.",
      "scope: personal",
      "---",
      "# OpenClaw memory operations",
      "",
      "## When To Use",
      "Use when importing OpenClaw memory into PraxisBase with provenance.",
      "",
      "## Procedure",
      "1. Export memory JSON.",
      "2. Verify the exported hash.",
      "3. Import with source refs and source hashes.",
      "",
      "## Verification",
      "- Run the import workflow and confirm the candidate report references both source hashes.",
      "",
      "## Reusable Lessons",
      "- Memory imports must preserve provenance before becoming reusable agent guidance.",
      "",
      "## Agent Use",
      "- Load this skill only for OpenClaw memory import or sharing workflows.",
      "",
      "## Pitfalls",
      "- Do not paste raw logs or private local paths into stable skill content.",
      "",
      "## Do Not Use When",
      "- The input is a one-off run report without repeated successful evidence.",
      "",
      "## Related Wiki Pages",
      "- [[kb/procedures/openclaw-memory-import]]",
      "",
      "## Provenance",
      "- raw-vault://codex/session-1 (sha256:abc)",
      "",
    ].join("\n"),
  },
  created_at: now,
};

const review: Review = {
  id: "review_skill_candidate_1",
  protocol_version: PROTOCOL_VERSION,
  proposal_id: proposal.id,
  reviewer_id: "local-user",
  reviewer_model: "human",
  prompt_version: "skill-audit-test",
  decision: "approve",
  risk: "medium",
  confidence: 0.9,
  reasons: ["Approved after inspecting candidate and provenance."],
  required_checks: [],
  created_at: now,
};

const audit: SkillPromotionAudit = {
  id: "audit_1",
  protocol_version: PROTOCOL_VERSION,
  type: "skill_promotion_audit",
  proposal_id: proposal.id,
  candidate_id: proposal.id,
  target_path: proposal.patch.path,
  scope: "personal",
  decision: "approved",
  reviewer: { kind: "user", id: "local-user" },
  semantic_review_id: "semantic_skill_review_1",
  source_hashes: ["sha256:abc"],
  created_at: now,
};

const semanticReview: SemanticSkillReview = {
  id: "semantic_skill_review_1",
  type: "semantic_skill_review",
  candidate_id: proposal.id,
  target_path: proposal.patch.path,
  decision: "approve_candidate",
  quality_score: 0.92,
  class_level: true,
  actionable: true,
  reusable: true,
  safe_for_future_agents: true,
  evidence_support: "strong",
  should_update_existing: null,
  fatal_issues: [],
  missing_requirements: [],
  reason: "Durable class-level skill.",
  reviewed_at: now,
};

describe("skill promotion audit", () => {
  it("validates audit records against proposal path, source hashes, and scope policy", () => {
    assert.equal(validateSkillPromotionAuditForProposal(audit, proposal).ok, true);
    assert.equal(validateSkillPromotionAuditForProposal({ ...audit, target_path: "skills/openclaw/other/SKILL.md" }, proposal).ok, false);
    assert.equal(validateSkillPromotionAuditForProposal({ ...audit, source_hashes: ["sha256:missing"] }, proposal).ok, false);
    assert.equal(validateSkillPromotionAuditForProposal({ ...audit, decision: "rejected" }, proposal).ok, false);
    assert.equal(validateSkillPromotionAuditForProposal({ ...audit, scope: "team", reviewer: { kind: "user", id: "me" } }, proposal).ok, false);
  });

  it("finds approved audits from inbox reviews and promotes a personal skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-skill-promotion-audit-"));
    await mkdir(join(root, protocolPaths.inboxReviews), { recursive: true });
    await writeFile(join(root, protocolPaths.inboxReviews, "audit_1.json"), JSON.stringify(audit, null, 2), "utf8");
    await writeFile(join(root, protocolPaths.inboxReviews, "semantic_skill_review_1.json"), JSON.stringify(semanticReview, null, 2), "utf8");

    const found = await findApprovedSkillPromotionAudit(root, proposal);
    assert.equal(found?.id, audit.id);

    await promoteApprovedProposal(root, { proposal, review });
    const written = await readFile(join(root, proposal.patch.path), "utf8");
    assert.ok(written.includes("OpenClaw memory operations"));
  });

  it("does not accept audit records without matching approved semantic review records", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-skill-promotion-audit-missing-review-"));
    await mkdir(join(root, protocolPaths.inboxReviews), { recursive: true });
    await writeFile(join(root, protocolPaths.inboxReviews, "audit_1.json"), JSON.stringify(audit, null, 2), "utf8");
    await writeFile(join(root, protocolPaths.inboxReviews, "semantic_skill_review_1.json"), JSON.stringify({
      ...semanticReview,
      decision: "needs_human",
      reason: "Needs human review.",
    }, null, 2), "utf8");

    assert.equal(await findApprovedSkillPromotionAudit(root, proposal), null);
  });

  it("promotes audited support files under an existing skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-skill-support-promotion-"));
    await mkdir(join(root, protocolPaths.inboxReviews), { recursive: true });
    const supportProposal: Proposal = {
      ...proposal,
      id: "skill_candidate_support_1",
      action: "create",
      patch: {
        path: "skills/openclaw/openclaw-memory-operations/references/import-checklist.md",
        content: "- Export memory JSON\n- Verify hash\n- Import with provenance\n",
      },
    };
    const supportReview: Review = { ...review, proposal_id: supportProposal.id };
    const supportSemanticReview: SemanticSkillReview = {
      ...semanticReview,
      id: "semantic_skill_review_support_1",
      candidate_id: supportProposal.id,
      target_path: supportProposal.patch.path,
    };
    const supportAudit: SkillPromotionAudit = {
      ...audit,
      id: "audit_support_1",
      proposal_id: supportProposal.id,
      candidate_id: supportProposal.id,
      target_path: supportProposal.patch.path,
      semantic_review_id: supportSemanticReview.id!,
    };
    await writeFile(join(root, protocolPaths.inboxReviews, "audit_support_1.json"), JSON.stringify(supportAudit, null, 2), "utf8");
    await writeFile(join(root, protocolPaths.inboxReviews, "semantic_skill_review_support_1.json"), JSON.stringify(supportSemanticReview, null, 2), "utf8");

    await promoteApprovedProposal(root, { proposal: supportProposal, review: supportReview });
    const written = await readFile(join(root, supportProposal.patch.path), "utf8");
    assert.match(written, /Verify hash/);
  });

  it("requires team_git audit metadata for team skill promotion", async () => {
    const teamProposal: Proposal = { ...proposal, scope: "team" };
    const teamAudit: SkillPromotionAudit = {
      ...audit,
      scope: "team",
      reviewer: { kind: "team_git", id: "gitlab-reviewer" },
      git: { merge_request: "https://gitlab.example/mr/1" },
    };
    assert.equal(validateSkillPromotionAuditForProposal(teamAudit, teamProposal).ok, true);
  });
});
