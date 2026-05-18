import { mkdtemp, readFile } from "node:fs/promises";
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
});
