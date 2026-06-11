import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { computeHash, makeId } from "../protocol/id.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { protocolPaths } from "../protocol/paths.js";
import { redactSensitiveValues } from "../protocol/redact.js";
import {
  OpenClawRemoteMemoryEnvelopeSchema,
  AgentMemoryFetchReportSchema,
  OpenClawRemoteDoctorReportSchema,
  ExceptionRecordSchema,
  type AgentMemoryFetchReport,
  type OpenClawRemoteDoctorReport,
  type OpenClawRemoteProvider,
  type PraxisBaseCliRuntimeMode,
} from "../protocol/schemas.js";
import { writeJson, readJson } from "../store/file-store.js";
import { containsPrivateMaterial } from "../wiki/lint.js";

const MAX_SUMMARY_LENGTH = 1200;

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface FetchOpenClawRemoteMemoryInput {
  provider: OpenClawRemoteProvider;
  sources?: string[];
  remote?: string;
  since?: string;
  limit?: number;
  out?: string;
  runtimeMode?: PraxisBaseCliRuntimeMode;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: string;
}

export interface DoctorOpenClawRemoteInput {
  provider: OpenClawRemoteProvider;
  runtimeMode?: PraxisBaseCliRuntimeMode;
  env?: Record<string, string | undefined>;
  now?: string;
  writeReport?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawRemoteItem {
  id?: string;
  remote_id?: string;
  summary?: string;
  redacted_summary?: string;
  signature?: string;
  created_at?: string;
  raw_log?: string;
  [key: string]: unknown;
}

function resolveRuntimeMode(input?: PraxisBaseCliRuntimeMode): PraxisBaseCliRuntimeMode {
  return input ?? "source";
}

function resolveEnv(env?: Record<string, string | undefined>): Record<string, string | undefined> {
  return env ?? process.env;
}

function makeEnvelopeId(provider: OpenClawRemoteProvider, remoteId: string): string {
  return makeId("openclaw-remote", `${provider}_${remoteId}`);
}

function makeSourceRef(provider: OpenClawRemoteProvider, remoteId: string): string {
  return `openclaw://${provider}/${remoteId}`;
}

async function isStagingIgnoredByGit(root: string): Promise<boolean> {
  try {
    const gitignore = await readFile(join(root, ".gitignore"), "utf8");
    return gitignore.split(/\r?\n/).some((line) => {
      const normalized = line.trim();
      return normalized === ".praxisbase/staging/" ||
        normalized === ".praxisbase/staging" ||
        normalized === ".praxisbase/staging/**" ||
        normalized === ".praxisbase/staging/openclaw/" ||
        normalized === ".praxisbase/staging/openclaw";
    });
  } catch {
    return false;
  }
}

function buildRedactedSummary(item: RawRemoteItem): string {
  const text = item.redacted_summary ?? item.summary ?? "";
  if (text.length > MAX_SUMMARY_LENGTH) {
    return text.slice(0, MAX_SUMMARY_LENGTH) + "...[truncated]";
  }
  return text || "openclaw remote memory";
}

function resolveRemoteId(item: RawRemoteItem, index: number): string {
  if (item.remote_id) return item.remote_id;
  if (item.id) return item.id;
  return `unknown-${index}`;
}

/**
 * Parse source file content into raw items.
 * Supports: {items:[...]} objects, top-level arrays, JSONL, NDJSON.
 */
function parseSourceItems(content: string): RawRemoteItem[] {
  const trimmed = content.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => item && typeof item === "object");
    }
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.items)) {
        return parsed.items.filter((item: unknown) => item && typeof item === "object");
      }
      return [parsed];
    }
    return [];
  } catch {
    // Fall through to JSONL/NDJSON parsing
  }

  const items: RawRemoteItem[] = [];
  for (const line of trimmed.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    try {
      const obj = JSON.parse(l);
      if (obj && typeof obj === "object") {
        items.push(obj);
      }
    } catch {
      // Skip unparseable lines
    }
  }
  return items;
}

/**
 * Load existing source_hash values from staged envelopes and reports to deduplicate.
 */
