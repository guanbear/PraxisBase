export interface AgentMemoryClientOptions {
  baseUrl: string;
  bearerTokenEnv?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

export interface AgentMemoryRecord {
  id: string;
  title?: string;
  content?: string;
  concepts?: string[];
  files?: string[];
  scope?: string;
  score?: number;
  session_id?: string;
  source?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface AgentMemoryRememberPayload {
  title: string;
  content: string;
  concepts?: string[];
  files?: string[];
  scope?: string;
}

export interface AgentMemoryHealthResult { ok: boolean; status?: string; error?: string; }
export interface AgentMemoryLivezResult { ok: boolean; status?: string; error?: string; }
export interface AgentMemorySearchResult { ok: boolean; hits?: AgentMemoryRecord[]; error?: string; }
export interface AgentMemoryMemoriesResult { ok: boolean; memories?: AgentMemoryRecord[]; error?: string; }
export interface AgentMemorySessionsResult { ok: boolean; sessions?: unknown[]; error?: string; }
export interface AgentMemoryRememberResult { ok: boolean; id?: string; error?: string; }

type FetchJsonResult = { ok: true; data: unknown } | { ok: false; error: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function recordArray(value: unknown): AgentMemoryRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AgentMemoryRecord =>
    isRecord(item) && typeof item.id === "string" && item.id.length > 0
  );
}

function normalizeStatus(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  return stringValue(data.status) ?? stringValue(data.state) ?? stringValue(data.message);
}

function normalizeId(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  return stringValue(data.id) ?? stringValue(data.memory_id);
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
}

export class AgentMemoryClient {
  private readonly baseUrl: string;
  private readonly bearerTokenEnv?: string;
  private readonly timeoutMs?: number;
  private readonly fetchImpl: typeof fetch;
  private readonly env: Record<string, string | undefined>;

  constructor(options: AgentMemoryClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.bearerTokenEnv = options.bearerTokenEnv;
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.env = options.env ?? process.env;
  }

  private bearerToken(): string | undefined {
    if (!this.bearerTokenEnv) return undefined;
    return this.env[this.bearerTokenEnv] ?? process.env[this.bearerTokenEnv];
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = this.bearerToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  private assertBearerSafe(url: string): void {
    if (!this.bearerToken()) return;
    const parsed = new URL(url);
    if (parsed.protocol !== "http:") return;
    const allowedLoopback = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
    if (allowedLoopback.has(parsed.hostname)) return;
    throw new Error("AGENTMEMORY_UNSAFE_BEARER: bearer tokens may only be sent to HTTPS or loopback HTTP endpoints.");
  }

  private urlFor(path: string): string {
    return new URL(path, `${this.baseUrl}/`).toString();
  }

  private async fetchJson(path: string, init: RequestInit = {}): Promise<FetchJsonResult> {
    const url = this.urlFor(path);
    try {
      this.assertBearerSafe(url);
      const headers = {
        ...this.getHeaders(),
        ...headersToRecord(init.headers),
      };
      const response = await this.fetchImpl(url, {
        ...init,
        headers,
        signal: init.signal ?? (this.timeoutMs ? AbortSignal.timeout(this.timeoutMs) : undefined),
      });
      if (!response.ok) {
        return { ok: false, error: `agentmemory_http_error: ${response.status} ${response.statusText}` };
      }
      const text = await response.text();
      if (!text.trim()) return { ok: true, data: {} };
      return { ok: true, data: JSON.parse(text) as unknown };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  async health(): Promise<AgentMemoryHealthResult> {
    const result = await this.fetchJson("/agentmemory/health");
    if (!result.ok) return result;
    return { ok: true, status: normalizeStatus(result.data) ?? "ok" };
  }

  async livez(): Promise<AgentMemoryLivezResult> {
    const result = await this.fetchJson("/agentmemory/livez");
    if (!result.ok) return result;
    return { ok: true, status: normalizeStatus(result.data) ?? "ok" };
  }

  async smartSearch(query: string, limit?: number): Promise<AgentMemorySearchResult> {
    const result = await this.fetchJson("/agentmemory/smart-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });
    if (!result.ok) return result;
    const data = isRecord(result.data) ? result.data : {};
    return {
      ok: true,
      hits: recordArray(data.hits ?? data.results ?? data.memories ?? data.items),
    };
  }

  async memoriesLatest(limit = 20): Promise<AgentMemoryMemoriesResult> {
    const result = await this.fetchJson(`/agentmemory/memories?limit=${encodeURIComponent(String(limit))}`);
    if (!result.ok) return result;
    const data = isRecord(result.data) ? result.data : {};
    return {
      ok: true,
      memories: recordArray(data.memories ?? data.results ?? data.items),
    };
  }

  async sessions(limit = 20): Promise<AgentMemorySessionsResult> {
    const result = await this.fetchJson(`/agentmemory/sessions?limit=${encodeURIComponent(String(limit))}`);
    if (!result.ok) return result;
    const data = isRecord(result.data) ? result.data : {};
    const sessions = Array.isArray(data.sessions) ? data.sessions : Array.isArray(data.items) ? data.items : [];
    return { ok: true, sessions };
  }

  async remember(payload: AgentMemoryRememberPayload): Promise<AgentMemoryRememberResult> {
    const result = await this.fetchJson("/agentmemory/remember", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!result.ok) return result;
    return { ok: true, id: normalizeId(result.data) };
  }
}
