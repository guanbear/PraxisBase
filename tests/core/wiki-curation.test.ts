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
import { buildWikiObservationsFromEvidence } from "@praxisbase/core/wiki/curate.js";
import type { WikiSource } from "@praxisbase/core/wiki/model.js";
import type { WikiEvidenceItem, WikiObservation } from "@praxisbase/core/wiki/curation-model.js";

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

  it("does not treat existing stable wiki pages as fresh curation evidence", () => {
    const pool = buildWikiEvidencePool([
      {
        ...source(
          "stable-kb-ack",
          "OpenClaw ACK timing",
          "# OpenClaw ACK timing\n\n## Problem\nLong delegated work needs an ACK first.\n\n## Fix\nSend a short ACK before tools or dispatch.\n\n## Verification\nDelegated work acceptance passed.\n\n## Reusable Lessons\nACK before long work.\n\n## Provenance\n- raw-vault://openclaw/ack (sha256:ack)",
        ),
        kind: "stable_kb",
        path: "kb/known-fixes/openclaw-ack-timing.md",
        knowledge_type: "known_fix",
      },
      source(
        "fresh-ack",
        "OpenClaw ACK timing follow-up",
        "User reported OpenClaw delegated work still felt slow. Action: send a short ACK before dispatch. Verification passed in delegated work acceptance. Reusable lesson: ACK before long OpenClaw work.",
      ),
    ]);

    assert.deepEqual(pool.items.map((item) => item.id), ["fresh-ack"]);
    assert.equal(pool.filtered_noise, 1);
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
    await writeCapture(root, "capture_1", "Fixed OpenClaw auth expired by refreshing login. Verification passed after retrying memory sync. Reusable lesson: refresh login before retrying OpenClaw memory sync.");

    const report = await curateWiki(root, { mode: "dry-run", degraded: true, now: "2026-05-21T00:00:00.000Z" });

    assert.equal(report.type, "wiki_curation_report");
    assert.equal(report.mode, "dry-run");
    assert.equal(report.output_counts.curated_proposals, 1);
    await assert.rejects(() => stat(join(root, ".praxisbase/inbox/proposals")), { code: "ENOENT" });
    const reports = await readdir(join(root, ".praxisbase/reports/wiki-curation"));
    assert.equal(reports.length, 1);
  });

  it("dry-run report includes compiler_counts with nonzero observations, topics, and page plans", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-compiler-counts-"));
    await writeCapture(root, "capture_1", "Fixed OpenClaw auth expired by refreshing login. Verification passed after retrying memory sync. Reusable lesson: refresh login before retrying OpenClaw memory sync.");
    await writeCapture(root, "capture_2", "OpenClaw auth expired again; refreshing login fixed sync. Verification passed after retrying memory sync. Reusable lesson: refresh login before retrying OpenClaw memory sync.");

    const report = await curateWiki(root, { mode: "dry-run", degraded: true, now: "2026-05-21T00:00:00.000Z" });

    assert.ok(report.compiler_counts, "report should include compiler_counts");
    assert.equal(report.compiler_counts.observations, 2, "observations should be nonzero");
    assert.equal(report.compiler_counts.topics, 1, "topics should be nonzero (both evidence share same topic)");
    const plans = report.compiler_counts.page_plans_by_action;
    assert.ok(plans, "page_plans_by_action should be present");
    const totalPlans = plans.create + plans.update + plans.merge + plans.supersede + plans.archive;
    assert.ok(totalPlans > 0, "at least one page plan should exist");
    assert.equal(report.compiler_counts.hard_blocks, 0, "hard_blocks should be 0 for this phase");
    assert.equal(report.compiler_counts.human_required_quality, 0, "human_required_quality should be 0 for this phase");

    assert.equal(report.output_counts.curated_proposals, 1, "existing proposal count should be unchanged");
    assert.equal(report.output_counts.written_proposals, 0, "dry-run should write 0 proposals");
  });

  it("compiler_counts page_plans_by_action sums match page plan count", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-plan-actions-"));
    await writeCapture(root, "capture_ack1", "ACK timing: send short ACK before long tasks. Verification passed in delegated work acceptance test. Reusable lesson: send ACK before long delegated work.");
    await writeCapture(root, "capture_ack2", "ACK timing: user preference to ACK first for long OpenClaw work. Verification passed in delegated work acceptance test. Reusable lesson: send ACK before long delegated work.");
    await writeCapture(root, "capture_auth", "Fixed OpenClaw auth expired by refreshing login. Verification passed after retrying memory sync. Reusable lesson: refresh login before retrying OpenClaw memory sync.");

    const report = await curateWiki(root, { mode: "dry-run", degraded: true, now: "2026-05-21T00:00:00.000Z" });

    const cc = report.compiler_counts!;
    assert.ok(cc.observations >= 3, "should have at least 3 observations");
    assert.ok(cc.topics >= 1, "should have at least 1 topic");
    const plans = cc.page_plans_by_action;
    const totalActions = plans.create + plans.update + plans.merge + plans.supersede + plans.archive;
    assert.equal(totalActions, cc.topics, "page plan action counts should sum to topic count");
    assert.ok(plans.create > 0, "should have at least one create plan");
  });

  it("quality gate blocks degraded template fallback proposals before review writes them", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-quality-block-"));
    await writeCapture(root, "capture_1", "Fixed OpenClaw auth expired by refreshing login.");

    const report = await curateWiki(root, { mode: "review", degraded: true, now: "2026-05-21T00:00:00.000Z" });

    assert.equal(report.compiler_counts?.hard_blocks, 1);
    assert.equal(report.output_counts.curated_proposals, 0);
    assert.equal(report.output_counts.written_proposals, 0);
    await assert.rejects(() => stat(join(root, ".praxisbase/inbox/proposals")), { code: "ENOENT" });
  });

  it("curate review writes curated proposals without stable knowledge", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-curate-"));
    await writeCapture(root, "capture_1", "Fixed OpenClaw auth expired by refreshing login. Verification passed after retrying memory sync. Reusable lesson: refresh login before retrying OpenClaw memory sync.");
    await writeCapture(root, "capture_2", "OpenClaw auth expired again; refreshing login fixed sync. Verification passed after retrying memory sync. Reusable lesson: refresh login before retrying OpenClaw memory sync.");

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

  it("adds suggested links between new planned pages that share entities", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-planned-links-"));
    await writeCapture(root, "capture_ack", "OpenClaw delegated work felt silent. Action: send a short ACK before dispatch. Verification passed in delegated work acceptance. Reusable lesson: ACK before long OpenClaw work.");
    await writeCapture(root, "capture_ack_2", "Long OpenClaw dispatch appeared silent again. Action: send ACK before background dispatch. Verification passed after the delegated work completed. Reusable lesson: ACK before long OpenClaw work.");
    await writeCapture(root, "capture_runner", "OpenClaw task runner was missing when checking hanging tasks. Action: verify task runner presence before debugging dispatch. Verification passed after runner status check. Reusable lesson: verify runner presence first.");
    await writeCapture(root, "capture_runner_2", "OpenClaw hanging task investigation found runner status missing. Action: verify task runner presence before dispatch debugging. Verification passed after runner status check. Reusable lesson: verify runner presence first.");
    await writeCapture(root, "capture_one_off", "OpenClaw one-off acceptance run had a dispatch warning. Action: record the warning for later review.");

    const report = await curateWiki(root, { mode: "review", degraded: true, now: "2026-05-21T00:00:00.000Z" });

    assert.ok((report.compiler_counts?.relationship_counts.suggested_links ?? 0) > 0);
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    const proposals = await Promise.all(proposalFiles.map(async (file) =>
      JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", file), "utf8")),
    ));
    assert.ok(proposals.some((proposal) => proposal.suggested_links?.length > 0));
    assert.ok(proposals.some((proposal) => /\[\[[^\]]+\]\]/.test(proposal.body_markdown)));
    assert.equal(
      proposals.some((proposal) =>
        proposal.suggested_links?.some((link: { path: string }) => link.path.includes("one-off-acceptance-run")),
      ),
      false,
    );
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

  it("deduplicates same-run proposals that target the same stable path", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-dedup-target-"));
    await writeCapture(root, "capture_ack_1", "ACK timing was slow. Action: send a short ACK before long dispatch. Verification passed. Reusable lesson: ACK before long OpenClaw work.");
    await writeCapture(root, "capture_ack_2", "OpenClaw dispatch looked silent. Action: send ACK before long dispatch. Verification passed. Reusable lesson: ACK before long OpenClaw work.");
    await writeCapture(root, "capture_auth_1", "OpenClaw auth expired. Action: refresh login. Verification passed. Reusable lesson: refresh login before retrying sync.");

    const duplicateTarget = "kb/known-fixes/shared-operator-guidance.md";
    const report = await curateWiki(root, {
      mode: "review",
      now: "2026-05-23T00:00:00.000Z",
      aiClient: {
        async generateJson(args: { user: string }) {
          const user = JSON.parse(args.user) as { compiler_context?: { topic_title?: string } };
          const topicTitle = user.compiler_context?.topic_title ?? "";
          const isAck = /ack/i.test(topicTitle);
          return {
            ok: true,
            json: {
              title: isAck ? "ACK timing before long-running agent work" : "OpenClaw auth expired recovery",
              summary: isAck ? "Send ACK before long dispatch work." : "Refresh login before retrying sync.",
              page_kind: "known_fix",
              target_path: duplicateTarget,
              body_markdown: [
                `# ${isAck ? "ACK timing before long-running agent work" : "OpenClaw auth expired recovery"}`,
                "",
                "## Problem",
                isAck ? "Long OpenClaw dispatch work can look silent." : "OpenClaw auth expiry can break sync.",
                "",
                "## Fix",
                isAck ? "Send a short ACK before dispatch." : "Refresh login before retrying sync.",
                "",
                "## Verification",
                "Verification passed.",
                "",
                "## Reusable Lessons",
                isAck ? "ACK before long OpenClaw work." : "Refresh login before sync retry.",
                "",
                "## Provenance",
                "Added by test AI.",
              ].join("\n"),
              confidence: isAck ? 0.93 : 0.83,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(report.output_counts.written_proposals, 1);
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposalFiles.length, 1);
    const proposal = JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", proposalFiles[0]), "utf8"));
    assert.equal(proposal.target_path, duplicateTarget);
    assert.equal(proposal.title, "ACK timing before long-running agent work");
    assert.equal(proposal.source_count, 2);
  });

  it("replaces stale pending proposals that target the same stable path", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-replace-stale-target-"));
    const targetPath = "kb/known-fixes/openclaw-auth-expired.md";
    const unrelatedPath = "kb/known-fixes/unrelated-openclaw-fix.md";
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await writeFile(join(root, ".praxisbase/inbox/proposals/wiki-curated-stale.json"), JSON.stringify({
      id: "wiki-curated-stale",
      protocol_version: PROTOCOL_VERSION,
      type: "wiki_curated_proposal",
      target_path: targetPath,
      action: "create",
      page_kind: "known_fix",
      scope: "personal",
      title: "Stale OpenClaw auth proposal",
      summary: "Old stale proposal.",
      body_markdown: "# Stale\n\n## Problem\nOld.",
      source_refs: ["old:source"],
      source_hashes: ["sha256:old"],
      source_count: 1,
      evidence_ids: ["old"],
      confidence: 0.66,
      maturity: "draft",
      provenance: [{ source_ref: "old:source", source_hash: "sha256:old" }],
      review_hint: { why_review: "Old", suggested_decision: "edit", risk_notes: [] },
      guards: [{ id: "path", ok: true, message: "allowed" }],
      created_at: "2026-05-20T00:00:00.000Z",
    }), "utf8");
    await writeFile(join(root, ".praxisbase/inbox/proposals/wiki-curated-unrelated.json"), JSON.stringify({
      id: "wiki-curated-unrelated",
      protocol_version: PROTOCOL_VERSION,
      type: "wiki_curated_proposal",
      target_path: unrelatedPath,
      action: "create",
      page_kind: "known_fix",
      scope: "personal",
      title: "Unrelated OpenClaw fix",
      summary: "Unrelated proposal must remain.",
      body_markdown: "# Unrelated\n\n## Problem\nOld.",
      source_refs: ["unrelated:source"],
      source_hashes: ["sha256:unrelated"],
      source_count: 1,
      evidence_ids: ["unrelated"],
      confidence: 0.66,
      maturity: "draft",
      provenance: [{ source_ref: "unrelated:source", source_hash: "sha256:unrelated" }],
      review_hint: { why_review: "Unrelated", suggested_decision: "edit", risk_notes: [] },
      guards: [{ id: "path", ok: true, message: "allowed" }],
      created_at: "2026-05-20T00:00:00.000Z",
    }), "utf8");
    await writeFile(join(root, ".praxisbase/inbox/proposals/manual-note.json"), JSON.stringify({
      id: "manual-note",
      type: "manual_review_note",
      target_path: targetPath,
    }), "utf8");
    await writeFile(join(root, ".praxisbase/inbox/proposals/malformed.json"), "{not-json", "utf8");
    await writeCapture(root, "capture_1", "Fixed OpenClaw auth expired by refreshing login. Verification passed after retrying memory sync. Reusable lesson: refresh login before retrying OpenClaw memory sync.");
    await writeCapture(root, "capture_2", "OpenClaw auth expired again; refreshing login fixed sync. Verification passed after retrying memory sync. Reusable lesson: refresh login before retrying OpenClaw memory sync.");

    const report = await curateWiki(root, { mode: "review", degraded: true, now: "2026-05-23T00:00:00.000Z" });

    assert.equal(report.output_counts.written_proposals, 1);
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposalFiles.includes("wiki-curated-stale.json"), false);
    assert.equal(proposalFiles.includes("wiki-curated-unrelated.json"), true);
    assert.equal(proposalFiles.includes("manual-note.json"), true);
    assert.equal(proposalFiles.includes("malformed.json"), true);
    const currentFiles = proposalFiles.filter((file) => !["wiki-curated-unrelated.json", "manual-note.json", "malformed.json"].includes(file));
    assert.equal(currentFiles.length, 1);
    const proposal = JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", currentFiles[0]), "utf8"));
    assert.equal(proposal.target_path, targetPath);
    assert.match(proposal.title, /OpenClaw auth expired/i);
    assert.notEqual(proposal.id, "wiki-curated-stale");
  });
});

describe("wiki observation extraction", () => {
  it("yields no observations from noise-only evidence pool", () => {
    const pool = buildWikiEvidencePool([
      source("meta", "meta", "{\"type\":\"session_meta\"}"),
      source("instructions", "instructions", "{\"base_instructions\":\"never include\"}"),
      source("unknown", "unknown", "openclaw:unknown"),
      source("sleep", "Deep Sleep", "# Deep Sleep\nPromoted 0 candidate(s)"),
      source("sleep-summary", "Deep Sleep Memory Consolidation Procedure", "The agent rewrites the recall store and promoted 0 candidates to MEMORY.md."),
      source("boot-config", "Codex Desktop CLI v0.118.0 Session Boot Configuration", "Session initialization metadata with sandbox mode, model provider, approval policy, and skill registry. No task execution occurred."),
      source("reflection-theme", "OpenClaw Reflection Theme", "Candidate: Reflections: Theme: `assistant` kept surfacing across 959 memories; recalls: 0; note: reflection."),
      source("promotion-bookkeeping", "Promoted From Short-Term Memory", "## Promoted From Short-Term Memory (2026-04-26) <!-- openclaw-memory-promotion:memory:memory/2026-04-20.md:238:241 -->"),
    ]);

    const observations = buildWikiObservationsFromEvidence(pool.items);
    assert.equal(observations.length, 0);
  });

  it("maps useful evidence to observations with correct kind and provenance", () => {
    const items: WikiEvidenceItem[] = [
      evidence("ack-timing", {
        title: "OpenClaw ACK timing",
        summary: "User preference: for any dispatch or tool task taking more than a few seconds, send a short ACK first.",
        actions: ["Send ACK before long tasks"],
        verification: ["Delegated work acceptance test passed"],
        reusable_lessons: ["Always ACK before long OpenClaw work"],
        signatures: ["ack-timing"],
        suggested_wiki_kind: "preference",
        outcome: "success",
      }),
      evidence("openclaw-auth", {
        title: "OpenClaw auth expired",
        summary: "OpenClaw auth expired and refreshing login fixed memory sync.",
        actions: ["Refresh OpenClaw login"],
        verification: ["Memory sync succeeded after refresh"],
        reusable_lessons: ["Refresh login before retrying OpenClaw memory sync"],
        signatures: ["openclaw:auth-expired"],
        suggested_wiki_kind: "known_fix",
        outcome: "success",
      }),
      evidence("stdin-closed", {
        title: "stdin closed during long operation",
        summary: "stdin was closed while the agent was running a long operation, causing unexpected termination.",
        actions: ["Handle stdin close gracefully"],
        verification: [],
        reusable_lessons: [],
        signatures: ["stdin-closed"],
        suggested_wiki_kind: "pitfall",
        outcome: "failed",
      }),
      evidence("codex-pref", {
        title: "Codex prefers rg over grep",
        summary: "Codex agent preference: use rg instead of grep for code search.",
        actions: ["Use rg for code search"],
        verification: [],
        reusable_lessons: [],
        signatures: [],
        suggested_wiki_kind: "preference",
        agent: "codex",
        outcome: "unknown",
      }),
      evidence("verified-fix", {
        title: "OpenClaw sync fix verified",
        summary: "Fixed OpenClaw memory sync by refreshing auth token. pnpm check passed.",
        actions: ["Refresh auth token", "Run pnpm check"],
        verification: ["pnpm check passed", "Memory sync working"],
        reusable_lessons: ["Always refresh auth before sync operations"],
        signatures: ["openclaw:auth-expired"],
        suggested_wiki_kind: "known_fix",
        outcome: "success",
      }),
    ];

    const observations = buildWikiObservationsFromEvidence(items);
    assert.equal(observations.length, 5);

    // ACK timing → preference, provenance preserved
    const ack = observations.find((o: WikiObservation) => o.evidence_id === "ack-timing")!;
    assert.equal(ack.kind, "preference");
    assert.equal(ack.source_ref, "source:ack-timing");
    assert.equal(ack.source_hash, "sha256:ack-timing");
    assert.equal(ack.agent, "codex");
    assert.equal(ack.scope, "personal");
    assert.deepEqual(ack.topics, ["ack-timing"]);
    assert.ok(ack.entities.includes("ack"));
    assert.ok(ack.entities.includes("openclaw"));
    assert.ok(ack.entities.includes("delegation"));
    assert.equal(ack.action, "Send ACK before long tasks");
    assert.equal(ack.verification, "Delegated work acceptance test passed");
    assert.equal(ack.reusable_lesson, "Always ACK before long OpenClaw work");
    assert.ok(ack.raw_excerpt);
    assert.ok(ack.id);
    assert.equal(ack.filtered_out, false);

    // OpenClaw auth expired → fix
    const auth = observations.find((o: WikiObservation) => o.evidence_id === "openclaw-auth")!;
    assert.equal(auth.kind, "fix");
    assert.deepEqual(auth.topics, ["openclaw:auth-expired"]);
    assert.ok(auth.entities.includes("openclaw"));
    assert.equal(auth.problem, "OpenClaw auth expired and refreshing login fixed memory sync.");
    assert.equal(auth.outcome, "success");

    // stdin closed → pitfall
    const stdin = observations.find((o: WikiObservation) => o.evidence_id === "stdin-closed")!;
    assert.equal(stdin.kind, "pitfall");
    assert.deepEqual(stdin.topics, ["stdin-closed"]);
    assert.ok(stdin.entities.includes("stdin"));
    assert.equal(stdin.outcome, "failed");
    assert.equal(stdin.verification, undefined);
    assert.equal(stdin.reusable_lesson, undefined);

    // Codex preference → preference
    const codex = observations.find((o: WikiObservation) => o.evidence_id === "codex-pref")!;
    assert.equal(codex.kind, "preference");
    assert.ok(codex.entities.includes("codex"));
    assert.equal(codex.agent, "codex");
    assert.equal(codex.confidence, 0.5);

    // Verified fix → fix with higher confidence
    const fix = observations.find((o: WikiObservation) => o.evidence_id === "verified-fix")!;
    assert.equal(fix.kind, "fix");
    assert.equal(fix.outcome, "success");
    assert.ok(fix.verification);
    assert.ok(fix.reusable_lesson);
    assert.equal(fix.confidence, 0.9);
    assert.ok(fix.confidence > codex.confidence);
  });
});

describe("wiki curation with relationship plans", () => {
  it("rewrites create to update when a stable page with matching source hash exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-rel-update-"));
    await mkdir(join(root, "kb", "known-fixes"), { recursive: true });
    await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });

    await writeFile(
      join(root, "kb", "known-fixes", "openclaw-ack-timing.md"),
      [
        "---",
        "title: OpenClaw ACK timing",
        "scope: personal",
        "sources:",
        "  - uri: \"raw-vault://codex/legacy\"",
        "    hash: \"sha256:capture_ack_new\"",
        "---",
        "# OpenClaw ACK timing",
        "",
        "Existing ACK page content.",
      ].join("\n"),
    );

    await writeCapture(root, "capture_ack_new", "ACK timing was slow again. Fixed by sending accepted ack before async processing. Verification passed after retrying delegated work acceptance test. Reusable lesson: send ACK before long OpenClaw work.");

    const report = await curateWiki(root, {
      mode: "dry-run",
      degraded: true,
      now: "2026-05-23T00:00:00.000Z",
    });

    assert.equal(report.type, "wiki_curation_report");
    const plans = report.compiler_counts!.page_plans_by_action;
    assert.ok(plans.update >= 1, `expected at least 1 update plan, got ${plans.update}`);
    assert.equal(report.output_counts.curated_proposals, 1);
  });

  it("does not keep planned-page links to proposals that need human review", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-planned-link-quality-"));
    await writeCapture(root, "capture_ack_1", "OpenClaw delegated work felt silent. Fix: send a short ACK before dispatch. Verification passed in delegated work acceptance. Reusable lesson: ACK before long OpenClaw work.");
    await writeCapture(root, "capture_ack_2", "OpenClaw dispatch appeared silent again. Fix: send ACK before background dispatch. Verification passed after delegated work completed. Reusable lesson: ACK before long OpenClaw work.");
    await writeCapture(root, "capture_runner_1", "OpenClaw task runner was missing when checking hanging tasks. Fix: verify task runner presence before debugging dispatch. Verification passed after runner status check. Reusable lesson: verify runner presence first.");
    await writeCapture(root, "capture_runner_2", "OpenClaw hanging task investigation found runner status missing. Fix: verify task runner presence before dispatch debugging. Verification passed after runner status check. Reusable lesson: verify runner presence first.");

    const report = await curateWiki(root, {
      mode: "review",
      now: "2026-05-23T00:00:00.000Z",
      aiClient: {
        async generateJson(args: { user: string }) {
          const user = JSON.parse(args.user) as { compiler_context?: { topic_title?: string } };
          const topicTitle = user.compiler_context?.topic_title ?? "";
          if (/task runner/i.test(topicTitle)) {
            return {
              ok: true,
              json: {
                title: "OpenClaw task runner presence checks",
                summary: "Verify runner presence before dispatch debugging.",
                page_kind: "known_fix",
                target_path: "kb/known-fixes/openclaw-task-runner-presence-checks.md",
                body_markdown: "# OpenClaw task runner presence checks\n\n## Problem\nRunner state was missing.\n\n## Fix\nCheck runner status.\n\n## Verification\nRunner status check passed.",
                confidence: 0.5,
                risk_notes: [],
              },
            };
          }
          return {
            ok: true,
            json: {
              title: "ACK timing before long-running agent work",
              summary: "Send an ACK before long OpenClaw dispatch work.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/ack-timing-before-long-running-agent-work.md",
              body_markdown: "# ACK timing before long-running agent work\n\n## Problem\nLong OpenClaw dispatch work can look silent.\n\n## Fix\nSend a short ACK before dispatch.\n\n## Verification\nDelegated work acceptance passed.\n\n## Reusable Lessons\nACK before long OpenClaw work.",
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(report.compiler_counts?.human_required_quality, 1);
    assert.equal(report.output_counts.curated_proposals, 2);
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    const proposals = await Promise.all(proposalFiles.map(async (file) =>
      JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", file), "utf8")),
    ));
    const proposal = proposals.find((item) => item.target_path === "kb/known-fixes/ack-timing-before-long-running-agent-work.md");
    assert.ok(proposal);
    assert.doesNotMatch(proposal.body_markdown, /openclaw-task-runner-presence-checks/);
    assert.notEqual(
      proposal.suggested_links?.some((link: { slug: string }) => link.slug === "openclaw-task-runner-presence-checks"),
      true,
    );
  });
});
