import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  WikiRootArtifactSchema,
  WikiSourceSummarySchema,
  WikiTypedRelationshipSchema,
  type WikiObservation,
} from "@praxisbase/core/wiki/curation-model.js";
import { writeJson } from "@praxisbase/core/store/file-store.js";
import { curateWiki } from "@praxisbase/core/wiki/curate.js";
import { buildWikiTopics } from "@praxisbase/core";

describe("wiki fidelity contract schemas", () => {
  it("accepts a source summary with provenance and topic contribution", () => {
    const parsed = WikiSourceSummarySchema.parse({
      id: "source-summary-1",
      type: "wiki_source_summary",
      source_id: "source-1",
      source_ref: "codex:session:1",
      source_hash: "sha256:abc",
      source_kind: "native_memory",
      scope: "personal",
      summary: "Codex verified that ACKs should be sent before long-running delegated work.",
      entities: ["Codex", "OpenClaw"],
      topics: ["ACK timing"],
      observation_ids: ["obs-1"],
      topic_keys: ["ack-timing::personal"],
      privacy_verdict: "safe",
      contributed_to_pages: ["kb/procedures/ack-timing-before-long-running-agent-work.md"],
      created_at: "2026-05-24T00:00:00.000Z",
    });
    assert.equal(parsed.type, "wiki_source_summary");
  });

  it("accepts root artifacts and typed relationships", () => {
    assert.equal(WikiRootArtifactSchema.parse({
      id: "wiki-root-index",
      type: "wiki_root_artifact",
      kind: "index",
      path: "dist/wiki/index.md",
      title: "Wiki Index",
      body_markdown: "# Wiki Index\n\n- [[ack-timing|ACK timing]]",
      generated_at: "2026-05-24T00:00:00.000Z",
    }).kind, "index");

    assert.equal(WikiTypedRelationshipSchema.parse({
      from: "wiki-ack-timing",
      to: "wiki-openclaw-operational-coordination",
      type: "depends_on",
      confidence: 0.88,
      source_refs: ["codex:session:1"],
    }).type, "depends_on");
  });
});

describe("wiki source summary curation", () => {
  it("writes source summaries for useful evidence without promoting them as guidance", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-fidelity-"));
    await writeJson(root, ".praxisbase/reports/memory/codex-1.json", {
      agent: "codex",
      kind: "memory",
      source_ref: "codex:session:1",
      source_hash: "sha256:abc",
      redacted_summary: "Codex verified that agents should send an ACK before long-running OpenClaw delegated work.",
      scope_hint: "personal",
      created_at: "2026-05-24T00:00:00.000Z",
    });

    const report = await curateWiki(root, {
      mode: "dry-run",
      degraded: true,
      now: "2026-05-24T00:00:00.000Z",
    });

    assert.ok(report.input_counts.evidence_items >= 1, `expected >= 1 evidence items, got ${report.input_counts.evidence_items}`);
    const sourceSummaryFiles = await import("node:fs/promises").then((fs) => fs.readdir(join(root, ".praxisbase/reports/wiki-source-summaries")));
    assert.ok(sourceSummaryFiles.length >= 1, `expected >= 1 source summary files, got ${sourceSummaryFiles.length}`);
    const summary = JSON.parse(await readFile(join(root, ".praxisbase/reports/wiki-source-summaries", sourceSummaryFiles[0]), "utf-8"));
    assert.equal(summary.type, "wiki_source_summary");
    assert.equal(summary.source_ref, "codex:session:1");
    assert.deepEqual(summary.contributed_to_pages, []);
  });
});

describe("wiki canonical topic clustering", () => {
  it("clusters by canonical entity problem action signature instead of title", () => {
    const base = {
      scope: "personal" as const,
      kind: "fix" as const,
      outcome: "success" as const,
      privacy_verdict: "safe" as const,
      filtered_out: false,
      confidence: 0.86,
      verification: "Verified by a successful incremental curation run.",
      reusable_lesson: "When model calls time out, keep distillation incremental with cache reuse.",
      entities: ["PraxisBase", "GLM"],
      topics: [],
    };
    const topics = buildWikiTopics([
      {
        ...base,
        id: "obs-1",
        evidence_id: "e1",
        source_ref: "codex:1",
        source_hash: "sha256:a",
        problem: "GLM curation request timed out while compiling wiki proposals",
        action: "Reduce AI batch size and reuse cached source summaries",
      },
      {
        ...base,
        id: "obs-2",
        evidence_id: "e2",
        source_ref: "openclaw:1",
        source_hash: "sha256:b",
        problem: "Wiki synthesis stalled because the model call exceeded the time limit",
        action: "Use smaller batches with cached source summaries before retrying synthesis",
      },
    ]);
    assert.equal(topics.length, 1);
    assert.equal(topics[0].source_count, 2);
  });
});
