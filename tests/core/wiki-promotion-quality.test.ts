import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROTOCOL_VERSION,
  assessWikiPromotionQuality,
  promotionTimeGuard,
  type CuratedWikiProposal,
} from "@praxisbase/core";

function goodProposal(overrides: Partial<CuratedWikiProposal> = {}): CuratedWikiProposal {
  return {
    id: "wiki-curated-test",
    protocol_version: PROTOCOL_VERSION,
    type: "wiki_curated_proposal",
    target_path: "kb/known-fixes/test-fix.md",
    action: "create",
    page_kind: "known_fix",
    scope: "personal",
    title: "Test fix",
    summary: "A test fix with verification.",
    body_markdown: "# Test fix\n\n## Problem\nSomething broke.\n\n## Fix\nApply the fix.\n\n## Verification\nTests pass.",
    source_refs: ["codex:session:1", "codex:session:2"],
    source_hashes: ["sha256:a", "sha256:b"],
    source_count: 2,
    evidence_ids: ["ev_1", "ev_2"],
    confidence: 0.92,
    maturity: "draft",
    provenance: [
      { source_ref: "codex:session:1", source_hash: "sha256:a" },
      { source_ref: "codex:session:2", source_hash: "sha256:b" },
    ],
    review_hint: { why_review: "Test", suggested_decision: "approve", risk_notes: [] },
    guards: [
      { id: "experience_signal", ok: true, message: "durable experience signal present" },
      { id: "actionability", ok: true, message: "agent actionability present" },
      { id: "verification_or_lesson", ok: true, message: "verification or reusable lesson present" },
      { id: "not_reference_only", ok: true, message: "not reference-only evidence" },
    ],
    created_at: "2026-05-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("assessWikiPromotionQuality - hard blocks", () => {
  it("passes a high-signal personal proposal with good provenance", () => {
    const result = assessWikiPromotionQuality(goodProposal());
    assert.equal(result.passed, true);
    assert.equal(result.hard_blocks.length, 0);
    assert.equal(result.human_required.length, 0);
  });

  it("hard-blocks raw JSON in body", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: '# Test\n\n## Problem\n{"type":"session_meta","status":"boot"}\n{"config":"sandbox_mode":"strict"}\n\n## Fix\nApply.',
    }));
    assert.ok(result.hard_blocks.includes("raw_json"));
    assert.equal(result.passed, false);
  });

  it("hard-blocks raw transcript/log body", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: "# Test\n\n2026-05-22T10:00:00 Starting session\n2026-05-22T10:00:01 INFO Connected\n2026-05-22T10:00:02 WARN Timeout\n2026-05-22T10:00:03 ERROR Failed\n",
    }));
    assert.ok(result.hard_blocks.includes("raw_transcript"));
    assert.equal(result.passed, false);
  });

  it("hard-blocks template fallback sentence", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: "# Test\n\n## Problem\nIssue.\n\n## Fix\nApply.\n\n## Verification\nRe-run the failing workflow and confirm the original symptom is gone.\n",
    }));
    assert.ok(result.hard_blocks.includes("template_fallback"));
    assert.equal(result.passed, false);
  });

  it("hard-blocks reference-only content", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      title: "OpenClaw API Reference",
      summary: "Official documentation for the OpenClaw REST API.",
      body_markdown: "# OpenClaw API Reference\n\n## Endpoints\nOfficial documentation for the REST API endpoints.\n",
    }));
    assert.ok(result.hard_blocks.includes("reference_only"));
    assert.equal(result.passed, false);
  });

  it("hard-blocks missing provenance", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      source_refs: [],
      source_hashes: [],
      provenance: [],
    }));
    assert.ok(result.hard_blocks.includes("missing_provenance"));
    assert.equal(result.passed, false);
  });

  it("hard-blocks missing provenance objects even when source arrays exist", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      provenance: [],
    }));
    assert.ok(result.hard_blocks.includes("missing_provenance"));
    assert.equal(result.passed, false);
  });

  it("hard-blocks unsafe target path", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      target_path: "../outside.md",
    }));
    assert.ok(result.hard_blocks.includes("unsafe_path"));
    assert.equal(result.passed, false);
  });

  it("hard-blocks private material", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: "# Test\n\n## Problem\nLeaked token abc123 in output.\n",
    }));
    assert.ok(result.hard_blocks.includes("private_material"));
    assert.equal(result.passed, false);
  });

  it("hard-blocks body missing wiki structure", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: "Just plain text with no headings at all.",
    }));
    assert.ok(result.hard_blocks.includes("body_missing_wiki_structure"));
    assert.equal(result.passed, false);
  });

  it("hard-blocks create action when existing page was found", () => {
    const result = assessWikiPromotionQuality(goodProposal({ action: "create" }), {
      existingPageFound: true,
    });
    assert.ok(result.hard_blocks.includes("create_with_existing_page"));
    assert.equal(result.passed, false);
  });

  it("hard-blocks duplicate source hash across create proposals", () => {
    const other = goodProposal({ id: "other-proposal", action: "create" });
    const result = assessWikiPromotionQuality(goodProposal({ id: "this-proposal", action: "create" }), {
      otherProposals: [other],
    });
    assert.ok(result.hard_blocks.includes("duplicate_source_hash"));
    assert.equal(result.passed, false);
  });

  it("does not hard-block duplicate source hash when other proposal is update", () => {
    const other = goodProposal({ id: "other-proposal", action: "update" });
    const result = assessWikiPromotionQuality(goodProposal({ id: "this-proposal", action: "create" }), {
      otherProposals: [other],
    });
    assert.equal(result.hard_blocks.includes("duplicate_source_hash"), false);
  });
});

