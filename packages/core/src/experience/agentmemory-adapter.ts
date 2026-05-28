import { computeHash, makeId } from "../protocol/id.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import {
  ExperienceEnvelopeSchema,
  type ExperienceEnvelope,
  type ExperienceOutcome,
  type ExperienceSourceConfig,
} from "../protocol/schemas.js";
import { redactSensitiveValues } from "../protocol/redact.js";
import { evaluateExperiencePrivacy } from "./privacy-policy.js";
import { AgentMemoryClient, type AgentMemoryRecord } from "./agentmemory-client.js";
import type { ResolveExperienceSourceOptions, ResolvedExperienceSource } from "./source-adapters.js";
import type { BrainBackend, BrainBackendDoctorResult, BrainBackendRetrievalInput, BrainBackendRetrievalResult } from "./brain-backend.js";
import type { WikiContextCandidate } from "../wiki/retrieval.js";

const DEFAULT_LIMIT = 20;
const MAX_SUMMARY_LENGTH = 1200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function trimSummary(text: string): string {
  const normalized = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 5).join(" ");
  const summary = normalized || "agentmemory record";
  return summary.length > MAX_SUMMARY_LENGTH ? `${summary.slice(0, MAX_SUMMARY_LENGTH)}...[truncated]` : summary;
}

function recordContent(record: AgentMemoryRecord): string {
  return [
    record.title,
    record.content,
    ...stringArrayValue(record.concepts).map((concept) => `concept:${concept}`),
    ...stringArrayValue(record.files).map((file) => `file:${file}`),
    record.session_id ? `session:${record.session_id}` : undefined,
  ].filter((value): value is string => Boolean(value)).join("\n");
}

function recordSummary(record: AgentMemoryRecord): string {
  return trimSummary(record.title ?? record.content ?? "agentmemory record");
}

function recordSourceRef(record: AgentMemoryRecord, mode: "latest" | "smart-search"): string {
  return `agentmemory://${mode === "smart-search" ? "smart-search" : "memories"}/${encodeURIComponent(record.id)}`;
}

function recordOutcome(record: AgentMemoryRecord): ExperienceOutcome | undefined {
  const value = stringValue(record.outcome);
  return value === "success" || value === "failed" || value === "partial" || value === "unknown" ? value : undefined;
}

function sanitizedRawRecord(record: AgentMemoryRecord): string {
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (/(?:token|secret|password|authorization|cookie)/i.test(key)) continue;
    clone[key] = value;
  }
  return redactSensitiveValues(JSON.stringify(clone));
}

function recordToEnvelope(
  source: ExperienceSourceConfig,
  record: AgentMemoryRecord,
  mode: "latest" | "smart-search",
  options: ResolveExperienceSourceOptions,
): ExperienceEnvelope {
  const fetchedAt = options.now ?? new Date().toISOString();
  const sourceRef = recordSourceRef(record, mode);
  const raw = sanitizedRawRecord(record);
  const sourceHash = computeHash(JSON.stringify({
    source_id: source.id,
    source_ref: sourceRef,
    record: raw,
  }));
  const redactedSummary = recordSummary(record);
  const text = recordContent(record);
  const privacy = evaluateExperiencePrivacy({
    mode: options.authorityMode,
    scopeHint: source.scope_default,
    channel: source.channel,
    text,
  });

  return ExperienceEnvelopeSchema.parse({
    id: makeId("experience", `${source.name}_${sourceHash.slice(7, 23)}`),
    protocol_version: PROTOCOL_VERSION,
    type: "experience_envelope",
    source_id: source.id,
    agent: source.agent,
    channel: source.channel,
    source_ref: sourceRef,
    source_hash: sourceHash,
    scope_hint: source.scope_default,
    signature: record.concepts?.[0],
    problem_signature: stringValue(record.problem_signature) ?? record.concepts?.[0],
    outcome: recordOutcome(record),
    redacted_summary: redactedSummary,
    created_at: record.created_at,
    fetched_at: fetchedAt,
    privacy: {
      mode: options.authorityMode,
      verdict: privacy.verdict,
      reasons: privacy.reasons,
    },
    warnings: [],
  });
}

export function createAgentMemoryClient(
  source: ExperienceSourceConfig,
  options: ResolveExperienceSourceOptions,
): AgentMemoryClient {
  if (!source.url) {
    throw new Error("AGENTMEMORY_SOURCE_INVALID: agentmemory source requires url.");
  }
  return new AgentMemoryClient({
    baseUrl: source.url,
    bearerTokenEnv: source.bearer_token_env,
    fetchImpl: options.fetchImpl,
    env: options.env,
    timeoutMs: 10_000,
  });
}

function agentMemorySummary(record: AgentMemoryRecord): string {
  return [record.title, record.content].filter((value): value is string => typeof value === "string" && value.length > 0).join("\n") || record.id;
}

function agentMemoryContextCandidate(record: AgentMemoryRecord, sourceId: string): WikiContextCandidate {
  const path = `agentmemory://smart-search/${encodeURIComponent(record.id)}`;
  return {
    id: `agentmemory-${record.id}`,
    path,
    kind: "agentmemory_sidecar",
    title: stringValue(record.title) ?? record.id,
    summary: agentMemorySummary(record).slice(0, 500),
    body: stringValue(record.content),
    scope: stringValue(record.scope),
    source_ids: [sourceId, path, stringValue(record.source)].filter((entry): entry is string => Boolean(entry)).sort(),
  };
}

