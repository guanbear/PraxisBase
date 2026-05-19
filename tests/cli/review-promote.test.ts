import { mkdtemp, readFile, readdir } from "node:fs/promises";
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
});
