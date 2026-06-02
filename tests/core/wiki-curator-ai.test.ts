import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PROTOCOL_VERSION,
  curateWiki,
  synthesizeCuratedWikiProposal,
  buildWikiCuratorPrompt,
  type WikiEvidenceCluster,
  type WikiEvidenceItem,
  type SynthesisContext,
  type StructuredLink,
  type MergeCandidate,
} from "@praxisbase/core";
import { writeAiProviderConfig } from "@praxisbase/core/ai/config.js";
import { normalizeStableSlug } from "@praxisbase/core/protocol/slug.js";

const evidence: WikiEvidenceItem[] = [
  {
    id: "ev_1",
    kind: "distilled_experience",
    source_ref: "codex:session:1",
    source_hash: "sha256:a",
    agent: "codex",
    scope: "personal",
    title: "OpenClaw auth expired",
    summary: "OpenClaw memory sync failed after auth expiry; refreshing login fixed it.",
    actions: ["Refresh OpenClaw login", "Retry memory sync"],
    failed_attempts: ["Retrying before login refresh failed"],
    outcome: "success",
    verification: ["Memory sync succeeded"],
    reusable_lessons: ["Refresh login before retrying OpenClaw memory sync"],
    signatures: ["openclaw:auth-expired"],
    suggested_wiki_kind: "known_fix",
    privacy_verdict: "safe",
  },
  {
    id: "ev_2",
    kind: "distilled_experience",
    source_ref: "openclaw:memory:2",
    source_hash: "sha256:b",
    agent: "openclaw",
    scope: "personal",
    title: "OpenClaw login expired",
    summary: "OpenClaw auth expired again; login refresh fixed the repair loop.",
    actions: ["Refresh OpenClaw login"],
    failed_attempts: [],
    outcome: "success",
    verification: ["Repair loop stopped"],
    reusable_lessons: ["Check auth freshness before repair"],
    signatures: ["openclaw:auth-expired"],
    suggested_wiki_kind: "known_fix",
    privacy_verdict: "safe",
  },
];

const cluster: WikiEvidenceCluster = {
  id: "wiki-cluster-openclaw-auth",
  cluster_key: "sig:openclaw:auth-expired",
  target_path_hint: "kb/known-fixes/openclaw-auth-expired.md",
  normalized_title: "OpenClaw auth expired",
  page_kind: "known_fix",
  scope: "personal",
  evidence_ids: ["ev_1", "ev_2"],
  source_refs: ["codex:session:1", "openclaw:memory:2"],
  source_hashes: ["sha256:a", "sha256:b"],
  source_count: 2,
  signatures: ["openclaw:auth-expired"],
  confidence_hint: 0.9,
  reasons: ["shared signature openclaw:auth-expired"],
  conflicts: [],
};

