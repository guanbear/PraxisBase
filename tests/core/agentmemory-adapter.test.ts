import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AgentMemoryClient } from "@praxisbase/core/experience/agentmemory-client.js";
import { resolveAgentMemorySource } from "@praxisbase/core/experience/agentmemory-adapter.js";
import { addExperienceSource } from "@praxisbase/core/experience/source-config.js";

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function queuedFetch(responses: Response[]): typeof fetch {
  return (async () => {
    const response = responses.shift();
    assert.ok(response, "unexpected fetch call");
    return response;
  }) as typeof fetch;
}

describe("AgentMemoryClient REST", () => {
  it("reads health and livez status", async () => {
    const client = new AgentMemoryClient({
      baseUrl: "http://localhost:3111",
      fetchImpl: queuedFetch([
        jsonResponse({ status: "ok" }),
        jsonResponse({ status: "alive" }),
      ]),
    });

    assert.deepEqual(await client.health(), { ok: true, status: "ok" });
    assert.deepEqual(await client.livez(), { ok: true, status: "alive" });
  });

  it("returns ok false on HTTP and network failures", async () => {
    const httpClient = new AgentMemoryClient({
      baseUrl: "http://localhost:3111",
      fetchImpl: queuedFetch([new Response("error", { status: 500, statusText: "Internal Server Error" })]),
    });
    const httpResult = await httpClient.health();
    assert.equal(httpResult.ok, false);
    assert.match(httpResult.error ?? "", /500/);

    const networkClient = new AgentMemoryClient({
      baseUrl: "http://localhost:3111",
      fetchImpl: (async () => {
        throw new Error("connection refused");
      }) as typeof fetch,
    });
    const networkResult = await networkClient.health();
    assert.equal(networkResult.ok, false);
    assert.match(networkResult.error ?? "", /connection refused/);
  });

  it("normalizes smart-search, memories, sessions, and remember responses", async () => {
    const seen: Array<{ url: string; method?: string; body?: string }> = [];
    const client = new AgentMemoryClient({
      baseUrl: "http://localhost:3111",
      fetchImpl: (async (input, init) => {
        seen.push({ url: String(input), method: init?.method, body: init?.body?.toString() });
        if (String(input).includes("smart-search")) {
          return jsonResponse({ hits: [{ id: "m1", title: "auth fix", content: "fixed auth", concepts: ["auth"], score: 0.9 }] });
        }
        if (String(input).includes("memories")) {
          return jsonResponse({ memories: [{ id: "m2", title: "test memory" }, { id: "m3", title: "another" }] });
        }
        if (String(input).includes("sessions")) {
          return jsonResponse({ sessions: [{ id: "s1" }, { id: "s2" }] });
        }
        return jsonResponse({ id: "new-mem-1" });
      }) as typeof fetch,
    });

    const search = await client.smartSearch("auth problems", 3);
    assert.equal(search.ok, true);
    assert.equal(search.hits?.[0].id, "m1");
    assert.match(seen[0].body ?? "", /auth problems/);

    const memories = await client.memoriesLatest();
    assert.equal(memories.ok, true);
    assert.equal(memories.memories?.length, 2);
    assert.match(seen[1].url, /limit=20/);

    const sessions = await client.sessions(2);
    assert.equal(sessions.ok, true);
    assert.equal(sessions.sessions?.length, 2);

    const remember = await client.remember({ title: "lesson", content: "content" });
    assert.deepEqual(remember, { ok: true, id: "new-mem-1" });
    assert.equal(seen[3].method, "POST");
  });

  it("reports failed smart-search and remember calls", async () => {
    const client = new AgentMemoryClient({
      baseUrl: "http://localhost:3111",
      fetchImpl: queuedFetch([
        new Response("bad", { status: 400, statusText: "Bad Request" }),
        new Response("err", { status: 500, statusText: "Internal Server Error" }),
      ]),
    });

    assert.equal((await client.smartSearch("auth")).ok, false);
    assert.equal((await client.remember({ title: "x", content: "y" })).ok, false);
  });
});

