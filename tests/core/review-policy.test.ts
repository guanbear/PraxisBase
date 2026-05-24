import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROTOCOL_VERSION,
  decideAutoReview,
  defaultReviewPolicy,
  type CuratedWikiProposal,
} from "@praxisbase/core";

function curatedProposal(overrides: Partial<CuratedWikiProposal> = {}): CuratedWikiProposal {
  return {
    id: "wiki-curated-openclaw-auth",
    protocol_version: PROTOCOL_VERSION,
    type: "wiki_curated_proposal",
    target_path: "kb/known-fixes/openclaw-auth-expired.md",
    action: "create",
    page_kind: "known_fix",
    scope: "personal",
    title: "OpenClaw auth expired recovery",
    summary: "Refresh login before retrying memory sync.",
    body_markdown: "# OpenClaw auth expired recovery\n",
    source_refs: ["codex:session:1", "openclaw:memory:2"],
    source_hashes: ["sha256:a", "sha256:b"],
    source_count: 2,
    evidence_ids: ["ev_1", "ev_2"],
    confidence: 0.92,
    maturity: "draft",
    provenance: [
      { source_ref: "codex:session:1", source_hash: "sha256:a" },
      { source_ref: "openclaw:memory:2", source_hash: "sha256:b" },
    ],
    review_hint: { why_review: "Low risk personal fix", suggested_decision: "approve", risk_notes: [] },
    guards: [{ id: "path", ok: true, message: "allowed" }],
    created_at: "2026-05-21T00:00:00.000Z",
    ...overrides,
  };
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

describe("review policy", () => {
  it("personal low-risk known fix can auto promote", () => {
    const decision = decideAutoReview(curatedProposal(), defaultReviewPolicy("personal"));
    assert.equal(decision.auto_review, true);
    assert.equal(decision.auto_promote, true);
    assert.equal(decision.human_required, false);
  });

  it("team proposal is not auto promoted by default", () => {
    const decision = decideAutoReview(
      curatedProposal({ scope: "team" }),
      defaultReviewPolicy("team"),
    );
    assert.equal(decision.auto_review, true);
    assert.equal(decision.auto_promote, false);
    assert.match(decision.reason, /team/i);
  });

  it("team policy requires human review for personal scope proposals", () => {
    const decision = decideAutoReview(curatedProposal({ scope: "personal" }), defaultReviewPolicy("team"));

    assert.equal(decision.auto_review, true);
    assert.equal(decision.auto_promote, false);
    assert.equal(decision.human_required, true);
    assert.ok(decision.required_human_reasons.includes("scope_escalation"));
  });

  it("skill target requires human in personal mode", () => {
    const decision = decideAutoReview(
      curatedProposal({ page_kind: "skill", target_path: "skills/openclaw/auth-repair/SKILL.md" }),
      defaultReviewPolicy("personal"),
    );
    assert.equal(decision.auto_promote, false);
    assert.equal(decision.human_required, true);
  });

  it("failing guards require human", () => {
    const decision = decideAutoReview(
      curatedProposal({ guards: [{ id: "privacy", ok: false, message: "private material" }] }),
      defaultReviewPolicy("personal"),
    );
    assert.equal(decision.auto_promote, false);
    assert.equal(decision.human_required, true);
  });

  it("weak single-source proposals require human in personal mode", () => {
    const decision = decideAutoReview(
      curatedProposal({
        source_refs: ["codex:session:1"],
        source_hashes: ["sha256:a"],
        source_count: 1,
        evidence_ids: ["ev_1"],
        provenance: [{ source_ref: "codex:session:1", source_hash: "sha256:a" }],
      }),
      defaultReviewPolicy("personal"),
    );

    assert.equal(decision.auto_review, true);
    assert.equal(decision.auto_promote, false);
    assert.equal(decision.human_required, true);
    assert.ok(decision.required_human_reasons.includes("weak_single_source"));
  });

  it("high-signal single-source personal proposals can follow auto-promote policy", () => {
    const decision = decideAutoReview(
      curatedProposal({
        source_refs: ["codex:session:1"],
        source_hashes: ["sha256:a"],
        source_count: 1,
        evidence_ids: ["ev_1"],
        provenance: [{ source_ref: "codex:session:1", source_hash: "sha256:a" }],
        guards: highSignalGuards(),
      }),
      defaultReviewPolicy("personal"),
    );

    assert.equal(decision.auto_review, true);
    assert.equal(decision.auto_promote, true);
    assert.equal(decision.human_required, false);
    assert.equal(decision.required_human_reasons.includes("weak_single_source"), false);
  });

  it("high-signal single-source personal notes still require human review", () => {
    const decision = decideAutoReview(
      curatedProposal({
        page_kind: "note",
        target_path: "kb/notes/wiki-single-event.md",
        source_refs: ["codex:session:1"],
        source_hashes: ["sha256:a"],
        source_count: 1,
        evidence_ids: ["ev_1"],
        provenance: [{ source_ref: "codex:session:1", source_hash: "sha256:a" }],
        guards: highSignalGuards(),
      }),
      defaultReviewPolicy("personal"),
    );

    assert.equal(decision.auto_review, true);
    assert.equal(decision.auto_promote, false);
    assert.equal(decision.human_required, true);
    assert.ok(decision.required_human_reasons.includes("weak_single_source"));
  });

  it("low-risk personal wiki updates can follow auto-promote policy", () => {
    const decision = decideAutoReview(
      curatedProposal({
        action: "update",
        target_path: "kb/notes/wiki-openclaw-ack-timing.md",
        page_kind: "note",
        scope: "personal",
        guards: highSignalGuards(),
        related_pages: [
          {
            slug: "wiki-asynchronous-task-ux-and-dispatch-mapping-anomalies",
            path: "kb/notes/wiki-asynchronous-task-ux-and-dispatch-mapping-anomalies.md",
            title: "Asynchronous Task UX and Dispatch Mapping Anomalies",
          },
        ],
      }),
      defaultReviewPolicy("personal"),
    );

    assert.equal(decision.auto_review, true);
    assert.equal(decision.auto_promote, true);
    assert.equal(decision.human_required, false);
    assert.equal(decision.required_human_reasons.includes("updates_existing_stable_page"), false);
  });

  it("quality hard block risk note prevents auto-promote", () => {
    const decision = decideAutoReview(
      curatedProposal({
        review_hint: {
          why_review: "Quality gate failed",
          suggested_decision: "reject",
          risk_notes: ["quality_hard_block:raw_json"],
        },
      }),
      defaultReviewPolicy("personal"),
    );
    assert.equal(decision.auto_promote, false);
    assert.equal(decision.human_required, true);
    assert.ok(decision.required_human_reasons.includes("quality_hard_block"));
    assert.match(decision.reason, /quality gate/i);
  });

  it("quality human required risk note prevents auto-promote", () => {
    const decision = decideAutoReview(
      curatedProposal({
        review_hint: {
          why_review: "Quality gate needs human",
          suggested_decision: "edit",
          risk_notes: ["quality_human_required:missing_wikilinks"],
        },
      }),
      defaultReviewPolicy("personal"),
    );
    assert.equal(decision.auto_promote, false);
    assert.equal(decision.human_required, true);
    assert.ok(decision.required_human_reasons.includes("quality_human_required"));
    assert.match(decision.reason, /quality gate/i);
  });

  it("quality hard block takes precedence over low-risk personal kind", () => {
    const decision = decideAutoReview(
      curatedProposal({
        page_kind: "known_fix",
        scope: "personal",
        guards: highSignalGuards(),
        review_hint: {
          why_review: "Quality hard block",
          suggested_decision: "reject",
          risk_notes: ["quality_hard_block:template_fallback"],
        },
      }),
      defaultReviewPolicy("personal"),
    );
    assert.equal(decision.auto_promote, false);
    assert.equal(decision.human_required, true);
    assert.ok(decision.required_human_reasons.includes("quality_hard_block"));
  });
});
