import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WikiObservationSchema,
  WikiTopicSchema,
  WikiPagePlanSchema,
  WikiPagePlanActionSchema,
  WikiPromotionQualityAssessmentSchema,
  WikiHardBlockReasonSchema,
  WikiHumanRequiredReasonSchema,
  WikiCurationReportSchema,
} from "@praxisbase/core";

const validObservation = {
  id: "obs-1",
  evidence_id: "evidence-1",
  source_ref: "raw-vault://codex/s1",
  source_hash: "sha256:abc",
  scope: "personal" as const,
  agent: "codex" as const,
  kind: "fix" as const,
  problem: "ACK timing slow on repeated runs",
  action: "Refresh OpenClaw login",
  outcome: "success" as const,
  verification: "Acceptance test passed",
  reusable_lesson: "Send ACK before long work",
  entities: ["openclaw", "auth"],
  topics: ["ack-timing"],
  raw_excerpt: "ACK timing slow on repeated runs",
  confidence: 0.85,
  privacy_verdict: "safe" as const,
};

describe("WikiObservationSchema", () => {
  it("parses a valid observation", () => {
    const result = WikiObservationSchema.parse(validObservation);
    assert.equal(result.id, "obs-1");
    assert.equal(result.confidence, 0.85);
    assert.deepEqual(result.entities, ["openclaw", "auth"]);
    assert.equal(result.filtered_out, false);
  });

  it("defaults filtered_out to false and entities to empty", () => {
    const minimal = {
      id: "obs-2",
      evidence_id: "evidence-2",
      source_ref: "s://x",
      source_hash: "sha256:x",
      scope: "project" as const,
      kind: "note" as const,
      confidence: 0.5,
      privacy_verdict: "safe" as const,
    };
    const result = WikiObservationSchema.parse(minimal);
    assert.equal(result.filtered_out, false);
    assert.deepEqual(result.entities, []);
  });

  it("rejects missing required fields", () => {
    assert.throws(() => WikiObservationSchema.parse({}), {
      message: /required/,
    });
  });

  it("rejects confidence out of range", () => {
    assert.throws(
      () =>
        WikiObservationSchema.parse({
          ...validObservation,
          confidence: 1.5,
        }),
      { message: /max/ },
    );
  });

  it("rejects invalid scope", () => {
    assert.throws(
      () =>
        WikiObservationSchema.parse({
          ...validObservation,
          scope: "invalid",
        }),
      undefined,
    );
  });

  it("accepts filtered_out true with filter_reason", () => {
    const result = WikiObservationSchema.parse({
      ...validObservation,
      filtered_out: true,
      filter_reason: "session boot metadata",
    });
    assert.equal(result.filtered_out, true);
    assert.equal(result.filter_reason, "session boot metadata");
  });
});

const validTopic = {
  id: "wiki-topic-1",
  topic_key: "ack-timing-slow::refresh-login::auth,openclaw::personal",
  title: "ACK timing slow on repeated runs",
  scope: "personal" as const,
  page_kind: "known_fix" as const,
  target_path: "kb/known-fixes/ack-timing-slow-on-repeated-runs.md",
  observation_ids: ["obs-1", "obs-2"],
  source_refs: ["raw-vault://codex/s1"],
  source_hashes: ["sha256:abc"],
  source_count: 1,
  entities: ["openclaw", "auth"],
  related_topic_keys: [],
  confidence: 0.88,
  maturity: "draft" as const,
  conflicts: [{
    claim: "ACK must be sent before long work",
    source_refs: ["raw-vault://codex/s1"],
    reason: "supported by accepted delegation flow",
  }],
};

describe("WikiTopicSchema", () => {
  it("parses a valid topic", () => {
    const result = WikiTopicSchema.parse(validTopic);
    assert.equal(result.topic_key, validTopic.topic_key);
    assert.equal(result.page_kind, "known_fix");
    assert.deepEqual(result.observation_ids, ["obs-1", "obs-2"]);
  });

  it("defaults entities, related topics, and conflicts", () => {
    const minimal = {
      id: "wiki-topic-2",
      topic_key: "t1",
      title: "Some topic",
      scope: "project" as const,
      page_kind: "note" as const,
      target_path: "kb/notes/wiki-some-topic.md",
      observation_ids: ["o1"],
      source_refs: ["s://1"],
      source_hashes: ["sha256:a"],
      source_count: 1,
      confidence: 0.5,
      maturity: "draft" as const,
    };
    const result = WikiTopicSchema.parse(minimal);
    assert.deepEqual(result.entities, []);
    assert.deepEqual(result.related_topic_keys, []);
    assert.deepEqual(result.conflicts, []);
  });

  it("rejects empty observation_ids", () => {
    assert.throws(
      () =>
        WikiTopicSchema.parse({
          ...validTopic,
          observation_ids: [],
        }),
      undefined,
    );
  });

  it("rejects invalid page_kind", () => {
    assert.throws(
      () =>
        WikiTopicSchema.parse({
          ...validTopic,
          page_kind: "invalid",
        }),
      undefined,
    );
  });
});

describe("WikiPagePlanActionSchema", () => {
  it("accepts all valid actions", () => {
    for (const action of ["create", "update", "merge", "supersede", "archive"] as const) {
      const result = WikiPagePlanActionSchema.parse(action);
      assert.equal(result, action);
    }
  });

  it("rejects invalid action", () => {
    assert.throws(() => WikiPagePlanActionSchema.parse("delete"), undefined);
  });
});

const validPagePlan = {
  action: "create" as const,
  target_path: "kb/known-fixes/ack-timing-slow.md",
  canonical_title: "ACK timing slow",
  topic_key: "ack-timing-slow::refresh-login::auth,openclaw::personal",
  reasons: ["new_canonical_topic"],
  related_paths: [],
  required_links: [],
};

