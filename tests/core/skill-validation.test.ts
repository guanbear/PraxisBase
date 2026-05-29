import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateSkillCandidate, validateSkillCandidateFromProposal, writeSkillValidationReport, findFreshPassingValidationReport, collectValidationSummaries } from "@praxisbase/core/synthesis/skill-validation.js";
import { SkillSynthesisCandidateSchema } from "@praxisbase/core/synthesis/skill-model.js";
import { PROTOCOL_VERSION } from "@praxisbase/core/protocol/types.js";
import { readJson } from "@praxisbase/core/store/file-store.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";

const VALID_CANDIDATE_BODY = `---
name: test-skill
description: A test skill
scope: team
status: draft
---
# Test Skill

## When To Use
Use when test fails.

## Procedure
1. Check logs.
2. Run tests.
3. Verify output.

## Verification
Tests pass.

## Pitfalls
Do not skip step 2.

## Do Not Use When
Tests are already passing.

## Related Wiki Pages
- None

## Provenance
- source: test
`;

const VALID_CANDIDATE = {
  id: "cand-valid-1",
  protocol_version: PROTOCOL_VERSION,
  type: "skill_synthesis_candidate" as const,
  action: "skill_create" as const,
  scope: "team",
  target_path: "skills/openclaw/test-skill/SKILL.md",
  target_skill: "test-skill",
  title: "Test Skill",
  summary: "A test skill for validation.",
  body_markdown: VALID_CANDIDATE_BODY,
  source_refs: ["log://session-1", "log://session-2"],
  source_hashes: ["sha256:abc", "sha256:def"],
  evidence_ids: ["evidence-1"],
  source_count: 3,
  confidence: 0.8,
  ladder_choice: "skill_create" as const,
  existing_skill_path: null,
  related_wiki_paths: [],
  review_hint: { suggested_decision: "approve" as const, risk_notes: [] },
  created_at: "2026-05-28T10:00:00Z",
};

