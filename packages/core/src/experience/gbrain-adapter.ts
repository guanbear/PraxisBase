import type { WikiContextCandidate } from "../wiki/retrieval.js";
import type { BrainBackend, BrainBackendDoctorResult, BrainBackendPublishInput, BrainBackendPublishResult, BrainBackendRetrievalInput, BrainBackendRetrievalResult } from "./brain-backend.js";
import { GBrainClient, type GBrainClientOptions, type GBrainQueryHit } from "./gbrain-client.js";
import { gbrainExecutable, type GBrainConfig } from "./gbrain-config.js";
import { GBrainRemoteClient, type FetchLike } from "./gbrain-remote.js";

function safeSlug(value: string): string {
  return encodeURIComponent(value.replace(/^\/+|\/+$/g, "") || "result");
}

function gbrainCandidate(hit: GBrainQueryHit): WikiContextCandidate {
  const slug = safeSlug(hit.slug);
  const path = `gbrain://query/${slug}`;
  return {
    id: `gbrain-${slug}`,
    path,
    kind: "gbrain_sidecar",
    title: hit.title ?? hit.slug,
    summary: [hit.title, hit.chunk_text].filter(Boolean).join("\n").slice(0, 500),
    body: hit.chunk_text,
    source_ids: ["gbrain", path, hit.page_id, hit.source].filter((entry): entry is string => Boolean(entry)).sort(),
  };
}

export class GBrainBackend implements BrainBackend {
  readonly name = "gbrain" as const;
  private readonly client: GBrainClient;
  private readonly sourceId?: string;

  constructor(options: GBrainClientOptions & { sourceId?: string } = {}) {
    this.client = new GBrainClient(options);
    this.sourceId = options.sourceId;
  }

  async doctor(): Promise<BrainBackendDoctorResult> {
    const result = await this.client.doctor({ sourceId: this.sourceId });
    return {
      backend: "gbrain",
      ok: result.ok,
      checks: result.checks,
      warnings: result.ok ? [] : result.checks.map((check) => check.message),
    };
  }

  async retrieve(input: BrainBackendRetrievalInput): Promise<BrainBackendRetrievalResult> {
    const result = await this.client.query(input.query || input.stage, { limit: input.limit, sourceId: this.sourceId });
    if (!result.ok) {
      return {
        backend: "gbrain",
        candidates: [],
        warnings: [`gbrain_sidecar_unavailable: ${result.error ?? "query failed"}`],
      };
    }
    return {
      backend: "gbrain",
      candidates: result.hits.map(gbrainCandidate),
      warnings: [],
    };
  }

  async publish(input: BrainBackendPublishInput): Promise<BrainBackendPublishResult> {
    const result = await this.client.capture(input.content, {
      slug: input.slug,
      type: input.type,
      sourceId: input.sourceId ?? this.sourceId,
    });
    return {
      backend: "gbrain",
      ok: result.ok,
      slug: result.slug,
      warnings: result.ok ? [] : [result.error ?? "gbrain_capture_failed"],
      error: result.error,
    };
  }
}

export function createGBrainBackend(options: GBrainClientOptions = {}): GBrainBackend {
  return new GBrainBackend(options);
}

export class GBrainRemoteBackend implements BrainBackend {
  readonly name = "gbrain" as const;
  private readonly client: GBrainRemoteClient;

  constructor(config: Extract<GBrainConfig, { mode: "remote" }>, options?: { fetch?: FetchLike }) {
    this.client = new GBrainRemoteClient(config, options);
  }

  async doctor(): Promise<BrainBackendDoctorResult> {
    return {
      backend: "gbrain",
      ok: true,
      checks: [{
        id: "gbrain_remote_config",
        ok: true,
        severity: "info",
        message: "GBrain remote MCP config is present.",
      }],
      warnings: [],
    };
  }

  async retrieve(input: BrainBackendRetrievalInput): Promise<BrainBackendRetrievalResult> {
    const result = await this.client.retrieve({ query: input.query || input.stage, limit: input.limit });
    if (!result.ok) {
      return {
        backend: "gbrain",
        candidates: [],
        warnings: [`gbrain_sidecar_unavailable: ${result.error ?? "remote MCP query failed"}`],
      };
    }
    return {
      backend: "gbrain",
      candidates: result.hits.map(gbrainCandidate),
      warnings: [],
    };
  }

  async publish(input: BrainBackendPublishInput): Promise<BrainBackendPublishResult> {
    const result = await this.client.publishPage({
      slug: input.slug,
      content: input.content,
      title: input.title,
      type: input.type,
      sourceId: input.sourceId,
    });
    return {
      backend: "gbrain",
      ok: result.ok,
      slug: result.slug,
      warnings: result.ok ? [] : [result.error ?? "gbrain_remote_publish_failed"],
      error: result.error,
    };
  }
}

export function createGBrainBackendFromConfig(config: GBrainConfig, options: GBrainClientOptions & { fetch?: FetchLike } = {}): BrainBackend {
  if (config.mode === "remote") {
    return new GBrainRemoteBackend(config, { fetch: options.fetch });
  }
  return new GBrainBackend({
    executable: options.executable ?? gbrainExecutable(config),
    timeoutMs: options.timeoutMs ?? config.timeout_ms,
    preferJson: options.preferJson,
    runCommand: options.runCommand,
    sourceId: config.source_id,
  });
}
