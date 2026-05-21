import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initializeWorkspace } from "@praxisbase/cli/commands/init.js";
import { reviewPolicyInit, reviewAutoWithPolicy } from "@praxisbase/cli/commands/review.js";
import { CuratedWikiProposalSchema } from "@praxisbase/core";
import type { CuratedWikiProposal } from "@praxisbase/core";

function curatedProposalFixture(
  overrides?: Partial<CuratedWikiProposal>,
): CuratedWikiProposal {
  return CuratedWikiProposalSchema.parse({
    id: "wiki_curated_openclaw_auth",
    protocol_version: "0.1",
    type: "wiki_curated_proposal",
    target_path: "kb/known-fixes/openclaw-auth-expired.md",
    action: "create",
    page_kind: "known_fix",
    scope: "personal",
    title: "OpenClaw auth expired recovery",
    summary: "Refresh OpenClaw login before retrying memory sync.",
    body_markdown:
      "# OpenClaw auth expired recovery\n\n## Problem\nOpenClaw memory sync fails after auth expiry.\n\n## Fix\nRefresh login and retry sync.\n\n## Verification\nRun memory sync again.",
    source_refs: ["codex:session:1", "openclaw:memory:2"],
    source_hashes: ["sha256:a", "sha256:b"],
    source_count: 2,
    evidence_ids: ["ev_1", "ev_2"],
    confidence: 0.9,
    maturity: "draft",
    provenance: [
      { source_ref: "codex:session:1", source_hash: "sha256:a" },
      { source_ref: "openclaw:memory:2", source_hash: "sha256:b" },
    ],
    review_hint: {
      why_review: "Low risk personal fix",
      suggested_decision: "approve",
      risk_notes: [],
    },
    guards: [{ id: "path", ok: true, message: "allowed" }],
    created_at: "2026-05-21T00:00:00.000Z",
    ...overrides,
  });
}

function highSignalGuards(): CuratedWikiProposal["guards"] {
  return [
    { id: "path", ok: true, message: "allowed" },
    { id: "experience_signal", ok: true, message: "durable experience signal present" },
    { id: "actionability", ok: true, message: "agent actionability present" },
    { id: "verification_or_lesson", ok: true, message: "verification or reusable lesson present" },
    { id: "not_reference_only", ok: true, message: "not reference-only evidence" },
  ];
}

describe("review policy init", () => {
  it("writes personal policy with auto-promote low_risk_personal_only", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-policy-personal-"));
    await initializeWorkspace(root);

    const policy = await reviewPolicyInit(root, "personal");

    assert.equal(policy.mode, "personal");
    assert.equal(policy.type, "review_policy");
    assert.equal(policy.protocol_version, "0.1");
    assert.equal(policy.auto_review, true);
    assert.equal(policy.auto_promote, "low_risk_personal_only");
    assert.ok(policy.min_confidence > 0);
    assert.ok(Array.isArray(policy.require_human_for));
    assert.ok(policy.require_human_for.length > 0);

    const readback = JSON.parse(
      await readFile(join(root, ".praxisbase/review-policy.json"), "utf8"),
    );
    assert.equal(readback.mode, "personal");
    assert.equal(readback.auto_promote, "low_risk_personal_only");
    assert.equal(readback.protocol_version, "0.1");
  });

  it("writes team policy with auto-promote off", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-policy-team-"));
    await initializeWorkspace(root);

    const policy = await reviewPolicyInit(root, "team");

    assert.equal(policy.mode, "team");
    assert.equal(policy.auto_review, true);
    assert.equal(policy.auto_promote, "off");
    assert.ok(policy.min_confidence >= 0.9, "team min_confidence should be at least 0.9");

    const readback = JSON.parse(
      await readFile(join(root, ".praxisbase/review-policy.json"), "utf8"),
    );
    assert.equal(readback.mode, "team");
    assert.equal(readback.auto_promote, "off");
  });

  it("overwrites existing policy on re-init", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-policy-overwrite-"));
    await initializeWorkspace(root);

    await reviewPolicyInit(root, "personal");
    await reviewPolicyInit(root, "team");

    const readback = JSON.parse(
      await readFile(join(root, ".praxisbase/review-policy.json"), "utf8"),
    );
    assert.equal(readback.mode, "team");
    assert.equal(readback.auto_promote, "off");
  });
});

