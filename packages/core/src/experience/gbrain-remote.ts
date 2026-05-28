import type { GBrainRemoteConfig } from "./gbrain-config.js";
import type { GBrainQueryHit } from "./gbrain-client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GBrainRemoteRetrieveOptions {
  query: string;
  limit?: number;
  sourceId?: string;
}

export interface GBrainRemoteRetrieveResult {
  ok: boolean;
  hits: GBrainQueryHit[];
  error?: string;
}

export interface GBrainRemotePublishResult {
  ok: boolean;
  slug?: string;
  error?: string;
}

export interface GBrainRemotePagePayload {
  slug: string;
  content: string;
  type?: string;
  title?: string;
  source?: string;
  sourceId?: string;
  frontmatter?: Record<string, unknown>;
}

export type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

// ---------------------------------------------------------------------------
// URL safety
// ---------------------------------------------------------------------------

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Assert that a URL is safe for remote GBrain communication.
 *
 * Rules:
 * - HTTPS is always allowed.
 * - HTTP is allowed **only** for loopback addresses (localhost / 127.0.0.1 / ::1).
 * - Bearer token presence is required for non-loopback URLs.
 *
 * @throws Error when the URL violates safety rules.
 */
export function assertSafeRemoteUrl(
  url: string,
  options?: { bearerToken?: string },
): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`gbrain_remote_invalid_url: ${redactBearerToken(url)}`);
  }

  const isLoopback = LOOPBACK_HOSTS.has(parsed.hostname);
  const isHttps = parsed.protocol === "https:";
  const isHttpLoopback = parsed.protocol === "http:" && isLoopback;

  if (!isHttps && !isHttpLoopback) {
    throw new Error(
      `gbrain_remote_unsafe_url: non-HTTPS non-loopback URL is not allowed (${parsed.protocol}//${parsed.hostname})`,
    );
  }

  if (!isLoopback && !options?.bearerToken) {
    throw new Error(
      "gbrain_remote_unsafe_url: bearer token is required for remote URLs",
    );
  }
}

// ---------------------------------------------------------------------------
// Bearer / secret redaction
// ---------------------------------------------------------------------------

/**
 * Remove Bearer tokens and common secret values from a string so it is safe
 * for reports and error messages.
 */
export function redactBearerToken(text: string): string {
  let result = text;

  result = result.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");

  result = result.replace(
    /\b(client_secret|secret)\s*[=:]\s*["']?[A-Za-z0-9._~+/=-]{4,}["']?/gi,
    "$1=[REDACTED]",
  );

  return result;
}

// ---------------------------------------------------------------------------
// Hit normalization (shared logic with local adapter)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeMcpHit(value: unknown): GBrainQueryHit | undefined {
  if (!isRecord(value)) return undefined;
  const slug =
    stringValue(value.slug) ??
    stringValue(value.id) ??
    stringValue(value.page_id) ??
    stringValue(value.path);
  const text =
    stringValue(value.chunk_text) ??
    stringValue(value.text) ??
    stringValue(value.content) ??
    stringValue(value.summary);
  if (!slug || !text) return undefined;
  return {
    slug,
    score: numberValue(value.score),
    chunk_text: text,
    title: stringValue(value.title),
    page_id: stringValue(value.page_id),
    source: stringValue(value.source),
  };
}

function normalizeMcpHits(raw: unknown): GBrainQueryHit[] {
  const items = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? (raw.results ?? raw.hits ?? raw.items ?? raw.pages)
      : [];
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const hit = normalizeMcpHit(item);
    return hit ? [hit] : [];
  });
}

function mcpResult(raw: unknown): { ok: true; result: unknown } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: "gbrain_remote_invalid_mcp_response" };
  if (isRecord(raw.error)) {
    const code = typeof raw.error.code === "number" ? ` ${raw.error.code}` : "";
    const message = stringValue(raw.error.message) ?? "unknown MCP error";
    return { ok: false, error: `gbrain_remote_mcp_error${code}: ${message}` };
  }
  if (!("result" in raw)) return { ok: false, error: "gbrain_remote_invalid_mcp_response" };
  return { ok: true, result: raw.result };
}