describe("assessWikiPromotionQuality - human required", () => {
  it("human-required for weak single source without strong signal", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      source_refs: ["codex:session:1"],
      source_hashes: ["sha256:a"],
      source_count: 1,
      provenance: [{ source_ref: "codex:session:1", source_hash: "sha256:a" }],
      guards: [
        { id: "experience_signal", ok: false, message: "missing" },
        { id: "verification_or_lesson", ok: false, message: "missing" },
      ],
    }));
    assert.ok(result.human_required.includes("weak_single_source"));
    assert.equal(result.passed, false);
  });

  it("human-required for low confidence", () => {
    const result = assessWikiPromotionQuality(goodProposal({ confidence: 0.5 }));
    assert.ok(result.human_required.includes("low_confidence"));
    assert.equal(result.passed, false);
  });

  it("human-required for unresolved conflict", () => {
    const result = assessWikiPromotionQuality(goodProposal(), {
      conflicts: [{ claim: "Fix A vs Fix B", source_refs: ["src:1", "src:2"], reason: "contradictory" }],
    });
    assert.ok(result.human_required.includes("unresolved_conflict"));
    assert.equal(result.passed, false);
  });

  it("human-required for missing wikilinks when related pages exist", () => {
    const result = assessWikiPromotionQuality(goodProposal(), {
      relatedPaths: ["kb/known-fixes/related.md", "kb/notes/another.md"],
    });
    assert.ok(result.human_required.includes("missing_wikilinks"));
    assert.equal(result.passed, false);
  });

  it("not human-required for missing wikilinks when body has wikilinks", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: "# Test\n\n## Problem\nSee [[related]] for context.\n\n## Fix\nApply.\n\n## Verification\nTests pass.\n",
    }), {
      relatedPaths: ["kb/known-fixes/related.md"],
    });
    assert.equal(result.human_required.includes("missing_wikilinks"), false);
  });

  it("human-required for team scope", () => {
    const result = assessWikiPromotionQuality(goodProposal({ scope: "team" }));
    assert.ok(result.human_required.includes("team_or_global_scope"));
    assert.equal(result.passed, false);
  });

  it("human-required for org scope", () => {
    const result = assessWikiPromotionQuality(goodProposal({ scope: "org" }));
    assert.ok(result.human_required.includes("team_or_global_scope"));
    assert.equal(result.passed, false);
  });

  it("human-required for global scope", () => {
    const result = assessWikiPromotionQuality(goodProposal({ scope: "global" }));
    assert.ok(result.human_required.includes("team_or_global_scope"));
    assert.equal(result.passed, false);
  });

  it("human-required for skill target", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      page_kind: "skill",
      target_path: "skills/test-skill/SKILL.md",
    }));
    assert.ok(result.human_required.includes("skill_or_policy_target"));
    assert.equal(result.passed, false);
  });

  it("human-required for destructive archive action", () => {
    const result = assessWikiPromotionQuality(goodProposal({ action: "archive" }));
    assert.ok(result.human_required.includes("destructive_action"));
    assert.equal(result.passed, false);
  });

  it("human-required for destructive supersede action", () => {
    const result = assessWikiPromotionQuality(goodProposal({ action: "supersede" }));
    assert.ok(result.human_required.includes("destructive_action"));
    assert.equal(result.passed, false);
  });

  it("passes high-signal personal single-source with no related pages", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      source_refs: ["codex:session:1"],
      source_hashes: ["sha256:a"],
      source_count: 1,
      provenance: [{ source_ref: "codex:session:1", source_hash: "sha256:a" }],
      guards: [
        { id: "experience_signal", ok: true, message: "durable experience signal present" },
        { id: "actionability", ok: true, message: "agent actionability present" },
        { id: "verification_or_lesson", ok: true, message: "verification or reusable lesson present" },
        { id: "not_reference_only", ok: true, message: "not reference-only evidence" },
      ],
    }));
    assert.equal(result.hard_blocks.length, 0);
    assert.equal(result.human_required.length, 0);
    assert.equal(result.passed, true);
  });
});

