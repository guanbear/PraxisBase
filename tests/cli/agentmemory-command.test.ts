import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agentmemoryCommand } from "@praxisbase/cli/commands/agentmemory.js";
import { sourceCommand } from "@praxisbase/cli/commands/source.js";

async function createKbPage(root: string, relativePath: string, content: string): Promise<void> {
  const fullPath = join(root, relativePath);
  await mkdir(join(fullPath, ".."), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

describe("agentmemory doctor", () => {
  it("returns healthy check when daemon responds ok", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-am-doctor-"));
    await sourceCommand(root, "add", {
      name: "test-agentmemory",
      agent: "agentmemory",
      type: "agentmemory",
      scope: "personal",
      url: "http://localhost:9090",
      json: true,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ status: "ok" }))) as typeof fetch;
    try {
      const output = await agentmemoryCommand(root, "doctor", { json: true });
      const parsed = JSON.parse(output);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.source.name, "test-agentmemory");
      assert.equal(parsed.source.url, "http://localhost:9090");
      assert.equal(parsed.checks[0].id, "agentmemory_health");
      assert.equal(parsed.checks[0].ok, true);
      assert.equal(parsed.checks[0].severity, "info");
      assert.match(parsed.checks[0].message, /healthy/i);
      assert.equal(parsed.checks[1].id, "agentmemory_smart_search");
      assert.equal(parsed.checks[1].ok, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns unhealthy check when daemon fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-am-doctor-fail-"));
    await sourceCommand(root, "add", {
      name: "am-down",
      agent: "agentmemory",
      type: "agentmemory",
      scope: "personal",
      url: "http://localhost:9090",
      json: true,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("error", { status: 500, statusText: "Internal Server Error" })) as typeof fetch;
    try {
      const output = await agentmemoryCommand(root, "doctor", { json: true });
      const parsed = JSON.parse(output);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.checks[0].ok, false);
      assert.equal(parsed.checks[0].severity, "warning");
      assert.match(parsed.checks[0].message, /unhealthy/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("explains the common iii-without-agentmemory-routes 404 state", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-am-doctor-404-"));
    await sourceCommand(root, "add", {
      name: "am-routes-missing",
      agent: "agentmemory",
      type: "agentmemory",
      scope: "personal",
      url: "http://localhost:9090",
      json: true,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("", { status: 404, statusText: "Not Found" })) as typeof fetch;
    try {
      const output = await agentmemoryCommand(root, "doctor", { json: true });
      const parsed = JSON.parse(output);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.checks[0].ok, false);
      assert.match(parsed.checks[0].message, /routes are not registered/i);
      assert.match(parsed.checks[0].message, /node dist\/index\.mjs/);
      assert.equal(parsed.checks.length, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns JSON error when no agentmemory source configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-am-doctor-nosource-"));
    const output = await agentmemoryCommand(root, "doctor", { json: true });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "AGENTMEMORY_NO_SOURCE");
    assert.equal(parsed.retryable, false);
  });
});

describe("agentmemory import", () => {
  it("dry-run returns import results without writing", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-am-import-"));
    await sourceCommand(root, "add", {
      name: "am-import",
      agent: "agentmemory",
      type: "agentmemory",
      scope: "personal",
      url: "http://localhost:3111",
      json: true,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("health")) return new Response(JSON.stringify({ status: "ok" }));
      if (url.includes("memories")) return new Response(JSON.stringify({ memories: [{ id: "mem-1", title: "Test memory", content: "Content." }] }));
      return new Response(JSON.stringify({}));
    }) as typeof fetch;
    try {
      const output = await agentmemoryCommand(root, "import", { json: true });
      const parsed = JSON.parse(output);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.source.name, "am-import");
      assert.equal(parsed.enveloped, 1);
      assert.equal(parsed.status, "completed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns JSON error when no agentmemory source for import", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-am-import-nosource-"));
    const output = await agentmemoryCommand(root, "import", { json: true });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "AGENTMEMORY_NO_SOURCE");
  });
});

describe("agentmemory export", () => {
  it("dry-run returns compact payloads from kb pages", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-am-export-"));
    await createKbPage(root, "kb/known-fixes/auth-expired.md", "# Auth Expired\n\nSession token expired. See [[session-management]].");
    await createKbPage(root, "kb/pitfalls/race.md", "# Race Condition\n\nCommon pitfall.");

    const output = await agentmemoryCommand(root, "export", { mode: "personal", dryRun: true, json: true });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.mode, "personal");
    assert.equal(parsed.pages, 2);
    assert.equal(parsed.payloads.length, 2);
    assert.ok(parsed.payloads.some((p: { title: string }) => p.title === "Auth Expired"));
    assert.ok(parsed.payloads.some((p: { title: string }) => p.title === "Race Condition"));
    assert.equal(parsed.exported, 0);
    assert.equal(parsed.already_present, 0);
    assert.equal(parsed.summary.idempotency, "provenance_hash");
    assert.match(parsed.payloads[0].provenanceHash, /^sha256:/);
    assert.match(parsed.payloads[0].idempotencyKey, /^sha256:/);
  });

  it("does not export review candidates or rejected material", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-am-export-filter-"));
    await createKbPage(root, "kb/known-fixes/real.md", "# Real Fix\n\nStable content.");
    await createKbPage(root, ".praxisbase/inbox/proposals/review-candidate.md", "# Review Candidate\n\nShould not appear.");
    await createKbPage(root, ".praxisbase/exceptions/human-required/rejected.md", "# Rejected\n\nShould not appear.");

    const output = await agentmemoryCommand(root, "export", { mode: "personal", dryRun: true, json: true });
    const parsed = JSON.parse(output);
    assert.equal(parsed.pages, 1);
    assert.equal(parsed.payloads.length, 1);
    assert.equal(parsed.payloads[0].title, "Real Fix");
  });

  it("blocks team export by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-am-export-team-"));
    await createKbPage(root, "kb/known-fixes/test.md", "# Test\n\nContent.");

    const output = await agentmemoryCommand(root, "export", { mode: "team", dryRun: true, json: true });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, false);
    assert.ok(parsed.errors.some((e: string) => e.includes("AGENTMEMORY_TEAM_EXPORT_BLOCKED")));
  });

  it("exports to the daemon only when --write is requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-am-export-write-"));
    await sourceCommand(root, "add", {
      name: "am-export",
      agent: "agentmemory",
      type: "agentmemory",
      scope: "personal",
      url: "http://localhost:3111",
      json: true,
    });
    await createKbPage(root, "kb/known-fixes/real.md", "# Real Fix\n\nStable content.");

    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      return new Response(JSON.stringify({ id: "exported-1" }));
    }) as typeof fetch;
    try {
      const dryRunOutput = await agentmemoryCommand(root, "export", { mode: "personal", dryRun: true, json: true });
      const dryRunParsed = JSON.parse(dryRunOutput);
      assert.equal(dryRunParsed.exported, 0);
      assert.equal(calls.length, 0);

      const writeOutput = await agentmemoryCommand(root, "export", { mode: "personal", write: true, json: true });
      const writeParsed = JSON.parse(writeOutput);
      assert.equal(writeParsed.ok, true);
      assert.equal(writeParsed.exported, 1);
      assert.equal(writeParsed.already_present, 0);
      assert.ok(calls.some((call) => call.includes("POST") && call.includes("agentmemory/remember")));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns explicit export failure when the requested AgentMemory target fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-am-export-fail-"));
    await sourceCommand(root, "add", {
      name: "am-export-fail",
      agent: "agentmemory",
      type: "agentmemory",
      scope: "personal",
      url: "http://localhost:3111",
      json: true,
    });
    await createKbPage(root, "kb/known-fixes/real.md", "# Real Fix\n\nStable content.");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("down", { status: 503, statusText: "Service Unavailable" })) as typeof fetch;
    try {
      const output = await agentmemoryCommand(root, "export", { mode: "personal", write: true, json: true });
      const parsed = JSON.parse(output);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.exported, 0);
      assert.ok(parsed.errors.some((error: string) => error.includes("503")));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("allows team export only with explicit allow flag and write", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-am-export-team-allow-"));
    await sourceCommand(root, "add", {
      name: "am-team",
      agent: "agentmemory",
      type: "agentmemory",
      scope: "team",
      url: "http://localhost:3111",
      json: true,
    });
    await createKbPage(root, "kb/known-fixes/team.md", "---\nscope: team\n---\n# Team Fix\n\nStable content.");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ id: "team-exported" }))) as typeof fetch;
    try {
      const output = await agentmemoryCommand(root, "export", {
        mode: "team",
        write: true,
        allowTeamExport: true,
        json: true,
      });
      const parsed = JSON.parse(output);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.exported, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps bearer token values out of JSON output", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-am-export-notoken-"));
    await createKbPage(root, "kb/known-fixes/test.md", "# Test\n\nContent.");

    const output = await agentmemoryCommand(root, "export", { mode: "personal", dryRun: true, json: true });
    assert.doesNotMatch(output, /Bearer\s+[^\s]/);
    assert.doesNotMatch(output, /secret|password/i);
  });
});

describe("agentmemory unknown subcommand", () => {
  it("returns JSON error for unknown subcommand", async () => {
    const output = await agentmemoryCommand("/tmp", "bogus", { json: true });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "AGENTMEMORY_ERROR");
    assert.match(parsed.message, /Unknown subcommand/);
  });
});