describe("skill validation", () => {
  it("passes all static checks for a valid candidate", () => {
    const candidate = SkillSynthesisCandidateSchema.parse(VALID_CANDIDATE);
    const report = validateSkillCandidate(candidate, { now: "2026-05-28T10:00:00Z" });

    assert.equal(report.decision, "pass");
    assert.equal(report.mode, "static");
    assert.equal(report.candidate_id, candidate.id);
    assert.ok(report.checks.every((c) => c.passed));
    assert.equal(report.reason, "All checks passed.");
  });

  it("fails on unsafe target path", () => {
    const candidate = SkillSynthesisCandidateSchema.parse({
      ...VALID_CANDIDATE,
      id: "cand-bad-path",
      target_path: "skills/openclaw/test-skill/SKILL.md",
      ladder_choice: "skill_create",
    });
    const report = validateSkillCandidate({
      ...candidate,
      target_path: "../etc/passwd",
    } as typeof candidate, { now: "2026-05-28T10:00:00Z" });

    assert.equal(report.decision, "fail");
    const safePathCheck = report.checks.find((c) => c.check === "safe_path");
    assert.ok(safePathCheck);
    assert.equal(safePathCheck.passed, false);
  });

  it("fails on missing required sections", () => {
    const candidate = SkillSynthesisCandidateSchema.parse({
      ...VALID_CANDIDATE,
      id: "cand-no-sections",
      body_markdown: "---\nname: x\n---\n\nJust a body with no sections.\n",
      ladder_choice: "skill_create",
    });
    const report = validateSkillCandidate(candidate, { now: "2026-05-28T10:00:00Z" });

    const sectionsCheck = report.checks.find((c) => c.check === "required_sections");
    assert.ok(sectionsCheck);
    assert.equal(sectionsCheck.passed, false);
    assert.ok(sectionsCheck.details!.includes("Missing sections"));
  });

  it("needs_human when evidence simulation shows weak signals", () => {
    const candidate = SkillSynthesisCandidateSchema.parse({
      ...VALID_CANDIDATE,
      id: "cand-weak-evidence",
      source_count: 1,
      confidence: 0.3,
      ladder_choice: "skill_create",
    });
    const report = validateSkillCandidate(candidate, { now: "2026-05-28T10:00:00Z" });

    assert.equal(report.decision, "needs_human");
  });

  it("writes validation report under reports path in write mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-sv-write-"));
    const candidate = SkillSynthesisCandidateSchema.parse(VALID_CANDIDATE);
    const report = validateSkillCandidate(candidate, { now: "2026-05-28T10:00:00Z" });
    const reportPath = await writeSkillValidationReport(root, report);

    assert.ok(reportPath.startsWith(protocolPaths.reportsSkillValidation));
    const written = await readJson<unknown>(root, reportPath);
    assert.equal((written as { id: string }).id, report.id);
  });

  it("validation cannot promote a skill (report has no promotion fields)", () => {
    const candidate = SkillSynthesisCandidateSchema.parse(VALID_CANDIDATE);
    const report = validateSkillCandidate(candidate, { now: "2026-05-28T10:00:00Z" });

    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes("promoted"));
    assert.ok(!serialized.includes("promotion_audit"));
  });

  it("replay mode is disabled unless explicitly enabled", () => {
    const candidate = SkillSynthesisCandidateSchema.parse(VALID_CANDIDATE);
    const reportDefault = validateSkillCandidate(candidate, { now: "2026-05-28T10:00:00Z" });
    assert.equal(reportDefault.mode, "static");

    const reportReplay = validateSkillCandidate(candidate, { now: "2026-05-28T10:00:00Z", replayEnabled: true });
    assert.equal(reportReplay.mode, "replay");
  });

  it("validates a support file candidate for an existing skill without requiring SKILL.md sections", () => {
    const candidate = SkillSynthesisCandidateSchema.parse({
      ...VALID_CANDIDATE,
      id: "cand-support-file",
      action: "skill_support_file",
      target_path: "skills/openclaw/test-skill/references/runbook.md",
      body_markdown: "# Runbook\n\nUse this supporting reference during the skill procedure.",
      ladder_choice: "skill_support_file",
      existing_skill_path: "skills/openclaw/test-skill/SKILL.md",
    });

    const report = validateSkillCandidate(candidate, { now: "2026-05-28T10:00:00Z" });

    assert.equal(report.decision, "pass");
    assert.equal(report.checks.find((c) => c.check === "safe_path")?.passed, true);
    assert.equal(report.checks.some((c) => c.check === "required_sections"), false);
  });

  it("validates from proposal file on disk", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-sv-proposal-"));
    const candidate = SkillSynthesisCandidateSchema.parse(VALID_CANDIDATE);
    const proposalDir = join(root, protocolPaths.inboxProposals);
    await mkdir(proposalDir, { recursive: true });
    await writeFile(join(proposalDir, `${candidate.id}.json`), JSON.stringify(candidate), "utf8");

    const { report } = await validateSkillCandidateFromProposal(root, candidate.id, { now: "2026-05-28T10:00:00Z" });

    assert.equal(report.candidate_id, candidate.id);
    assert.equal(report.decision, "pass");
  });

  it("writes report to reports path when called with write option", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-sv-proposal-write-"));
    const candidate = SkillSynthesisCandidateSchema.parse(VALID_CANDIDATE);
    const proposalDir = join(root, protocolPaths.inboxProposals);
    await mkdir(proposalDir, { recursive: true });
    await writeFile(join(proposalDir, `${candidate.id}.json`), JSON.stringify(candidate), "utf8");

    const { report, reportPath } = await validateSkillCandidateFromProposal(root, candidate.id, {
      now: "2026-05-28T10:00:00Z",
      write: true,
    });

    assert.ok(reportPath);
    assert.ok(reportPath!.startsWith(protocolPaths.reportsSkillValidation));
    const written = await readJson<unknown>(root, reportPath!);
    assert.equal((written as { candidate_id: string }).candidate_id, candidate.id);
  });

  it("report includes target_path and source_hashes for matching", async () => {
    const candidate = SkillSynthesisCandidateSchema.parse(VALID_CANDIDATE);
    const report = validateSkillCandidate(candidate, { now: "2026-05-28T10:00:00Z" });

    assert.equal(report.target_path, candidate.target_path);
    assert.deepEqual(report.source_hashes, candidate.source_hashes);
  });

  it("findFreshPassingValidationReport returns pass for matching report", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-sv-fresh-"));
    const candidate = SkillSynthesisCandidateSchema.parse(VALID_CANDIDATE);
    const report = validateSkillCandidate(candidate, { now: "2026-05-28T10:00:00Z" });
    await writeSkillValidationReport(root, report);

    const result = await findFreshPassingValidationReport(root, candidate);
    assert.equal(result.status, "pass");
    if (result.status === "pass") {
      assert.equal(result.report.candidate_id, candidate.id);
    }
  });

  it("findFreshPassingValidationReport returns missing when no reports exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-sv-missing-"));
    const candidate = SkillSynthesisCandidateSchema.parse(VALID_CANDIDATE);

    const result = await findFreshPassingValidationReport(root, candidate);
    assert.equal(result.status, "missing");
  });

  it("findFreshPassingValidationReport returns stale when source_hashes changed", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-sv-stale-"));
    const candidate = SkillSynthesisCandidateSchema.parse(VALID_CANDIDATE);
    const report = validateSkillCandidate(candidate, { now: "2026-05-28T10:00:00Z" });
    await writeSkillValidationReport(root, report);

    const modifiedCandidate = SkillSynthesisCandidateSchema.parse({
      ...VALID_CANDIDATE,
      source_hashes: ["sha256:changed1", "sha256:changed2"],
    });
    const result = await findFreshPassingValidationReport(root, modifiedCandidate);
    assert.equal(result.status, "stale");
  });

  it("findFreshPassingValidationReport rejects legacy passing reports without freshness metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-sv-legacy-"));
    const candidate = SkillSynthesisCandidateSchema.parse(VALID_CANDIDATE);
    const report = validateSkillCandidate(candidate, { now: "2026-05-28T10:00:00Z" });
    const { target_path: _targetPath, source_hashes: _sourceHashes, ...legacyReport } = report;
    await mkdir(join(root, protocolPaths.reportsSkillValidation), { recursive: true });
    await writeFile(join(root, protocolPaths.reportsSkillValidation, `${report.id}.json`), JSON.stringify(legacyReport), "utf8");

    const result = await findFreshPassingValidationReport(root, candidate);
    assert.equal(result.status, "stale");
  });

  it("findFreshPassingValidationReport returns mismatched when target_path differs", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-sv-mismatch-"));
    const candidate = SkillSynthesisCandidateSchema.parse(VALID_CANDIDATE);
    const report = validateSkillCandidate(candidate, { now: "2026-05-28T10:00:00Z" });
    await writeSkillValidationReport(root, report);

    const modifiedCandidate = SkillSynthesisCandidateSchema.parse({
      ...VALID_CANDIDATE,
      target_path: "skills/openclaw/different-skill/SKILL.md",
    });
    const result = await findFreshPassingValidationReport(root, modifiedCandidate);
    assert.equal(result.status, "mismatched");
  });

  it("findFreshPassingValidationReport returns failing when decision is fail", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-sv-failing-"));
    const weakCandidate = SkillSynthesisCandidateSchema.parse({
      ...VALID_CANDIDATE,
      id: "cand-failing-test",
      source_count: 1,
      confidence: 0.1,
      body_markdown: "---\nname: x\n---\n\nShort.\n",
    });
    const report = validateSkillCandidate(weakCandidate, { now: "2026-05-28T10:00:00Z" });
    await writeSkillValidationReport(root, report);

    const result = await findFreshPassingValidationReport(root, weakCandidate);
    assert.equal(result.status, "failing");
  });

  it("collectValidationSummaries returns correct counts", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-sv-summary-"));
    const candidate = SkillSynthesisCandidateSchema.parse(VALID_CANDIDATE);
    const passingReport = validateSkillCandidate(candidate, { now: "2026-05-28T10:00:00Z" });
    await writeSkillValidationReport(root, passingReport);

    const weakCandidate = SkillSynthesisCandidateSchema.parse({
      ...VALID_CANDIDATE,
      id: "cand-summary-weak",
      source_count: 1,
      confidence: 0.1,
    });
    const failingReport = validateSkillCandidate(weakCandidate, { now: "2026-05-28T10:00:00Z" });
    await writeSkillValidationReport(root, failingReport);

    const summary = await collectValidationSummaries(root);
    assert.equal(summary.total, 2);
    assert.equal(summary.by_decision["pass"], 1);
    assert.equal(summary.candidates_without_passing.length, 1);
    assert.equal(summary.candidates_without_passing[0].candidate_id, "cand-summary-weak");
  });
});
