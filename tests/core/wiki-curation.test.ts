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
    assert.match(knowledge.patch.content, /^---\n/);
    assert.match(knowledge.patch.content, /title: "OpenClaw auth expired recovery"/);
    assert.match(knowledge.patch.content, /knowledge_type: known_fix/);
    assert.match(knowledge.patch.content, /sources:\n  - uri: "codex:session:1"\n    hash: "sha256:a"/);
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
      source("sleep-summary", "Deep Sleep Memory Consolidation Procedure", "The agent rewrites the recall store and promoted 0 candidates to MEMORY.md."),
      {
        ...source("official-doc", "OpenClaw Official API Reference", "Official documentation for OpenClaw memory APIs."),
        kind: "external_ref",
        source_ref: "https://docs.openclaw.example/memory-api",
      },
      source("boot-config", "Codex Desktop CLI v0.118.0 Session Boot Configuration", "Session initialization metadata with sandbox mode, model provider, approval policy, and skill registry. No task execution occurred."),
      source("boot-policy", "Codex Desktop CLI Session Boot Policy", "Session boot metadata says agents must run verification and should use rg. This is startup policy, not task experience."),
      source("codex-init", "Codex Desktop agent session initialization", "Suggested Wiki Kind: note\nSummary: Codex Desktop agent session initialization containing base instructions, personality configuration, engineering judgment guidelines, frontend design rules, editing constraints, sandbox mode, approval policy, and skill registry."),
      source("codex-best-practices", "Codex Agent Initialization and Best Practices", "A Codex agent was initialized with base instructions, filesystem sandbox, approval policy, collaboration mode, tool usage policies, and editing constraints. Decisions & Guidelines: context compaction and testing standards. Reusable Lessons: prefer rg, use apply_patch, and avoid noisy shell output."),
      source("codex-session-config", "capture_codex-sha256-dddf570b3320ae46", "Suggested Wiki Kind: note\nConfidence: 0.99\nSummary: System configuration and base instructions for a Codex CLI agent session running on a workspace named OctoClaw. Includes behavioral guidelines, tool usage policies, and collaboration mode settings.\n\n## Problem\n- N/A - Initializing agent session environment.\n\n## Context\n- {\"environment\":\"Codex CLI v0.118.0\",\"cwd\":\"/Users/guanbear/workspace/OctoClaw\",\"sandbox_mode\":\"danger-full-access\",\"approval_policy\":\"never\",\"collaboration_mode\":\"Default\"}\n\n## Actions\n- Parsed session metadata and system instructions.\n- Extracted file system permissions, network access, and approval policies.\n- Identified available tools and their operational constraints.\n\n## Verification\n- System instructions, boundaries, and available skills successfully extracted and configured for the session without errors.\n\n## Reusable Lessons\n- In Default collaboration mode, avoid stopping to ask the user questions.\n- Use `apply_patch` exclusively for file edits.\n- When approval policy is never, proactively run tests and formatting.\n- Always reference files using workspace-relative paths; do not use file:// URIs.\n\n## Risks\n- Running in danger-full-access sandbox mode allows unrestricted file system and network access."),
      source("reflection-theme", "OpenClaw Reflection Theme", "Candidate: Reflections: Theme: `assistant` kept surfacing across 959 memories; recalls: 0; note: reflection."),
      source("promotion-bookkeeping", "Promoted From Short-Term Memory", "## Promoted From Short-Term Memory (2026-04-26) <!-- openclaw-memory-promotion:memory:memory/2026-04-20.md:238:241 -->"),
    ]);

    assert.deepEqual(pool.items.map((item) => item.id), ["good"]);
    assert.equal(pool.filtered_noise, 13);
  });

  it("keeps only evidence with useful experience signals", () => {
    const pool = buildWikiEvidencePool([
      source("preference", "OpenClaw ACK timing", "User preference: for any dispatch or tool task taking more than a few seconds, send a short ACK first, then continue and verify final delivery."),
      source("weak", "Codex startup", "The session loaded the model, sandbox mode, tools, and available skills."),
    ]);

    assert.deepEqual(pool.items.map((item) => item.id), ["preference"]);
    assert.equal(pool.filtered_noise, 1);
    assert.ok(pool.items[0].reusable_lessons.some((lesson) => /ACK/i.test(lesson)));
  });

  it("strips curation headings from evidence summaries before building wiki bodies", () => {
    const pool = buildWikiEvidencePool([
      source(
        "distilled-summary",
        "OpenClaw Slack delegated work acceptance",
        [
          "Summary: Delegated work acceptance passed after polling the final assertion.",
          "## Problem",
          "- Slack delegated work must emit ACK and final assertion messages.",
          "## Verification",
          "- Replay gate passed after 34 matching events.",
          "Confidence: 0.9",
        ].join("\n"),
      ),
    ]);

    assert.equal(pool.items.length, 1);
    assert.doesNotMatch(pool.items[0].summary, /^##/m);
    assert.doesNotMatch(pool.items[0].summary, /^Confidence:/m);
    assert.match(pool.items[0].summary, /Delegated work acceptance passed/);
  });

  it("normalizes OpenClaw promotion bookkeeping out of memory summaries", () => {
    const pool = buildWikiEvidencePool([
      source(
        "openclaw-memory",
        "OpenClaw ACK timing",
        "- - 17:30 guanbear 提醒：文档更新，新增 QF-5 ACK timing 调整。 [score=0.817 recalls=0 avg=0.620 source=memory/2026-04-29.md:2-2] ## Promoted From Short-Term Memory (2026-05-06) <!-- openclaw-memory-promotion:memory:memory/2026-04-30.md:2:2 --> - - 06:27 guanbear 反馈：OpenClaw 查询类任务回复慢，且没有先 ACK；以后需要工具、联网或超过几秒的任务应先发 ACK，再补结果。 [score=0.817 recalls=0 avg=0.620 source=memory/2026-04-30.md:2-2]",
      ),
    ]);

    assert.equal(pool.items.length, 1);
    assert.doesNotMatch(pool.items[0].summary, /score=|Promoted From Short-Term Memory|openclaw-memory-promotion/);
    assert.match(pool.items[0].summary, /先发 ACK/);
  });

  it("keeps doc-backed evidence when the user experience is concrete", () => {
    const pool = buildWikiEvidencePool([
      {
        ...source("doc-backed", "OpenClaw docs mismatch workaround", "Official docs said retry memory sync, but the agent fixed the failure by refreshing login first. pnpm check passed. Lesson: use refreshed auth before retrying sync."),
        kind: "external_ref",
        source_ref: "https://docs.openclaw.example/memory-api",
      },
      {
        ...source("reference-only", "OpenClaw Official API Reference", "Official documentation for OpenClaw memory APIs."),
        kind: "external_ref",
        source_ref: "https://docs.openclaw.example/memory-api",
      },
    ]);

    assert.deepEqual(pool.items.map((item) => item.id), ["doc-backed"]);
    assert.equal(pool.filtered_noise, 1);
  });

  it("keeps Codex initialization captures when they contain concrete user experience", () => {
    const pool = buildWikiEvidencePool([
      source(
        "codex-init-experience",
        "Codex Desktop agent session initialization",
        "Codex Desktop agent session initialization mentioned base instructions and sandbox mode. User preference: send ACK before long OpenClaw work, then continue and verify delivery. This was verified in the Slack delegated work acceptance test.",
      ),
    ]);

    assert.deepEqual(pool.items.map((item) => item.id), ["codex-init-experience"]);
    assert.equal(pool.filtered_noise, 0);
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
    assert.deepEqual(proposal.guards.map((guard: { id: string }) => guard.id), [
      "path",
      "privacy",
      "provenance",
      "experience_signal",
      "actionability",
      "verification_or_lesson",
      "not_reference_only",
    ]);
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

  it("applies local filter rules before curation", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-filter-rules-"));
    await writeCapture(root, "capture_1", "Fixed OpenClaw auth expired by refreshing login.");
    await mkdir(join(root, ".praxisbase"), { recursive: true });
    await writeFile(join(root, ".praxisbase/filter-rules.yaml"), [
      "rules:",
      "  - id: exclude-auth-refresh",
      "    action: exclude",
      "    when:",
      "      agent: codex",
      "      contains_any:",
      "        - auth expired",
    ].join("\n"), "utf8");

    const report = await curateWiki(root, { mode: "dry-run", degraded: true, now: "2026-05-21T00:00:00.000Z" });

    assert.equal(report.input_counts.evidence_items, 0);
    assert.equal(report.input_counts.filtered_noise, 1);
    assert.equal(report.output_counts.curated_proposals, 0);
  });
});
