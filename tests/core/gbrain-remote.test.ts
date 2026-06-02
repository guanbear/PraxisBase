import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  GBrainRemoteClient,
  assertSafeRemoteUrl,
  redactBearerToken,
  type FetchLike,
} from "@praxisbase/core/experience/gbrain-remote.js";
import type { GBrainRemoteConfig } from "@praxisbase/core/experience/gbrain-config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET_ENV_VAR = "PRAXISBASE_TEST_GBRAIN_SECRET";

function makeRemoteConfig(overrides?: Partial<GBrainRemoteConfig>): GBrainRemoteConfig {
  return {
    mode: "remote",
    issuer_url: "https://auth.example.com",
    mcp_url: "https://gbrain.example.com/mcp",
    oauth_client_id: "test-client",
    secret_env: SECRET_ENV_VAR,
    source_id: "praxisbase",
    federated_read: [],
    timeout_ms: 5000,
    ...overrides,
  };
}

function mockFetch(response: {
  ok: boolean;
  status: number;
  body: unknown;
}): { fetch: FetchLike; captured: { url: string; init?: RequestInit }[] } {
  const captured: { url: string; init?: RequestInit }[] = [];
  const fetch: FetchLike = async (url: string, init?: RequestInit) => {
    captured.push({ url, init });
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
    };
  };
  return { fetch, captured };
}

// ---------------------------------------------------------------------------
// assertSafeRemoteUrl
// ---------------------------------------------------------------------------

describe("assertSafeRemoteUrl", () => {
  it("allows HTTPS URLs with bearer token", () => {
    assert.doesNotThrow(() =>
      assertSafeRemoteUrl("https://gbrain.example.com/mcp", {
        bearerToken: "tok_abc123",
      }),
    );
  });

  it("allows HTTP loopback without bearer token", () => {
    assert.doesNotThrow(() =>
      assertSafeRemoteUrl("http://localhost:3000/mcp"),
    );
    assert.doesNotThrow(() =>
      assertSafeRemoteUrl("http://127.0.0.1:3000/mcp"),
    );
  });

  it("rejects HTTP non-loopback even with bearer token", () => {
    assert.throws(
      () => assertSafeRemoteUrl("http://gbrain.example.com/mcp", { bearerToken: "tok" }),
      /gbrain_remote_unsafe_url.*non-HTTPS non-loopback/,
    );
  });

  it("rejects HTTPS without bearer token", () => {
    assert.throws(
      () => assertSafeRemoteUrl("https://gbrain.example.com/mcp"),
      /gbrain_remote_unsafe_url.*bearer token is required/,
    );
  });

  it("rejects invalid URLs", () => {
    assert.throws(
      () => assertSafeRemoteUrl("not-a-url"),
      /gbrain_remote_invalid_url/,
    );
  });
});

// ---------------------------------------------------------------------------
// redactBearerToken
// ---------------------------------------------------------------------------

describe("redactBearerToken", () => {
  it("removes Bearer tokens from strings", () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature';
    const result = redactBearerToken(input);
    assert.equal(result, "Authorization: Bearer [REDACTED]");
  });

  it("removes client_secret values", () => {
    const input = "client_secret=abc123def456ghi789";
    const result = redactBearerToken(input);
    assert.match(result, /client_secret=\[REDACTED\]/);
    assert.doesNotMatch(result, /abc123def456ghi789/);
  });

  it("removes secret= values", () => {
    const input = "secret=my-super-secret-value-12345";
    const result = redactBearerToken(input);
    assert.match(result, /secret=\[REDACTED\]/);
    assert.doesNotMatch(result, /my-super-secret-value-12345/);
  });

  it("leaves non-secret content intact", () => {
    const input = "gbrain_remote_http_502: service unavailable";
    const result = redactBearerToken(input);
    assert.equal(result, input);
  });

  it("redacts Bearer in error messages containing JSON", () => {
    const input =
      'fetch failed: headers {"authorization":"Bearer tok_abcdefghij1234567890"}';
    const result = redactBearerToken(input);
    assert.doesNotMatch(result, /tok_abcdefghij1234567890/);
    assert.match(result, /Bearer \[REDACTED\]/);
  });
});

// ---------------------------------------------------------------------------
// GBrainRemoteClient.retrieve
// ---------------------------------------------------------------------------

