import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROTOCOL_VERSION,
  CuratedWikiProposalSchema,
  buildWikiEvidencePool,
  clusterWikiEvidence,
  curatedWikiProposalToKnowledgeProposal,
} from "@praxisbase/core";
import { curateWiki } from "@praxisbase/core/wiki/curate.js";
import type { WikiSource } from "@praxisbase/core/wiki/model.js";
import type { WikiEvidenceItem } from "@praxisbase/core/wiki/curation-model.js";

function source(id: string, title: string, summary: string): WikiSource {
  return {
    id,
    kind: "capture",
    source_ref: `raw-vault://codex/${id}`,
    source_hash: `sha256:${id}`,
    title,
    summary,
    scope: "project",
  };
}

function evidence(id: string, overrides: Partial<WikiEvidenceItem> = {}): WikiEvidenceItem {
  return {
    id,
    kind: "distilled_experience",
    source_ref: `source:${id}`,
    source_hash: `sha256:${id}`,
    agent: "codex",
    scope: "personal",
    title: "OpenClaw auth expired",
    summary: "OpenClaw auth expired and refreshing login fixed memory sync.",
    actions: ["Refresh OpenClaw login"],
    failed_attempts: [],
    outcome: "success",
    verification: ["Retry memory sync"],
    reusable_lessons: ["Refresh login before retrying OpenClaw memory sync"],
    signatures: ["openclaw:auth-expired"],
    suggested_wiki_kind: "known_fix",
    privacy_verdict: "safe",
    ...overrides,
  };
}

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
    artifacts: [
      {
        kind: "transcript",
        source_ref: `raw-vault://codex/${id}`,
        source_hash: `sha256:${id}`,
        redacted_summary: summary,
      },
    ],
    created_at: "2026-05-21T00:00:00.000Z",
  }));
}

describe("wiki curation model", () => {
  it("validates curated proposals with multi-source provenance", () => {
    const proposal = CuratedWikiProposalSchema.parse({
      id: "wiki-curated-openclaw-auth",
      protocol_version: PROTOCOL_VERSION,
      type: "wiki_curated_proposal",
      target_path: "kb/known-fixes/openclaw-auth-expired.md",
      action: "create",
      page_kind: "known_fix",
      scope: "personal",
      title: "OpenClaw auth expired recovery",
      summary: "Refresh OpenClaw login before retrying memory sync.",
      body_markdown: "# OpenClaw auth expired recovery\n\n## Problem\nMemory sync fails after auth expiry.",
      source_refs: ["codex:session:1", "openclaw:memory:2"],
      source_hashes: ["sha256:a", "sha256:b"],
      source_count: 2,
      evidence_ids: ["ev_1", "ev_2"],
      confidence: 0.9,
      maturity: "draft",
      provenance: [
        { source_ref: "codex:session:1", source_hash: "sha256:a" },
        { source_ref: "openclaw:memory:2", source_hash: "sha256:b" },
      ],
      review_hint: { why_review: "Repeated successful repair", suggested_decision: "approve", risk_notes: [] },
      guards: [{ id: "path", ok: true, message: "allowed" }],
      created_at: "2026-05-21T00:00:00.000Z",
    });

    assert.equal(proposal.source_count, 2);
    assert.deepEqual(proposal.source_hashes, ["sha256:a", "sha256:b"]);
  });

  it("converts curated proposals to existing knowledge proposals", () => {
    const knowledge = curatedWikiProposalToKnowledgeProposal({
      id: "wiki-curated-openclaw-auth",
      protocol_version: PROTOCOL_VERSION,
      type: "wiki_curated_proposal",
      target_path: "kb/known-fixes/openclaw-auth-expired.md",
      action: "create",
      page_kind: "known_fix",
      scope: "personal",
      title: "OpenClaw auth expired recovery",
      summary: "Refresh OpenClaw login before retrying memory sync.",
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
    });

    assert.equal(knowledge.type, "knowledge_proposal");
    assert.equal(knowledge.target_type, "known_fix");
    assert.equal(knowledge.patch.path, "kb/known-fixes/openclaw-auth-expired.md");
    assert.deepEqual(knowledge.evidence.source_refs, [{ uri: "codex:session:1", hash: "sha256:a" }]);
  });
});

describe("wiki evidence curation", () => {
  it("suppresses operational noise before review", () => {
    const pool = buildWikiEvidencePool([
      source("good", "OpenClaw auth expired", "Refresh login fixed OpenClaw auth expired memory sync."),
      source("meta", "meta", "{\"type\":\"session_meta\"}"),
      source("instructions", "instructions", "{\"base_instructions\":\"never include\"}"),
      source("unknown", "unknown", "openclaw:unknown"),
      source("sleep", "Deep Sleep", "# Deep Sleep\nPromoted 0 candidate(s)"),
    ]);

    assert.deepEqual(pool.items.map((item) => item.id), ["good"]);
    assert.equal(pool.filtered_noise, 4);
  });

  it("clusters repeated source evidence into one proposal input", () => {
    const clusters = clusterWikiEvidence([
      evidence("ev1", { title: "OpenClaw auth expired", source_ref: "codex:1", source_hash: "sha256:1" }),
      evidence("ev2", { title: "OpenClaw login expired", source_ref: "openclaw:2", source_hash: "sha256:2" }),
    ]);

    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].source_count, 2);
    assert.deepEqual(clusters[0].source_refs.sort(), ["codex:1", "openclaw:2"]);
    assert.deepEqual(clusters[0].source_hashes.sort(), ["sha256:1", "sha256:2"]);
  });

  it("curate dry-run writes report only", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-curate-"));
    await writeCapture(root, "capture_1", "Fixed OpenClaw auth expired by refreshing login.");

    const report = await curateWiki(root, { mode: "dry-run", degraded: true, now: "2026-05-21T00:00:00.000Z" });

    assert.equal(report.type, "wiki_curation_report");
    assert.equal(report.mode, "dry-run");
    assert.equal(report.output_counts.curated_proposals, 1);
    await assert.rejects(() => stat(join(root, ".praxisbase/inbox/proposals")), { code: "ENOENT" });
    const reports = await readdir(join(root, ".praxisbase/reports/wiki-curation"));
    assert.equal(reports.length, 1);
  });

  it("curate review writes curated proposals without stable knowledge", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-curate-"));
    await writeCapture(root, "capture_1", "Fixed OpenClaw auth expired by refreshing login.");
    await writeCapture(root, "capture_2", "OpenClaw auth expired again; refreshing login fixed sync.");

    const report = await curateWiki(root, { mode: "review", degraded: true, now: "2026-05-21T00:00:00.000Z" });

    assert.equal(report.output_counts.written_proposals, 1);
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposalFiles.length, 1);
    const proposal = JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", proposalFiles[0]), "utf8"));
    assert.equal(proposal.type, "wiki_curated_proposal");
    assert.equal(proposal.source_count, 2);
    assert.equal(proposal.target_path, "kb/known-fixes/openclaw-auth-expired.md");
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
  });

  it("can require multiple sources before writing curated proposals", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-curate-min-source-"));
    await writeCapture(root, "capture_1", "Fixed OpenClaw auth expired by refreshing login.");

    const report = await curateWiki(root, {
      mode: "review",
      degraded: true,
      minSourceCount: 2,
      now: "2026-05-21T00:00:00.000Z",
    });

    assert.equal(report.input_counts.clusters, 1);
    assert.equal(report.output_counts.curated_proposals, 0);
    assert.equal(report.output_counts.written_proposals, 0);
    await assert.rejects(() => stat(join(root, ".praxisbase/inbox/proposals")), { code: "ENOENT" });
  });
});
