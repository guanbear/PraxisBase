import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reviewProposal } from "@praxisbase/core/review/reviewer.js";
import { ProposalSchema } from "@praxisbase/core/protocol/schemas.js";

describe("deterministic MVP reviewer", () => {
  it("approves medium-risk known-fix proposal with evidence", () => {
    const proposal = ProposalSchema.parse({
      id: "proposal_test",
      protocol_version: "0.1",
      type: "knowledge_proposal",
      scope: "team",
      action: "create",
      target_type: "known_fix",
      target_id: "test-fix",
      agent_id: "agent-1",
      agent_type: "temporary_repair_agent",
      environment_id: "sandbox",
      run_id: "run-1",
      idempotency_key: "proposal_test",
      evidence: {
        source_uri: "log://test",
        source_hash: "sha256:abc",
        excerpt: "Fixed.",
        repair_result: "success",
        verification: "Verified.",
      },
      patch: { path: "kb/known-fixes/test.md", content: "# Test" },
      created_at: "2026-05-17T10:00:00Z",
    });

    const review = reviewProposal(proposal);
    assert.equal(review.decision, "approve");
    assert.equal(review.risk, "medium");
    assert.ok(review.confidence >= 0.75);
  });

  it("sends high-risk policy proposal to human queue", () => {
    const proposal = ProposalSchema.parse({
      id: "proposal_policy",
      protocol_version: "0.1",
      type: "knowledge_proposal",
      scope: "team",
      action: "patch",
      target_type: "policy",
      target_id: "autonomy",
      agent_id: "agent-1",
      agent_type: "temporary_repair_agent",
      environment_id: "sandbox",
      run_id: "run-1",
      idempotency_key: "proposal_policy",
      evidence: {
        source_uri: "log://test",
        source_hash: "sha256:abc",
        excerpt: "Policy change.",
        repair_result: "success",
        verification: "Verified.",
      },
      patch: { path: "kb/policies/autonomy.md", content: "# Updated" },
      created_at: "2026-05-17T10:00:00Z",
    });

    const review = reviewProposal(proposal);
    assert.equal(review.decision, "needs_human");
    assert.equal(review.risk, "high");
  });

  it("rejects proposals without verification", () => {
    const result = ProposalSchema.safeParse({
      id: "proposal_no_verify",
      protocol_version: "0.1",
      type: "knowledge_proposal",
      scope: "team",
      action: "create",
      target_type: "known_fix",
      target_id: "test",
      agent_id: "agent-1",
      agent_type: "temporary_repair_agent",
      environment_id: "sandbox",
      run_id: "run-1",
      idempotency_key: "proposal_no_verify",
      evidence: {
        source_uri: "log://test",
        source_hash: "sha256:abc",
        excerpt: "Fixed.",
        repair_result: "success",
        verification: "",
      },
      patch: { path: "kb/known-fixes/test.md", content: "# Test" },
      created_at: "2026-05-17T10:00:00Z",
    });

    assert.equal(result.success, false);
  });
});
