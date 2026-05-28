import { PROTOCOL_VERSION } from "../protocol/types.js";
import { computeHash, makeId } from "../protocol/id.js";
import { ExperienceEnvelopeSchema, type ExperienceEnvelope } from "../protocol/schemas.js";
import { writeExperienceEnvelope } from "./source-adapters.js";
import { GBrainClient, type GBrainCommandRunner, type GBrainQueryHit } from "./gbrain-client.js";
import { gbrainExecutable, type GBrainConfig } from "./gbrain-config.js";
import { GBrainRemoteClient, type FetchLike } from "./gbrain-remote.js";

export interface ImportGBrainOptions {
  query: string;
  sourceId?: string;
  limit?: number;
  write?: boolean;
  executable?: string;
  timeoutMs?: number;
  runCommand?: GBrainCommandRunner;
  config?: GBrainConfig | null;
  fetchImpl?: FetchLike;
  now?: string;
}

export interface ImportGBrainResult {
  ok: boolean;
  source_id: string;
  query: string;
  candidates: number;
  imported: number;
  outputs: string[];
  warnings: string[];
  errors: string[];
}

function envelopeFromHit(hit: GBrainQueryHit, input: { sourceId: string; now: string }): ExperienceEnvelope {
  const sourceRef = `gbrain://${input.sourceId}/${hit.slug}`;
  const sourceHash = computeHash(JSON.stringify({
    source_id: input.sourceId,
    slug: hit.slug,
    text: hit.chunk_text,
    score: hit.score,
  }));
  return ExperienceEnvelopeSchema.parse({
    id: makeId("experience", `gbrain_${input.sourceId}_${sourceHash.slice(7, 23)}`),
    protocol_version: PROTOCOL_VERSION,
    type: "experience_envelope",
    source_id: makeId("source", `gbrain_${input.sourceId}`),
    agent: "generic",
    channel: "unknown",
    source_ref: sourceRef,
    source_hash: sourceHash,
    scope_hint: "personal",
    signature: hit.slug,
    problem_signature: hit.title ?? hit.slug,
    redacted_summary: hit.chunk_text,
    created_at: input.now,
    fetched_at: input.now,
    privacy: {
      mode: "personal-local",
      verdict: "allow",
      reasons: ["gbrain_explicit_import"],
    },
    warnings: ["gbrain_sidecar_imported_as_evidence"],
  });
}

export async function importGBrain(root: string, options: ImportGBrainOptions): Promise<ImportGBrainResult> {
  const sourceId = options.sourceId ?? options.config?.source_id ?? "praxisbase";
  const now = options.now ?? new Date().toISOString();
  const result = options.config?.mode === "remote"
    ? await new GBrainRemoteClient(options.config, { fetch: options.fetchImpl }).retrieve({
      query: options.query,
      limit: options.limit,
      sourceId,
    })
    : await new GBrainClient({
      executable: options.executable ?? (options.config ? gbrainExecutable(options.config) : undefined),
      timeoutMs: options.timeoutMs ?? (options.config?.mode === "local" ? options.config.timeout_ms : undefined),
      preferJson: true,
      runCommand: options.runCommand,
    }).query(options.query, { limit: options.limit, sourceId });
  if (!result.ok) {
    return {
      ok: false,
      source_id: sourceId,
      query: options.query,
      candidates: 0,
      imported: 0,
      outputs: [],
      warnings: [],
      errors: [result.error ?? "gbrain_query_failed"],
    };
  }

  const envelopes = result.hits.map((hit) => envelopeFromHit(hit, { sourceId, now }));
  const outputs: string[] = [];
  if (options.write) {
    for (const envelope of envelopes) {
      outputs.push(await writeExperienceEnvelope(root, envelope));
    }
  }

  return {
    ok: true,
    source_id: sourceId,
    query: options.query,
    candidates: envelopes.length,
    imported: options.write ? outputs.length : 0,
    outputs,
    warnings: [],
    errors: [],
  };
}
