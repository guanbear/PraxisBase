import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reviewPolicyInit, reviewAutoWithPolicy } from "@praxisbase/cli/commands/review.js";
import { wikiCommand } from "@praxisbase/cli/commands/wiki.js";
import { PROTOCOL_VERSION } from "@praxisbase/core";
import type { AiJsonClient } from "@praxisbase/core/ai/client.js";
import { curateWiki } from "@praxisbase/core/wiki/curate.js";

function captureRecord(input: {
  id: string;
  sourceRef: string;
  sourceHash: string;
  summary: string;
  createdAt: string;
}): string {
  return JSON.stringify({
    id: input.id,
    protocol_version: PROTOCOL_VERSION,
    type: "capture_record",
    agent: "codex",
    workspace: "e2e",
    scope_hint: "personal",
    result: "success",
    triggers: ["task_finish"],
    signals: [],
    artifacts: [
      {
        kind: "transcript",
        source_ref: input.sourceRef,
        source_hash: input.sourceHash,
        redacted_summary: input.summary,
      },
    ],
    created_at: input.createdAt,
  });
}

async function writeExperienceCaptures(root: string): Promise<void> {
  await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
  const ackSummary = "OpenClaw ACK timing broke during delegation. Fixed by sending accepted ACK before async processing. Verification passed with delegated task completion. Reusable lesson: acknowledge first, then run background work.";
  const stdinSummary = "OpenClaw stdin closed after a delegated child process ended. Fixed by reopening the session runner and avoiding writes after close. Verification passed with the next delegated task. Reusable lesson: check stdin state before writing.";

  for (let i = 0; i < 6; i++) {
    await writeFile(
      join(root, ".praxisbase/outbox/captures", `capture_ack_${i}.json`),
      captureRecord({
        id: `capture_ack_${i}`,
        sourceRef: `raw-vault://codex/ack-${i}`,
        sourceHash: `sha256:ack-${i}`,
        summary: ackSummary,
        createdAt: `2026-05-22T10:0${i}:00.000Z`,
      }),
      "utf8",
    );
  }
  for (let i = 0; i < 4; i++) {
    await writeFile(
      join(root, ".praxisbase/outbox/captures", `capture_stdin_${i}.json`),
      captureRecord({
        id: `capture_stdin_${i}`,
        sourceRef: `raw-vault://codex/stdin-${i}`,
        sourceHash: `sha256:stdin-${i}`,
        summary: stdinSummary,
        createdAt: `2026-05-22T11:0${i}:00.000Z`,
      }),
      "utf8",
    );
  }
}

async function writeStableRelatedPages(root: string): Promise<void> {
  await mkdir(join(root, "kb/known-fixes"), { recursive: true });
  await writeFile(
    join(root, "kb/known-fixes/openclaw-operational-coordination.md"),
    `---
id: openclaw-operational-coordination
title: "OpenClaw operational coordination"
knowledge_type: known_fix
scope: personal
maturity: draft
signatures:
  - openclaw:coordination
sources:
  - uri: "kb://seed/openclaw-operational-coordination"
    hash: "sha256:stable-openclaw"
---
# OpenClaw operational coordination

Use this page for OpenClaw delegation, ACK timing, and stdin coordination patterns.
`,
    "utf8",
  );
  await writeFile(
    join(root, "kb/known-fixes/agent-terminal-io-patterns.md"),
    `---
id: agent-terminal-io-patterns
title: "Agent terminal IO patterns"
knowledge_type: known_fix
scope: personal
maturity: draft
signatures:
  - openclaw:terminal-io
sources:
  - uri: "kb://seed/agent-terminal-io-patterns"
    hash: "sha256:stable-terminal"
---
# Agent terminal IO patterns

Use this page when OpenClaw or Codex repair work depends on terminal stdin, stdout, and delegated task process state.
`,
    "utf8",
  );
}

function linkedCurator(): AiJsonClient {
  return {
    async generateJson(input) {
      const prompt = JSON.parse(input.user) as {
        compiler_context?: {
          topic_title?: string;
          page_kind?: string;
          suggested_links?: Array<{ slug: string; label: string }>;
        };
      };
      const context = prompt.compiler_context ?? {};
      const title = context.topic_title ?? "OpenClaw repair lesson";
      const links = (context.suggested_links ?? [])
        .map((link) => `[[${link.slug}|${link.label}]]`)
        .join(", ");
      const related = links ? `\n\nRelated context: ${links}.` : "";
      return {
        ok: true,
        json: {
          title,
          summary: `${title} distilled from repeated successful repair experience.`,
          page_kind: context.page_kind ?? "known_fix",
          body_markdown: `# ${title}

## Problem
OpenClaw repair work repeatedly hit this failure mode during delegated agent operation.${related}

## Fix
Apply the repeated successful repair action from the evidence and keep the related wiki context linked for future agents.

## Verification
Verification passed in the captured repair sessions.

## Reusable Lessons
Agents should check the linked OpenClaw coordination pages before repeating the repair.`,
          confidence: 0.93,
          risk_notes: [],
        },
      };
    },
  };
}

describe("wiki compiler core redesign e2e", () => {
  it("clusters repeated evidence, links generated pages, and reduces graph orphans", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-redesign-e2e-"));
    await reviewPolicyInit(root, "personal");
    await writeStableRelatedPages(root);
    await writeExperienceCaptures(root);

    const report = await curateWiki(root, {
      mode: "review",
      aiClient: linkedCurator(),
      now: "2026-05-22T12:00:00.000Z",
    });

    assert.equal(report.input_counts.evidence_items, 10);
    assert.equal(report.compiler_counts?.topics, 2);
    assert.equal(report.compiler_counts?.relationship_counts.suggested_links, 4);
    assert.equal(report.output_counts.written_proposals, 2);

    const review = await reviewAutoWithPolicy(root, { promoteApproved: true });
    assert.equal(review.reviewed, 2);
    assert.equal(review.auto_promoted, 2);
    assert.equal(review.needs_human, 0);

    const siteOutput = await wikiCommand(root, "build-site", { json: true });
    const site = JSON.parse(siteOutput);
    assert.equal(site.ok, true);
    assert.ok(site.result.pages < 10, `expected fewer pages than evidence count, got ${site.result.pages}`);
    assert.ok(site.result.health.orphans < site.result.pages, `expected orphans < pages, got ${site.result.health.orphans}/${site.result.pages}`);

    const graph = JSON.parse(await readFile(join(root, "dist/graph.json"), "utf8"));
    assert.ok(graph.links.length >= 2, "expected generated pages to contain wikilinks");
    assert.ok(
      graph.links.some((link: { to: string }) => link.to === "openclaw-operational-coordination"),
      "expected a generated page to link to the OpenClaw coordination page",
    );
  });
});
