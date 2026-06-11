import { mkdir, mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL_VERSION } from "@praxisbase/core";
import { wikiCommand } from "@praxisbase/cli/commands/wiki.js";

async function writeCapture(root: string): Promise<void> {
  await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
  await writeFile(join(root, ".praxisbase/outbox/captures/capture_1.json"), JSON.stringify({
    id: "capture_1",
    protocol_version: PROTOCOL_VERSION,
    type: "capture_record",
    agent: "codex",
    workspace: root,
    scope_hint: "personal",
    result: "success",
    triggers: ["task_finish"],
    signals: [],
    artifacts: [
      {
        kind: "transcript",
        source_ref: "raw-vault://codex/session-1",
        source_hash: "sha256:session1",
        redacted_summary: "Fixed OpenClaw auth expired by refreshing login. Verification passed after OpenClaw sync succeeded. Reusable lesson: refresh login before retrying OpenClaw sync when Claude auth expires.",
      },
    ],
    created_at: "2026-05-21T00:00:00.000Z",
  }));
}

async function writeSecondCapture(root: string): Promise<void> {
  await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
  await writeFile(join(root, ".praxisbase/outbox/captures/capture_2.json"), JSON.stringify({
    id: "capture_2",
    protocol_version: PROTOCOL_VERSION,
    type: "capture_record",
    agent: "codex",
    workspace: root,
    scope_hint: "personal",
    result: "success",
    triggers: ["task_finish"],
    signals: [],
    artifacts: [
      {
        kind: "transcript",
        source_ref: "raw-vault://codex/session-2",
        source_hash: "sha256:session2",
        redacted_summary: "Run PraxisBase daily with GLM thinking disabled for JSON output. Verification passed when the daily run returned parseable JSON. Reusable lesson: disable thinking for strict JSON generation jobs.",
      },
    ],
    created_at: "2026-05-21T00:01:00.000Z",
  }));
}

async function writeDuplicateStablePages(root: string): Promise<void> {
  await mkdir(join(root, "kb/known-fixes"), { recursive: true });
  const page = (id: string, title: string) => `---
id: ${id}
title: "${title}"
knowledge_type: known_fix
scope: personal
maturity: draft
sources:
  - uri: raw-vault://codex/session-1
    hash: sha256:session1
---
# ${title}

Existing OpenClaw auth repair page.
`;
  await writeFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), page("openclaw-auth-expired", "OpenClaw auth expired"), "utf8");
  await writeFile(join(root, "kb/known-fixes/openclaw-auth-refresh.md"), page("openclaw-auth-refresh", "OpenClaw auth refresh"), "utf8");
}

describe("wiki curate CLI", () => {
  it("dry-run writes report only", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-curate-"));
    await writeCapture(root);

    const output = await wikiCommand(root, "curate", { dryRun: true, degraded: true, json: true });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.type, "wiki_curation_report");
    assert.equal(parsed.report.mode, "dry-run");
    await assert.rejects(() => stat(join(root, ".praxisbase/inbox/proposals")), { code: "ENOENT" });
  });

  it("review writes curated proposal records", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-curate-"));
    await writeCapture(root);

    const output = await wikiCommand(root, "curate", { review: true, degraded: true, json: true });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.output_counts.written_proposals, 1);
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposalFiles.length, 1);
  });

  it("honors minSourceCount before writing curated proposal records", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-curate-min-source-"));
    await writeCapture(root);

    const output = await wikiCommand(root, "curate", {
      review: true,
      degraded: true,
      minSourceCount: 2,
      json: true,
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.output_counts.written_proposals, 0);
    await assert.rejects(() => stat(join(root, ".praxisbase/inbox/proposals")), { code: "ENOENT" });
  });

  it("limits curated proposal synthesis when --limit is provided", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-curate-limit-"));
    await writeCapture(root);
    await writeSecondCapture(root);

    const output = await wikiCommand(root, "curate", {
      review: true,
      degraded: true,
      limit: 1,
      json: true,
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.output_counts.written_proposals, 1);
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposalFiles.length, 1);
  });

  it("report includes relationship_counts when evidence produces relationships", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-curate-relationships-"));
    await writeCapture(root);
    await writeDuplicateStablePages(root);

    const output = await wikiCommand(root, "curate", { dryRun: true, degraded: true, json: true });
    const parsed = JSON.parse(output);
    const counts = parsed.report.compiler_counts.relationship_counts;

    assert.equal(parsed.ok, true);
    assert.equal(counts.required_links, 0);
    assert.equal(counts.suggested_links, 0);
    assert.equal(counts.merge_plans, 1);
    assert.equal(counts.ambiguous_merge_targets, 1);
    assert.equal(counts.isolated_topics, 0);
    assert.equal(counts.orphan_risk_after_plan, 0);
  });

  it("enables semantic review with semanticReview option", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-curate-semantic-"));
    await writeCapture(root);
    await writeSecondCapture(root);

    const output = await wikiCommand(root, "curate", {
      review: true,
      degraded: true,
      semanticReview: true,
      json: true,
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.semantic_review?.enabled, true);
  });

  it("keeps semantic review disabled by default for backward compatibility", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-curate-no-semantic-"));
    await writeCapture(root);

    const output = await wikiCommand(root, "curate", { review: true, degraded: true, json: true });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.semantic_review, undefined);
  });
});
