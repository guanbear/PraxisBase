import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initializeWorkspace } from "@praxisbase/cli/commands/init.js";
import { submitProposal } from "@praxisbase/cli/commands/propose.js";
import { reviewAuto } from "@praxisbase/cli/commands/review.js";
import { promoteAuto } from "@praxisbase/cli/commands/promote.js";

describe("review and promote commands", () => {
  it("auto reviews and promotes approved known fix proposals", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-review-promote-"));
    await initializeWorkspace(root);
    await submitProposal(root, "tests/fixtures/openclaw/proposals/known-fix.json");

    await reviewAuto(root);
    const review = JSON.parse(
      await readFile(join(root, ".praxisbase/inbox/reviews/review_proposal_20260517_known_fix.json"), "utf8")
    );
    assert.equal(review.decision, "approve");
    assert.equal(review.risk, "medium");

    await promoteAuto(root);
    const promoted = await readFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), "utf8");
    assert.ok(promoted.includes("OpenClaw auth expired"));
  });

  it("does not promote high-risk policy proposals", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-policy-"));
    await initializeWorkspace(root);
    await submitProposal(root, "tests/fixtures/openclaw/proposals/policy-high-risk.json");

    await reviewAuto(root);
    const review = JSON.parse(
      await readFile(join(root, ".praxisbase/inbox/reviews/review_proposal_20260517_policy_high.json"), "utf8")
    );
    assert.equal(review.decision, "needs_human");
    assert.equal(review.risk, "high");

    await promoteAuto(root);
    await assert.rejects(readFile(join(root, "skills/openclaw/policy.md"), "utf8"));
  });

  it("fails on approved unsafe patch paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-unsafe-"));
    await initializeWorkspace(root);
    await submitProposal(root, "tests/fixtures/openclaw/proposals/unsafe-path.json");
    await reviewAuto(root);

    await assert.rejects(promoteAuto(root), /Path traversal rejected|outside stable knowledge/);
  });

  it("writes human-required exception for high-risk policy proposal review", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-exc-review-"));
    await initializeWorkspace(root);
    await submitProposal(root, "tests/fixtures/openclaw/proposals/policy-high-risk.json");

    await reviewAuto(root);

    const exceptionDir = join(root, ".praxisbase/exceptions/human-required");
    const exceptionFiles = await readdir(exceptionDir);
    assert.ok(exceptionFiles.length >= 1, "expected at least one human-required exception record");

    const exception = JSON.parse(
      await readFile(join(exceptionDir, exceptionFiles[0]), "utf8")
    );
    assert.equal(exception.type, "exception_record");
    assert.equal(exception.category, "human_required");
    assert.ok(exception.source_id.startsWith("review_"));
    assert.ok(exception.reason.includes("needs_human"));
    assert.ok(exception.reason.includes("high"));
    assert.equal(exception.protocol_version, "0.1");
  });

  it("routes team skill proposals to human-required review", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-team-skill-review-"));
    await initializeWorkspace(root);
    await submitProposal(root, "tests/fixtures/m28/openclaw/proposals/team-skill-default.json");

    await reviewAuto(root);

    const review = JSON.parse(
      await readFile(join(root, ".praxisbase/inbox/reviews/review_proposal_m28_team_skill_default.json"), "utf8")
    );
    assert.equal(review.decision, "needs_human");
    assert.equal(review.risk, "high");

    const exceptionFiles = await readdir(join(root, ".praxisbase/exceptions/human-required"));
    assert.ok(exceptionFiles.length >= 1);
  });

  it("skips skill synthesis candidates during generic auto promotion", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-promote-skip-skill-candidate-"));
    await initializeWorkspace(root);
    await submitProposal(root, "tests/fixtures/openclaw/proposals/known-fix.json");
    await writeFile(
      join(root, ".praxisbase/inbox/proposals/skill_candidate_team.json"),
      JSON.stringify({
        id: "skill_candidate_team",
        protocol_version: "0.1",
        type: "skill_synthesis_candidate",
        action: "skill_create",
        cause_classification: "skill_problem",
        scope: "team",
        target_path: "skills/openclaw/team-skill/SKILL.md",
        target_skill: "Team skill",
        title: "Team skill",
        summary: "Team skill candidate.",
        body_markdown: "# Team skill\n\n## When To Use\nUse for team review only.",
        source_refs: ["log://openclaw/team/1"],
        source_hashes: ["sha256:teamskill001"],
        evidence_ids: ["evidence-team-skill"],
        source_count: 1,
        confidence: 0.91,
        ladder_choice: "skill_create",
        existing_skill_path: null,
        related_wiki_paths: [],
        review_hint: { suggested_decision: "approve", risk_notes: [] },
        created_at: "2026-06-03T10:00:00.000Z",
      }),
      "utf8",
    );

    await reviewAuto(root);
    await promoteAuto(root);

    const promoted = await readFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), "utf8");
    assert.ok(promoted.includes("OpenClaw auth expired"));
    await assert.rejects(readFile(join(root, "skills/openclaw/team-skill/SKILL.md"), "utf8"));
  });

  it("continues after a historical proposal fails when another proposal was promoted", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-promote-partial-"));
    await initializeWorkspace(root);
    await submitProposal(root, "tests/fixtures/openclaw/proposals/known-fix.json");
    await writeFile(join(root, "kb/procedures/existing-procedure.md"), [
      "---",
      "id: existing-procedure",
      "protocol_version: '0.1'",
      "type: procedure",
      "knowledge_type: procedure",
      "scope: personal",
      "status: draft",
      "maturity: draft",
      "sources:",
      "  - uri: log://existing/procedure",
      "    hash: sha256:existingprocedure",
      "confidence: 0.9",
      "source_count: 1",
      "updated_at: '2026-06-01T00:00:00.000Z'",
      "---",
      "# Existing Procedure",
      "",
      "## When to Use",
      "Use this when an agent needs to verify an existing operational procedure before changing stable knowledge.",
      "",
      "## Procedure",
      "- Confirm the stable page keeps the procedure knowledge type before applying a patch.",
      "- Preserve the existing procedure metadata when the page is updated.",
      "",
      "## Verification",
      "- Run the promotion checks and confirm the page still validates as a procedure.",
      "",
      "## Reusable Lessons",
      "- Stable procedure pages should keep their procedure type unless a human explicitly approves reclassification.",
      "",
      "## Agent Use",
      "Use this page when:",
      "- An approved proposal rewrites an existing procedure page.",
      "",
      "Apply it by:",
      "- Check the frontmatter knowledge_type before promoting the patch.",
      "",
      "Verify by:",
      "- Confirm the promoted page still has procedure metadata.",
      "",
      "## Provenance",
      "- log://existing/procedure",
    ].join("\n"), "utf8");
    await writeFile(join(root, ".praxisbase/inbox/proposals/bad-downgrade.json"), JSON.stringify({
      id: "bad-downgrade",
      protocol_version: "0.1",
      type: "knowledge_proposal",
      scope: "personal",
      action: "patch",
      target_type: "known_fix",
      target_id: "existing-procedure",
      agent_id: "codex",
      agent_type: "curator",
      environment_id: "local",
      run_id: "run-bad-downgrade",
      idempotency_key: "bad-downgrade",
      evidence: {
        source_uri: "log://existing/procedure",
        source_hash: "sha256:existingprocedure2",
        excerpt: "Bad downgrade.",
        repair_result: "success",
        verification: "Not relevant."
      },
      patch: {
        path: "kb/procedures/existing-procedure.md",
        content: [
          "---",
          "id: existing-procedure",
          "protocol_version: '0.1'",
          "type: known_fix",
          "knowledge_type: known_fix",
          "scope: personal",
          "risk: medium",
          "status: draft",
          "maturity: draft",
          "sources:",
          "  - uri: log://existing/procedure",
          "    hash: sha256:existingprocedure",
          "confidence: 0.9",
          "source_count: 1",
          "updated_at: '2026-06-01T00:00:00.000Z'",
          "---",
          "# Existing Procedure",
          "",
          "## When to Use",
          "Use this when an agent needs to verify an existing operational procedure before changing stable knowledge.",
          "",
          "## Procedure",
          "- Confirm the stable page keeps the procedure knowledge type before applying a patch.",
          "- Preserve the existing procedure metadata when the page is updated.",
          "",
          "## Verification",
          "- Run the promotion checks and confirm the page still validates as a procedure.",
          "",
          "## Reusable Lessons",
          "- Stable procedure pages should keep their procedure type unless a human explicitly approves reclassification.",
          "",
          "## Agent Use",
          "Use this page when:",
          "- An approved proposal rewrites an existing procedure page.",
          "",
          "Apply it by:",
          "- Check the frontmatter knowledge_type before promoting the patch.",
          "",
          "Verify by:",
          "- Confirm the promoted page still has procedure metadata.",
          "",
          "## Provenance",
          "- log://existing/procedure",
        ].join("\n"),
      },
      created_at: "2026-06-03T10:00:00.000Z",
    }), "utf8");

    await reviewAuto(root);
    await promoteAuto(root);

    const promoted = await readFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), "utf8");
    assert.ok(promoted.includes("OpenClaw auth expired"));
    const runFiles = await readdir(join(root, ".praxisbase/runs/promote"));
    const latest = runFiles.sort().at(-1)!;
    const run = JSON.parse(await readFile(join(root, ".praxisbase/runs/promote", latest), "utf8"));
    assert.equal(run.status, "partial");
    assert.equal(run.counts.promoted, 1);
    assert.equal(run.counts.failed, 1);
  });

  it("writes a review run record", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-run-review-"));
    await initializeWorkspace(root);
    await submitProposal(root, "tests/fixtures/openclaw/proposals/known-fix.json");

    await reviewAuto(root);

    const runDir = join(root, ".praxisbase/runs/review");
    const runFiles = await readdir(runDir);
    assert.ok(runFiles.length >= 1, "expected at least one review run record");

    const run = JSON.parse(
      await readFile(join(runDir, runFiles[0]), "utf8")
    );
    assert.equal(run.command, "review");
    assert.equal(run.protocol_version, "0.1");
    assert.ok(run.started_at);
    assert.ok(run.finished_at);
    assert.equal(typeof run.counts.reviewed, "number");
    assert.ok(Array.isArray(run.errors));
  });

  it("writes a promote run record on successful promotion", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-run-promote-"));
    await initializeWorkspace(root);
    await submitProposal(root, "tests/fixtures/openclaw/proposals/known-fix.json");

    await reviewAuto(root);
    await promoteAuto(root);

    const runDir = join(root, ".praxisbase/runs/promote");
    const runFiles = await readdir(runDir);
    assert.ok(runFiles.length >= 1, "expected at least one promote run record");

    const run = JSON.parse(
      await readFile(join(runDir, runFiles[0]), "utf8")
    );
    assert.equal(run.command, "promote");
    assert.equal(run.protocol_version, "0.1");
    assert.equal(run.status, "completed");
    assert.ok(run.counts.promoted >= 1);
    assert.ok(run.started_at);
    assert.ok(run.finished_at);
  });

  it("writes exception record for unsafe path promotion failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-exc-unsafe-"));
    await initializeWorkspace(root);
    await submitProposal(root, "tests/fixtures/openclaw/proposals/unsafe-path.json");
    await reviewAuto(root);

    await assert.rejects(promoteAuto(root), /Path traversal rejected|outside stable knowledge/);

    const conflictDir = join(root, ".praxisbase/exceptions/conflicts");
    const conflictFiles = await readdir(conflictDir).catch(() => []);
    assert.ok(conflictFiles.length >= 1, "expected at least one conflict exception record");

    const exception = JSON.parse(
      await readFile(join(conflictDir, conflictFiles[0]), "utf8")
    );
    assert.equal(exception.type, "exception_record");
    assert.equal(exception.category, "conflict");
    assert.ok(exception.reason.includes("rejected") || exception.reason.includes("outside"));
    assert.equal(exception.protocol_version, "0.1");

    await assert.rejects(readFile(join(root, "../outside.md"), "utf8"));
  });

  it("writes failed run record when proposal has bad JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-review-bad-json-"));
    await initializeWorkspace(root);

    await writeFile(
      join(root, ".praxisbase/inbox/proposals/bad-json.json"),
      "{ invalid json content "
    );

    await reviewAuto(root);

    const runDir = join(root, ".praxisbase/runs/review");
    const runFiles = await readdir(runDir);
    assert.ok(runFiles.length >= 1, "expected at least one review run record");

    const run = JSON.parse(
      await readFile(join(runDir, runFiles[0]), "utf8")
    );
    assert.equal(run.command, "review");
    assert.equal(run.protocol_version, "0.1");
    assert.ok(run.status === "failed" || run.status === "partial", `expected failed or partial status, got ${run.status}`);
    assert.ok(run.errors.length >= 1, "expected at least one error");
    assert.ok(run.errors[0].includes("bad-json.json"), `error should mention file name: ${run.errors[0]}`);
    assert.equal(run.counts.reviewed, 0);
  });

  it("writes partial run record when some proposals have bad schema", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-review-bad-schema-"));
    await initializeWorkspace(root);

    await submitProposal(root, "tests/fixtures/openclaw/proposals/known-fix.json");

    await writeFile(
      join(root, ".praxisbase/inbox/proposals/bad-schema.json"),
      JSON.stringify({ id: "bad", type: "knowledge_proposal" })
    );

    await reviewAuto(root);

    const runDir = join(root, ".praxisbase/runs/review");
    const runFiles = await readdir(runDir);
    assert.ok(runFiles.length >= 1, "expected at least one review run record");

    const run = JSON.parse(
      await readFile(join(runDir, runFiles[0]), "utf8")
    );
    assert.equal(run.command, "review");
    assert.equal(run.status, "partial", `expected partial status, got ${run.status}`);
    assert.ok(run.errors.length >= 1, "expected at least one error for bad schema");
    assert.ok(run.errors[0].includes("bad-schema.json"), `error should mention file name: ${run.errors[0]}`);
    assert.equal(run.counts.reviewed, 1, "should have reviewed the valid proposal");
    const reviewDir = join(root, ".praxisbase/inbox/reviews");
    const reviewFiles = await readdir(reviewDir);
    assert.ok(reviewFiles.length >= 1, "expected at least one review for the valid proposal");
  });

  it("auto reviews and promotes wiki proposal candidates", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-review-wiki-candidate-"));
    await initializeWorkspace(root);
    await writeFile(
      join(root, ".praxisbase/inbox/proposals/wiki-proposal_auth.json"),
      JSON.stringify({
        id: "wiki-proposal_auth",
        protocol_version: "0.1",
        type: "wiki_proposal_candidate",
        source_id: "capture:auth",
        source_kind: "capture",
        source_hash: "sha256:auth",
        changed_stable_knowledge: false,
        patch: {
          path: "kb/notes/wiki-openclaw-auth.md",
          content: `---
id: wiki-openclaw-auth
protocol_version: "0.1"
type: note
knowledge_type: note
scope: personal
status: draft
maturity: draft
sources:
  - uri: "capture:auth"
    hash: "sha256:auth"
confidence: 0.5
updated_at: "2026-05-21T10:00:00.000Z"
---
# OpenClaw Auth Refresh

## When to Use
Use this when OpenClaw authentication expires during agent repair.

## Fix
Refresh the OpenClaw login before retrying the failing repair operation.
`,
        },
        created_at: "2026-05-21T10:00:00.000Z",
      }),
      "utf8",
    );

    await reviewAuto(root);
    const review = JSON.parse(await readFile(join(root, ".praxisbase/inbox/reviews/review_wiki-proposal_auth.json"), "utf8"));
    assert.equal(review.decision, "approve");
    assert.equal(review.proposal_id, "wiki-proposal_auth");

    await promoteAuto(root);
    const promoted = await readFile(join(root, "kb/notes/wiki-openclaw-auth.md"), "utf8");
    assert.ok(promoted.includes("OpenClaw Auth Refresh"));
  });
});
