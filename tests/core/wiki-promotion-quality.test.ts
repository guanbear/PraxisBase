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
    body_markdown: "# Test fix\n\n## Problem\nSomething broke.\n\n## Fix\nApply the fix.\n\n## Verification\nTests pass.\n\n## Reusable Lessons\nUse the verified fix when the same signature appears.\n\n## Agent Use\nUse this page when:\n- The same test failure recurs.\n\nApply it by:\n- Apply the verified fix.\n\nVerify by:\n- Run the failing tests again.\n\n## Provenance\n- codex:session:1 (sha256:a)\n- codex:session:2 (sha256:b)",
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
  } as CuratedWikiProposal;
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

  it("hard-blocks body provenance that does not match structured provenance", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: [
        "# Test fix",
        "",
        "## Problem",
        "Something broke.",
        "",
        "## Fix",
        "Apply the fix.",
        "",
        "## Verification",
        "Tests pass.",
        "",
        "## Reusable Lessons",
        "Use the verified fix when the same signature appears.",
        "",
        "## Provenance",
        "- codex:session:1 (sha256:b)",
      ].join("\n"),
      source_refs: ["codex:session:1"],
      source_hashes: ["sha256:a"],
      source_count: 1,
      provenance: [{ source_ref: "codex:session:1", source_hash: "sha256:a" }],
    }));

    assert.ok(result.hard_blocks.includes("provenance_mismatch" as any));
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

  it("hard-blocks bodies missing reusable lessons", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: "# Test\n\n## Problem\nSomething broke.\n\n## Fix\nApply.\n\n## Verification\nTests pass.\n\n## Provenance\n- codex:session:1 (sha256:a)",
    }));
    assert.ok(result.hard_blocks.includes("body_missing_wiki_structure"));
    assert.equal(result.passed, false);
  });

  it("hard-blocks bodies missing agent-use guidance", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: "# Test fix\n\n## Problem\nSomething broke.\n\n## Fix\nApply the fix.\n\n## Verification\nTests pass.\n\n## Reusable Lessons\nUse the verified fix when the same signature appears.\n\n## Provenance\n- codex:session:1 (sha256:a)\n- codex:session:2 (sha256:b)",
    }));
    assert.ok(result.hard_blocks.includes("missing_agent_use"));
    assert.equal(result.passed, false);
  });

  it("hard-blocks thin agent-use placeholders", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: "# Test fix\n\n## Problem\nSomething broke.\n\n## Fix\nApply the fix.\n\n## Verification\nTests pass.\n\n## Reusable Lessons\nUse the verified fix when the same signature appears.\n\n## Agent Use\nUse this page.\n\n## Provenance\n- codex:session:1 (sha256:a)\n- codex:session:2 (sha256:b)",
    }));
    assert.ok(result.hard_blocks.includes("missing_agent_use"));
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

  it("hard-blocks process-status titles that are not reusable wiki topics", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      title: "Successfully fixed and re-approved in a subsequent commit (c52742b)",
      target_path: "kb/known-fixes/successfully-fixed-and-re-approved-in-a-subsequent-commit-c52742b.md",
      body_markdown: [
        "# Successfully fixed and re-approved in a subsequent commit (c52742b)",
        "",
        "## When to Use",
        "Use this when Successfully fixed and re-approved in a subsequent commit (c52742b) appears in agent work.",
        "",
        "## Symptoms",
        "A staged sign-off plan was generated and later approved.",
        "",
        "## What To Do",
        "- Successfully fixed and re-approved in a subsequent commit (c52742b)",
        "",
        "## Verify",
        "The follow-up commit was approved.",
        "",
        "## Reusable Lessons",
        "Use staged signoff when dependencies matter.",
        "",
        "## Provenance",
        "- raw-vault://codex/rollout (sha256:a)",
      ].join("\n"),
    }));

    assert.ok(result.hard_blocks.includes("non_reusable_topic"));
    assert.ok(result.hard_blocks.includes("generic_applicability"));
    assert.ok(result.hard_blocks.includes("non_specific_action"));
    assert.equal(result.passed, false);
  });

  it("hard-blocks generic applicability and action text even with a readable title", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      title: "OpenClaw gateway restart after configuration changes",
      target_path: "kb/procedures/openclaw-gateway-restart-after-configuration-changes.md",
      page_kind: "procedure",
      body_markdown: [
        "# OpenClaw gateway restart after configuration changes",
        "",
        "## When to Use",
        "Use this when OpenClaw gateway restart after configuration changes / text:capture-openclaw-sha256-abc-suggested appears in agent work.",
        "",
        "## Symptoms",
        "Gateway configuration changed.",
        "",
        "## What To Do",
        "- OpenClaw gateway restart after configuration changes",
        "",
        "## Verify",
        "Confirm the gateway is healthy.",
        "",
        "## Reusable Lessons",
        "Restart services after configuration changes.",
        "",
        "## Provenance",
        "- openclaw-memory://memory/config (sha256:a)",
      ].join("\n"),
    }));

    assert.equal(result.hard_blocks.includes("non_reusable_topic"), false);
    assert.ok(result.hard_blocks.includes("generic_applicability"));
    assert.ok(result.hard_blocks.includes("non_specific_action"));
    assert.equal(result.passed, false);
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

  it("human-required for non-active lifecycle proposals", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      lifecycle: "superseded",
      superseded_by: "wiki-newer-fix",
    }));
    assert.ok(result.human_required.includes("destructive_action"));
    assert.equal(result.passed, false);
  });

  it("passes high-signal personal single-source with no related pages", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: "# Test fix\n\n## Problem\nSomething broke.\n\n## Fix\nApply the fix.\n\n## Verification\nTests pass.\n\n## Reusable Lessons\nUse the verified fix when the same signature appears.\n\n## Agent Use\nUse this page when:\n- The same test failure recurs.\n\nApply it by:\n- Apply the verified fix.\n\nVerify by:\n- Run the failing tests again.\n\n## Provenance\n- codex:session:1 (sha256:a)",
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

  it("human-required for single-source one-off run reports even when actionability guards pass", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      title: "OpenClaw acceptance test environment run octoclaw acceptance test mp9ot12v",
      target_path: "kb/known-fixes/openclaw-acceptance-test-environment-run-octoclaw-acceptance-test-mp9ot12v.md",
      summary: "A specific OpenClaw acceptance test run interacted via Slack and recorded one run result.",
      body_markdown: [
        "# OpenClaw acceptance test environment run octoclaw acceptance test mp9ot12v",
        "",
        "## When to Use",
        "Use this when reviewing that exact acceptance test run.",
        "",
        "## Symptoms",
        "The run reported a dispatch warning.",
        "",
        "## What To Do",
        "Review the run report before taking action.",
        "",
        "## Verify",
        "Check the run log.",
        "",
        "## Reusable Lessons",
        "Do not generalize a single run id into a stable fix.",
        "",
        "## Provenance",
        "- openclaw:report:octoclaw-acceptance-test-mp9ot12v (sha256:a)",
      ].join("\n"),
      source_refs: ["openclaw:report:octoclaw-acceptance-test-mp9ot12v"],
      source_hashes: ["sha256:a"],
      source_count: 1,
      provenance: [{ source_ref: "openclaw:report:octoclaw-acceptance-test-mp9ot12v", source_hash: "sha256:a" }],
    }));

    assert.ok(result.human_required.includes("one_off_run_report"));
    assert.equal(result.passed, false);
  });

  it("does not treat reusable acceptance test procedures as one-off run reports", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      title: "Run OpenClaw acceptance test after gateway changes",
      target_path: "kb/procedures/run-openclaw-acceptance-test-after-gateway-changes.md",
      page_kind: "procedure",
      body_markdown: [
        "# Run OpenClaw acceptance test after gateway changes",
        "",
        "## When to Use",
        "Use this after changing gateway routing.",
        "",
        "## Symptoms",
        "Gateway changes need a repeatable acceptance check.",
        "",
        "## What To Do",
        "Run the OpenClaw acceptance test suite.",
        "",
        "## Verify",
        "Confirm the acceptance test suite passes.",
        "",
        "## Reusable Lessons",
        "Run acceptance checks after gateway routing changes.",
        "",
        "## Provenance",
        "- codex:session:1 (sha256:a)",
      ].join("\n"),
      source_refs: ["codex:session:1"],
      source_hashes: ["sha256:a"],
      source_count: 1,
      provenance: [{ source_ref: "codex:session:1", source_hash: "sha256:a" }],
    }));

    assert.equal(result.human_required.includes("one_off_run_report"), false);
  });

  it("human-required for explicit run id artifacts without broader report wording", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      title: "OpenClaw run id abc123def456",
      target_path: "kb/known-fixes/openclaw-run-id-abc123def456.md",
      summary: "Run id: abc123def456 recorded a one-off dispatch warning.",
      body_markdown: [
        "# OpenClaw run id abc123def456",
        "",
        "## When to Use",
        "Use this only when reviewing this exact run id.",
        "",
        "## Symptoms",
        "Run id: abc123def456 recorded a dispatch warning.",
        "",
        "## What To Do",
        "Review the source run before taking action.",
        "",
        "## Verify",
        "Check the run output.",
        "",
        "## Reusable Lessons",
        "Do not generalize one run id into a stable fix.",
        "",
        "## Provenance",
        "- openclaw:run:abc123def456 (sha256:a)",
      ].join("\n"),
      source_refs: ["openclaw:run:abc123def456"],
      source_hashes: ["sha256:a"],
      source_count: 1,
      provenance: [{ source_ref: "openclaw:run:abc123def456", source_hash: "sha256:a" }],
    }));

    assert.ok(result.human_required.includes("one_off_run_report"));
  });

  it("human-required for underscore report artifacts and provenance-only run ids", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      title: "OpenClaw acceptance test dispatch warning",
      target_path: "kb/known-fixes/openclaw-acceptance-test-dispatch-warning.md",
      summary: "A source report captured one specific dispatch warning.",
      body_markdown: [
        "# OpenClaw acceptance test dispatch warning",
        "",
        "## When to Use",
        "Use this when reviewing the linked source artifact.",
        "",
        "## Symptoms",
        "A dispatch warning appeared in the test output.",
        "",
        "## What To Do",
        "Review the report before deciding whether a reusable fix exists.",
        "",
        "## Verify",
        "Check the source report.",
        "",
        "## Reusable Lessons",
        "Keep source reports as evidence until repeated evidence exists.",
        "",
        "## Provenance",
        "- openclaw:report:acceptance_test_run:abc123def456 (sha256:a)",
      ].join("\n"),
      source_refs: ["openclaw:report:acceptance_test_run:abc123def456"],
      source_hashes: ["sha256:a"],
      source_count: 1,
      provenance: [{ source_ref: "openclaw:report:acceptance_test_run:abc123def456", source_hash: "sha256:a" }],
    }));

    assert.ok(result.human_required.includes("one_off_run_report"));
  });

  it("hard-blocks one-off passed stability smoke run titles", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      title: "The test run passed, specifically noting a successful post-deploy recovery restart",
      target_path: "kb/known-fixes/the-test-run-passed-specifically-noting-a-successful-post-deploy-recovery-restart.md",
      summary: "One OpenClaw stability report said a post-deploy recovery restart passed.",
      body_markdown: [
        "# The test run passed, specifically noting a successful post-deploy recovery restart",
        "",
        "## When to Use",
        "Use this guidance when verifying system stability and resilience post-deployment.",
        "",
        "## Context",
        "Agent openclaw executed a stability smoke test and the test run passed.",
        "",
        "## What To Do",
        "Perform a restart.post_deploy_recovery action as part of the standard stability smoke test execution.",
        "",
        "## Verify",
        "Confirm the stability smoke test has executed and passed.",
        "",
        "## Reusable Lessons",
        "Successful completion of this test with no failure codes indicates provider resilience.",
        "",
        "## Agent Use",
        "Use this page when:\n- Reviewing this exact stability smoke report.\n\nApply it by:\n- Check the source report.\n\nVerify by:\n- Confirm the run passed.",
        "",
        "## Provenance",
        "- log://openclaw/2026-05-22-10-03-52-stability-report. (sha256:a)",
      ].join("\n"),
      source_refs: ["log://openclaw/2026-05-22-10-03-52-stability-report."],
      source_hashes: ["sha256:a"],
      source_count: 1,
      provenance: [{ source_ref: "log://openclaw/2026-05-22-10-03-52-stability-report.", source_hash: "sha256:a" }],
    }));

    assert.ok(result.hard_blocks.includes("non_reusable_topic"));
    assert.ok(result.human_required.includes("one_off_run_report"));
    assert.equal(result.passed, false);
  });
});