describe("AgentMemoryClient bearer safety", () => {
  it("blocks bearer tokens over non-loopback HTTP", async () => {
    const client = new AgentMemoryClient({
      baseUrl: "http://remote.example.com:8080",
      bearerTokenEnv: "TEST_TOKEN",
      env: { TEST_TOKEN: "secret123" },
      fetchImpl: queuedFetch([jsonResponse({ status: "ok" })]),
    });

    const result = await client.health();
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /AGENTMEMORY_UNSAFE_BEARER/);
  });

  it("allows bearer tokens over HTTPS and loopback HTTP", async () => {
    for (const baseUrl of ["https://remote.example.com:8080", "http://127.0.0.1:8080", "http://localhost:8080", "http://[::1]:8080"]) {
      const client = new AgentMemoryClient({
        baseUrl,
        bearerTokenEnv: "TEST_TOKEN",
        env: { TEST_TOKEN: "secret123" },
        fetchImpl: queuedFetch([jsonResponse({ status: "ok" })]),
      });
      assert.deepEqual(await client.health(), { ok: true, status: "ok" });
    }
  });

  it("does not run bearer safety checks when no token is configured", async () => {
    const client = new AgentMemoryClient({
      baseUrl: "http://remote.example.com:8080",
      fetchImpl: queuedFetch([jsonResponse({ status: "ok" })]),
    });
    assert.deepEqual(await client.health(), { ok: true, status: "ok" });
  });
});

describe("resolveAgentMemorySource adapter", () => {
  it("blocks personal-scope AgentMemory sources in team-git mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-agentmemory-team-block-"));
    const source = await addExperienceSource(root, {
      name: "personal-agentmemory",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:3111",
    });

    const result = await resolveAgentMemorySource(root, source, { authorityMode: "team-git" });
    assert.equal(result.status, "failed");
    assert.equal(result.envelopes.length, 0);
    assert.ok(result.warnings.some((warning) => warning.includes("personal_agentmemory_blocked_in_team_mode")));
  });

  it("returns a warning when daemon health fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-agentmemory-unhealthy-"));
    const source = await addExperienceSource(root, {
      name: "agentmemory",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:3111",
    });

    const result = await resolveAgentMemorySource(root, source, {
      authorityMode: "personal-local",
      fetchImpl: queuedFetch([new Response("error", { status: 500, statusText: "Internal Server Error" })]),
    });

    assert.equal(result.status, "failed");
    assert.ok(result.warnings.some((warning) => warning.includes("agentmemory_health_failed")));
  });

  it("uses smart-search when remote query is set", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-agentmemory-search-"));
    const source = await addExperienceSource(root, {
      name: "agentmemory-search",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:3111",
      remote: "auth problems",
    });

    const result = await resolveAgentMemorySource(root, source, {
      authorityMode: "personal-local",
      now: "2026-05-25T01:00:00.000Z",
      fetchImpl: queuedFetch([
        jsonResponse({ status: "ok" }),
        jsonResponse({ hits: [{ id: "mem-1", title: "Retry fix", content: "Retry the stale session and verify with smoke tests.", concepts: ["retry"], authorization: "Bearer secret" }] }),
      ]),
    });

    assert.equal(result.status, "completed");
    assert.equal(result.envelopes.length, 1);
    assert.equal(result.envelopes[0].source_id, source.id);
    assert.equal(result.envelopes[0].agent, "agentmemory");
    assert.match(result.envelopes[0].source_ref, /^agentmemory:\/\/smart-search\/mem-1$/);
    assert.match(result.envelopes[0].source_hash, /^sha256:/);
    assert.equal(result.envelopes[0].privacy.verdict, "allow");
    assert.equal(result.envelopes[0].fetched_at, "2026-05-25T01:00:00.000Z");
  });

  it("uses latest memories when remote query is not set", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-agentmemory-latest-"));
    const source = await addExperienceSource(root, {
      name: "agentmemory-latest",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:3111",
    });

    const result = await resolveAgentMemorySource(root, source, {
      authorityMode: "personal-local",
      fetchImpl: queuedFetch([
        jsonResponse({ status: "ok" }),
        jsonResponse({ memories: [{ id: "mem-2", title: "Latest lesson", content: "Useful experience about debugging.", secret: "hidden" }] }),
      ]),
    });

    assert.equal(result.status, "completed");
    assert.equal(result.envelopes.length, 1);
    assert.match(result.envelopes[0].source_ref, /^agentmemory:\/\/memories\/mem-2$/);
  });
});