describe("GBrainRemoteClient retrieve", () => {
  const originalEnv = process.env[SECRET_ENV_VAR];

  beforeEach(() => {
    process.env[SECRET_ENV_VAR] = "test-bearer-token-value";
  });

  it("throws a clear error when no fetch implementation is available", () => {
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    try {
      assert.throws(
        () => new GBrainRemoteClient(makeRemoteConfig()),
        /gbrain_remote_fetch_unavailable/,
      );
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
    }
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[SECRET_ENV_VAR];
    } else {
      process.env[SECRET_ENV_VAR] = originalEnv;
    }
  });

  it("normalizes MCP JSON-RPC search hits", async () => {
    const { fetch, captured } = mockFetch({
      ok: true,
      status: 200,
      body: {
        jsonrpc: "2.0",
        id: 1,
        result: {
          results: [
            {
              slug: "openclaw-auth-refresh",
              score: 0.92,
              chunk_text: "Refresh the OpenClaw login and retry memory sync.",
              title: "OpenClaw Auth Refresh",
              source: "praxisbase",
            },
            {
              id: "codex-signal-ack",
              score: 0.78,
              text: "Acknowledge the Codex signal before timeout.",
            },
          ],
        },
      },
    });

    const client = new GBrainRemoteClient(makeRemoteConfig(), { fetch });
    const result = await client.retrieve({ query: "openclaw auth" });

    assert.equal(result.ok, true);
    assert.equal(result.hits.length, 2);

    assert.equal(result.hits[0].slug, "openclaw-auth-refresh");
    assert.equal(result.hits[0].score, 0.92);
    assert.equal(result.hits[0].chunk_text, "Refresh the OpenClaw login and retry memory sync.");
    assert.equal(result.hits[0].title, "OpenClaw Auth Refresh");
    assert.equal(result.hits[0].source, "praxisbase");

    assert.equal(result.hits[1].slug, "codex-signal-ack");
    assert.equal(result.hits[1].chunk_text, "Acknowledge the Codex signal before timeout.");
  });

  it("sends MCP JSON-RPC search to the configured mcp_url", async () => {
    const { fetch, captured } = mockFetch({
      ok: true,
      status: 200,
      body: { jsonrpc: "2.0", id: 1, result: { results: [] } },
    });

    const config = makeRemoteConfig({ mcp_url: "https://gbrain.example.com/mcp/" });
    const client = new GBrainRemoteClient(config, { fetch });
    await client.retrieve({ query: "test query", limit: 3 });

    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, "https://gbrain.example.com/mcp/");
    assert.equal(captured[0].init?.method, "POST");

    const headers = captured[0].init?.headers as Record<string, string>;
    assert.equal(headers["content-type"], "application/json");
    assert.equal(headers["authorization"], "Bearer test-bearer-token-value");

    const body = JSON.parse(captured[0].init?.body as string);
    assert.deepEqual(body, {
      jsonrpc: "2.0",
      id: 1,
      method: "search",
      params: {
        query: "test query",
        limit: 3,
        source_id: "praxisbase",
      },
    });
  });

  it("passes a timeout abort signal to remote search requests", async () => {
    const { fetch, captured } = mockFetch({
      ok: true,
      status: 200,
      body: { jsonrpc: "2.0", id: 1, result: { results: [] } },
    });
    const client = new GBrainRemoteClient(makeRemoteConfig({ timeout_ms: 1234 }), { fetch });

    await client.retrieve({ query: "timeout test" });

    assert.ok(captured[0].init?.signal instanceof AbortSignal);
  });

  it("returns error when bearer token env var is missing", async () => {
    delete process.env[SECRET_ENV_VAR];

    const { fetch } = mockFetch({ ok: true, status: 200, body: {} });
    const client = new GBrainRemoteClient(
      makeRemoteConfig({ secret_env: "MISSING_VAR_GBRAIN_TEST" }),
      { fetch },
    );

    const result = await client.retrieve({ query: "test" });

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /gbrain_remote_auth_missing/);
  });

  it("returns HTTP error status", async () => {
    const { fetch } = mockFetch({ ok: false, status: 503, body: {} });
    const client = new GBrainRemoteClient(makeRemoteConfig(), { fetch });

    const result = await client.retrieve({ query: "test" });

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /gbrain_remote_http_503/);
  });

  it("returns MCP error messages without leaking secrets", async () => {
    const { fetch } = mockFetch({
      ok: true,
      status: 200,
      body: {
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32001,
          message: "auth failed for Bearer test-bearer-token-value",
        },
      },
    });
    const client = new GBrainRemoteClient(makeRemoteConfig(), { fetch });

    const result = await client.retrieve({ query: "test" });

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /gbrain_remote_mcp_error/);
    assert.doesNotMatch(result.error ?? "", /test-bearer-token-value/);
  });

  it("redacts bearer tokens in thrown errors", async () => {
    const { fetch } = mockFetch({ ok: false, status: 500, body: {} });
    const throwFetch: FetchLike = async (_url: string, init?: RequestInit) => {
      throw new Error(
        `Connection refused with Bearer ${(init?.headers as Record<string, string>)["authorization"]?.replace("Bearer ", "")}`,
      );
    };

    const client = new GBrainRemoteClient(makeRemoteConfig(), { fetch: throwFetch });
    const result = await client.retrieve({ query: "test" });

    assert.equal(result.ok, false);
    assert.doesNotMatch(result.error ?? "", /test-bearer-token-value/);
  });
});

