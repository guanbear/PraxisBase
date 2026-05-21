import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runHarvest } from "@praxisbase/core/experience/harvest.js";
import { addRemoteSource } from "@praxisbase/core/experience/remote-sources.js";

async function readFilesRecursively(root: string, relativeDir: string): Promise<string> {
  const base = join(root, relativeDir);
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return "";
  }
  const chunks: string[] = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      chunks.push(await readFilesRecursively(root, relativePath));
    } else if (entry.isFile()) {
      chunks.push(await readFile(join(root, relativePath), "utf8"));
    }
  }
  return chunks.join("\n");
}

describe("runHarvest", () => {
  it("harvests an OpenClaw export without changing stable knowledge", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-export-"));
    const exportPath = join(root, "openclaw-export.json");
    await writeFile(exportPath, JSON.stringify({
      items: [{
        id: "remote-auth-expired-1",
        summary: "OpenClaw detected Claude auth expired and asked the user to login again.",
        signature: "openclaw:claude-auth-expired",
        raw_log: "RAW LOG MUST NOT BE WRITTEN",
      }],
    }));

    const report = await runHarvest(root, {
      openclawExports: [exportPath],
      buildSite: true,
      json: true,
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(report.authority_mode, "personal-local");
    assert.equal(report.sources[0].imported, 1);
    assert.equal(report.changed_stable_knowledge, false);
    await assert.doesNotReject(() => stat(join(root, "dist/index.html")));
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
    const rawReport = await readFile(join(root, ".praxisbase/reports/harvest", `${report.id}.json`), "utf8");
    assert.equal(rawReport.includes("RAW LOG MUST NOT BE WRITTEN"), false);
    assert.equal((await readFilesRecursively(root, ".praxisbase/staging/openclaw")).includes("RAW LOG MUST NOT BE WRITTEN"), false);
    assert.equal((await readFilesRecursively(root, ".praxisbase/raw-vault/refs")).includes("RAW LOG MUST NOT BE WRITTEN"), false);
  });

  it("harvests local Codex sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-codex-"));
    const source = join(root, "session.txt");
    await writeFile(source, "Implemented wiki compile workflow. pnpm check passed.");
    const report = await runHarvest(root, {
      codexSources: [source],
      buildSite: true,
      now: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(report.sources[0].agent, "codex");
    assert.equal(report.sources[0].imported, 1);
  });

  it("harvests local OpenClaw sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-openclaw-"));
    const source = join(root, "openclaw.log");
    await writeFile(source, "Claude authentication expired. Please login again. Refreshing login fixed OpenClaw sync and pnpm check passed.");
    const report = await runHarvest(root, {
      openclawSources: [source],
      now: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(report.sources[0].agent, "openclaw");
    assert.equal(report.sources[0].source_type, "local");
    assert.equal(report.sources[0].imported, 1);
    assert.ok(report.outputs.some((output) => output.startsWith(".praxisbase/reports/wiki-curation/")));
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    const proposals = await Promise.all(proposalFiles.map(async (file) => (
      JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", file), "utf8"))
    )));
    assert.ok(proposals.some((proposal) => proposal.type === "wiki_curated_proposal"));
  });

  it("harvests registered file remotes", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-remote-file-"));
    const exportPath = join(root, "openclaw-export.json");
    await writeFile(exportPath, JSON.stringify({
      items: [{ id: "remote-one", summary: "Registered remote export summary", signature: "openclaw:remote-one" }],
    }));
    await addRemoteSource(root, {
      name: "file-prod",
      sourceType: "file",
      agent: "openclaw",
      path: exportPath,
      now: "2026-05-20T00:00:00.000Z",
    });

    const report = await runHarvest(root, {
      remoteNames: ["file-prod"],
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(report.sources[0].name, "file-prod");
    assert.equal(report.sources[0].source_type, "file");
    assert.equal(report.sources[0].imported, 1);
  });

  it("harvests all registered remotes when --all is set", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-all-"));
    const exportPath = join(root, "openclaw-export.json");
    await writeFile(exportPath, JSON.stringify({
      items: [{ id: "remote-all", summary: "All registered remote export summary", signature: "openclaw:remote-all" }],
    }));
    await addRemoteSource(root, {
      name: "file-prod",
      sourceType: "file",
      agent: "openclaw",
      path: exportPath,
      now: "2026-05-20T00:00:00.000Z",
    });

    const report = await runHarvest(root, {
      all: true,
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(report.sources.length, 1);
    assert.equal(report.sources[0].name, "file-prod");
    assert.equal(report.sources[0].imported, 1);
  });

  it("harvests registered OpenClaw API remotes through M12.1 fetch", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-openclaw-api-"));
    await addRemoteSource(root, {
      name: "openclaw-prod",
      sourceType: "openclaw-api",
      agent: "openclaw",
      remote: "prod",
      now: "2026-05-20T00:00:00.000Z",
    });

    const report = await runHarvest(root, {
      remoteNames: ["openclaw-prod"],
      openclawEnvForTests: {
        OPENCLAW_TOKEN: "test-token",
        OPENCLAW_BASE_URL: "https://openclaw.example.test",
      },
      fetchImpl: async () => new Response(JSON.stringify({
        items: [{ id: "api-one", summary: "API remote export summary", signature: "openclaw:api-one" }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(report.sources[0].name, "openclaw-prod");
    assert.equal(report.sources[0].source_type, "openclaw-api");
    assert.equal(report.sources[0].fetched, 1);
    assert.equal(report.sources[0].imported, 1);
  });

  it("runs review and promote only when explicitly requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-review-promote-"));
    await writeFile(join(root, "proposal.json"), JSON.stringify({
      id: "proposal_harvest_known_fix",
      protocol_version: "0.1",
      type: "knowledge_proposal",
      scope: "team",
      action: "create",
      target_type: "known_fix",
      target_id: "harvest-known-fix",
      agent_id: "agent-1",
      agent_type: "temporary_repair_agent",
      environment_id: "sandbox",
      run_id: "run-1",
      idempotency_key: "proposal_harvest_known_fix",
      evidence: {
        source_uri: "log://test",
        source_hash: "sha256:abc",
        excerpt: "Fixed.",
        repair_result: "success",
        verification: "Verified.",
      },
      patch: { path: "kb/known-fixes/harvest-known-fix.md", content: "# Harvest Known Fix\n" },
      created_at: "2026-05-20T00:00:00.000Z",
    }));
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await writeFile(join(root, ".praxisbase/inbox/proposals/proposal_harvest_known_fix.json"), await readFile(join(root, "proposal.json"), "utf8"));

    const reviewed = await runHarvest(root, {
      autoReview: true,
      now: "2026-05-20T00:00:00.000Z",
    });
    await assert.doesNotReject(() => stat(join(root, ".praxisbase/inbox/reviews/review_proposal_harvest_known_fix.json")));
    await assert.rejects(() => stat(join(root, "kb/known-fixes/harvest-known-fix.md")), { code: "ENOENT" });
    assert.equal(reviewed.changed_stable_knowledge, false);

    const promoted = await runHarvest(root, {
      autoReview: true,
      autoPromote: true,
      now: "2026-05-20T00:00:01.000Z",
    });
    await assert.doesNotReject(() => stat(join(root, "kb/known-fixes/harvest-known-fix.md")));
    assert.equal(promoted.changed_stable_knowledge, true);
  });

  it("reviews curated wiki proposals during harvest auto-review", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-curated-review-"));
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await writeFile(join(root, ".praxisbase/inbox/proposals/wiki_curated_openclaw_auth.json"), JSON.stringify({
      id: "wiki_curated_openclaw_auth",
      protocol_version: "0.1",
      type: "wiki_curated_proposal",
      target_path: "kb/known-fixes/openclaw-auth-expired.md",
      action: "create",
      page_kind: "known_fix",
      scope: "personal",
      title: "OpenClaw auth expired recovery",
      summary: "Refresh login before retrying memory sync.",
      body_markdown: "# OpenClaw auth expired recovery\n\n## Problem\nAuth expired.\n\n## Fix\n- Refresh login.\n\n## Verification\n- pnpm test passed\n",
      source_refs: ["raw-vault://codex/session-1"],
      source_hashes: ["sha256:session1"],
      source_count: 1,
      evidence_ids: ["ev1"],
      confidence: 0.92,
      maturity: "draft",
      provenance: [{ source_ref: "raw-vault://codex/session-1", source_hash: "sha256:session1" }],
      review_hint: { why_review: "curated repeated evidence", suggested_decision: "approve", risk_notes: [] },
      guards: [{ id: "path", ok: true, message: "allowed" }],
      created_at: "2026-05-20T00:00:00.000Z",
    }));

    await runHarvest(root, {
      autoReview: true,
      now: "2026-05-20T00:00:00.000Z",
    });

    await assert.doesNotReject(() => stat(join(root, ".praxisbase/inbox/reviews/review_wiki_curated_openclaw_auth.json")));
  });
});
