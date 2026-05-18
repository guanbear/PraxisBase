import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyProposalRisk, shouldAutoMergeReview } from "@praxisbase/core/review/risk.js";

describe("review risk", () => {
  it("classifies known-fix create as medium risk", () => {
    const risk = classifyProposalRisk({ action: "create", target_type: "known_fix" });
    assert.equal(risk, "medium");
  });

  it("classifies policy patch as high risk", () => {
    const risk = classifyProposalRisk({ action: "patch", target_type: "policy" });
    assert.equal(risk, "high");
  });

  it("classifies decision changes as high risk", () => {
    const risk = classifyProposalRisk({ action: "patch", target_type: "decision" });
    assert.equal(risk, "high");
  });

  it("classifies archive as high risk regardless of target", () => {
    const risk = classifyProposalRisk({ action: "archive", target_type: "known_fix" });
    assert.equal(risk, "high");
  });

  it("classifies note link as low risk", () => {
    const risk = classifyProposalRisk({ action: "link", target_type: "note" });
    assert.equal(risk, "low");
  });

  it("classifies skill create as medium risk", () => {
    const risk = classifyProposalRisk({ action: "create", target_type: "skill" });
    assert.equal(risk, "medium");
  });

  it("classifies skill link as low risk", () => {
    const risk = classifyProposalRisk({ action: "link", target_type: "skill" });
    assert.equal(risk, "low");
  });

  it("allows auto-merge for medium approval above confidence threshold", () => {
    assert.equal(shouldAutoMergeReview({ decision: "approve", risk: "medium", confidence: 0.8 }), true);
  });

  it("allows auto-merge for low risk", () => {
    assert.equal(shouldAutoMergeReview({ decision: "approve", risk: "low", confidence: 0.8 }), true);
  });

  it("blocks auto-merge for high risk", () => {
    assert.equal(shouldAutoMergeReview({ decision: "approve", risk: "high", confidence: 0.95 }), false);
  });

  it("blocks auto-merge below confidence threshold", () => {
    assert.equal(shouldAutoMergeReview({ decision: "approve", risk: "medium", confidence: 0.5 }), false);
  });

  it("blocks auto-merge for needs_human", () => {
    assert.equal(shouldAutoMergeReview({ decision: "needs_human", risk: "medium", confidence: 0.9 }), false);
  });

  it("blocks auto-merge for reject", () => {
    assert.equal(shouldAutoMergeReview({ decision: "reject", risk: "low", confidence: 0.9 }), false);
  });
});
