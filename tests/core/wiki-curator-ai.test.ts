import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PROTOCOL_VERSION,
  curateWiki,
  synthesizeCuratedWikiProposal,
  type WikiEvidenceCluster,
  type WikiEvidenceItem,
} from "@praxisbase/core";
import { writeAiProviderConfig } from "@praxisbase/core/ai/config.js";

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
      assert.match(result.proposal.body_markdown, /## Verification/);
      assert.ok(result.proposal.guards.some((guard) => guard.id === "body" && guard.ok));
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
});