async function loadExistingSourceHashes(root: string, stagingDir: string): Promise<Set<string>> {
  const hashes = new Set<string>();
  const dirs = [stagingDir];

  for (const dir of dirs) {
    try {
      const files = await readdir(join(root, dir));
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const data = await readJson<{ source_hash?: string }>(root, `${dir}/${file}`);
          if (data.source_hash) {
            hashes.add(data.source_hash);
          }
        } catch {
        }
      }
    } catch {
    }
  }
  return hashes;
}

// ---------------------------------------------------------------------------
// exported-json provider
// ---------------------------------------------------------------------------

async function fetchExportedJson(
  input: FetchOpenClawRemoteMemoryInput,
): Promise<{ items: RawRemoteItem[]; warnings: string[]; skipped: number }> {
  const sources = input.sources ?? [];
  const warnings: string[] = [];
  let skipped = 0;

  if (sources.length === 0) {
    warnings.push("exported-json requires at least one source file");
    return { items: [], warnings, skipped };
  }

  const allItems: RawRemoteItem[] = [];

  for (const sourcePath of sources) {
    let s;
    try {
      s = await stat(sourcePath);
    } catch {
      warnings.push(`source_not_found: ${sourcePath}`);
      skipped++;
      continue;
    }

    if (!s.isFile()) {
      warnings.push(`source_not_file: ${sourcePath}`);
      skipped++;
      continue;
    }

    let content: string;
    try {
      content = await readFile(sourcePath, "utf8");
    } catch {
      warnings.push(`read_failed: ${sourcePath}`);
      skipped++;
      continue;
    }

    const items = parseSourceItems(content);
    if (items.length === 0) {
      skipped++;
    }
    allItems.push(...items);
  }

  return { items: allItems, warnings, skipped };
}

// ---------------------------------------------------------------------------
// openclaw-api provider (minimal, mockable)
// ---------------------------------------------------------------------------

async function fetchOpenClawApi(
  input: FetchOpenClawRemoteMemoryInput,
): Promise<{ items: RawRemoteItem[]; warnings: string[]; skipped: number }> {
  const env = resolveEnv(input.env);
  const warnings: string[] = [];

  if (!input.remote) {
    warnings.push("openclaw-api requires --remote");
    return { items: [], warnings, skipped: 1 };
  }

  const token = env.OPENCLAW_TOKEN;
  if (!token) {
    warnings.push("OPENCLAW_TOKEN is not set");
    return { items: [], warnings, skipped: 1 };
  }

  const baseUrl = (env.OPENCLAW_BASE_URL ?? "https://api.openclaw.dev").replace(/\/+$/, "");
  const limit = input.limit ?? 20;

  const url = new URL(`/v1/memory/${input.remote}`, baseUrl);
  url.searchParams.set("limit", String(limit));
  if (input.since) {
    url.searchParams.set("since", input.since);
  }

  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    warnings.push(`api_request_failed: ${err instanceof Error ? err.message : String(err)}`);
    return { items: [], warnings, skipped: 1 };
  }

  if (!response.ok) {
    warnings.push(`api_error: ${response.status} ${response.statusText}`);
    return { items: [], warnings, skipped: 1 };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    warnings.push("api_response_parse_failed");
    return { items: [], warnings, skipped: 1 };
  }

  if (body && typeof body === "object" && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      return { items: obj.items as RawRemoteItem[], warnings, skipped: 0 };
    }
    return { items: [obj as RawRemoteItem], warnings, skipped: 0 };
  }

  if (Array.isArray(body)) {
    return { items: body as RawRemoteItem[], warnings, skipped: 0 };
  }

  warnings.push("api_response_unexpected_format");
  return { items: [], warnings, skipped: 1 };
}

// ---------------------------------------------------------------------------
// Fetch orchestrator
// ---------------------------------------------------------------------------

