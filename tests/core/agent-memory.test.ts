import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AgentMemoryCandidateSchema,
  AgentMemoryIngestReportSchema,
  RealWikiSmokeReportSchema,
  protocolPaths,
} from "@praxisbase/core";
import { scanAgentMemory } from "@praxisbase/core/experience/agent-memory.js";
import { ingestAgentMemory } from "@praxisbase/core/experience/agent-memory.js";
import { fetchOpenClawRemoteMemory } from "@praxisbase/core/experience/openclaw-remote.js";

describe("agent memory ingestion protocol", () => {
  it("exposes M12 paths and validates report schemas", () => {
    assert.equal(protocolPaths.reportsMemoryIngest, ".praxisbase/reports/memory-ingest");
    assert.equal(protocolPaths.runsMemoryIngest, ".praxisbase/runs/memory-ingest");

    const candidate = AgentMemoryCandidateSchema.parse({
      id: "agent-memory-candidate_codex_session_1",
      agent: "codex",
      kind: "codex_session",
      source_path: "sessions/session-1.json",
      source_ref: "raw-vault://codex/session-1",
      source_hash: "sha256:session1",
      size_bytes: 128,
      warnings: [],
    });
    assert.equal(candidate.agent, "codex");

    const ingest = AgentMemoryIngestReportSchema.parse({
      id: "agent-memory-ingest_codex",
      protocol_version: "0.1",
      type: "agent_memory_ingest_report",
      agent: "codex",
      mode: "dry-run",
      scanned: 1,
      imported: 0,
      duplicates: 0,
      skipped: 0,
      unsafe: 0,
      outputs: [],
      warnings: [],
      changed_stable_knowledge: false,
      created_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(ingest.changed_stable_knowledge, false);

    const smoke = RealWikiSmokeReportSchema.parse({
      id: "real-wiki-smoke_codex",
      protocol_version: "0.1",
      type: "real_wiki_smoke_report",
      agent: "codex",
      imported: 1,
      duplicates: 0,
      unsafe: 0,
      proposal_candidates: 1,
      graph_nodes: 1,
      graph_broken_links: 0,
      site_pages: 1,
      context_items: 1,
      outputs: ["dist/index.html"],
      changed_stable_knowledge: false,
      created_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(smoke.type, "real_wiki_smoke_report");
  });
});

describe("scanAgentMemory", () => {
  it("scans Codex session fixtures without writing files", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-codex-scan-"));
    const sessions = join(root, "codex-sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.json"), JSON.stringify({
      id: "session-1",
      messages: [
        { role: "user", content: "Implement wiki graph retrieval." },
        { role: "assistant", content: "Changed packages/core/src/wiki/resolver.ts and ran pnpm check." }
      ],
      created_at: "2026-05-20T00:00:00.000Z"
    }));

    const result = await scanAgentMemory(root, {
      agent: "codex",
      sources: [sessions],
      limit: 10,
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].agent, "codex");
    assert.equal(result.candidates[0].kind, "codex_session");
    assert.ok(result.candidates[0].source_hash.startsWith("sha256:"));
    await assert.rejects(() => stat(join(root, ".praxisbase/raw-vault/refs")), { code: "ENOENT" });
  });

  it("expands explicit tilde source paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-codex-tilde-"));
    const previousHome = process.env.HOME;
    try {
      process.env.HOME = root;
      await writeFile(join(root, "session-tilde.txt"), "Implemented tilde path support and tests passed.");

      const result = await scanAgentMemory(root, {
        agent: "codex",
        sources: ["~/session-tilde.txt"],
        limit: 10,
        now: "2026-05-20T00:00:00.000Z",
      });

      assert.equal(result.candidates.length, 1);
      assert.equal(result.candidates[0].source_path, join(root, "session-tilde.txt"));
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  it("scans OpenClaw logs and detects known signatures", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-scan-"));
    const logs = join(root, "logs");
    await mkdir(logs, { recursive: true });
    await writeFile(join(logs, "openclaw.log"), "Claude authentication expired. Please login again.");

    const result = await scanAgentMemory(root, {
      agent: "openclaw",
      sources: [logs],
      limit: 10,
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].kind, "openclaw_log");
    assert.ok(result.candidates[0].summary_hint?.includes("openclaw:claude-auth-expired"));
  });

  it("scans staged OpenClaw remote envelopes as redacted memory candidates", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-staged-scan-"));
    const source = join(root, "openclaw-export.json");
    await writeFile(source, JSON.stringify({
      items: [{
        id: "remote-auth-expired-1",
        summary: "OpenClaw detected Claude auth expired and asked the user to login again.",
        signature: "openclaw:claude-auth-expired",
        raw_log: "RAW REMOTE LOG SHOULD NOT BE INGESTED",
      }],
    }));

    const fetchReport = await fetchOpenClawRemoteMemory(root, {
      provider: "exported-json",
      sources: [source],
      now: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(fetchReport.staged, 1);

    const result = await scanAgentMemory(root, {
      agent: "openclaw",
      sources: [join(root, protocolPaths.stagingOpenClaw)],
      limit: 10,
      now: "2026-05-20T00:00:00.000Z",
    });

    const envelope = JSON.parse(await readFile(join(root, fetchReport.outputs[0]), "utf8"));
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].source_hash, envelope.source_hash);
    assert.equal(result.candidates[0].source_ref, envelope.source_ref);
    assert.equal(result.candidates[0].summary_hint, envelope.redacted_summary);
  });
});

