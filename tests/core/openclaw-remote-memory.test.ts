import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, stat, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  AgentMemoryFetchReportSchema,
  OpenClawRemoteDoctorReportSchema,
  OpenClawRemoteMemoryEnvelopeSchema,
  protocolPaths,
} from "@praxisbase/core";
import { fetchOpenClawRemoteMemory, doctorOpenClawRemote } from "@praxisbase/core/experience/openclaw-remote.js";

describe("OpenClaw remote memory protocol", () => {
  it("exposes M12.1 paths and validates remote schemas", () => {
    assert.equal(protocolPaths.stagingOpenClaw, ".praxisbase/staging/openclaw");
    assert.equal(protocolPaths.reportsMemoryFetch, ".praxisbase/reports/memory-fetch");
    assert.equal(protocolPaths.runsMemoryFetch, ".praxisbase/runs/memory-fetch");

    const envelope = OpenClawRemoteMemoryEnvelopeSchema.parse({
      id: "openclaw-remote_remote-auth-expired-1",
      protocol_version: "0.1",
      type: "openclaw_remote_memory",
      provider: "exported-json",
      remote_id: "remote-auth-expired-1",
      source_ref: "openclaw://exported-json/remote-auth-expired-1",
      source_hash: "sha256:abc",
      redacted_summary: "OpenClaw detected Claude auth expired.",
      signature: "openclaw:claude-auth-expired",
      fetched_at: "2026-05-20T00:00:00.000Z",
      warnings: [],
    });
    assert.equal(envelope.provider, "exported-json");

    const fetchReport = AgentMemoryFetchReportSchema.parse({
      id: "memory-fetch_openclaw_exported-json",
      protocol_version: "0.1",
      type: "agent_memory_fetch_report",
      agent: "openclaw",
      provider: "exported-json",
      runtime_mode: "source",
      fetched: 1,
      staged: 1,
      duplicates: 0,
      skipped: 0,
      unsafe: 0,
      outputs: [".praxisbase/staging/openclaw/openclaw-remote_remote-auth-expired-1.json"],
      warnings: [],
      changed_stable_knowledge: false,
      created_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(fetchReport.changed_stable_knowledge, false);

    const doctor = OpenClawRemoteDoctorReportSchema.parse({
      id: "openclaw-remote-doctor_openclaw-api",
      protocol_version: "0.1",
      type: "openclaw_remote_doctor_report",
      provider: "openclaw-api",
      runtime_mode: "source",
      ok: false,
      checks: [
        { id: "openclaw-token", ok: false, severity: "error", message: "OPENCLAW_TOKEN is not set." },
      ],
      warnings: ["OPENCLAW_TOKEN is not set."],
      created_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(doctor.ok, false);
  });
});

describe("fetchOpenClawRemoteMemory exported-json", () => {
  it("stages safe envelopes without raw remote body", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-remote-export-"));
    try {
      const source = join(root, "openclaw-export.json");
      await writeFile(source, JSON.stringify({
        items: [{
          id: "remote-auth-expired-1",
          summary: "OpenClaw detected Claude auth expired and asked the user to login again.",
          signature: "openclaw:claude-auth-expired",
          created_at: "2026-05-20T00:00:00.000Z",
          raw_log: "RAW REMOTE LOG SHOULD NOT BE STAGED",
        }],
      }));

      const report = await fetchOpenClawRemoteMemory(root, {
        provider: "exported-json",
        sources: [source],
        now: "2026-05-20T00:00:00.000Z",
        runtimeMode: "source",
      });

      assert.equal(report.staged, 1);
      assert.equal(report.changed_stable_knowledge, false);
      const staged = await readdir(join(root, ".praxisbase/staging/openclaw"));
      assert.equal(staged.length, 1);
      const raw = await readFile(join(root, ".praxisbase/staging/openclaw", staged[0]), "utf8");
      assert.equal(raw.includes("RAW REMOTE LOG SHOULD NOT BE STAGED"), false);
      assert.equal(raw.includes("openclaw:claude-auth-expired"), true);
      await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
      await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("deduplicates by source_hash across staged envelopes", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-dedup-"));
    try {
      const source = join(root, "export.json");
      const item = {
        id: "dup-1",
        summary: "Dedup test item",
        signature: "openclaw:dedup-test",
      };
      await writeFile(source, JSON.stringify({ items: [item] }));

      const report1 = await fetchOpenClawRemoteMemory(root, {
        provider: "exported-json",
        sources: [source],
        now: "2026-05-20T00:00:00.000Z",
        runtimeMode: "source",
      });
      assert.equal(report1.staged, 1);
      assert.equal(report1.duplicates, 0);

      const report2 = await fetchOpenClawRemoteMemory(root, {
        provider: "exported-json",
        sources: [source],
        now: "2026-05-20T00:00:01.000Z",
        runtimeMode: "source",
      });
      assert.equal(report2.staged, 0);
      assert.equal(report2.duplicates, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("routes private summaries to human-required exceptions", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-private-"));
    try {
      const source = join(root, "private.json");
      await writeFile(source, JSON.stringify({
        items: [{
          id: "private-1",
          summary: "Agent used token sk-abc123secret to authenticate with password=hunter2",
        }],
      }));

      const report = await fetchOpenClawRemoteMemory(root, {
        provider: "exported-json",
        sources: [source],
        now: "2026-05-20T00:00:00.000Z",
        runtimeMode: "source",
      });

      assert.equal(report.unsafe, 1);
      assert.equal(report.staged, 0);
      const exceptionFiles = await readdir(join(root, ".praxisbase/exceptions/human-required"));
      assert.equal(exceptionFiles.length, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("supports top-level array format", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-array-"));
    try {
      const source = join(root, "array.json");
      await writeFile(source, JSON.stringify([
        { id: "arr-1", summary: "Array item 1", signature: "openclaw:arr-1" },
        { id: "arr-2", summary: "Array item 2", signature: "openclaw:arr-2" },
      ]));

      const report = await fetchOpenClawRemoteMemory(root, {
        provider: "exported-json",
        sources: [source],
        now: "2026-05-20T00:00:00.000Z",
        runtimeMode: "source",
      });

      assert.equal(report.staged, 2);
      assert.equal(report.fetched, 2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes fetch report and run record", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-report-"));
    try {
      const source = join(root, "report.json");
      await writeFile(source, JSON.stringify({
        items: [{ id: "rpt-1", summary: "Report test", signature: "openclaw:rpt" }],
      }));

      const report = await fetchOpenClawRemoteMemory(root, {
        provider: "exported-json",
        sources: [source],
        now: "2026-05-20T00:00:00.000Z",
        runtimeMode: "source",
      });

      assert.equal(report.staged, 1);

      const reportFiles = await readdir(join(root, ".praxisbase/reports/memory-fetch"));
      assert.ok(reportFiles.length >= 1);

      const runFiles = await readdir(join(root, ".praxisbase/runs/memory-fetch"));
      assert.ok(runFiles.length >= 1);

      const reportContent = JSON.parse(
        await readFile(join(root, ".praxisbase/reports/memory-fetch", reportFiles[0]), "utf8")
      );
      assert.equal(reportContent.changed_stable_knowledge, false);
      assert.equal(reportContent.type, "agent_memory_fetch_report");
      assert.equal(reportContent.agent, "openclaw");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires sources for exported-json provider", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-nosrc-"));
    try {
      const report = await fetchOpenClawRemoteMemory(root, {
        provider: "exported-json",
        sources: [],
        now: "2026-05-20T00:00:00.000Z",
        runtimeMode: "source",
      });

      assert.equal(report.staged, 0);
      assert.equal(report.fetched, 0);
      assert.equal(report.skipped, 0);
      assert.ok(report.warnings.some((w) => w.includes("source")));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("counts missing source files as skipped", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-missing-source-"));
    try {
      const report = await fetchOpenClawRemoteMemory(root, {
        provider: "exported-json",
        sources: [join(root, "missing.json")],
        now: "2026-05-20T00:00:00.000Z",
        runtimeMode: "source",
      });

      assert.equal(report.staged, 0);
      assert.equal(report.skipped, 1);
      assert.ok(report.warnings.some((w) => w.includes("source_not_found")));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("fetchOpenClawRemoteMemory openclaw-api", () => {
  it("fetches from a mock API without persisting auth secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-remote-api-"));
    const token = "secret-token-should-not-be-written";
    const server = createServer((req, res) => {
      assert.equal(req.headers.authorization, `Bearer ${token}`);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        items: [{
          id: "remote-api-1",
          summary: "OpenClaw workspace lock was detected and cleared.",
          signature: "openclaw:workspace-lock-stuck",
          created_at: "2026-05-20T00:00:00.000Z",
        }],
      }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");

    try {
      const report = await fetchOpenClawRemoteMemory(root, {
        provider: "openclaw-api",
        remote: "workspace/project",
        limit: 1,
        runtimeMode: "source",
        now: "2026-05-20T00:00:00.000Z",
        env: {
          OPENCLAW_TOKEN: token,
          OPENCLAW_BASE_URL: `http://127.0.0.1:${address.port}`,
        },
      });
      server.close();

      assert.equal(report.staged, 1);
      const reportRaw = await readFile(join(root, ".praxisbase/reports/memory-fetch", `${report.id}.json`), "utf8");
      assert.equal(reportRaw.includes(token), false);
      assert.equal(reportRaw.includes("Authorization"), false);
    } finally {
      server.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("doctorOpenClawRemote", () => {
  async function writeStagingIgnore(root: string): Promise<void> {
    await writeFile(join(root, ".gitignore"), ".praxisbase/staging/\n");
  }

  it("reports missing OPENCLAW_TOKEN for openclaw-api", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-remote-doctor-"));
    try {
      await writeStagingIgnore(root);
      const report = await doctorOpenClawRemote(root, {
        provider: "openclaw-api",
        runtimeMode: "source",
        env: {},
        now: "2026-05-20T00:00:00.000Z",
      });

      assert.equal(report.ok, false);
      assert.ok(report.checks.some((check) => check.id === "openclaw-token" && check.ok === false));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports exported-json provider as available", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-doctor-export-"));
    try {
      await writeStagingIgnore(root);
      const report = await doctorOpenClawRemote(root, {
        provider: "exported-json",
        runtimeMode: "source",
        env: {},
        now: "2026-05-20T00:00:00.000Z",
      });

      assert.equal(report.ok, true);
      assert.ok(report.checks.some((check) => check.id === "exported-json-provider" && check.ok === true));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses process environment when env is omitted", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-doctor-process-env-"));
    const previousToken = process.env.OPENCLAW_TOKEN;
    try {
      await writeStagingIgnore(root);
      process.env.OPENCLAW_TOKEN = "process-env-token";
      const report = await doctorOpenClawRemote(root, {
        provider: "openclaw-api",
        runtimeMode: "source",
        now: "2026-05-20T00:00:00.000Z",
      });

      assert.equal(report.checks.some((check) => check.id === "openclaw-token" && check.ok === true), true);
    } finally {
      if (previousToken === undefined) {
        delete process.env.OPENCLAW_TOKEN;
      } else {
        process.env.OPENCLAW_TOKEN = previousToken;
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports invalid OPENCLAW_BASE_URL", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-doctor-url-"));
    try {
      await writeStagingIgnore(root);
      const report = await doctorOpenClawRemote(root, {
        provider: "openclaw-api",
        runtimeMode: "source",
        env: {
          OPENCLAW_TOKEN: "test-token",
          OPENCLAW_BASE_URL: "not-a-valid-url",
        },
        now: "2026-05-20T00:00:00.000Z",
      });

      assert.equal(report.ok, false);
      assert.ok(report.checks.some((check) => check.id === "openclaw-base-url" && check.ok === false));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("makes no network calls for exported-json doctor", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-doctor-nonetwork-"));
    try {
      await writeStagingIgnore(root);
      const report = await doctorOpenClawRemote(root, {
        provider: "exported-json",
        runtimeMode: "source",
        env: {},
        now: "2026-05-20T00:00:00.000Z",
      });

      assert.equal(report.ok, true);
      assert.equal(report.warnings.length, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes report when writeReport is true", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-doctor-write-"));
    try {
      await writeStagingIgnore(root);
      await doctorOpenClawRemote(root, {
        provider: "exported-json",
        runtimeMode: "source",
        env: {},
        now: "2026-05-20T00:00:00.000Z",
        writeReport: true,
      });

      const reportFiles = await readdir(join(root, ".praxisbase/reports/memory-fetch"));
      assert.ok(reportFiles.length >= 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("warns when staging is not ignored by Git", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-doctor-ignore-"));
    try {
      await writeFile(join(root, ".gitignore"), "dist/\n");
      const report = await doctorOpenClawRemote(root, {
        provider: "exported-json",
        runtimeMode: "source",
        env: {},
        now: "2026-05-20T00:00:00.000Z",
      });

      assert.equal(report.ok, false);
      assert.ok(report.warnings.includes("staging_not_ignored"));
      assert.ok(report.checks.some((check) =>
        check.id === "staging-gitignore" && check.ok === false && check.severity === "warning"
      ));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