export async function fetchOpenClawRemoteMemory(
  root: string,
  input: FetchOpenClawRemoteMemoryInput,
): Promise<AgentMemoryFetchReport> {
  const provider = input.provider;
  const runtimeMode = resolveRuntimeMode(input.runtimeMode);
  const now = input.now ?? new Date().toISOString();
  const stagingDir = input.out ?? protocolPaths.stagingOpenClaw;

  let rawItems: RawRemoteItem[];
  let fetchWarnings: string[];
  let providerSkipped = 0;

  switch (provider) {
    case "exported-json": {
      const result = await fetchExportedJson(input);
      rawItems = result.items;
      fetchWarnings = result.warnings;
      providerSkipped = result.skipped;
      break;
    }
    case "openclaw-api": {
      const result = await fetchOpenClawApi(input);
      rawItems = result.items;
      fetchWarnings = result.warnings;
      providerSkipped = result.skipped;
      break;
    }
    case "openclaw-cli": {
      fetchWarnings = ["openclaw-cli provider is not yet implemented"];
      rawItems = [];
      providerSkipped = 1;
      break;
    }
    default:
      fetchWarnings = [`unsupported_provider: ${provider}`];
      rawItems = [];
  }

  const existingHashes = await loadExistingSourceHashes(root, stagingDir);

  let fetched = 0;
  let staged = 0;
  let duplicates = 0;
  let skipped = providerSkipped;
  let unsafe = 0;
  const outputs: string[] = [];
  const warnings = [...fetchWarnings];

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    fetched++;

    const remoteId = resolveRemoteId(item, i);
    const sourceRef = makeSourceRef(provider, remoteId);

    // Hash computed from raw item JSON before redaction (security invariant)
    const rawItemJson = JSON.stringify(item);
    const sourceHash = computeHash(rawItemJson);

    if (existingHashes.has(sourceHash)) {
      duplicates++;
      continue;
    }

    const summary = buildRedactedSummary(item);

    if (containsPrivateMaterial(summary)) {
      unsafe++;
      const exceptionId = makeId("exception", `human-required_${sourceHash.slice(0, 16)}`);
      const exception = ExceptionRecordSchema.parse({
        id: exceptionId,
        protocol_version: PROTOCOL_VERSION,
        type: "exception_record",
        category: "human_required",
        source_id: makeEnvelopeId(provider, remoteId),
        reason: "Private material detected in remote memory summary",
        details: {
          provider,
          remote_id: remoteId,
          source_ref: sourceRef,
          source_hash: sourceHash,
          redacted_summary: redactSensitiveValues(summary),
        },
        created_at: now,
      });
      const exceptionPath = `${protocolPaths.exceptionsHumanRequired}/${exceptionId}.json`;
      await writeJson(root, exceptionPath, exception);
      outputs.push(exceptionPath);
      continue;
    }

    const envelopeId = makeEnvelopeId(provider, remoteId);
    const envelope = OpenClawRemoteMemoryEnvelopeSchema.parse({
      id: envelopeId,
      protocol_version: PROTOCOL_VERSION,
      type: "openclaw_remote_memory",
      provider,
      remote_id: remoteId,
      source_ref: sourceRef,
      source_hash: sourceHash,
      redacted_summary: summary,
      signature: item.signature,
      created_at: item.created_at,
      fetched_at: now,
      warnings: [],
    });

    const envelopePath = `${stagingDir}/${envelopeId}.json`;
    await writeJson(root, envelopePath, envelope);
    outputs.push(envelopePath);
    existingHashes.add(sourceHash);
    staged++;
  }

  const reportId = makeId("memory-fetch", `openclaw_${provider}_${now.replace(/[^a-z0-9]/gi, "-")}`);
  const report = AgentMemoryFetchReportSchema.parse({
    id: reportId,
    protocol_version: PROTOCOL_VERSION,
    type: "agent_memory_fetch_report",
    agent: "openclaw",
    provider,
    runtime_mode: runtimeMode,
    fetched,
    staged,
    duplicates,
    skipped,
    unsafe,
    outputs,
    warnings,
    changed_stable_knowledge: false as const,
    created_at: now,
  });

  const reportPath = `${protocolPaths.reportsMemoryFetch}/${reportId}.json`;
  await writeJson(root, reportPath, report);

  const runId = makeId("run", `memory-fetch_openclaw_${provider}_${now.replace(/[^a-z0-9]/gi, "-")}`);
  await writeJson(root, `${protocolPaths.runsMemoryFetch}/${runId}.json`, {
    id: runId,
    protocol_version: PROTOCOL_VERSION,
    command: "memory-fetch",
    status: (skipped > 0 || fetchWarnings.length > 0) ? "partial" as const : "completed" as const,
    started_at: now,
    finished_at: now,
    counts: { fetched, staged, duplicates, skipped, unsafe },
    errors: [],
  });

  return report;
}

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------