describe("review auto with policy", () => {
  it("reviews curated proposal and writes review record", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-auto-curated-"));
    await initializeWorkspace(root);
    await reviewPolicyInit(root, "personal");

    await writeFile(
      join(root, ".praxisbase/inbox/proposals/curated-fix.json"),
      JSON.stringify(curatedProposalFixture()),
    );

    const result = await reviewAutoWithPolicy(root);

    assert.equal(result.ok, true);
    assert.equal(result.reviewed, 1);
    assert.equal(result.needs_human, 0);

    const reviewDir = join(root, ".praxisbase/inbox/reviews");
    const reviewFiles = await readdir(reviewDir);
    assert.ok(reviewFiles.length >= 1, "expected at least one review record");

    const review = JSON.parse(
      await readFile(join(reviewDir, reviewFiles[0]), "utf8"),
    );
    assert.ok(review.id.startsWith("review_"));
    assert.equal(review.proposal_id, "wiki_curated_openclaw_auth");
  });

  it("writes run record for policy-aware review", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-auto-run-"));
    await initializeWorkspace(root);
    await reviewPolicyInit(root, "personal");

    await writeFile(
      join(root, ".praxisbase/inbox/proposals/curated-fix.json"),
      JSON.stringify(curatedProposalFixture()),
    );

    await reviewAutoWithPolicy(root);

    const runDir = join(root, ".praxisbase/runs/review");
    const runFiles = await readdir(runDir);
    assert.ok(runFiles.length >= 1, "expected at least one run record");

    const run = JSON.parse(
      await readFile(join(runDir, runFiles[0]), "utf8"),
    );
    assert.equal(run.command, "review");
    assert.equal(run.protocol_version, "0.1");
    assert.ok(run.started_at);
    assert.ok(run.finished_at);
    assert.equal(typeof run.counts.reviewed, "number");
  });

  it("flags human-required skill proposal under personal policy", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-auto-skill-"));
    await initializeWorkspace(root);
    await reviewPolicyInit(root, "personal");

    await writeFile(
      join(root, ".praxisbase/inbox/proposals/curated-skill.json"),
      JSON.stringify(
        curatedProposalFixture({
          id: "wiki_curated_skill_openclaw",
          page_kind: "skill",
          target_path: "skills/openclaw/openclaw-repair.md",
          title: "OpenClaw repair skill",
          action: "skill_create",
        }),
      ),
    );

    const result = await reviewAutoWithPolicy(root);

    assert.equal(result.ok, true);
    assert.equal(result.needs_human, 1);
    assert.equal(result.auto_promoted, 0);

    const exceptionDir = join(root, ".praxisbase/exceptions/human-required");
    const exceptionFiles = await readdir(exceptionDir);
    assert.ok(exceptionFiles.length >= 1, "expected human-required exception");

    const exception = JSON.parse(
      await readFile(join(exceptionDir, exceptionFiles[0]), "utf8"),
    );
    assert.equal(exception.type, "exception_record");
    assert.equal(exception.category, "human_required");
  });

  it("promotes approved low-risk personal proposal with promoteApproved", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-promote-approved-"));
    await initializeWorkspace(root);
    await reviewPolicyInit(root, "personal");

    await writeFile(
      join(root, ".praxisbase/inbox/proposals/curated-fix.json"),
      JSON.stringify(curatedProposalFixture()),
    );

    const result = await reviewAutoWithPolicy(root, { promoteApproved: true });

    assert.equal(result.ok, true);
    assert.equal(result.auto_promoted, 1);
    assert.equal(result.approved_by_policy, 1);
    assert.equal(result.needs_human, 0);

    const promoted = await readFile(
      join(root, "kb/known-fixes/openclaw-auth-expired.md"),
      "utf8",
    );
    assert.ok(promoted.includes("OpenClaw auth expired"));
  });

  it("promotes high-signal single-source personal proposals with promoteApproved", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-promote-single-high-signal-"));
    await initializeWorkspace(root);
    await reviewPolicyInit(root, "personal");

    await writeFile(
      join(root, ".praxisbase/inbox/proposals/curated-single-source-fix.json"),
      JSON.stringify(curatedProposalFixture({
        source_refs: ["codex:session:1"],
        source_hashes: ["sha256:a"],
        source_count: 1,
        evidence_ids: ["ev_1"],
        provenance: [{ source_ref: "codex:session:1", source_hash: "sha256:a" }],
        guards: highSignalGuards(),
      })),
    );

    const result = await reviewAutoWithPolicy(root, { promoteApproved: true });

    assert.equal(result.ok, true);
    assert.equal(result.auto_promoted, 1);
    assert.equal(result.needs_human, 0);
  });

  it("does not auto-promote team proposal under personal policy", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-no-team-promote-"));
    await initializeWorkspace(root);
    await reviewPolicyInit(root, "personal");

    await writeFile(
      join(root, ".praxisbase/inbox/proposals/curated-team.json"),
      JSON.stringify(
        curatedProposalFixture({
          id: "wiki_curated_team_fix",
          scope: "team",
        }),
      ),
    );

    const result = await reviewAutoWithPolicy(root, { promoteApproved: true });

    assert.equal(result.ok, true);
    assert.equal(result.auto_promoted, 0);
    assert.equal(result.needs_human, 1);
  });

  it("does not auto-promote under team policy even with promoteApproved", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-team-no-promote-"));
    await initializeWorkspace(root);
    await reviewPolicyInit(root, "team");

    await writeFile(
      join(root, ".praxisbase/inbox/proposals/curated-fix.json"),
      JSON.stringify(curatedProposalFixture()),
    );

    const result = await reviewAutoWithPolicy(root, { promoteApproved: true });

    assert.equal(result.ok, true);
    assert.equal(result.auto_promoted, 0);
  });

  it("does not auto-promote without promoteApproved flag", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-no-flag-"));
    await initializeWorkspace(root);
    await reviewPolicyInit(root, "personal");

    await writeFile(
      join(root, ".praxisbase/inbox/proposals/curated-fix.json"),
      JSON.stringify(curatedProposalFixture()),
    );

    const result = await reviewAutoWithPolicy(root);

    assert.equal(result.ok, true);
    assert.equal(result.auto_promoted, 0);
    assert.equal(result.approved_by_policy, 1);
  });

  it("returns errors for invalid proposal files", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-auto-errors-"));
    await initializeWorkspace(root);
    await reviewPolicyInit(root, "personal");

    await writeFile(
      join(root, ".praxisbase/inbox/proposals/bad.json"),
      "{ invalid json }",
    );

    const result = await reviewAutoWithPolicy(root);

    assert.equal(result.ok, true);
    assert.equal(result.reviewed, 0);
    assert.ok(result.errors.length >= 1, "expected at least one error");
    assert.ok(result.errors[0].includes("bad.json"));
  });
});
