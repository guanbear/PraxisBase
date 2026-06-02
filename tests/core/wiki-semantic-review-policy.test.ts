import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decideSemanticWikiAction,
  type SemanticArbitrationInput,
} from "@praxisbase/core";
import type { SemanticWikiReview } from "@praxisbase/core/wiki/semantic-review.js";
import type { WikiPromotionQualityAssessment } from "@praxisbase/core/wiki/curation-model.js";

function makeReview(overrides?: Partial<SemanticWikiReview>): SemanticWikiReview {
  return {
    type: "semantic_wiki_review",
    candidate_id: "proposal_1",
    target_path: "kb/known-fixes/test.md",
    decision: "promote",
    quality_score: 0.91,
    long_term_agent_value: true,
    is_run_report_summary: false,
    is_raw_or_near_raw_copy: false,
    is_actionable: true,
    is_reusable: true,
    evidence_support: "strong",
    should_merge_with: null,
    revision_required: false,
    fatal_issues: [],
    missing_requirements: [],
    reason: "Reusable multi-source procedure.",
    reviewed_at: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}

function makeAssessment(overrides?: Partial<WikiPromotionQualityAssessment>): WikiPromotionQualityAssessment {
  return {
    topic_key: "proposal_1",
    hard_blocks: [],
    human_required: [],
    passed: true,
    ...overrides,
  };
}

function makeInput(overrides?: Partial<SemanticArbitrationInput>): SemanticArbitrationInput {
  return {
    proposal: {
      id: "proposal_1",
      action: "create",
      scope: "personal",
      source_count: 2,
      page_kind: "known_fix",
      title: "Test known fix",
    },
    assessment: makeAssessment(),
    review: makeReview(),
    hasBeenRetried: false,
    ...overrides,
  };
}

describe("decideSemanticWikiAction", () => {
  it("deterministic hard block wins over reviewer promote", () => {
    const result = decideSemanticWikiAction(makeInput({
      assessment: makeAssessment({
        hard_blocks: ["unsafe_path"],
        passed: false,
      }),
      review: makeReview({ decision: "promote", quality_score: 0.95 }),
    }));
    assert.equal(result.action, "reject");
    assert.ok(result.reviewNotes.some((n) => /hard block/i.test(n)));
  });

  it("reviewer reject rejects the candidate", () => {
    const result = decideSemanticWikiAction(makeInput({
      review: makeReview({
        decision: "reject",
        quality_score: 0.4,
        fatal_issues: ["Dangling fragments"],
      }),
    }));
    assert.equal(result.action, "reject");
  });

  it("reviewer merge without valid target becomes needs_human", () => {
    const result = decideSemanticWikiAction(makeInput({
      review: makeReview({
        decision: "merge",
        should_merge_with: null,
      }),
    }));
    assert.equal(result.action, "needs_human");
    assert.ok(result.reviewNotes.some((n) => /merge.*target/i.test(n) || /no.*merge/i.test(n)));
  });

  it("reviewer merge with valid target returns rewrite_as_merge", () => {
    const result = decideSemanticWikiAction(makeInput({
      review: makeReview({
        decision: "merge",
        should_merge_with: "kb/known-fixes/existing-page.md",
      }),
    }));
    assert.equal(result.action, "rewrite_as_merge");
  });

  it("reviewer revise allows one retry", () => {
    const result = decideSemanticWikiAction(makeInput({
      review: makeReview({
        decision: "revise",
        revision_required: true,
        quality_score: 0.7,
        missing_requirements: ["Needs concrete trigger"],
      }),
      hasBeenRetried: false,
    }));
    assert.equal(result.action, "retry_synthesis");
    assert.ok(result.reason.toLowerCase().includes("revision") || result.reason.toLowerCase().includes("missing"));
  });

  it("reviewer revise after one retry becomes needs_human", () => {
    const result = decideSemanticWikiAction(makeInput({
      review: makeReview({
        decision: "revise",
        revision_required: true,
        quality_score: 0.7,
      }),
      hasBeenRetried: true,
    }));
    assert.equal(result.action, "needs_human");
    assert.ok(result.reviewNotes.some((n) => /retr/i.test(n)));
  });

  it("personal promote requires quality_score >= 0.82 and all positive flags", () => {
    const happy = decideSemanticWikiAction(makeInput({
      proposal: {
        id: "proposal_1",
        action: "create",
        scope: "personal",
        source_count: 2,
        page_kind: "known_fix",
        title: "Good fix",
      },
      review: makeReview({
        decision: "promote",
        quality_score: 0.82,
        long_term_agent_value: true,
        is_actionable: true,
        is_reusable: true,
        fatal_issues: [],
      }),
    }));
    assert.equal(happy.action, "write_candidate");

    const lowScore = decideSemanticWikiAction(makeInput({
      review: makeReview({
        decision: "promote",
        quality_score: 0.81,
        long_term_agent_value: true,
        is_actionable: true,
        is_reusable: true,
      }),
    }));
    assert.equal(lowScore.action, "needs_human");

    const noValue = decideSemanticWikiAction(makeInput({
      review: makeReview({
        decision: "promote",
        quality_score: 0.91,
        long_term_agent_value: false,
        is_actionable: true,
        is_reusable: true,
      }),
    }));
    assert.equal(noValue.action, "needs_human");

    const notActionable = decideSemanticWikiAction(makeInput({
      review: makeReview({
        decision: "promote",
        quality_score: 0.91,
        long_term_agent_value: true,
        is_actionable: false,
        is_reusable: true,
      }),
    }));
    assert.equal(notActionable.action, "needs_human");

    const notReusable = decideSemanticWikiAction(makeInput({
      review: makeReview({
        decision: "promote",
        quality_score: 0.91,
        long_term_agent_value: true,
        is_actionable: true,
        is_reusable: false,
      }),
    }));
    assert.equal(notReusable.action, "needs_human");

    const withFatal = decideSemanticWikiAction(makeInput({
      review: makeReview({
        decision: "promote",
        quality_score: 0.91,
        long_term_agent_value: true,
        is_actionable: true,
        is_reusable: true,
        fatal_issues: ["Empty section"],
      }),
    }));
    assert.equal(withFatal.action, "needs_human");
  });

  it("team scope remains needs_human even when reviewer approves", () => {
    const result = decideSemanticWikiAction(makeInput({
      proposal: {
        id: "proposal_1",
        action: "create",
        scope: "team",
        source_count: 3,
        page_kind: "known_fix",
        title: "Team fix",
      },
      review: makeReview({
        decision: "promote",
        quality_score: 0.95,
        long_term_agent_value: true,
        is_actionable: true,
        is_reusable: true,
      }),
    }));
    assert.equal(result.action, "needs_human");
    assert.ok(result.reviewNotes.some((n) => /team/i.test(n)));
  });

  it("org scope remains needs_human", () => {
    const result = decideSemanticWikiAction(makeInput({
      proposal: {
        id: "proposal_1",
        action: "create",
        scope: "org",
        source_count: 3,
        page_kind: "known_fix",
        title: "Org fix",
      },
      review: makeReview({
        decision: "promote",
        quality_score: 0.95,
      }),
    }));
    assert.equal(result.action, "needs_human");
  });

  it("global scope remains needs_human", () => {
    const result = decideSemanticWikiAction(makeInput({
      proposal: {
        id: "proposal_1",
        action: "create",
        scope: "global",
        source_count: 3,
        page_kind: "known_fix",
        title: "Global fix",
      },
      review: makeReview({
        decision: "promote",
        quality_score: 0.95,
      }),
    }));
    assert.equal(result.action, "needs_human");
  });

  it("single-source run-report create cannot promote", () => {
    const result = decideSemanticWikiAction(makeInput({
      proposal: {
        id: "proposal_1",
        action: "create",
        scope: "personal",
        source_count: 1,
        page_kind: "known_fix",
        title: "Post-deploy smoke test failure",
      },
      review: makeReview({
        decision: "promote",
        quality_score: 0.85,
        long_term_agent_value: true,
        is_actionable: true,
        is_reusable: true,
        is_run_report_summary: true,
      }),
    }));
    assert.notEqual(result.action, "write_candidate");
    assert.ok(
      result.action === "needs_human" || result.action === "rewrite_as_merge" || result.action === "reject",
      `Expected non-promote action but got ${result.action}`,
    );
  });

  it("reviewer needs_human passes through", () => {
    const result = decideSemanticWikiAction(makeInput({
      review: makeReview({
        decision: "needs_human",
        quality_score: 0.75,
      }),
    }));
    assert.equal(result.action, "needs_human");
  });

  it("unavailable review (null) produces needs_human for personal scope", () => {
    const result = decideSemanticWikiAction(makeInput({
      review: undefined,
    }));
    assert.equal(result.action, "needs_human");
    assert.ok(result.reviewNotes.some((n) => /unavailable/i.test(n)));
  });

  it("returns reason and reviewNotes for every decision", () => {
    const cases: Array<{ input: Partial<SemanticArbitrationInput>; expectedAction: string }> = [
      { input: { assessment: makeAssessment({ hard_blocks: ["private_material"], passed: false }) }, expectedAction: "reject" },
      { input: { review: makeReview({ decision: "reject" }) }, expectedAction: "reject" },
      { input: { review: makeReview({ decision: "merge", should_merge_with: null }) }, expectedAction: "needs_human" },
      { input: { review: makeReview({ decision: "promote", quality_score: 0.91, long_term_agent_value: true, is_actionable: true, is_reusable: true }) }, expectedAction: "write_candidate" },
      { input: { review: makeReview({ decision: "needs_human" }) }, expectedAction: "needs_human" },
    ];
    for (const { input, expectedAction } of cases) {
      const result = decideSemanticWikiAction(makeInput(input));
      assert.equal(result.action, expectedAction);
      assert.ok(typeof result.reason === "string" && result.reason.length > 0);
      assert.ok(Array.isArray(result.reviewNotes));
    }
  });
});