describe("WikiPagePlanSchema", () => {
  it("parses a valid page plan with create action", () => {
    const result = WikiPagePlanSchema.parse(validPagePlan);
    assert.equal(result.action, "create");
    assert.equal(result.existing_path, undefined);
  });

  it("parses an update plan with existing_path", () => {
    const update = {
      ...validPagePlan,
      action: "update",
      existing_path: "kb/known-fixes/ack-timing.md",
      existing_source_hash: "sha256:abc",
    };
    const result = WikiPagePlanSchema.parse(update);
    assert.equal(result.action, "update");
    assert.equal(result.existing_path, "kb/known-fixes/ack-timing.md");
    assert.equal(result.existing_source_hash, "sha256:abc");
  });

  it("rejects missing required fields", () => {
    assert.throws(
      () =>
        WikiPagePlanSchema.parse({
          topic_key: "t1",
          action: "create",
        }),
      undefined,
    );
  });
});

describe("WikiHardBlockReasonSchema", () => {
  it("accepts all defined hard block reasons", () => {
    const reasons = [
      "unsafe_path",
      "missing_provenance",
      "private_material",
      "raw_json",
      "raw_transcript",
      "template_fallback",
      "reference_only",
      "duplicate_source_hash",
      "body_missing_wiki_structure",
      "create_with_existing_page",
    ];
    for (const r of reasons) {
      assert.equal(WikiHardBlockReasonSchema.parse(r), r);
    }
  });

  it("rejects unknown reason", () => {
    assert.throws(() => WikiHardBlockReasonSchema.parse("unknown_reason"), undefined);
  });
});

describe("WikiHumanRequiredReasonSchema", () => {
  it("accepts all defined human-required reasons", () => {
    const reasons = [
      "weak_single_source",
      "low_confidence",
      "unresolved_conflict",
      "missing_wikilinks",
      "team_or_global_scope",
      "skill_or_policy_target",
      "destructive_action",
    ];
    for (const r of reasons) {
      assert.equal(WikiHumanRequiredReasonSchema.parse(r), r);
    }
  });

  it("rejects unknown reason", () => {
    assert.throws(() => WikiHumanRequiredReasonSchema.parse("not_a_reason"), undefined);
  });
});

describe("WikiPromotionQualityAssessmentSchema", () => {
  it("parses an assessment with no blocks", () => {
    const assessment = {
      topic_key: "t1",
      hard_blocks: [],
      human_required: [],
      passed: true,
    };
    const result = WikiPromotionQualityAssessmentSchema.parse(assessment);
    assert.equal(result.passed, true);
    assert.deepEqual(result.hard_blocks, []);
  });

  it("parses an assessment with hard blocks", () => {
    const assessment = {
      topic_key: "t1",
      hard_blocks: ["private_material", "unsafe_path"] as const,
      human_required: ["low_confidence"] as const,
      passed: false,
    };
    const result = WikiPromotionQualityAssessmentSchema.parse(assessment);
    assert.equal(result.passed, false);
    assert.equal(result.hard_blocks.length, 2);
    assert.equal(result.human_required.length, 1);
  });

  it("defaults arrays to empty", () => {
    const minimal = {
      topic_key: "t1",
      passed: false,
    };
    const result = WikiPromotionQualityAssessmentSchema.parse(minimal);
    assert.deepEqual(result.hard_blocks, []);
    assert.deepEqual(result.human_required, []);
  });
});

const validReportBase = {
  id: "report-1",
  protocol_version: "0.1" as const,
  type: "wiki_curation_report" as const,
  created_at: "2026-05-21T00:00:00.000Z",
  mode: "dry-run" as const,
  ai: { configured: true, mode: "production" as const },
  input_counts: { evidence_items: 5, filtered_noise: 2, human_required: 0, rejected: 0, clusters: 1 },
  output_counts: { curated_proposals: 1, written_proposals: 0, conflicts: 0 },
  proposals: [],
};

describe("WikiCurationReportSchema compiler_counts", () => {
  it("parses report without compiler_counts (backward compatible)", () => {
    const result = WikiCurationReportSchema.parse(validReportBase);
    assert.equal(result.compiler_counts, undefined);
    assert.equal(result.output_counts.curated_proposals, 1);
  });

  it("parses report with full compiler_counts", () => {
    const result = WikiCurationReportSchema.parse({
      ...validReportBase,
      compiler_counts: {
        observations: 3,
        topics: 2,
        page_plans_by_action: { create: 2, update: 0, merge: 0, supersede: 0, archive: 0 },
        duplicate_source_hash_groups: 0,
        hard_blocks: 0,
        human_required_quality: 0,
      },
    });
    assert.ok(result.compiler_counts);
    assert.equal(result.compiler_counts.observations, 3);
    assert.equal(result.compiler_counts.topics, 2);
    assert.equal(result.compiler_counts.page_plans_by_action.create, 2);
    assert.equal(result.compiler_counts.hard_blocks, 0);
    assert.equal(result.compiler_counts.human_required_quality, 0);
  });

  it("defaults compiler_counts inner fields", () => {
    const result = WikiCurationReportSchema.parse({
      ...validReportBase,
      compiler_counts: {},
    });
    assert.ok(result.compiler_counts);
    assert.equal(result.compiler_counts.observations, 0);
    assert.equal(result.compiler_counts.topics, 0);
    assert.deepEqual(result.compiler_counts.page_plans_by_action, {
      create: 0, update: 0, merge: 0, supersede: 0, archive: 0,
    });
    assert.equal(result.compiler_counts.duplicate_source_hash_groups, 0);
  });
});