describe("AI wiki curator", () => {
  it("creates wiki-shaped proposal from mocked AI JSON", async () => {
    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login before retrying memory sync.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-auth-expired.md",
              body_markdown: "# OpenClaw auth expired recovery\n\n## Problem\nMemory sync fails after auth expiry.\n\n## Fix\nRefresh login and retry sync.\n\n## Verification\nRun memory sync again.",
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.proposal.source_count, 2);
      assert.equal(result.proposal.source_refs.length, 2);
      assert.match(result.proposal.body_markdown, /## Verification/);
    }
  });

  it("replaces AI-written provenance with structured provenance", async () => {
    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login before retrying memory sync.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-auth-expired.md",
              body_markdown: [
                "# OpenClaw auth expired recovery",
                "",
                "## Problem",
                "Memory sync fails after auth expiry.",
                "",
                "## Fix",
                "Refresh login and retry sync.",
                "",
                "## Verification",
                "Run memory sync again.",
                "",
                "## Reusable Lessons",
                "Refresh login before retrying memory sync.",
                "",
                "## Provenance",
                "- codex:session:1 (sha256:wrong)",
              ].join("\n"),
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.proposal.body_markdown, /- codex:session:1 \(sha256:a\)/);
      assert.match(result.proposal.body_markdown, /- openclaw:memory:2 \(sha256:b\)/);
      assert.doesNotMatch(result.proposal.body_markdown, /sha256:wrong/);
    }
  });

  it("rejects AI output with unsafe target path", async () => {
    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login.",
              page_kind: "known_fix",
              target_path: "../outside.md",
              body_markdown: "# Bad\n\n## Fix\nWrite outside.",
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.category, "guard_error");
  });

  it("repairs AI body that omits wiki headings when guards otherwise pass", async () => {
    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-auth-expired.md",
              body_markdown: "Refresh login and retry memory sync.",
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.proposal.body_markdown, /^# OpenClaw auth expired recovery/m);
      assert.match(result.proposal.body_markdown, /## Verify/);
      assert.ok(result.proposal.guards.some((guard) => guard.id === "body" && guard.ok));
    }
  });

  it("falls back to deterministic synthesis when AI body fails quality guards", async () => {
    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-auth-expired.md",
              body_markdown: [
                "# OpenClaw auth expired recovery",
                "",
                "## Problem",
                "Authentication expiry affected sync.",
                "",
                "## Fix",
                "TBD.",
                "",
                "## Verification",
                "TBD.",
                "",
                "## Reusable Lessons",
                "TBD.",
                "",
                "## Provenance",
                "TBD.",
              ].join("\n"),
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.proposal.body_markdown, /Refresh OpenClaw login/);
      assert.equal(result.proposal.guards.every((guard) => guard.ok), true);
    }
  });

  it("builds deterministic fallback bodies as reusable agent guidance", async () => {
    const noisySignatureCluster: WikiEvidenceCluster = {
      ...cluster,
      signatures: Array.from({ length: 8 }, (_, index) => `openclaw:runner-status-${index}`),
      normalized_title: "OpenClaw task runner presence checks",
      page_kind: "procedure",
      target_path_hint: "kb/procedures/openclaw-task-runner-presence-checks.md",
    };
    const result = await synthesizeCuratedWikiProposal(noisySignatureCluster, {
      evidence: [
        {
          ...evidence[0],
          title: "OpenClaw task runner presence checks",
          summary: "OpenClaw task runner status was missing during dispatch debugging.",
          actions: ["Verify task runner presence before dispatch debugging"],
          verification: ["Runner status check passed"],
          reusable_lessons: ["Check runner presence before debugging dispatch hangs"],
          signatures: noisySignatureCluster.signatures,
          suggested_wiki_kind: "procedure",
        },
      ],
      now: "2026-05-21T00:00:00.000Z",
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw task runner presence checks",
              summary: "Verify runner presence before dispatch debugging.",
              page_kind: "procedure",
              target_path: "kb/procedures/openclaw-task-runner-presence-checks.md",
              body_markdown: "TBD",
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.proposal.body_markdown, /## When to Use/);
      assert.match(result.proposal.body_markdown, /## What To Do/);
      assert.match(result.proposal.body_markdown, /## Verify/);
      assert.match(result.proposal.body_markdown, /## Agent Use/);
      assert.match(result.proposal.body_markdown, /Use this page when:/);
      assert.match(result.proposal.body_markdown, /Apply it by:/);
      assert.match(result.proposal.body_markdown, /Verify by:/);
      assert.doesNotMatch(result.proposal.body_markdown, /Use this when evidence matches openclaw:runner-status-0,/);
    }
  });

  it("repairs AI body that omits Agent Use guidance", async () => {
    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login before retrying memory sync.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-auth-expired.md",
              body_markdown: [
                "# OpenClaw auth expired recovery",
                "",
                "## When to Use",
                "Use this when OpenClaw memory sync fails after auth expiry.",
                "",
                "## Fix",
                "Refresh login and retry sync.",
                "",
                "## Verification",
                "Run memory sync again.",
                "",
                "## Reusable Lessons",
                "Refresh login before retrying memory sync.",
              ].join("\n"),
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.proposal.body_markdown, /## Agent Use/);
      assert.match(result.proposal.body_markdown, /Use this page when:/);
      assert.match(result.proposal.body_markdown, /Apply it by:/);
      assert.match(result.proposal.body_markdown, /Verify by:/);
    }
  });

  it("repairs AI body that uses a machine-generated hash heading", async () => {
    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-auth-expired.md",
              body_markdown: "# capture_openclaw-sha256-0641118511b3cb45\n\n## Problem\nMemory sync failed.\n\n## Fix\nRefresh login.\n\n## Verification\nMemory sync passed.",
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.proposal.body_markdown, /^# OpenClaw auth expired recovery/m);
      assert.doesNotMatch(result.proposal.body_markdown, /^# capture_openclaw/m);
    }
  });

  it("replaces machine-generated AI target paths with title-derived wiki paths", async () => {
    const result = await synthesizeCuratedWikiProposal(
      {
        ...cluster,
        target_path_hint: "kb/notes/wiki-capture-openclaw-sha256-0641118511b3cb45.md",
        page_kind: "note",
      },
      {
        evidence,
        now: "2026-05-21T00:00:00.000Z",
        client: {
          async generateJson() {
            return {
              ok: true,
              json: {
                title: "OpenClaw Slack Delegated Work Acceptance Test",
                summary: "Delegated work acceptance passed.",
                page_kind: "note",
                target_path: "kb/notes/wiki-capture-openclaw-sha256-0641118511b3cb45.md",
                body_markdown: "# OpenClaw Slack Delegated Work Acceptance Test\n\n## Problem\nSlack delegated work needed ACK/final validation.\n\n## Fix\nRun the delegated work replay and verify ACK plus final message delivery.\n\n## Verification\nReplay gate passed.\n\n## Reusable Lessons\nUse a long enough final assertion timeout for delegated Slack work.",
                confidence: 0.91,
                risk_notes: [],
              },
            };
          },
        },
      },
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.proposal.target_path, "kb/notes/wiki-openclaw-slack-delegated-work-acceptance-test.md");
    }
  });

  it("repairs machine-generated AI titles before deriving target paths", async () => {
    const result = await synthesizeCuratedWikiProposal(
      {
        ...cluster,
        target_path_hint: "kb/notes/wiki-capture-codex-sha256-8dd881b6e1635da3.md",
        page_kind: "note",
      },
      {
        evidence,
        now: "2026-05-21T00:00:00.000Z",
        client: {
          async generateJson() {
            return {
              ok: true,
              json: {
                title: "capture_codex-sha256-8dd881b6e1635da314a309400d99f0560613e27bb1b220943f66c8eb345cecb0",
                summary: "Delegated work acceptance passed.",
                page_kind: "note",
                target_path: "kb/notes/wiki-capture-codex-sha256-8dd881b6e1635da3.md",
                body_markdown: "# OpenClaw Slack Delegated Work Acceptance Test\n\n## Problem\nSlack delegated work needed ACK/final validation.\n\n## Fix\nRun the delegated work replay and verify ACK plus final message delivery.\n\n## Verification\nReplay gate passed.\n\n## Reusable Lessons\nUse a long enough final assertion timeout for delegated Slack work.",
                confidence: 0.91,
                risk_notes: [],
              },
            };
          },
        },
      },
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.proposal.title, "OpenClaw Slack Delegated Work Acceptance Test");
      assert.equal(result.proposal.target_path, "kb/notes/wiki-openclaw-slack-delegated-work-acceptance-test.md");
      assert.doesNotMatch(result.proposal.title, /sha256|^capture_/i);
    }
  });

  it("derives a readable title from evidence when AI and cluster titles are machine-generated", async () => {
    const machineEvidence: WikiEvidenceItem[] = [{
      ...evidence[0],
      id: "ev_machine",
      title: "capture_codex-sha256-8dd881b6e1635da314a309400d99f0560613e27bb1b220943f66c8eb345cecb0",
      summary: "Unit tests verifying the structure and behavior of task display rendering functions, focusing on lineage and OpenClaw taskflow bindings.",
      actions: ["Mocked parent-child task states to verify lineage output"],
      verification: ["Task display test suite passed"],
      reusable_lessons: ["Translate task events into user-friendly event timelines"],
      signatures: ["text:capture-codex-sha256-8dd881b6e1635da314a309400d99f0560613e27bb1b220943f66c8eb345cecb0-suggested"],
      suggested_wiki_kind: "note",
    }];
    const result = await synthesizeCuratedWikiProposal(
      {
        ...cluster,
        cluster_key: "sig:text:capture-codex-sha256-8dd881b6e1635da314a309400d99f0560613e27bb1b220943f66c8eb345cecb0-suggested",
        target_path_hint: "kb/notes/wiki-capture-codex-sha256-8dd881b6e1635da314a309400d99f0560613e27bb1b220943f66c8eb345cecb0.md",
        normalized_title: "capture_codex-sha256-8dd881b6e1635da314a309400d99f0560613e27bb1b220943f66c8eb345cecb0",
        page_kind: "note",
        evidence_ids: ["ev_machine"],
        source_refs: ["codex:session:machine"],
        source_hashes: ["sha256:machine"],
        signatures: ["text:capture-codex-sha256-8dd881b6e1635da314a309400d99f0560613e27bb1b220943f66c8eb345cecb0-suggested"],
      },
      {
        evidence: machineEvidence,
        now: "2026-05-21T00:00:00.000Z",
        client: {
          async generateJson() {
            return {
              ok: true,
              json: {
                title: "capture_codex-sha256-8dd881b6e1635da314a309400d99f0560613e27bb1b220943f66c8eb345cecb0",
                summary: "Task display rendering tests passed.",
                page_kind: "note",
                target_path: "kb/notes/wiki-capture-codex-sha256-8dd881b6e1635da314a309400d99f0560613e27bb1b220943f66c8eb345cecb0.md",
                body_markdown: "# capture_codex-sha256-8dd881b6e1635da314a309400d99f0560613e27bb1b220943f66c8eb345cecb0\n\n## Problem\nTask display rendering needed lineage verification.\n\n## Fix\nMock parent-child task states.\n\n## Verification\nTask display test suite passed.\n\n## Reusable Lessons\nTranslate task events into user-friendly event timelines.",
                confidence: 0.91,
                risk_notes: [],
              },
            };
          },
        },
      },
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      const title = "Unit tests verifying the structure and behavior of task display rendering functions";
      assert.equal(result.proposal.title, title);
      assert.equal(result.proposal.target_path, `kb/notes/wiki-${normalizeStableSlug(title)}.md`);
      assert.ok(result.proposal.target_path.replace(/^kb\/notes\/wiki-/, "").replace(/\.md$/, "").length <= 80);
      assert.doesNotMatch(result.proposal.body_markdown, /^# capture_/m);
    }
  });

  it("repairs AI body that leaks curation metadata and duplicate sections", async () => {
    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-auth-expired.md",
              body_markdown: "# OpenClaw auth expired recovery\n\n## Problem\nSuggested Wiki Kind: note\nConfidence: 0.95\nSummary: Refresh login.\n\n## Problem\nMemory sync failed.\n\n## Verification\nMemory sync passed.\n\n## Verification\nRun sync again.",
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.doesNotMatch(result.proposal.body_markdown, /Suggested Wiki Kind|Confidence:/);
      assert.equal((result.proposal.body_markdown.match(/^#\s+/gm) ?? []).length, 1);
      assert.equal((result.proposal.body_markdown.match(/^## Verify$/gm) ?? []).length, 1);
    }
  });

  it("repairs AI body that repeats the H1 title", async () => {
    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-auth-expired.md",
              body_markdown: "# OpenClaw auth expired recovery\n# OpenClaw auth expired recovery\n\n## Problem\nMemory sync failed.\n\n## Fix\nRefresh login.\n\n## Verification\nMemory sync passed.\n\n## Reusable Lessons\nRefresh auth before retrying sync.",
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal((result.proposal.body_markdown.match(/^#\s+/gm) ?? []).length, 1);
      assert.match(result.proposal.body_markdown, /^# OpenClaw auth expired recovery/m);
    }
  });

  it("repairs accidental leading n before markdown bullet lists without changing code fences", async () => {
    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw Slack replay stability failures",
              summary: "Replay failures need stable verification.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-slack-replay-stability-failures.md",
              body_markdown: [
                "# OpenClaw Slack replay stability failures",
                "",
                "## Problem",
                "Slack replay verification can fail after deploy.",
                "",
                "## Fix",
                "n*   Test reports should be checked before restarting the gateway.",
                "n-   Restart only after the report shows a gateway drift.",
                "n+   Record the verification result.",
                "n* means multiply by n in a literal note.",
                "```text",
                "n* do not change this code sample",
                "```",
                "",
                "## Verification",
                "Replay gate passed.",
                "",
                "## Reusable Lessons",
                "Check replay reports before taking repair action.",
              ].join("\n"),
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.doesNotMatch(result.proposal.body_markdown, /^n\*\s{2,}/m);
      assert.match(result.proposal.body_markdown, /^\*\s+Test reports/m);
      assert.match(result.proposal.body_markdown, /^-\s+Restart only/m);
      assert.match(result.proposal.body_markdown, /^\+\s+Record the verification result/m);
      assert.match(result.proposal.body_markdown, /^n\* means multiply by n/m);
      assert.match(result.proposal.body_markdown, /^n\* do not change this code sample/m);
    }
  });

  it("rejects AI body containing private material", async () => {
    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-auth-expired.md",
              body_markdown: "# Bad\n\n## Fix\nUse token abc.",
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.category, "privacy_error");
  });

  it("production curate creates an AI client from configured provider", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-curator-ai-client-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "glm-5.1" });
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
      artifacts: [{
        kind: "transcript",
        source_ref: "raw-vault://codex/session-1",
        source_hash: "sha256:session1",
        redacted_summary: "Fixed OpenClaw auth expired by refreshing login. pnpm check passed.",
      }],
      created_at: "2026-05-21T00:00:00.000Z",
    }));

    let called = false;
    const report = await curateWiki(root, {
      mode: "review",
      now: "2026-05-21T00:00:00.000Z",
      env: {
        PRAXISBASE_LLM_API_KEY: "test-key",
        PRAXISBASE_LLM_BASE_URL: "https://llm.example.test/v1",
      },
      fetchImpl: async (url: string | URL | Request, init?: RequestInit) => {
        called = true;
        assert.equal(String(url), "https://llm.example.test/v1/chat/completions");
        assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-key");
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                title: "AI curated OpenClaw auth recovery",
                summary: "Refresh login before retrying OpenClaw sync.",
                page_kind: "known_fix",
                target_path: "kb/known-fixes/openclaw-auth-expired.md",
                body_markdown: "# AI curated OpenClaw auth recovery\n\n## Problem\nOpenClaw auth expired.\n\n## Fix\nRefresh login and retry sync.\n\n## Verification\npnpm check passed.",
                confidence: 0.93,
                risk_notes: [],
              }),
            },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    assert.equal(called, true);
    assert.equal(report.ai.mode, "production");
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    const proposal = JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", proposalFiles[0]), "utf8"));
    assert.equal(proposal.title, "AI curated OpenClaw auth recovery");
  });

  it("production curate uses the configured curation model override", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-curator-stage-model-"));
    await writeAiProviderConfig(root, {
      provider: "openai-compatible",
      model: "GLM-4.7",
      curationModel: "GLM-5.1",
    });
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
      artifacts: [{
        kind: "transcript",
        source_ref: "raw-vault://codex/session-1",
        source_hash: "sha256:session1",
        redacted_summary: "Fixed OpenClaw auth expired by refreshing login. pnpm check passed.",
      }],
      created_at: "2026-05-21T00:00:00.000Z",
    }));

    let requestedModel = "";
    await curateWiki(root, {
      mode: "dry-run",
      now: "2026-05-21T00:00:00.000Z",
      env: {
        PRAXISBASE_LLM_API_KEY: "test-key",
        PRAXISBASE_LLM_BASE_URL: "https://llm.example.test/v1",
      },
      fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { model: string };
        requestedModel = body.model;
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                title: "AI curated OpenClaw auth recovery",
                summary: "Refresh login before retrying OpenClaw sync.",
                page_kind: "known_fix",
                target_path: "kb/known-fixes/openclaw-auth-expired.md",
                body_markdown: "# AI curated OpenClaw auth recovery\n\n## Problem\nOpenClaw auth expired.\n\n## Fix\nRefresh login and retry sync.\n\n## Verification\npnpm check passed.",
                confidence: 0.93,
                risk_notes: [],
              }),
            },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    assert.equal(requestedModel, "GLM-5.1");
  });

  it("curate passes existing page context and writes update proposals for existing page plans", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-curator-update-plan-"));
    await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await writeFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), [
      "---",
      "title: \"OpenClaw auth expired\"",
      "scope: personal",
      "sources:",
      "  - uri: \"raw-vault://codex/session-1\"",
      "    hash: \"sha256:session1\"",
      "---",
      "# OpenClaw auth expired",
      "",
      "## Existing Fix",
      "Refresh login before retrying sync.",
      "",
    ].join("\n"));
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
      artifacts: [{
        kind: "transcript",
        source_ref: "raw-vault://codex/session-1",
        source_hash: "sha256:session1",
        redacted_summary: "Fixed OpenClaw auth expired by refreshing login. Verification passed after memory sync. Reusable lesson: refresh login before retrying OpenClaw sync.",
      }],
      created_at: "2026-05-21T00:00:00.000Z",
    }));

    let sawExistingPageContext = false;
    const report = await curateWiki(root, {
      mode: "review",
      now: "2026-05-21T00:00:00.000Z",
      aiClient: {
        async generateJson(request) {
          const user = JSON.parse(request.user) as {
            compiler_context?: {
              page_plan_action?: string;
              existing_page_content?: string;
              update_instruction?: string;
            };
          };
          sawExistingPageContext = user.compiler_context?.page_plan_action === "update"
            && Boolean(user.compiler_context.existing_page_content?.includes("Existing Fix"))
            && Boolean(user.compiler_context.update_instruction?.includes("UPDATE or MERGE"));
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login before retrying memory sync.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/wrong-new-page.md",
              body_markdown: "# OpenClaw auth expired recovery\n\n## Problem\nOpenClaw auth expired.\n\n## Fix\nRefresh login before retrying sync.\n\n## Verification\nMemory sync passed.\n\n## Reusable Lessons\nKeep auth fresh before retrying OpenClaw sync.",
              confidence: 0.93,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(sawExistingPageContext, true);
    assert.equal(report.compiler_counts?.page_plans_by_action.update, 1);
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposalFiles.length, 1);
    const proposal = JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", proposalFiles[0]), "utf8"));
    assert.equal(proposal.action, "update");
    assert.equal(proposal.target_path, "kb/known-fixes/openclaw-auth-expired.md");
  });

  it("continues past failed clusters until the proposal limit is filled", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-curator-limit-"));
    await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
    for (const [index, summary] of [
      "Fixed unrelated OpenClaw dispatch failure by restarting the runner. pnpm check passed.",
      "Fixed OpenClaw auth expired memory sync by refreshing login. pnpm check passed.",
    ].entries()) {
      await writeFile(join(root, `.praxisbase/outbox/captures/capture_${index + 1}.json`), JSON.stringify({
        id: `capture_${index + 1}`,
        protocol_version: PROTOCOL_VERSION,
        type: "capture_record",
        agent: "codex",
        workspace: root,
        scope_hint: "personal",
        result: "success",
        triggers: ["task_finish"],
        signals: [],
        artifacts: [{
          kind: "transcript",
          source_ref: `raw-vault://codex/session-${index + 1}`,
          source_hash: `sha256:session${index + 1}`,
          redacted_summary: summary,
        }],
        created_at: "2026-05-21T00:00:00.000Z",
      }));
    }

    let calls = 0;
    const report = await curateWiki(root, {
      mode: "review",
      now: "2026-05-21T00:00:00.000Z",
      limit: 1,
      aiClient: {
        async generateJson() {
          calls++;
          if (calls === 1) {
            return {
              ok: true,
              json: {
                title: "Bad first cluster",
                summary: "Bad first cluster.",
                page_kind: "note",
                target_path: "../outside.md",
                body_markdown: "# Bad\n\n## Problem\nUnsafe path.",
                confidence: 0.7,
                risk_notes: [],
              },
            };
          }
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login before retrying memory sync.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-auth-expired.md",
              body_markdown: "# OpenClaw auth expired recovery\n\n## Problem\nMemory sync failed after auth expiry.\n\n## Fix\nRefresh login and retry.\n\n## Verification\nRun pnpm check.",
              confidence: 0.92,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(calls, 2);
    assert.equal(report.output_counts.curated_proposals, 1);
    assert.equal(report.output_counts.conflicts, 1);
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposalFiles.length, 1);
  });

  it("runs production curation synthesis with bounded concurrency", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-curator-concurrency-"));
    await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
    const summaries = [
      "Fixed OpenClaw auth expired memory sync by refreshing login. pnpm check passed. Reusable lesson: refresh login before retrying memory sync.",
      "Fixed OpenClaw Slack replay timeout by increasing final assertion wait. Replay verification passed. Reusable lesson: use longer timeout for delegated Slack work.",
      "Fixed OpenClaw dashboard runner missing state by checking task runner registration. Unit tests passed. Reusable lesson: verify runner presence before showing task state.",
    ];
    for (const [index, summary] of summaries.entries()) {
      await writeFile(join(root, `.praxisbase/outbox/captures/capture_${index + 1}.json`), JSON.stringify({
        id: `capture_${index + 1}`,
        protocol_version: PROTOCOL_VERSION,
        type: "capture_record",
        agent: "codex",
        workspace: root,
        scope_hint: "personal",
        result: "success",
        triggers: ["task_finish"],
        signals: [],
        artifacts: [{
          kind: "transcript",
          source_ref: `raw-vault://codex/concurrency-${index + 1}`,
          source_hash: `sha256:concurrency${index + 1}`,
          redacted_summary: summary,
        }],
        created_at: "2026-05-21T00:00:00.000Z",
      }));
    }

    let active = 0;
    let maxActive = 0;
    const releaseQueue: Array<() => void> = [];
    const report = await curateWiki(root, {
      mode: "dry-run",
      now: "2026-05-21T00:00:00.000Z",
      concurrency: 2,
      aiClient: {
        async generateJson(args: { user: string }) {
          const user = JSON.parse(args.user) as { expected_schema?: { target_path?: string } };
          const targetPath = user.expected_schema?.target_path ?? "kb/known-fixes/openclaw-reusable-repair-lesson.md";
          const title = targetPath.split("/").pop()?.replace(/\.md$/i, "") ?? "openclaw-reusable-repair-lesson";
          active++;
          maxActive = Math.max(maxActive, active);
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 20);
            releaseQueue.push(resolve);
            if (releaseQueue.length >= 2) {
              clearTimeout(timeout);
              for (const release of releaseQueue.splice(0)) release();
            }
          });
          active--;
          return {
            ok: true,
            json: {
              title: "OpenClaw reusable repair lesson",
              summary: "A concrete OpenClaw repair lesson was distilled.",
              page_kind: "known_fix",
              target_path: targetPath,
              body_markdown: `# ${title}\n\n## Problem\nA repair workflow failed.\n\n## Fix\nApply the distilled repair lesson.\n\n## Verification\nThe verification command passed.`,
              confidence: 0.9,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(report.output_counts.curated_proposals, 3);
    assert.equal(maxActive, 2);
  });
});

describe("AI wiki curator prompt with synthesis context", () => {
  it("includes topic title, page kind, and observation summaries in prompt.user", () => {
    const context: SynthesisContext = {
      topicTitle: "OpenClaw ACK timing",
      pageKind: "preference",
      observations: [
        { summary: "User prefers ACK before long tasks", raw_excerpt: "send a short ACK first, then continue" },
        { summary: "ACK timing improved response perception" },
      ],
      relatedPages: [],
      requiredLinks: [],
    };
    const prompt = buildWikiCuratorPrompt(cluster, evidence, context);
    const user = prompt.user;

    assert.match(prompt.system, /compiled wiki article/i);
    assert.ok(user.includes("OpenClaw ACK timing"), "prompt.user should contain topic title");
    assert.ok(user.includes("preference"), "prompt.user should contain page kind");
    assert.ok(user.includes("required_sections"), "prompt.user should contain required sections");
    assert.ok(user.includes("Agent Use"), "prompt.user should require agent-use guidance");
    assert.ok(user.includes("Related Wiki Pages"), "prompt.user should contain related section contract");
    assert.ok(user.includes("User prefers ACK before long tasks"), "prompt.user should contain first observation summary");
    assert.ok(user.includes("send a short ACK first, then continue"), "prompt.user should contain raw_excerpt");
    assert.ok(user.includes("ACK timing improved response perception"), "prompt.user should contain second observation summary");
  });

  it("includes existing page content when action is update", () => {
    const context: SynthesisContext = {
      topicTitle: "OpenClaw auth expired",
      pageKind: "known_fix",
      observations: [{ summary: "Auth expired again" }],
      existingPageContent: "# OpenClaw auth expired\n\n## Fix\nRefresh login.",
      relatedPages: [{ title: "OpenClaw ACK timing", path: "kb/memory/preferences-openclaw-ack-timing.md" }],
      requiredLinks: ["kb/memory/preferences-openclaw-ack-timing.md"],
      pagePlanAction: "update",
    };
    const prompt = buildWikiCuratorPrompt(cluster, evidence, context);
    const user = prompt.user;

    assert.ok(user.includes("Refresh login."), "prompt.user should contain existing page content");
    assert.ok(user.includes("OpenClaw ACK timing"), "prompt.user should contain related page title");
    assert.ok(user.includes("kb/memory/preferences-openclaw-ack-timing.md"), "prompt.user should contain related page path");
    assert.ok(user.includes("kb/memory/preferences-openclaw-ack-timing.md"), "prompt.user should contain required links");
    assert.ok(user.includes("update_instruction"), "prompt.user should contain update_instruction");
    assert.ok(user.includes("UPDATE or MERGE"), "prompt.user should instruct update/merge instead of create");
    assert.ok(user.includes("update"), "prompt.user should contain page_plan_action update");
  });

  it("includes existing page content when action is merge", () => {
    const context: SynthesisContext = {
      topicTitle: "OpenClaw auth expired",
      pageKind: "known_fix",
      observations: [{ summary: "Auth expired with different source" }],
      existingPageContent: "# Existing page\n\n## Fix\nOriginal fix content.",
      relatedPages: [],
      requiredLinks: [],
      pagePlanAction: "merge",
    };
    const prompt = buildWikiCuratorPrompt(cluster, evidence, context);
    const user = prompt.user;

    assert.ok(user.includes("Original fix content."), "prompt.user should contain existing page content for merge");
    assert.ok(user.includes("UPDATE or MERGE"), "prompt.user should instruct update/merge for merge action");
    assert.ok(user.includes("merge"), "prompt.user should contain page_plan_action merge");
  });

  it("does not include update_instruction when action is create", () => {
    const context: SynthesisContext = {
      topicTitle: "New topic",
      pageKind: "note",
      observations: [{ summary: "Brand new observation" }],
      relatedPages: [],
      requiredLinks: [],
      pagePlanAction: "create",
    };
    const prompt = buildWikiCuratorPrompt(cluster, evidence, context);
    const user = prompt.user;

    assert.ok(!user.includes("update_instruction"), "prompt.user should NOT contain update_instruction for create");
    assert.ok(!user.includes("UPDATE or MERGE"), "prompt.user should NOT instruct update/merge for create");
    assert.ok(user.includes("create"), "prompt.user should contain page_plan_action create");
  });

  it("does not include existing_page_content when not provided", () => {
    const context: SynthesisContext = {
      topicTitle: "New topic",
      pageKind: "note",
      observations: [{ summary: "Some observation" }],
      relatedPages: [],
      requiredLinks: [],
    };
    const prompt = buildWikiCuratorPrompt(cluster, evidence, context);
    const user = prompt.user;

    assert.ok(!user.includes("existing_page_content"), "prompt.user should NOT contain existing_page_content when not provided");
  });

  it("passes synthesis context through synthesizeCuratedWikiProposal", async () => {
    let capturedUser = "";
    const context: SynthesisContext = {
      topicTitle: "OpenClaw auth expired",
      pageKind: "known_fix",
      observations: [
        { summary: "Auth expired; refresh fixed it", raw_excerpt: "refreshing login fixed memory sync" },
      ],
      existingPageContent: "# OpenClaw auth expired\n\n## Fix\nRefresh login.",
      relatedPages: [{ title: "OpenClaw ACK timing", path: "kb/memory/preferences-openclaw-ack-timing.md" }],
      requiredLinks: ["kb/memory/preferences-openclaw-ack-timing.md"],
      pagePlanAction: "update",
    };

    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      synthesisContext: context,
      client: {
        async generateJson(args: { user: string }) {
          capturedUser = args.user;
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login before retrying memory sync.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-auth-expired.md",
              body_markdown: "# OpenClaw auth expired recovery\n\n## Problem\nMemory sync fails after auth expiry.\n\n## Fix\nRefresh login and retry sync.\n\n## Verification\nRun memory sync again.",
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    assert.ok(capturedUser.includes("OpenClaw auth expired"), "AI client should receive topic title");
    assert.ok(capturedUser.includes("known_fix"), "AI client should receive page kind");
    assert.ok(capturedUser.includes("Auth expired; refresh fixed it"), "AI client should receive observation summary");
    assert.ok(capturedUser.includes("refreshing login fixed memory sync"), "AI client should receive raw_excerpt");
    assert.ok(capturedUser.includes("Refresh login."), "AI client should receive existing page content");
    assert.ok(capturedUser.includes("OpenClaw ACK timing"), "AI client should receive related page title");
    assert.ok(capturedUser.includes("kb/memory/preferences-openclaw-ack-timing.md"), "AI client should receive related page path and required links");
    assert.ok(capturedUser.includes("UPDATE or MERGE"), "AI client should receive update/merge instruction");
  });

  it("repairs AI output that omits supplied relationship links and provenance", async () => {
    const context: SynthesisContext = {
      topicTitle: "OpenClaw auth expired",
      pageKind: "known_fix",
      observations: [{ summary: "Auth expired; refresh fixed it" }],
      relatedPages: [
        { title: "OpenClaw operational coordination", path: "kb/known-fixes/openclaw-operational-coordination.md" },
      ],
      requiredLinks: [
        {
          slug: "openclaw-operational-coordination",
          label: "OpenClaw operational coordination",
          path: "kb/known-fixes/openclaw-operational-coordination.md",
          reason: "entity_overlap",
        },
      ],
      suggestedLinks: [
        {
          slug: "agent-terminal-io-patterns",
          label: "Agent terminal IO patterns",
          path: "kb/known-fixes/agent-terminal-io-patterns.md",
          reason: "related_terminal_io",
        },
      ],
      pagePlanAction: "create",
    };

    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      synthesisContext: context,
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login before retrying memory sync.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-auth-expired.md",
              body_markdown: "# OpenClaw auth expired recovery\n\n## Problem\nMemory sync fails after auth expiry.\n\n## Fix\nRefresh login and retry sync.\n\n## Verification\nRun memory sync again.",
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.proposal.body_markdown, /## Related Wiki Pages/);
      assert.match(result.proposal.body_markdown, /\[\[openclaw-operational-coordination\|OpenClaw operational coordination\]\]/);
      assert.match(result.proposal.body_markdown, /## Reusable Lessons/);
      assert.match(result.proposal.body_markdown, /## Provenance/);
    }
  });

  it("adds resolvable suggested links when AI output contains only non-context wikilinks", async () => {
    const context: SynthesisContext = {
      topicTitle: "OpenClaw gateway status check",
      pageKind: "procedure",
      observations: [{ summary: "Verify gateway and plugin versions before debugging dispatch failures." }],
      relatedPages: [
        { title: "Asynchronous Task UX and Dispatch Mapping Anomalies", path: "kb/notes/wiki-asynchronous-task-ux-and-dispatch-mapping-anomalies.md" },
      ],
      requiredLinks: [],
      suggestedLinks: [
        {
          slug: "wiki-asynchronous-task-ux-and-dispatch-mapping-anomalies",
          label: "Asynchronous Task UX and Dispatch Mapping Anomalies",
          path: "kb/notes/wiki-asynchronous-task-ux-and-dispatch-mapping-anomalies.md",
          reason: "entity_overlap",
        },
      ],
      pagePlanAction: "create",
    };

    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      synthesisContext: context,
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw gateway status check",
              summary: "Verify gateway and plugin versions before dispatch debugging.",
              page_kind: "procedure",
              target_path: "kb/procedures/openclaw-gateway-status-check.md",
              body_markdown: "# OpenClaw gateway status check\n\n## Problem\nDispatch debugging can start from stale gateway state.\n\n## Procedure\nCheck [[asynchronous-task-ux-and-dispatch-mapping-anomalies|dispatch UX]] before changing code.\n\n## Verification\nConfirm gateway and plugin versions match.",
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(
        result.proposal.body_markdown,
        /\[\[wiki-asynchronous-task-ux-and-dispatch-mapping-anomalies\|Asynchronous Task UX and Dispatch Mapping Anomalies\]\]/,
      );
    }
  });

  it("existing synthesizeCuratedWikiProposal callers work without context", async () => {
    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-21T00:00:00.000Z",
      client: {
        async generateJson() {
          return {
            ok: true,
            json: {
              title: "OpenClaw auth expired recovery",
              summary: "Refresh login.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-auth-expired.md",
              body_markdown: "# OpenClaw auth expired recovery\n\n## Problem\nMemory sync failed.\n\n## Fix\nRefresh login.\n\n## Verification\nSync passed.",
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.proposal.title, "OpenClaw auth expired recovery");
      assert.equal(result.proposal.source_count, 2);
    }
  });

  it("includes structured required links and merge candidates in captured prompt", async () => {
    const structuredRequired: StructuredLink[] = [
      { slug: "openclaw-ack-timing", label: "OpenClaw ACK timing", path: "kb/memory/preferences-openclaw-ack-timing.md", reason: "shared_signature" },
    ];
    const mergeCands: MergeCandidate[] = [
      { title: "OpenClaw auth expired", path: "kb/known-fixes/openclaw-auth-expired.md", reason: "same_title_or_slug" },
    ];
    const context: SynthesisContext = {
      topicTitle: "OpenClaw ACK timing",
      pageKind: "preference",
      observations: [{ summary: "User prefers ACK before long tasks" }],
      relatedPages: [],
      requiredLinks: structuredRequired,
      suggestedLinks: [{ slug: "openclaw-repair-loop", label: "OpenClaw repair loop", path: "kb/known-fixes/openclaw-repair-loop.md", reason: "entity_overlap" }],
      mergeCandidates: mergeCands,
      relationshipReasons: ["shared_signature", "entity_overlap"],
      pagePlanAction: "create",
    };
    let capturedUser = "";
    const result = await synthesizeCuratedWikiProposal(cluster, {
      evidence,
      now: "2026-05-23T00:00:00.000Z",
      synthesisContext: context,
      client: {
        async generateJson(args: { user: string }) {
          capturedUser = args.user;
          return {
            ok: true,
            json: {
              title: "OpenClaw ACK timing",
              summary: "Send ACK before long tasks.",
              page_kind: "known_fix",
              target_path: "kb/known-fixes/openclaw-ack-timing.md",
              body_markdown: "# OpenClaw ACK timing\n\n## Problem\nACK was delayed.\n\n## Fix\nSend ACK before long tasks and reference [[openclaw-ack-timing|OpenClaw ACK timing]] when documenting the repair.\n\n## Verification\nTest passed: ACK sent on time.",
              confidence: 0.91,
              risk_notes: [],
            },
          };
        },
      },
    });

    assert.equal(result.ok, true);
    const parsed = JSON.parse(capturedUser) as {
      compiler_context: {
        required_links: StructuredLink[];
        suggested_links: StructuredLink[];
        merge_candidates: MergeCandidate[];
        relationship_reasons: string[];
        link_instruction: string;
      };
    };
    const cc = parsed.compiler_context;
    assert.deepEqual(cc.required_links[0], structuredRequired[0]);
    assert.deepEqual(cc.suggested_links[0], { slug: "openclaw-repair-loop", label: "OpenClaw repair loop", path: "kb/known-fixes/openclaw-repair-loop.md", reason: "entity_overlap" });
    assert.deepEqual(cc.merge_candidates[0], mergeCands[0]);
    assert.deepEqual(cc.relationship_reasons, ["shared_signature", "entity_overlap"]);
    assert.ok(cc.link_instruction.includes("[[slug|label]]"), "prompt should explain wiki link format");
    assert.ok(cc.link_instruction.includes("Do NOT invent"), "prompt should forbid invented wiki links");
  });

  it("normalizes string requiredLinks to structured links in prompt", () => {
    const context: SynthesisContext = {
      topicTitle: "OpenClaw auth expired",
      pageKind: "known_fix",
      observations: [{ summary: "Auth expired" }],
      relatedPages: [],
      requiredLinks: ["kb/memory/preferences-openclaw-ack-timing.md"],
    };
    const prompt = buildWikiCuratorPrompt(cluster, evidence, context);
    const user = prompt.user;

    const parsed = JSON.parse(user) as { compiler_context: { required_links: StructuredLink[] } };
    const links = parsed.compiler_context.required_links;
    assert.equal(links.length, 1);
    assert.equal(links[0].slug, "preferences-openclaw-ack-timing");
    assert.equal(links[0].label, "preferences-openclaw-ack-timing");
    assert.equal(links[0].path, "kb/memory/preferences-openclaw-ack-timing.md");
    assert.equal(links[0].reason, "required_link");
  });
});