describe("promotionTimeGuard", () => {
  it("passes well-formed wiki content", () => {
    const content = "# Title\n\n## Problem\nIssue.\n\n## Fix\nApply.\n";
    assert.equal(promotionTimeGuard(content), null);
  });

  it("rejects raw JSON content", () => {
    const content = '# Title\n\n## Problem\n{"type":"session_meta"}\n{"boot":"config"}\n';
    const err = promotionTimeGuard(content);
    assert.ok(err);
    assert.match(err, /raw JSON/i);
  });

  it("rejects template fallback content", () => {
    const content = "# Title\n\n## Fix\nDo the thing.\n\n## Verification\nRe-run the failing workflow and confirm the original symptom is gone.\n";
    const err = promotionTimeGuard(content);
    assert.ok(err);
    assert.match(err, /template fallback/i);
  });

  it("rejects content missing wiki structure", () => {
    const content = "Just plain text no headings.";
    const err = promotionTimeGuard(content);
    assert.ok(err);
    assert.match(err, /wiki structure/i);
  });

  it("passes content inside code blocks", () => {
    const content = "# Title\n\n## Example\n```json\n{\"key\": \"value\"}\n```\n\n## Fix\nApply.\n";
    assert.equal(promotionTimeGuard(content), null);
  });
});

describe("assessWikiPromotionQuality - required links", () => {
  it("records missing_wikilinks when requiredLinks exist and body lacks matching wikilink", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: "# Test\n\n## Problem\nSomething broke.\n\n## Fix\nApply the fix.\n\n## Verification\nTests pass.",
    }), {
      requiredLinks: [
        { slug: "openclaw-auth-expired", label: "OpenClaw auth expired", path: "kb/known-fixes/openclaw-auth-expired.md", reason: "shared_signature" },
      ],
    });
    assert.ok(result.human_required.includes("missing_wikilinks"));
    assert.equal(result.passed, false);
  });

  it("passes when body contains [[slug|label]] matching a required link", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: "# Test\n\n## Problem\nSee [[openclaw-auth-expired|OpenClaw Auth]] for context.\n\n## Fix\nApply.\n\n## Verification\nTests pass.",
    }), {
      requiredLinks: [
        { slug: "openclaw-auth-expired", label: "OpenClaw auth expired", path: "kb/known-fixes/openclaw-auth-expired.md", reason: "shared_signature" },
      ],
    });
    assert.equal(result.human_required.includes("missing_wikilinks"), false);
  });

  it("passes when body contains [[slug]] matching a required link", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: "# Test\n\n## Problem\nSee [[openclaw-auth-expired]] for context.\n\n## Fix\nApply.\n\n## Verification\nTests pass.",
    }), {
      requiredLinks: [
        { slug: "openclaw-auth-expired", label: "OpenClaw auth expired", path: "kb/known-fixes/openclaw-auth-expired.md", reason: "shared_signature" },
      ],
    });
    assert.equal(result.human_required.includes("missing_wikilinks"), false);
  });

  it("passes isolated page with no related or required links", () => {
    const result = assessWikiPromotionQuality(goodProposal(), {
      requiredLinks: [],
      relatedPages: [],
    });
    assert.equal(result.human_required.includes("missing_wikilinks"), false);
    assert.equal(result.passed, true);
  });

  it("still uses broad relatedPaths check when requiredLinks is absent", () => {
    const result = assessWikiPromotionQuality(goodProposal(), {
      relatedPaths: ["kb/known-fixes/related.md"],
    });
    assert.ok(result.human_required.includes("missing_wikilinks"));
  });
});

describe("assessWikiPromotionQuality - ambiguous merge", () => {
  it("records ambiguous_merge_target when mergeCandidates has multiple entries", () => {
    const result = assessWikiPromotionQuality(goodProposal(), {
      mergeCandidates: [
        { title: "Page A", path: "kb/known-fixes/page-a.md", reason: "shared_source_hash" },
        { title: "Page B", path: "kb/known-fixes/page-b.md", reason: "same_title_or_slug" },
      ],
    });
    assert.ok(result.human_required.includes("ambiguous_merge_target"));
    assert.equal(result.passed, false);
  });

  it("records ambiguous_merge_target from relationshipReasons", () => {
    const result = assessWikiPromotionQuality(goodProposal(), {
      relationshipReasons: ["ambiguous_merge_target", "shared_source_hash"],
    });
    assert.ok(result.human_required.includes("ambiguous_merge_target"));
    assert.equal(result.passed, false);
  });

  it("records multiple_canonical_targets from relationshipReasons", () => {
    const result = assessWikiPromotionQuality(goodProposal(), {
      relationshipReasons: ["multiple_canonical_targets"],
    });
    assert.ok(result.human_required.includes("multiple_canonical_targets"));
    assert.equal(result.passed, false);
  });

  it("does not record ambiguous merge when mergeCandidates has one entry", () => {
    const result = assessWikiPromotionQuality(goodProposal(), {
      mergeCandidates: [
        { title: "Page A", path: "kb/known-fixes/page-a.md", reason: "shared_source_hash" },
      ],
    });
    assert.equal(result.human_required.includes("ambiguous_merge_target"), false);
    assert.equal(result.human_required.includes("multiple_canonical_targets"), false);
  });
});