// ---------------------------------------------------------------------------
// Remote client
// ---------------------------------------------------------------------------

/**
 * GBrainRemoteClient communicates with a remote GBrain server over MCP
 * HTTP/HTTPS endpoints.
 *
 * It does **not** import or vendor any GBrain core modules.  All interaction
 * is through HTTP fetch to the configured `mcp_url` with an OAuth bearer
 * token resolved at call time from the `secret_env` environment variable
 * named in the config.
 */
export class GBrainRemoteClient {
  private readonly config: GBrainRemoteConfig;
  private readonly fetchFn: FetchLike;
  private nextRequestId = 1;

  constructor(config: GBrainRemoteConfig, options?: { fetch?: FetchLike }) {
    this.config = config;
    if (options?.fetch) {
      this.fetchFn = options.fetch;
      return;
    }
    const nativeFetch = globalThis.fetch?.bind(globalThis);
    if (typeof nativeFetch !== "function") {
      throw new Error("gbrain_remote_fetch_unavailable: remote GBrain requires a fetch implementation.");
    }
    this.fetchFn = async (url, init) => nativeFetch(url, init);
  }

  // ---- helpers ----

  private resolveBearerToken(): string {
    const envVar = this.config.secret_env;
    const token = process.env[envVar];
    if (!token) {
      throw new Error(
        `gbrain_remote_auth_missing: environment variable ${envVar} is not set`,
      );
    }
    return token;
  }

  private rpcBody(method: string, params: Record<string, unknown>): string {
    return JSON.stringify({
      jsonrpc: "2.0",
      id: this.nextRequestId++,
      method,
      params,
    });
  }

  // ---- public API ----

  async retrieve(options: GBrainRemoteRetrieveOptions): Promise<GBrainRemoteRetrieveResult> {
    const limit = Math.max(1, Math.min(options.limit ?? 4, 20));

    try {
      const bearerToken = this.resolveBearerToken();
      assertSafeRemoteUrl(this.config.mcp_url, { bearerToken });

      const body = this.rpcBody("search", {
        query: options.query,
        limit,
        source_id: options.sourceId ?? this.config.source_id,
      });

      const response = await this.fetchFn(this.config.mcp_url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearerToken}`,
        },
        body,
        signal: AbortSignal.timeout(this.config.timeout_ms),
      });

      if (!response.ok) {
        return {
          ok: false,
          hits: [],
          error: `gbrain_remote_http_${response.status}`,
        };
      }

      const json = await response.json();
      const parsed = mcpResult(json);
      if (!parsed.ok) {
        return { ok: false, hits: [], error: redactBearerToken(parsed.error) };
      }
      const hits = normalizeMcpHits(parsed.result).slice(0, limit);
      return { ok: true, hits };
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        hits: [],
        error: redactBearerToken(msg),
      };
    }
  }

  async publishPage(payload: GBrainRemotePagePayload): Promise<GBrainRemotePublishResult> {
    try {
      const bearerToken = this.resolveBearerToken();
      assertSafeRemoteUrl(this.config.mcp_url, { bearerToken });

      const body = this.rpcBody("put_page", {
        slug: payload.slug,
        content: payload.content,
        source_id: payload.sourceId ?? payload.source ?? this.config.source_id,
        type: payload.type ?? "wiki",
      });

      const response = await this.fetchFn(this.config.mcp_url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearerToken}`,
        },
        body,
        signal: AbortSignal.timeout(this.config.timeout_ms),
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `gbrain_remote_http_${response.status}`,
        };
      }

      const json = await response.json();
      const parsed = mcpResult(json);
      if (!parsed.ok) {
        return { ok: false, error: redactBearerToken(parsed.error) };
      }
      const slug = isRecord(parsed.result)
        ? (stringValue(parsed.result.slug) ?? stringValue(parsed.result.page_slug))
        : undefined;

      return { ok: true, slug: slug ?? payload.slug };
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error: redactBearerToken(msg),
      };
    }
  }
}
