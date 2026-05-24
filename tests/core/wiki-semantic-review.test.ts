import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SemanticWikiReviewSchema,
  normalizeSemanticWikiReview,
  buildSemanticWikiReviewPrompt,
  reviewWikiCandidateSemantically,
  type SemanticWikiReview,
} from "@praxisbase/core";
import type { AiJsonClient } from "@praxisbase/core/ai/client.js";
import type { CuratedWikiProposal } from "@praxisbase/core/wiki/curation-model.js";

const baseProposal: CuratedWikiProposal = {
  id: "proposal_1",
  protocol_version: "0.1",
  type: "wiki_curated_proposal",
  target_path: "kb/known-fixes/openclaw-auth-expired.md",
  action: "create",
  page_kind: "known_fix",
  scope: "personal",
  title: "OpenClaw auth expired recovery",
  summary: "Refresh login before retrying memory sync.",
  body_markdown: [
    "# OpenClaw auth expired recovery",
    "",
    "## Problem",
    "Memory sync fails after auth expiry.",
    "",
    "## Fix",
    "Refresh login and retry sync.",
    "",
    "## Verification",
    "Run memory sync again.",
    "",
    "## Reusable Lessons",
    "Refresh auth before retrying OpenClaw sync.",
    "",
    "## Provenance",
    "- codex:session:1 (sha256:a)",
    "- openclaw:memory:2 (sha256:b)",
  ].join("\n"),
  source_refs: ["codex:session:1", "openclaw:memory:2"],
  source_hashes: ["sha256:a", "sha256:b"],
  source_count: 2,
  evidence_ids: ["ev_1", "ev_2"],
  confidence: 0.91,
  maturity: "draft",
  provenance: [
    { source_ref: "codex:session:1", source_hash: "sha256:a" },
    { source_ref: "openclaw:memory:2", source_hash: "sha256:b" },
  ],
  review_hint: {
    why_review: "Multi-source known fix with proven repair path.",
    suggested_decision: "approve",
    risk_notes: [],
  },
  guards: [],
  supersedes: [],
  superseded_by: null,
  lifecycle: "active",
  relationship_types: [],
  created_at: "2026-05-24T00:00:00.000Z",
};