describe("ingestAgentMemory", () => {
  it("writes raw-vault refs and captures without raw session text", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-codex-ingest-"));
    const source = join(root, "session-1.txt");
    await writeFile(source, "User: build wiki\nAssistant: implemented graph retrieval and pnpm check passed\nRAW SHOULD NOT BE STORED");

    const report = await ingestAgentMemory(root, {
      agent: "codex",
      sources: [source],
      mode: "write",
      limit: 10,
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(report.imported, 1);
    assert.equal(report.changed_stable_knowledge, false);
    const refs = await readdir(join(root, ".praxisbase/raw-vault/refs"));
    const captures = await readdir(join(root, ".praxisbase/outbox/captures"));
    assert.equal(refs.length, 1);
    assert.equal(captures.length, 1);
    const refRaw = await readFile(join(root, ".praxisbase/raw-vault/refs", refs[0]), "utf8");
    const captureRaw = await readFile(join(root, ".praxisbase/outbox/captures", captures[0]), "utf8");
    assert.equal(refRaw.includes("RAW SHOULD NOT BE STORED"), false);
    assert.equal(captureRaw.includes("RAW SHOULD NOT BE STORED"), false);
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
  });

  it("deduplicates imported source hashes", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-codex-dedupe-"));
    const source = join(root, "session-1.txt");
    await writeFile(source, "Implemented wiki site and tests passed.");

    const first = await ingestAgentMemory(root, { agent: "codex", sources: [source], mode: "write", now: "2026-05-20T00:00:00.000Z" });
    const second = await ingestAgentMemory(root, { agent: "codex", sources: [source], mode: "write", now: "2026-05-20T00:00:00.000Z" });
    assert.equal(first.imported, 1);
    assert.equal(second.imported, 0);
    assert.equal(second.duplicates, 1);
  });

  it("routes private material to human-required exceptions", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-codex-private-"));
    const source = join(root, "session-secret.txt");
    await writeFile(source, "The token abc123 was printed.");

    const report = await ingestAgentMemory(root, { agent: "codex", sources: [source], mode: "write", now: "2026-05-20T00:00:00.000Z" });
    assert.equal(report.imported, 0);
    assert.equal(report.unsafe, 1);
    const exceptions = await readdir(join(root, ".praxisbase/exceptions/human-required"));
    assert.equal(exceptions.length, 1);
  });

  it("ingests staged OpenClaw remote envelopes without raw remote logs", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-staged-ingest-"));
    const source = join(root, "openclaw-export.json");
    await writeFile(source, JSON.stringify({
      items: [{
        id: "remote-workspace-lock-1",
        summary: "OpenClaw workspace lock was detected and cleared.",
        signature: "openclaw:workspace-lock-stuck",
        raw_log: "RAW REMOTE LOG SHOULD NOT BE WRITTEN",
      }],
    }));

    const fetchReport = await fetchOpenClawRemoteMemory(root, {
      provider: "exported-json",
      sources: [source],
      now: "2026-05-20T00:00:00.000Z",
    });
    const envelope = JSON.parse(await readFile(join(root, fetchReport.outputs[0]), "utf8"));

    const report = await ingestAgentMemory(root, {
      agent: "openclaw",
      sources: [join(root, protocolPaths.stagingOpenClaw)],
      mode: "write",
      limit: 10,
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(report.imported, 1);
    const refs = await readdir(join(root, ".praxisbase/raw-vault/refs"));
    const refRaw = await readFile(join(root, ".praxisbase/raw-vault/refs", refs[0]), "utf8");
    assert.equal(refRaw.includes("RAW REMOTE LOG SHOULD NOT BE WRITTEN"), false);
    assert.equal(refRaw.includes(envelope.redacted_summary), true);
    assert.equal(refRaw.includes(envelope.source_hash), true);
  });
});
