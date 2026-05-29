import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { skillCommand } from "@praxisbase/cli/commands/skill.js";
import { PROTOCOL_VERSION } from "@praxisbase/core";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { validateSkillCandidate, writeSkillValidationReport } from "@praxisbase/core/synthesis/skill-validation.js";
import { SkillSynthesisCandidateSchema } from "@praxisbase/core/synthesis/skill-model.js";

describe("skill CLI command", () => {
  it("synthesizes reviewable skill candidates without writing stable skills", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-skill-"));
    await mkdir(join(root, ".praxisbase/cache/ai-distill"), { recursive: true });
    const experience = {
      source_ref: "raw-vault://codex/session-1",
      source_hash: "sha256:distilled1",
      chunk_hashes: ["sha256:chunk1"],
      agent: "codex",
      scope_hint: "personal",
      summary: "OpenClaw memory import repair.",
      problem: "OpenClaw memory import needed provenance.",
      actions: ["Exported memory JSON.", "Verified hash.", "Imported with provenance."],
      failed_attempts: [],
      outcome: "success",
      verification: ["pnpm test passed"],
      reusable_lessons: ["Export memory, verify hash, then import with provenance."],
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
    };
    await writeFile(join(root, ".praxisbase/cache/ai-distill/one.json"), JSON.stringify({
      type: "ai_distill_cache_entry",
      version: "ai-distill-v1",
      status: "distilled",
      model: "test",
      authority_mode: "personal-local",
      source_id: "codex-1",
      source_hash: "sha256:source1",
      chunk_hash: "sha256:chunk1",
      experience,
      created_at: "2026-05-26T00:00:00.000Z",
    }), "utf8");
    await writeFile(join(root, ".praxisbase/cache/ai-distill/two.json"), JSON.stringify({
      type: "ai_distill_cache_entry",
      version: "ai-distill-v1",
      status: "distilled",
      model: "test",
      authority_mode: "personal-local",
      source_id: "codex-2",
      source_hash: "sha256:source2",
      chunk_hash: "sha256:chunk2",
      experience: { ...experience, source_ref: "raw-vault://codex/session-2", source_hash: "sha256:distilled2", chunk_hashes: ["sha256:chunk2"] },
      created_at: "2026-05-26T00:00:00.000Z",
    }), "utf8");

    const output = await skillCommand(root, "synthesize", {
      mode: "personal",
      review: true,
      json: true,
      now: "2026-05-26T00:00:00.000Z",
      aiClient: {
        async generateJson(input: { schemaName: string }) {
          if (input.schemaName === "semantic_skill_review") {
            return { ok: true, json: {
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
              reason: "Durable class-level skill.",
              reviewed_at: "2026-05-26T00:00:00.000Z",
            } };
          }
          return { ok: true, json: {} };
        },
      },
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.candidates, 1);
    assert.equal(parsed.report.approved, 1);
    assert.equal(await readdir(join(root, "skills")).then((items) => items.length, () => 0), 0);
    assert.equal((await readdir(join(root, ".praxisbase/inbox/proposals"))).length, 1);
  });

  it("promotes a skill candidate only when an approved audit and passing validation exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-skill-promote-"));
    await mkdir(join(root, protocolPaths.inboxProposals), { recursive: true });
    await mkdir(join(root, protocolPaths.inboxReviews), { recursive: true });
    const candidate = {
      id: "skill_candidate_cli",
      protocol_version: PROTOCOL_VERSION,
      type: "skill_synthesis_candidate",
      action: "skill_create",
      scope: "personal",
      target_path: "skills/openclaw/openclaw-memory-operations/SKILL.md",
      target_skill: "OpenClaw memory operations",
      title: "OpenClaw memory operations",
      summary: "Skill candidate synthesized from repeated stable signals.",
      body_markdown: [
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
        "- Confirm the report references both source hashes.",
        "",
        "## Reusable Lessons",
        "- Memory imports must preserve provenance.",
        "",
        "## Agent Use",
        "- Load this skill only for OpenClaw memory import workflows.",
        "",
        "## Pitfalls",
        "- Do not paste raw logs into stable skill content.",
        "",
        "## Do Not Use When",
        "- Evidence is a one-off run report.",
        "",
        "## Related Wiki Pages",
        "- [[kb/procedures/openclaw-memory-import]]",
        "",
        "## Provenance",
        "- raw-vault://codex/session-1 (sha256:abc)",
        "",
      ].join("\n"),
      source_refs: ["raw-vault://codex/session-1"],
      source_hashes: ["sha256:abc"],
      evidence_ids: ["sha256:e1"],
      source_count: 2,
      confidence: 0.91,
      ladder_choice: "skill_create",
      existing_skill_path: null,
      related_wiki_paths: ["kb/procedures/openclaw-memory-import"],
      review_hint: {
        suggested_decision: "approve",
        risk_notes: ["semantic_skill_review:approve_candidate", "semantic_skill_score:0.91", "semantic_skill_reason:Durable class-level skill."],
      },
      created_at: "2026-05-26T00:00:00.000Z",
    };
    await writeFile(join(root, protocolPaths.inboxProposals, `${candidate.id}.json`), JSON.stringify(candidate, null, 2), "utf8");

    const blocked = JSON.parse(await skillCommand(root, "promote", { proposal: candidate.id, json: true }));
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "SKILL_PROMOTION_REQUIRES_AUDIT");

    await writeFile(join(root, protocolPaths.inboxReviews, "audit_cli.json"), JSON.stringify({
      id: "audit_cli",
      protocol_version: PROTOCOL_VERSION,
      type: "skill_promotion_audit",
      proposal_id: candidate.id,
      candidate_id: candidate.id,
      target_path: candidate.target_path,
      scope: "personal",
      decision: "approved",
      reviewer: { kind: "user", id: "local-user" },
      semantic_review_id: "semantic_skill_review_cli",
      source_hashes: ["sha256:abc"],
      created_at: "2026-05-26T00:00:00.000Z",
    }, null, 2), "utf8");
    await writeFile(join(root, protocolPaths.inboxReviews, "semantic_skill_review_cli.json"), JSON.stringify({
      id: "semantic_skill_review_cli",
      type: "semantic_skill_review",
      candidate_id: candidate.id,
      target_path: candidate.target_path,
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
      reason: "Durable class-level skill.",
      reviewed_at: "2026-05-26T00:00:00.000Z",
    }, null, 2), "utf8");

    const blockedNoValidation = JSON.parse(await skillCommand(root, "promote", { proposal: candidate.id, json: true }));
    assert.equal(blockedNoValidation.ok, false);
    assert.equal(blockedNoValidation.code, "SKILL_PROMOTION_REQUIRES_VALIDATION");

    const validationReport = validateSkillCandidate(SkillSynthesisCandidateSchema.parse(candidate), { now: "2026-05-28T10:00:00Z" });
    assert.equal(validationReport.decision, "pass");
    await writeSkillValidationReport(root, validationReport);

    const promoted = JSON.parse(await skillCommand(root, "promote", { proposal: candidate.id, json: true }));
    assert.equal(promoted.ok, true);
    assert.equal(promoted.target_path, candidate.target_path);
    assert.match(await readFile(join(root, candidate.target_path), "utf8"), /OpenClaw memory operations/);
  });

  it("rejects promotion when validation decision is failing", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-skill-promote-fail-"));
    await mkdir(join(root, protocolPaths.inboxProposals), { recursive: true });
    await mkdir(join(root, protocolPaths.inboxReviews), { recursive: true });
    const candidate = {
      id: "skill_candidate_fail_validation",
      protocol_version: PROTOCOL_VERSION,
      type: "skill_synthesis_candidate",
      action: "skill_create",
      scope: "personal",
      target_path: "skills/openclaw/fail-validation/SKILL.md",
      target_skill: "Fail validation",
      title: "Fail validation",
      summary: "Skill candidate that will fail validation.",
      body_markdown: "# Fail\n\n## When To Use\nWhen testing.\n\n## Procedure\n1. Test.\n\n## Verification\n- Done.\n\n## Pitfalls\n- None.",
      source_refs: ["raw-vault://session-1"],
      source_hashes: ["sha256:fail1"],
      evidence_ids: ["sha256:e1"],
      source_count: 2,
      confidence: 0.91,
      ladder_choice: "skill_create",
      existing_skill_path: null,
      related_wiki_paths: [],
      review_hint: { suggested_decision: "approve", risk_notes: [] },
      created_at: "2026-05-28T10:00:00.000Z",
    };
    await writeFile(join(root, protocolPaths.inboxProposals, `${candidate.id}.json`), JSON.stringify(candidate, null, 2), "utf8");
    await writeFile(join(root, protocolPaths.inboxReviews, "audit_fail.json"), JSON.stringify({
      id: "audit_fail",
      protocol_version: PROTOCOL_VERSION,
      type: "skill_promotion_audit",
      proposal_id: candidate.id,
      candidate_id: candidate.id,
      target_path: candidate.target_path,
      scope: "personal",
      decision: "approved",
      reviewer: { kind: "user", id: "local-user" },
      semantic_review_id: "semantic_fail",
      source_hashes: ["sha256:fail1"],
      created_at: "2026-05-28T10:00:00.000Z",
    }, null, 2), "utf8");
    await writeFile(join(root, protocolPaths.inboxReviews, "semantic_fail.json"), JSON.stringify({
      id: "semantic_fail",
      type: "semantic_skill_review",
      candidate_id: candidate.id,
      target_path: candidate.target_path,
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
      reason: "Test skill.",
      reviewed_at: "2026-05-28T10:00:00.000Z",
    }, null, 2), "utf8");

    const failingReport = {
      id: "skill-validation_failing_test",
      protocol_version: PROTOCOL_VERSION,
      type: "skill_validation_report",
      candidate_id: candidate.id,
      target_path: candidate.target_path,
      source_hashes: candidate.source_hashes,
      mode: "static",
      evidence_ids: [],
      checks: [{ check: "safe_path", passed: false, details: "Invalid path" }],
      decision: "fail",
      reason: "safe_path: Invalid path",
      created_at: "2026-05-28T10:00:00Z",
    };
    await mkdir(join(root, protocolPaths.reportsSkillValidation), { recursive: true });
    await writeFile(join(root, protocolPaths.reportsSkillValidation, `${failingReport.id}.json`), JSON.stringify(failingReport), "utf8");

    const blocked = JSON.parse(await skillCommand(root, "promote", { proposal: candidate.id, json: true }));
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "SKILL_PROMOTION_VALIDATION_FAILING");
  });

  it("allows promotion with requireValidation=false bypassing validation gate", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-skill-promote-bypass-"));
    await mkdir(join(root, protocolPaths.inboxProposals), { recursive: true });
    await mkdir(join(root, protocolPaths.inboxReviews), { recursive: true });
    const candidate = {
      id: "skill_candidate_bypass",
      protocol_version: PROTOCOL_VERSION,
      type: "skill_synthesis_candidate",
      action: "skill_create",
      scope: "personal",
      target_path: "skills/openclaw/bypass-validation/SKILL.md",
      target_skill: "OpenClaw bypass validation",
      title: "OpenClaw bypass validation",
      summary: "Skill candidate promoted without validation.",
      body_markdown: [
        "---",
        "name: OpenClaw bypass validation",
        "description: Skill candidate promoted without validation.",
        "scope: personal",
        "---",
        "# OpenClaw bypass validation",
        "",
        "## When To Use",
        "Use when importing OpenClaw memory without validation gate.",
        "",
        "## Procedure",
        "1. Export memory JSON.",
        "2. Verify the exported hash.",
        "3. Import with source refs and source hashes.",
        "",
        "## Verification",
        "- Confirm the report references both source hashes.",
        "",
        "## Reusable Lessons",
        "- Memory imports must preserve provenance.",
        "",
        "## Agent Use",
        "- Load this skill for OpenClaw memory import workflows.",
        "",
        "## Pitfalls",
        "- Do not bypass validation in production.",
        "",
        "## Do Not Use When",
        "- Running in production mode.",
        "",
        "## Related Wiki Pages",
        "- None",
        "",
        "## Provenance",
        "- raw-vault://test/session-1 (sha256:bypass1)",
        "",
      ].join("\n"),
      source_refs: ["raw-vault://test/session-1"],
      source_hashes: ["sha256:bypass1"],
      evidence_ids: ["sha256:e1"],
      source_count: 2,
      confidence: 0.91,
      ladder_choice: "skill_create",
      existing_skill_path: null,
      related_wiki_paths: [],
      review_hint: { suggested_decision: "approve", risk_notes: [] },
      created_at: "2026-05-28T10:00:00.000Z",
    };
    await writeFile(join(root, protocolPaths.inboxProposals, `${candidate.id}.json`), JSON.stringify(candidate, null, 2), "utf8");
    await writeFile(join(root, protocolPaths.inboxReviews, "audit_bypass.json"), JSON.stringify({
      id: "audit_bypass",
      protocol_version: PROTOCOL_VERSION,
      type: "skill_promotion_audit",
      proposal_id: candidate.id,
      candidate_id: candidate.id,
      target_path: candidate.target_path,
      scope: "personal",
      decision: "approved",
      reviewer: { kind: "user", id: "local-user" },
      semantic_review_id: "semantic_bypass",
      source_hashes: ["sha256:bypass1"],
      created_at: "2026-05-28T10:00:00.000Z",
    }, null, 2), "utf8");
    await writeFile(join(root, protocolPaths.inboxReviews, "semantic_bypass.json"), JSON.stringify({
      id: "semantic_bypass",
      type: "semantic_skill_review",
      candidate_id: candidate.id,
      target_path: candidate.target_path,
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
      reason: "Bypass test.",
      reviewed_at: "2026-05-28T10:00:00.000Z",
    }, null, 2), "utf8");

    const promoted = JSON.parse(await skillCommand(root, "promote", { proposal: candidate.id, json: true, requireValidation: false }));
    assert.equal(promoted.ok, true);
    assert.equal(promoted.target_path, candidate.target_path);
  });

  it("exports agent access skill through the skill command group", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-skill-export-"));
    const output = JSON.parse(await skillCommand(root, "export", { agent: "codex", json: true }));

    assert.equal(output.ok, true);
    assert.equal(output.skill_path, ".praxisbase/agent-tools/skills/praxisbase/SKILL.md");
    assert.match(await readFile(join(root, output.skill_path), "utf8"), /PraxisBase/);
  });

  it("previews promoted skill injection without injecting candidates", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-skill-inject-"));
    await mkdir(join(root, "skills/openclaw/openclaw-memory"), { recursive: true });
    await writeFile(join(root, "skills/openclaw/openclaw-memory/SKILL.md"), `---
name: openclaw-memory
description: Use when repairing OpenClaw memory recall.
origin: praxisbase_synthesized
status: promoted
scope: personal
tags: ["openclaw", "memory"]
---
# OpenClaw Memory

## When To Use
Use when repairing OpenClaw memory recall.

## Procedure
- Check stable PraxisBase wiki first.
`, "utf8");
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await writeFile(join(root, ".praxisbase/inbox/proposals/candidate.json"), JSON.stringify({
      id: "candidate",
      type: "skill_synthesis_candidate",
      target_path: "skills/openclaw/candidate/SKILL.md",
      body_markdown: "candidate body",
    }), "utf8");

    const output = JSON.parse(await skillCommand(root, "inject-preview", {
      query: "OpenClaw memory recall",
      json: true,
    }));

    assert.equal(output.ok, true);
    assert.match(output.text, /\[PB-SKILL:openclaw-memory\]/);
    assert.ok(output.decisions.some((decision: { skill_id: string; decision: string }) => decision.skill_id === "openclaw-memory" && decision.decision === "matched"));
    assert.equal(output.text.includes("candidate body"), false);
  });

  it("summarizes the skill review queue while building the review site", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-skill-review-"));
    await mkdir(join(root, protocolPaths.inboxProposals), { recursive: true });
    await mkdir(join(root, protocolPaths.inboxReviews), { recursive: true });
    await writeFile(join(root, protocolPaths.inboxProposals, "skill_candidate_review.json"), JSON.stringify({
      id: "skill_candidate_review",
      protocol_version: PROTOCOL_VERSION,
      type: "skill_synthesis_candidate",
      action: "skill_create",
      scope: "personal",
      target_path: "skills/openclaw/openclaw-memory-operations/SKILL.md",
      target_skill: "OpenClaw memory operations",
      title: "OpenClaw memory operations",
      summary: "Skill candidate synthesized from repeated stable signals.",
      body_markdown: "# OpenClaw memory operations\n\n## When To Use\nUse when importing OpenClaw memory.\n\n## Procedure\n1. Export memory.\n\n## Verification\n- Verify hash.\n\n## Pitfalls\n- Avoid raw logs.\n\n## Do Not Use When\n- One-off run.\n\n## Related Wiki Pages\n- None.\n\n## Provenance\n- raw-vault://codex/session-1 (sha256:abc)\n",
      source_refs: ["raw-vault://codex/session-1"],
      source_hashes: ["sha256:abc"],
      evidence_ids: ["sha256:e1"],
      source_count: 2,
      confidence: 0.91,
      ladder_choice: "skill_create",
      existing_skill_path: null,
      related_wiki_paths: [],
      review_hint: { suggested_decision: "approve", risk_notes: [] },
      created_at: "2026-05-26T00:00:00.000Z",
    }, null, 2), "utf8");
    await writeFile(join(root, protocolPaths.inboxReviews, "semantic_skill_review_review.json"), JSON.stringify({
      id: "semantic_skill_review_review",
      type: "semantic_skill_review",
      candidate_id: "skill_candidate_review",
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
      reason: "Durable.",
      reviewed_at: "2026-05-26T00:00:00.000Z",
    }, null, 2), "utf8");

    const output = JSON.parse(await skillCommand(root, "review", { json: true }));
    assert.equal(output.ok, true);
    assert.equal(output.queue.candidates, 1);
    assert.equal(output.queue.semantic_reviews, 1);
    assert.equal(output.queue.promotion_ready, 0);
    assert.match(await readFile(join(root, "dist/review.html"), "utf8"), /OpenClaw memory operations/);
  });

  it("validates a skill proposal and writes a validation report", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-skill-validate-"));
    await mkdir(join(root, protocolPaths.inboxProposals), { recursive: true });
    const candidate = {
      id: "skill_candidate_validate",
      protocol_version: PROTOCOL_VERSION,
      type: "skill_synthesis_candidate",
      action: "skill_create",
      scope: "personal",
      target_path: "skills/openclaw/openclaw-validate/SKILL.md",
      target_skill: "OpenClaw validate",
      title: "OpenClaw validate",
      summary: "Skill candidate for validation command coverage.",
      body_markdown: [
        "# OpenClaw validate",
        "",
        "## When To Use",
        "Use when validating generated skills.",
        "",
        "## Procedure",
        "1. Read the candidate.",
        "2. Run validation.",
        "",
        "## Verification",
        "- Validation report is written.",
        "",
        "## Pitfalls",
        "- Do not promote from validation alone.",
      ].join("\n"),
      source_refs: ["raw-vault://codex/session-1", "raw-vault://codex/session-2"],
      source_hashes: ["sha256:abc", "sha256:def"],
      evidence_ids: ["sha256:e1"],
      source_count: 2,
      confidence: 0.91,
      ladder_choice: "skill_create",
      existing_skill_path: null,
      related_wiki_paths: [],
      review_hint: { suggested_decision: "approve", risk_notes: [] },
      created_at: "2026-05-28T10:00:00.000Z",
    };
    await writeFile(join(root, protocolPaths.inboxProposals, `${candidate.id}.json`), JSON.stringify(candidate, null, 2), "utf8");

    const output = JSON.parse(await skillCommand(root, "validate", {
      proposal: candidate.id,
      json: true,
      now: "2026-05-28T10:00:00.000Z",
    }));

    assert.equal(output.ok, true);
    assert.equal(output.report.decision, "pass");
    assert.match(output.report_path, /\.praxisbase\/reports\/skill-validation\/skill-validation_/);
    const report = JSON.parse(await readFile(join(root, output.report_path), "utf8"));
    assert.equal(report.candidate_id, candidate.id);
  });
});