// ---------------------------------------------------------------------------
// GBrainRemoteClient.publishPage
// ---------------------------------------------------------------------------

describe("GBrainRemoteClient publishPage", () => {
  const originalEnv = process.env[SECRET_ENV_VAR];

  beforeEach(() => {
    process.env[SECRET_ENV_VAR] = "test-bearer-token-value";
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[SECRET_ENV_VAR];
    } else {
      process.env[SECRET_ENV_VAR] = originalEnv;
    }
  });

  it("sends MCP JSON-RPC put_page to the configured mcp_url", async () => {
    const { fetch, captured } = mockFetch({
      ok: true,
      status: 200,
      body: {
        jsonrpc: "2.0",
        id: 1,
        result: { slug: "praxisbase/wiki/test-page", page_slug: "praxisbase/wiki/test-page" },
      },
    });

    const client = new GBrainRemoteClient(makeRemoteConfig(), { fetch });
    const result = await client.publishPage({
      slug: "praxisbase/wiki/test-page",
      content: "# Test Page\n\nContent here.",
      title: "Test Page",
      frontmatter: { generated_by: "praxisbase", praxisbase_kind: "wiki" },
    });

    assert.equal(result.ok, true);
    assert.equal(result.slug, "praxisbase/wiki/test-page");

    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, "https://gbrain.example.com/mcp");

    const body = JSON.parse(captured[0].init?.body as string);
    assert.deepEqual(body, {
      jsonrpc: "2.0",
      id: 1,
      method: "put_page",
      params: {
        slug: "praxisbase/wiki/test-page",
        content: "# Test Page\n\nContent here.",
        source_id: "praxisbase",
        type: "wiki",
      },
    });
  });

  it("defaults type to wiki and source to config source_id", async () => {
    const { fetch, captured } = mockFetch({
      ok: true,
      status: 200,
      body: { jsonrpc: "2.0", id: 1, result: { slug: "praxisbase/wiki/defaults" } },
    });

    const config = makeRemoteConfig({ source_id: "my-source" });
    const client = new GBrainRemoteClient(config, { fetch });
    const result = await client.publishPage({
      slug: "praxisbase/wiki/defaults",
      content: "content",
    });

    assert.equal(result.ok, true);
    const body = JSON.parse(captured[0].init?.body as string);
    assert.equal(body.params.type, "wiki");
    assert.equal(body.params.source_id, "my-source");
  });

  it("returns error on HTTP failure", async () => {
    const { fetch } = mockFetch({ ok: false, status: 422, body: {} });
    const client = new GBrainRemoteClient(makeRemoteConfig(), { fetch });

    const result = await client.publishPage({
      slug: "praxisbase/wiki/fail",
      content: "fail",
    });

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /gbrain_remote_http_422/);
  });
});

// ---------------------------------------------------------------------------
// Error redaction integration
// ---------------------------------------------------------------------------

describe("GBrainRemoteClient error redaction", () => {
  const originalEnv = process.env[SECRET_ENV_VAR];

  beforeEach(() => {
    process.env[SECRET_ENV_VAR] = "super-secret-bearer-tok-1234567890";
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[SECRET_ENV_VAR];
    } else {
      process.env[SECRET_ENV_VAR] = originalEnv;
    }
  });

  it("redacts bearer tokens from errors in retrieve", async () => {
    const throwFetch: FetchLike = async () => {
      throw new Error("Network error: Bearer super-secret-bearer-tok-1234567890 was rejected");
    };

    const client = new GBrainRemoteClient(makeRemoteConfig(), { fetch: throwFetch });
    const result = await client.retrieve({ query: "test" });

    assert.equal(result.ok, false);
    assert.doesNotMatch(result.error ?? "", /super-secret-bearer-tok-1234567890/);
    assert.match(result.error ?? "", /Bearer \[REDACTED\]/);
  });

  it("redacts client_secret values from errors in publishPage", async () => {
    const throwFetch: FetchLike = async () => {
      throw new Error("Auth failed: client_secret=super-secret-bearer-tok-1234567890");
    };

    const client = new GBrainRemoteClient(makeRemoteConfig(), { fetch: throwFetch });
    const result = await client.publishPage({ slug: "test", content: "test" });

    assert.equal(result.ok, false);
    assert.doesNotMatch(result.error ?? "", /super-secret-bearer-tok-1234567890/);
    assert.match(result.error ?? "", /client_secret=\[REDACTED\]/);
  });
});