export async function doctorOpenClawRemote(
  root: string,
  input: DoctorOpenClawRemoteInput,
): Promise<OpenClawRemoteDoctorReport> {
  const provider = input.provider;
  const runtimeMode = resolveRuntimeMode(input.runtimeMode);
  const now = input.now ?? new Date().toISOString();
  const env = resolveEnv(input.env);

  const checks: Array<{
    id: string;
    ok: boolean;
    severity: "info" | "warning" | "error";
    message: string;
  }> = [];
  const warnings: string[] = [];
  const stagingIgnored = await isStagingIgnoredByGit(root);

  checks.push({
    id: "staging-gitignore",
    ok: stagingIgnored,
    severity: stagingIgnored ? "info" : "warning",
    message: stagingIgnored
      ? ".praxisbase/staging/ is ignored by Git."
      : ".praxisbase/staging/ is not covered by .gitignore.",
  });
  if (!stagingIgnored) {
    warnings.push("staging_not_ignored");
  }

  switch (provider) {
    case "exported-json": {
      checks.push({
        id: "exported-json-provider",
        ok: true,
        severity: "info",
        message: "exported-json provider is available.",
      });

      checks.push({
        id: "staging-directory",
        ok: true,
        severity: "info",
        message: "Staging directory is configured.",
      });
      break;
    }

    case "openclaw-api": {
      const token = env.OPENCLAW_TOKEN;
      if (!token) {
        checks.push({
          id: "openclaw-token",
          ok: false,
          severity: "error",
          message: "OPENCLAW_TOKEN is not set.",
        });
        warnings.push("OPENCLAW_TOKEN is not set.");
      } else {
        checks.push({
          id: "openclaw-token",
          ok: true,
          severity: "info",
          message: "OPENCLAW_TOKEN is set.",
        });
      }

      const baseUrl = env.OPENCLAW_BASE_URL;
      if (baseUrl) {
        try {
          new URL(baseUrl);
          checks.push({
            id: "openclaw-base-url",
            ok: true,
            severity: "info",
            message: `OPENCLAW_BASE_URL is valid: ${baseUrl}`,
          });
        } catch {
          checks.push({
            id: "openclaw-base-url",
            ok: false,
            severity: "error",
            message: `OPENCLAW_BASE_URL is invalid: ${baseUrl}`,
          });
          warnings.push(`OPENCLAW_BASE_URL is invalid: ${baseUrl}`);
        }
      } else {
        checks.push({
          id: "openclaw-base-url",
          ok: true,
          severity: "info",
          message: "OPENCLAW_BASE_URL not set; will use default.",
        });
      }
      break;
    }

    case "openclaw-cli": {
      checks.push({
        id: "openclaw-cli",
        ok: false,
        severity: "warning",
        message: "openclaw-cli provider is not yet implemented.",
      });
      warnings.push("openclaw-cli provider is not yet implemented.");
      break;
    }

    default: {
      checks.push({
        id: "provider-unknown",
        ok: false,
        severity: "error",
        message: `Unknown provider: ${provider}`,
      });
      warnings.push(`Unknown provider: ${provider}`);
    }
  }

  const ok = checks.every((c) => c.ok);

  const report: OpenClawRemoteDoctorReport = {
    id: makeId("openclaw-remote-doctor", `${provider}`),
    protocol_version: PROTOCOL_VERSION,
    type: "openclaw_remote_doctor_report",
    provider,
    runtime_mode: runtimeMode,
    ok,
    checks,
    warnings,
    created_at: now,
  };

  OpenClawRemoteDoctorReportSchema.parse(report);

  if (input.writeReport) {
    const reportPath = `${protocolPaths.reportsMemoryFetch}/${report.id}.json`;
    await writeJson(root, reportPath, report);
  }

  return report;
}