function makeValidReview(overrides?: Partial<SemanticWikiReview>): SemanticWikiReview {
  return {
    type: "semantic_wiki_review",
    candidate_id: "proposal_1",
    target_path: "kb/known-fixes/openclaw-auth-expired.md",
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
    reason: "Reusable procedure with concrete trigger, action, verification, and multi-source provenance.",
    reviewed_at: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("SemanticWikiReviewSchema", () => {
  it("accepts valid promote decision", () => {
    const review = makeValidReview({ decision: "promote" });
    const parsed = SemanticWikiReviewSchema.parse(review);
    assert.equal(parsed.decision, "promote");
  });

  it("accepts valid revise decision", () => {
    const parsed = SemanticWikiReviewSchema.parse(makeValidReview({ decision: "revise" }));
    assert.equal(parsed.decision, "revise");
  });

  it("accepts valid merge decision", () => {
    const parsed = SemanticWikiReviewSchema.parse(makeValidReview({ decision: "merge" }));
    assert.equal(parsed.decision, "merge");
  });

  it("accepts valid reject decision", () => {
    const parsed = SemanticWikiReviewSchema.parse(makeValidReview({ decision: "reject" }));
    assert.equal(parsed.decision, "reject");
  });

  it("accepts valid needs_human decision", () => {
    const parsed = SemanticWikiReviewSchema.parse(makeValidReview({ decision: "needs_human" }));
    assert.equal(parsed.decision, "needs_human");
  });

  it("rejects invalid decision values", () => {
    assert.throws(() =>
      SemanticWikiReviewSchema.parse(makeValidReview({ decision: "approve" as SemanticWikiReview["decision"] }))
    );
  });

  it("enforces score bounds 0..1", () => {
    assert.throws(() =>
      SemanticWikiReviewSchema.parse(makeValidReview({ quality_score: -0.1 }))
    );
    assert.throws(() =>
      SemanticWikiReviewSchema.parse(makeValidReview({ quality_score: 1.5 }))
    );
    const validZero = SemanticWikiReviewSchema.parse(makeValidReview({ quality_score: 0 }));
    assert.equal(validZero.quality_score, 0);
    const validOne = SemanticWikiReviewSchema.parse(makeValidReview({ quality_score: 1 }));
    assert.equal(validOne.quality_score, 1);
  });

  it("accepts nullable should_merge_with", () => {
    const nullMerge = SemanticWikiReviewSchema.parse(makeValidReview({ should_merge_with: null }));
    assert.equal(nullMerge.should_merge_with, null);
    const withMerge = SemanticWikiReviewSchema.parse(makeValidReview({ should_merge_with: "kb/known-fixes/existing.md" }));
    assert.equal(withMerge.should_merge_with, "kb/known-fixes/existing.md");
  });

  it("accepts evidence_support enum values", () => {
    for (const value of ["none", "weak", "partial", "strong"] as const) {
      const parsed = SemanticWikiReviewSchema.parse(makeValidReview({ evidence_support: value }));
      assert.equal(parsed.evidence_support, value);
    }
  });

  it("requires all mandatory fields", () => {
    const { decision, ...missing } = makeValidReview();
    assert.throws(() => SemanticWikiReviewSchema.parse(missing));
  });
});

describe("normalizeSemanticWikiReview", () => {
  it("normalizes valid JSON with extra fields into a valid review", () => {
    const raw = {
      ...makeValidReview(),
      extra_field: "should be stripped",
    };
    const result = normalizeSemanticWikiReview(JSON.stringify(raw), "proposal_1", "kb/known-fixes/openclaw-auth-expired.md");
    assert.ok(result);
    assert.equal(result.decision, "promote");
    assert.equal(result.candidate_id, "proposal_1");
    assert.equal(result.target_path, "kb/known-fixes/openclaw-auth-expired.md");
  });

  it("normalizes decision strings to valid enum values", () => {
    const raw = {
      ...makeValidReview(),
      decision: "promote",
      quality_score: "0.91",
      long_term_agent_value: "true",
      is_actionable: "true",
      is_reusable: "true",
    };
    const result = normalizeSemanticWikiReview(JSON.stringify(raw), "proposal_1", "kb/known-fixes/openclaw-auth-expired.md");
    assert.ok(result);
    assert.equal(typeof result.quality_score, "number");
    assert.equal(typeof result.long_term_agent_value, "boolean");
  });

  it("clamps quality_score to 0..1 range", () => {
    const raw = { ...makeValidReview(), quality_score: 1.5 };
    const result = normalizeSemanticWikiReview(JSON.stringify(raw), "proposal_1", "kb/known-fixes/openclaw-auth-expired.md");
    assert.ok(result);
    assert.ok(result.quality_score >= 0 && result.quality_score <= 1);
  });

  it("defaults missing fields to safe values", () => {
    const raw = {
      decision: "promote",
      quality_score: 0.9,
      reason: "Looks good",
    };
    const result = normalizeSemanticWikiReview(JSON.stringify(raw), "proposal_1", "kb/known-fixes/openclaw-auth-expired.md");
    assert.ok(result);
    assert.equal(result.decision, "promote");
    assert.equal(result.is_actionable, false);
    assert.equal(result.is_reusable, false);
    assert.deepEqual(result.fatal_issues, []);
    assert.deepEqual(result.missing_requirements, []);
  });

  it("returns null for completely unparseable JSON", () => {
    const result = normalizeSemanticWikiReview("not json at all", "proposal_1", "kb/known-fixes/test.md");
    assert.equal(result, null);
  });

  it("returns null for JSON with invalid decision", () => {
    const raw = { decision: "maybe", quality_score: 0.5, reason: "unclear" };
    const result = normalizeSemanticWikiReview(JSON.stringify(raw), "proposal_1", "kb/test.md");
    assert.equal(result, null);
  });
});

describe("buildSemanticWikiReviewPrompt", () => {
  it("includes strict JSON instruction", () => {
    const prompt = buildSemanticWikiReviewPrompt(baseProposal, []);
    assert.match(prompt.system, /only strict JSON/i);
  });

  it("forbids rewriting the page", () => {
    const prompt = buildSemanticWikiReviewPrompt(baseProposal, []);
    assert.match(prompt.system, /do not rewrite/i);
  });

  it("states provenance-only evidence requirement", () => {
    const prompt = buildSemanticWikiReviewPrompt(baseProposal, []);
    assert.match(prompt.system, /provenance/i);
  });

  it("warns about agentmemory sidecar hits", () => {
    const prompt = buildSemanticWikiReviewPrompt(baseProposal, []);
    assert.match(prompt.system, /agentmemory/i);
    assert.match(prompt.system, /sidecar/i);
  });

  it("includes candidate context in user prompt", () => {
    const prompt = buildSemanticWikiReviewPrompt(baseProposal, []);
    const user = JSON.parse(prompt.user) as Record<string, unknown>;
    assert.equal(user.title, "OpenClaw auth expired recovery");
    assert.equal(user.target_path, "kb/known-fixes/openclaw-auth-expired.md");
    assert.equal(user.scope, "personal");
    assert.equal(user.source_count, 2);
  });

  it("includes body_markdown in user prompt", () => {
    const prompt = buildSemanticWikiReviewPrompt(baseProposal, []);
    const user = JSON.parse(prompt.user) as Record<string, unknown>;
    assert.ok(typeof user.body_markdown === "string");
    assert.ok((user.body_markdown as string).includes("## Fix"));
  });

  it("includes existing pages for merge awareness", () => {
    const existingPages = [
      { slug: "openclaw-auth-expired", path: "kb/known-fixes/openclaw-auth-expired.md", title: "OpenClaw auth expired" },
    ];
    const prompt = buildSemanticWikiReviewPrompt(baseProposal, existingPages);
    const user = JSON.parse(prompt.user) as Record<string, unknown>;
    assert.ok(Array.isArray(user.existing_pages));
    assert.equal((user.existing_pages as Array<{ title: string }>).length, 1);
    assert.equal((user.existing_pages as Array<{ title: string }>)[0].title, "OpenClaw auth expired");
  });

  it("includes deterministic gate output when supplied", () => {
    const prompt = buildSemanticWikiReviewPrompt(baseProposal, [], {
      topic_key: "proposal_1",
      hard_blocks: [],
      human_required: ["missing_wikilinks"],
      passed: true,
    });
    const user = JSON.parse(prompt.user) as {
      deterministic_gate: {
        passed: boolean;
        hard_blocks: string[];
        human_required: string[];
      };
    };
    assert.deepEqual(user.deterministic_gate, {
      passed: true,
      hard_blocks: [],
      human_required: ["missing_wikilinks"],
    });
  });

  it("includes the expected JSON schema in the prompt", () => {
    const prompt = buildSemanticWikiReviewPrompt(baseProposal, []);
    const user = JSON.parse(prompt.user) as Record<string, unknown>;
    assert.ok(user.expected_schema);
  });
});

describe("reviewWikiCandidateSemantically", () => {
  it("returns promote review from mocked AI client", async () => {
    const client: AiJsonClient = {
      async generateJson() {
        return {
          ok: true,
          json: makeValidReview({ decision: "promote", quality_score: 0.91 }),
        };
      },
    };
    const result = await reviewWikiCandidateSemantically(baseProposal, {
      client,
      existingPages: [],
      qualityAssessment: {
        topic_key: "proposal_1",
        hard_blocks: [],
        human_required: [],
        passed: true,
      },
    });
    assert.ok(result);
    assert.equal(result.decision, "promote");
    assert.equal(result.quality_score, 0.91);
  });

  it("returns merge review with merge target", async () => {
    const client: AiJsonClient = {
      async generateJson() {
        return {
          ok: true,
          json: makeValidReview({
            decision: "merge",
            should_merge_with: "kb/known-fixes/existing-page.md",
          }),
        };
      },
    };
    const result = await reviewWikiCandidateSemantically(baseProposal, {
      client,
      existingPages: [{ slug: "existing-page", path: "kb/known-fixes/existing-page.md", title: "Existing" }],
    });
    assert.ok(result);
    assert.equal(result.decision, "merge");
    assert.equal(result.should_merge_with, "kb/known-fixes/existing-page.md");
  });

  it("returns reject review", async () => {
    const client: AiJsonClient = {
      async generateJson() {
        return {
          ok: true,
          json: makeValidReview({
            decision: "reject",
            quality_score: 0.4,
            fatal_issues: ["Dangling fragments", "Empty sections"],
          }),
        };
      },
    };
    const result = await reviewWikiCandidateSemantically(baseProposal, {
      client,
      existingPages: [],
    });
    assert.ok(result);
    assert.equal(result.decision, "reject");
    assert.deepEqual(result.fatal_issues, ["Dangling fragments", "Empty sections"]);
  });

  it("returns unavailable when AI client returns error", async () => {
    const client: AiJsonClient = {
      async generateJson() {
        return { ok: false, error: "AI provider request timed out after 90000ms" };
      },
    };
    const result = await reviewWikiCandidateSemantically(baseProposal, {
      client,
      existingPages: [],
    });
    assert.equal(result, null);
  });

  it("returns unavailable when AI client throws", async () => {
    const client: AiJsonClient = {
      async generateJson() {
        throw new Error("Network failure");
      },
    };
    const result = await reviewWikiCandidateSemantically(baseProposal, {
      client,
      existingPages: [],
    });
    assert.equal(result, null);
  });

  it("normalizes malformed JSON from AI and returns valid review", async () => {
    const malformedJson = {
      decision: "promote",
      quality_score: "0.85",
      reason: "Good enough",
      long_term_agent_value: "true",
    };
    const client: AiJsonClient = {
      async generateJson() {
        return { ok: true, json: malformedJson };
      },
    };
    const result = await reviewWikiCandidateSemantically(baseProposal, {
      client,
      existingPages: [],
    });
    assert.ok(result);
    assert.equal(result.decision, "promote");
    assert.equal(typeof result.quality_score, "number");
    assert.equal(typeof result.long_term_agent_value, "boolean");
  });

  it("returns null when AI returns unparseable content", async () => {
    const client: AiJsonClient = {
      async generateJson() {
        return { ok: true, json: "just a string, not valid" };
      },
    };
    const result = await reviewWikiCandidateSemantically(baseProposal, {
      client,
      existingPages: [],
    });
    assert.equal(result, null);
  });
});
