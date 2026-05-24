import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL_VERSION, WikiCurationReportSchema } from "@praxisbase/core";
import type { AiJsonClient } from "@praxisbase/core/ai/client.js";
import { curateWiki } from "@praxisbase/core/wiki/curate.js";
import type { SemanticWikiReview } from "@praxisbase/core/wiki/semantic-review.js";

const NOW = "2026-05-24T12:00:00.000Z";

async function writeCapture(root: string, id: string, summary: string, scope = "personal"): Promise<void> {
  await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
  await writeFile(join(root, `.praxisbase/outbox/captures/${id}.json`), JSON.stringify({
    id,
    protocol_version: PROTOCOL_VERSION,
    type: "capture_record",
    agent: "codex",
    workspace: root,
    scope_hint: scope,
    result: "success",
    triggers: ["task_finish"],
    signals: [],
    artifacts: [{
      kind: "transcript",
      source_ref: `raw-vault://codex/${id}`,
      source_hash: `sha256:${id}`,
      redacted_summary: summary,
    }],
    created_at: NOW,
  }));
}

async function writeOpenClawAuthCaptures(root: string): Promise<void> {
  await writeCapture(root, "capture_1", "Fixed OpenClaw auth expired by refreshing login. Verification passed after retrying memory sync. Reusable lesson: refresh login before retrying OpenClaw memory sync.");
  await writeCapture(root, "capture_2", "OpenClaw auth expired again; refreshing login fixed sync. Verification passed after retrying memory sync. Reusable lesson: refresh login before retrying OpenClaw memory sync.");
}

function semanticReview(overrides: Partial<SemanticWikiReview> = {}): SemanticWikiReview {
  return {
    type: "semantic_wiki_review",
    candidate_id: "ignored-by-normalizer",
    target_path: "ignored-by-normalizer",
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
    reviewed_at: NOW,
    ...overrides,
  };
}

function reviewClient(review: SemanticWikiReview | null, calls?: { count: number }): AiJsonClient {
  return {
    async generateJson() {
      if (calls) calls.count++;
      if (!review) return { ok: false, error: "semantic reviewer unavailable" };
      return { ok: true, json: review };
    },
  };
}

async function readWrittenProposals(root: string): Promise<Array<{
  review_hint: { suggested_decision: string; risk_notes: string[] };
  target_path: string;
}>> {
  const dir = join(root, ".praxisbase/inbox/proposals");
  const files = await readdir(dir);
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(join(dir, file), "utf8"))));
}

