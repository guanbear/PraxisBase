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
    source_refs: ["codex:session:1"],
    source_hashes: ["sha256:a"],
    source_count: 1,
    evidence_ids: ["ev_1"],
    confidence: 0.92,
    maturity: "draft",
    provenance: [{ source_ref: "codex:session:1", source_hash: "sha256:a" }],
    review_hint: { why_review: "Low risk personal fix", suggested_decision: "approve", risk_notes: [] },
    guards: [{ id: "path", ok: true, message: "allowed" }],
    created_at: "2026-05-21T00:00:00.000Z",
    ...overrides,
  };
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
});