export class AgentMemoryBackend implements BrainBackend {
  readonly name = "agentmemory" as const;
  private readonly source: ExperienceSourceConfig;
  private readonly options: ResolveExperienceSourceOptions;

  constructor(source: ExperienceSourceConfig, options: ResolveExperienceSourceOptions) {
    this.source = source;
    this.options = options;
  }

  async doctor(): Promise<BrainBackendDoctorResult> {
    try {
      const client = createAgentMemoryClient(this.source, this.options);
      const health = await client.health();
      const ok = health.ok;
      return {
        backend: "agentmemory",
        ok,
        checks: [{
          id: "agentmemory_health",
          ok,
          severity: ok ? "info" : "warning",
          message: ok ? `AgentMemory daemon healthy (${health.status ?? "ok"}).` : `AgentMemory daemon unhealthy: ${health.error ?? "unknown error"}`,
        }],
        warnings: ok ? [] : [health.error ?? "agentmemory health check failed"],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        backend: "agentmemory",
        ok: false,
        checks: [{
          id: "agentmemory_health",
          ok: false,
          severity: "warning",
          message,
        }],
        warnings: [message],
      };
    }
  }

  async retrieve(input: BrainBackendRetrievalInput): Promise<BrainBackendRetrievalResult> {
    try {
      const client = createAgentMemoryClient(this.source, this.options);
      const health = await client.health();
      if (!health.ok) {
        return {
          backend: "agentmemory",
          candidates: [],
          warnings: [`agentmemory_sidecar_unavailable: ${health.error ?? "health check failed"}`],
        };
      }
      const search = await client.smartSearch(input.query || input.stage, input.limit);
      if (!search.ok) {
        return {
          backend: "agentmemory",
          candidates: [],
          warnings: [`agentmemory_sidecar_unavailable: ${search.error ?? "smart-search failed"}`],
        };
      }
      return {
        backend: "agentmemory",
        candidates: (search.hits ?? []).map((record) => agentMemoryContextCandidate(record, this.source.id)),
        warnings: [],
      };
    } catch (error) {
      return {
        backend: "agentmemory",
        candidates: [],
        warnings: [`agentmemory_sidecar_unavailable: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }
}

export function createAgentMemoryBackend(
  source: ExperienceSourceConfig,
  options: ResolveExperienceSourceOptions,
): AgentMemoryBackend {
  return new AgentMemoryBackend(source, options);
}

export async function resolveAgentMemorySource(
  root: string,
  source: ExperienceSourceConfig,
  options: ResolveExperienceSourceOptions,
): Promise<ResolvedExperienceSource> {
  void root;
  const warnings: string[] = [];
  const limit = options.limit ?? DEFAULT_LIMIT;

  if (options.authorityMode === "team-git" && source.scope_default === "personal") {
    warnings.push("personal_agentmemory_blocked_in_team_mode: personal-scope agentmemory source requires explicit team policy to import into team knowledge");
    return emptyResult(source, warnings);
  }

  let client: AgentMemoryClient;
  try {
    client = createAgentMemoryClient(source, options);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
    return emptyResult(source, warnings);
  }

  const health = await client.health();
  if (!health.ok) {
    warnings.push(`agentmemory_health_failed: ${health.error ?? "unknown error"}`);
    return emptyResult(source, warnings);
  }

  const query = stringValue(source.remote);
  const mode: "latest" | "smart-search" = query ? "smart-search" : "latest";
  const fetched = mode === "smart-search"
    ? await client.smartSearch(query!, limit)
    : await client.memoriesLatest(limit);

  if (!fetched.ok) {
    warnings.push(`agentmemory_fetch_failed: ${fetched.error ?? "unknown error"}`);
    return emptyResult(source, warnings);
  }

  const records: AgentMemoryRecord[] = mode === "smart-search"
    ? (fetched as { hits?: AgentMemoryRecord[] }).hits ?? []
    : (fetched as { memories?: AgentMemoryRecord[] }).memories ?? [];
  const envelopes = records
    .filter((record) => record.id)
    .slice(0, limit)
    .map((record) => recordToEnvelope(source, record, mode, options));

  const rejected = envelopes.filter((envelope) => envelope.privacy.verdict === "reject").length;
  const humanRequired = envelopes.filter((envelope) => envelope.privacy.verdict === "human_required").length;
  const status = warnings.length > 0 || rejected > 0 || humanRequired > 0
    ? (envelopes.length > 0 ? "partial" : "failed")
    : "completed";

  return {
    source,
    status,
    scanned: records.length,
    fetched: envelopes.length,
    enveloped: envelopes.length,
    rejected,
    humanRequired,
    skipped: Math.max(0, records.length - envelopes.length),
    envelopes,
    warnings,
  };
}

function emptyResult(source: ExperienceSourceConfig, warnings: string[]): ResolvedExperienceSource {
  return {
    source,
    status: "failed",
    scanned: 0,
    fetched: 0,
    enveloped: 0,
    rejected: 0,
    humanRequired: 0,
    skipped: 0,
    envelopes: [],
    warnings,
  };
}
