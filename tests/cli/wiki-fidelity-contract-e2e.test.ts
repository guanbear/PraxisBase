import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { reviewAutoWithPolicy, reviewPolicyInit } from "@praxisbase/cli/commands/review.js";
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
    workspace: "golden",
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

async function writeGoldenCorpus(root: string): Promise<void> {
  await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
  await mkdir(join(root, ".praxisbase/raw-vault/refs"), { recursive: true });

  const ackSummary = [
    "OpenClaw delegation looked stalled until the ACK timing fix landed.",
    "Fixed by sending an accepted ACK before async delegated processing starts.",
    "Verification passed when the child agent completed and the user saw immediate progress.",
    "Reusable lesson: acknowledge first, then run background work.",
  ].join(" ");
  const stdinSummary = [
    "OpenClaw delegated task failed after stdin closed during a child process handoff.",
    "Fixed by checking the runner state and reopening stdin before the next write.",
    "Verification passed with a successful delegated repair task.",
    "Reusable lesson: check terminal IO state before writing to an agent process.",
  ].join(" ");

  for (let i = 0; i < 4; i++) {
    await writeFile(
      join(root, ".praxisbase/outbox/captures", `ack-${i}.json`),
      captureRecord({
        id: `ack-${i}`,
        sourceRef: `raw-vault://codex/golden-ack-${i}`,
        sourceHash: `sha256:golden-ack-${i}`,
        summary: ackSummary,
        createdAt: `2026-05-24T01:0${i}:00.000Z`,
      }),
      "utf8",
    );
  }
  for (let i = 0; i < 3; i++) {
    await writeFile(
      join(root, ".praxisbase/outbox/captures", `stdin-${i}.json`),
      captureRecord({
        id: `stdin-${i}`,
        sourceRef: `raw-vault://openclaw/golden-stdin-${i}`,
        sourceHash: `sha256:golden-stdin-${i}`,
        summary: stdinSummary,
        createdAt: `2026-05-24T02:0${i}:00.000Z`,
      }),
      "utf8",
    );
  }

  await writeFile(
    join(root, ".praxisbase/raw-vault/refs", "official-docs.json"),
    JSON.stringify({
      id: "official-docs",
      source_ref: "https://docs.example.invalid/api/reference",
      source_hash: "sha256:official-docs",
      redacted_summary: "Official documentation and API reference for an external SDK.",
      scope_hint: "personal",
      created_at: "2026-05-24T03:00:00.000Z",
    }),
    "utf8",
  );
  await writeFile(
    join(root, ".praxisbase/raw-vault/refs", "private-token.json"),
    JSON.stringify({
      id: "private-token",
      agent: "codex",
      source_ref: "raw-vault://codex/private-token",
      source_hash: "sha256:private-token",
      redacted_summary: "Fixed an OpenClaw login failure but the note contains token abc123 and must not enter stable guidance.",
      scope_hint: "personal",
      created_at: "2026-05-24T03:01:00.000Z",
    }),
    "utf8",
  );
}

function goldenCurator(): AiJsonClient {
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
      const related = links ? `\n\n## Related Wiki Pages\n- ${links}` : "";
      return {
        ok: true,
        json: {
          title,
          summary: `${title} distilled from repeated repair evidence.`,
          page_kind: context.page_kind ?? "known_fix",
          body_markdown: `# ${title}

## When to Use
Use this when OpenClaw or Codex repair work repeats this operational failure mode.

## Symptoms
Agent delegation appears blocked even though the repair can proceed.

## What To Do
- Apply the repeated successful operational fix from the evidence.
- Keep the action short enough for agents to reuse without copying raw transcripts.

## Verify
- Re-run the delegated repair workflow and confirm the original symptom is gone.

## Reusable Lessons
- Preserve the durable rule and provenance, not the raw session text.${related}`,
          confidence: 0.94,
          risk_notes: [],
        },
      };
    },
  };
}

describe("wiki fidelity contract golden e2e", () => {
  it("compiles repeated evidence into fewer provenance-backed wiki pages and a typed graph", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-fidelity-golden-"));
    await reviewPolicyInit(root, "personal");
    await writeGoldenCorpus(root);

    const report = await curateWiki(root, {
      mode: "review",
      aiClient: goldenCurator(),
      now: "2026-05-24T04:00:00.000Z",
    });

    assert.equal(report.input_counts.evidence_items, 7);
    assert.ok(report.input_counts.filtered_noise >= 1, "expected reference-only evidence to be filtered");
    assert.ok(report.input_counts.human_required >= 1, "expected private evidence to require human handling");
    assert.ok(report.compiler_counts, "expected compiler counts in curation report");
    assert.ok(report.compiler_counts.topics < report.input_counts.evidence_items);
    assert.ok(report.output_counts.written_proposals < report.input_counts.evidence_items);
    assert.ok(report.output_counts.written_proposals >= 2);

    const sourceSummaryFiles = await readdir(join(root, ".praxisbase/reports/wiki-source-summaries"));
    assert.equal(sourceSummaryFiles.length, report.input_counts.evidence_items);

    const review = await reviewAutoWithPolicy(root, { promoteApproved: true });
    assert.equal(review.reviewed, report.output_counts.written_proposals);
    assert.equal(review.needs_human, 0);
    assert.equal(review.auto_promoted, report.output_counts.written_proposals);

    const promotedSourceSummaries = await Promise.all(
      sourceSummaryFiles.map(async (file) =>
        JSON.parse(await readFile(join(root, ".praxisbase/reports/wiki-source-summaries", file), "utf8")) as {
          contributed_to_pages: string[];
        }
      ),
    );
    assert.ok(
      promotedSourceSummaries.every((summary) => summary.contributed_to_pages.length > 0),
      "expected each promoted source summary to record its stable wiki page contribution",
    );

    const siteOutput = await wikiCommand(root, "build-site", { json: true });
    const site = JSON.parse(siteOutput) as { ok: boolean; result: { pages: number; outputs: string[] } };
    assert.equal(site.ok, true);
    assert.ok(site.result.pages < report.input_counts.evidence_items);
    for (const artifact of [
      "dist/wiki/index.md",
      "dist/wiki/log.md",
      "dist/wiki/purpose.md",
      "dist/wiki/schema.md",
      "dist/wiki/overview.md",
    ]) {
      assert.ok(site.result.outputs.includes(artifact), `expected ${artifact} in site outputs`);
      assert.ok((await readFile(join(root, artifact), "utf8")).length > 0, `expected ${artifact} to be non-empty`);
    }

    const graph = JSON.parse(await readFile(join(root, "dist/graph.json"), "utf8")) as {
      links: Array<{ type: string; source_refs?: string[] }>;
    };
    assert.ok(
      graph.links.some((link) => link.type === "related" || link.type === "source_overlap"),
      "expected a typed related or source_overlap graph edge",
    );

    const stableMarkdown = (await Promise.all([
      readFile(join(root, "kb/known-fixes/openclaw-delegation-looked-stalled-until-the-ack-timing-fix-landed.md"), "utf8").catch(() => ""),
      readFile(join(root, "kb/known-fixes/openclaw-delegated-task-failed-after-stdin-closed-during-a-child-process-handoff.md"), "utf8").catch(() => ""),
      readFile(join(root, "dist/llms-full.txt"), "utf8"),
    ])).join("\n");
    assert.match(stableMarkdown, /## Provenance/);
    assert.doesNotMatch(stableMarkdown, /Official documentation and API reference/);
    assert.doesNotMatch(stableMarkdown, /token abc123/);
  });
});