describe("promotionTimeGuard", () => {
  it("passes well-formed wiki content", () => {
    const content = "# OpenClaw auth refresh repair\n\n## When to Use\nUse this when OpenClaw authentication expires during memory sync.\n\n## Problem\nIssue.\n\n## Fix\nRefresh the OpenClaw login and retry memory sync.\n";
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
    const content = "# OpenClaw auth refresh repair\n\n## When to Use\nUse this when OpenClaw authentication expires during memory sync.\n\n## Example\n```json\n{\"key\": \"value\"}\n```\n\n## Fix\nRefresh the OpenClaw login and retry memory sync.\n";
    assert.equal(promotionTimeGuard(content), null);
  });

  it("rejects generic heading titles from old candidates", () => {
    const content = "# Title\n\n## Context\nA run completed.\n\n## Procedure\nReview the source run before taking action.\n";
    const err = promotionTimeGuard(content);
    assert.ok(err);
    assert.match(err, /reusable wiki topic/i);
  });

  it("rejects stale candidates with raw evidence applicability", () => {
    const content = [
      "# OpenClaw gateway restart after configuration changes",
      "",
      "## Applicability",
      "Use this when evidence matches text:capture-openclaw-sha256-abc-suggested.",
      "",
      "## Fix",
      "Restart the OpenClaw gateway after configuration changes.",
    ].join("\n");
    const err = promotionTimeGuard(content);
    assert.ok(err);
    assert.match(err, /generic applicability/i);
  });

  it("rejects run-specific wiki titles even when the body is actionable", () => {
    const content = [
      "# OpenClaw acceptance test environment (run: octoclaw-acceptance-test-mp9ot12v) interacting via Slack",
      "",
      "## When to Use",
      "Use this when diagnosing OpenClaw acceptance test failures related to unsupported search parameters.",
      "",
      "## Fix",
      "Remove unsupported search filter parameters and rerun the acceptance test.",
    ].join("\n");
    const err = promotionTimeGuard(content);
    assert.ok(err);
    assert.match(err, /reusable wiki topic/i);
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

  it("requires at least one related page slug to resolve when related pages are supplied", () => {
    const result = assessWikiPromotionQuality(goodProposal({
      body_markdown: "# Test\n\n## Problem\nSee [[related-page|Related page]].\n\n## Fix\nApply.\n\n## Verification\nTests pass.\n\n## Reusable Lessons\nReuse the fix.\n\n## Provenance\n- codex:session:1 (sha256:a)\n- codex:session:2 (sha256:b)",
    }), {
      relatedPages: [
        { slug: "wiki-related-page", title: "Related page", path: "kb/notes/wiki-related-page.md" },
      ],
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