describe("curateWiki semantic review integration", () => {
  it("writes a proposal when semantic review promotes it", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-semantic-promote-"));
    await writeOpenClawAuthCaptures(root);

    const report = await curateWiki(root, {
      mode: "review",
      degraded: true,
      now: NOW,
      semanticReview: { enabled: true, client: reviewClient(semanticReview({ quality_score: 0.9 })) },
    });

    assert.equal(report.output_counts.written_proposals, 1);
    assert.equal(report.semantic_review?.enabled, true);
    assert.equal(report.semantic_review?.reviewed, 1);
    assert.equal(report.semantic_review?.promote, 1);

    const proposals = await readWrittenProposals(root);
    assert.equal(proposals.length, 1);
    assert.ok(proposals[0].review_hint.risk_notes.includes("semantic_review:promote"));
    assert.ok(proposals[0].review_hint.risk_notes.includes("semantic_score:0.9"));
  });

  it("does not write a proposal when semantic review rejects it", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-semantic-reject-"));
    await writeOpenClawAuthCaptures(root);

    const report = await curateWiki(root, {
      mode: "review",
      degraded: true,
      now: NOW,
      semanticReview: {
        enabled: true,
        client: reviewClient(semanticReview({
          decision: "reject",
          quality_score: 0.3,
          long_term_agent_value: false,
          is_actionable: false,
          is_reusable: false,
          fatal_issues: ["Run report summary without reusable guidance"],
          reason: "Status-like candidate, not durable wiki knowledge.",
        })),
      },
    });

    assert.equal(report.output_counts.curated_proposals, 0);
    assert.equal(report.output_counts.written_proposals, 0);
    assert.equal(report.semantic_review?.reviewed, 1);
    assert.equal(report.semantic_review?.reject, 1);
    await assert.rejects(() => stat(join(root, ".praxisbase/inbox/proposals")), { code: "ENOENT" });
  });

  it("writes a human-required proposal when semantic review is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-semantic-unavailable-"));
    await writeOpenClawAuthCaptures(root);

    const report = await curateWiki(root, {
      mode: "review",
      degraded: true,
      now: NOW,
      semanticReview: { enabled: true, client: reviewClient(null) },
    });

    assert.equal(report.output_counts.written_proposals, 1);
    assert.equal(report.semantic_review?.reviewed, 0);
    assert.equal(report.semantic_review?.unavailable, 1);
    assert.equal(report.semantic_review?.needs_human, 1);

    const proposals = await readWrittenProposals(root);
    assert.equal(proposals[0].review_hint.suggested_decision, "edit");
    assert.ok(proposals[0].review_hint.risk_notes.includes("semantic_review:unavailable"));
    assert.ok(proposals[0].review_hint.risk_notes.includes("semantic_review:needs_human"));
  });

  it("marks a semantic merge as human-required instead of auto-promoting a new page", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-semantic-merge-"));
    await writeOpenClawAuthCaptures(root);

    const report = await curateWiki(root, {
      mode: "review",
      degraded: true,
      now: NOW,
      semanticReview: {
        enabled: true,
        client: reviewClient(semanticReview({
          decision: "merge",
          should_merge_with: "kb/known-fixes/existing-openclaw-auth.md",
          reason: "Near-duplicate of existing page.",
        })),
      },
    });

    assert.equal(report.output_counts.written_proposals, 1);
    assert.equal(report.semantic_review?.merge, 1);

    const proposals = await readWrittenProposals(root);
    assert.equal(proposals[0].review_hint.suggested_decision, "edit");
    assert.ok(proposals[0].review_hint.risk_notes.includes("semantic_review:merge"));
  });

  it("skips semantic client calls for deterministic hard-blocked proposals", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-semantic-hard-block-"));
    await writeCapture(root, "capture_1", "Fixed OpenClaw auth expired by refreshing login.");
    const calls = { count: 0 };

    const report = await curateWiki(root, {
      mode: "review",
      degraded: true,
      now: NOW,
      semanticReview: { enabled: true, client: reviewClient(semanticReview(), calls) },
    });

    assert.equal(report.output_counts.curated_proposals, 0);
    assert.equal(report.semantic_review?.reviewed, 0);
    assert.equal(report.semantic_review?.unavailable, 0);
    assert.equal(calls.count, 0);
  });

  it("keeps semantic review disabled by default for backward compatibility", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-semantic-default-"));
    await writeOpenClawAuthCaptures(root);

    const report = await curateWiki(root, { mode: "review", degraded: true, now: NOW });

    assert.equal(report.output_counts.written_proposals, 1);
    assert.equal(report.semantic_review, undefined);
  });

  it("parses older curation reports without semantic_review", () => {
    const parsed = WikiCurationReportSchema.parse({
      id: "report-1",
      protocol_version: PROTOCOL_VERSION,
      type: "wiki_curation_report",
      created_at: NOW,
      mode: "dry-run",
      ai: { configured: true, mode: "production" },
      input_counts: { evidence_items: 1, filtered_noise: 0, human_required: 0, rejected: 0, clusters: 1 },
      output_counts: { curated_proposals: 1, written_proposals: 0, conflicts: 0 },
      proposals: [],
    });

    assert.equal(parsed.output_counts.curated_proposals, 1);
    assert.equal(parsed.semantic_review, undefined);
  });
});
