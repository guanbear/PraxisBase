import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { computeHash, makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import {
  ExperienceEnvelopeSchema,
  type ExperienceEnvelope,
  type ExperienceOutcome,
  type ExperienceSourceConfig,
} from "../protocol/schemas.js";
import { safePath, writeText } from "../store/file-store.js";
import { detectOpenClawProblemSignature } from "../repair/signature.js";
import { evaluateExperiencePrivacy, type EvaluateExperiencePrivacyInput } from "./privacy-policy.js";
import type { GitCommandRunner } from "./git-workflow.js";

const execFileAsync = promisify(execFile);

const SUPPORTED_EXTENSIONS = new Set([".json", ".jsonl", ".md", ".txt", ".log", ".sqlite"]);
const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_BYTES = 512 * 1024;
const MAX_SUMMARY_LENGTH = 1200;

export interface ResolveExperienceSourceOptions {
  authorityMode: EvaluateExperiencePrivacyInput["mode"];
  limit?: number;
  maxBytes?: number;
  now?: string;
  fetchImpl?: typeof fetch;
  runCommand?: GitCommandRunner;
  env?: Record<string, string | undefined>;
}

export interface ResolvedExperienceSource {
  source: ExperienceSourceConfig;
  status: "completed" | "partial" | "failed";
  scanned: number;
  fetched: number;
  enveloped: number;
  rejected: number;
  humanRequired: number;
  skipped: number;
  envelopes: ExperienceEnvelope[];
  warnings: string[];
}

interface RawExperienceItem {
  id?: string;
  remote_id?: string;
  source_ref?: string;
  summary?: string;
  redacted_summary?: string;
  signature?: string;
  problem_signature?: string;
  outcome?: string;
  created_at?: string;
  raw_log?: string;
  text?: string;
  [key: string]: unknown;
}

interface OpenClawSqliteChunkRow {
  id?: unknown;
  path?: unknown;
  source?: unknown;
  start_line?: unknown;
  end_line?: unknown;
  hash?: unknown;
  text?: unknown;
  updated_at?: unknown;
}

function expandSourcePath(path: string, root?: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  if (root && !isAbsolute(path)) return join(root, path);
  return path;
}

async function listFilesRecursively(dir: string, maxBytes: number, warnings: string[]): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      warnings.push(`read_failed: ${current}`);
      return;
    }

    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
      try {
        const s = await stat(full);
        if (ext !== ".sqlite" && s.size > maxBytes) {
          warnings.push(`oversize: ${full}`);
          continue;
        }
        results.push(full);
      } catch {
        warnings.push(`stat_failed: ${full}`);
      }
    }
  }

  await walk(dir);
  return results.sort();
}

function parseJsonItems(content: string): RawExperienceItem[] | undefined {
  const trimmed = content.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === "object");
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.items)) {
        return obj.items.filter((item): item is RawExperienceItem => Boolean(item) && typeof item === "object");
      }
      return [obj as RawExperienceItem];
    }
    return [];
  } catch {
  }

  const items: RawExperienceItem[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    try {
      const parsed = JSON.parse(l);
      if (parsed && typeof parsed === "object") {
        items.push(parsed as RawExperienceItem);
      }
    } catch {
      return undefined;
    }
  }
  return items;
}

function summarizeText(text: string, fallback: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const summary = lines.slice(0, 5).join(" ") || fallback;
  return summary.length > MAX_SUMMARY_LENGTH ? `${summary.slice(0, MAX_SUMMARY_LENGTH)}...[truncated]` : summary;
}

function summaryForItem(source: ExperienceSourceConfig, item: RawExperienceItem, rawText: string): string {
  const explicit = item.redacted_summary ?? item.summary;
  if (explicit && explicit.length > 0) {
    return explicit.length > MAX_SUMMARY_LENGTH ? `${explicit.slice(0, MAX_SUMMARY_LENGTH)}...[truncated]` : explicit;
  }
  if (source.agent === "openclaw") {
    return detectOpenClawProblemSignature(item.raw_log ?? rawText);
  }
  return summarizeText(item.text ?? item.raw_log ?? rawText, `${source.agent} experience`);
}

function outcomeForItem(item: RawExperienceItem): ExperienceOutcome | undefined {
  if (item.outcome === "success" || item.outcome === "failed" || item.outcome === "partial" || item.outcome === "unknown") {
    return item.outcome;
  }
  return undefined;
}

function sourceRefForItem(source: ExperienceSourceConfig, item: RawExperienceItem, index: number, filePath?: string): string {
  if (item.source_ref) return item.source_ref;
  const itemId = item.remote_id ?? item.id ?? (filePath ? basename(filePath, extname(filePath)) : `item-${index}`);
  if (source.agent === "codex") return `raw-vault://codex/${itemId}`;
  if (source.agent === "claude-code") return `logs://${source.name}/${itemId}`;
  if (source.source_type === "openclaw-api") return `openclaw://${source.remote ?? source.name}/${itemId}`;
  return `log://openclaw/${itemId}`;
}

function itemText(item: RawExperienceItem, rawText: string): string {
  return [
    item.redacted_summary,
    item.summary,
    item.raw_log,
    item.text,
    rawText,
  ].filter((value): value is string => typeof value === "string" && value.length > 0).join("\n");
}

function makeEnvelope(
  source: ExperienceSourceConfig,
  item: RawExperienceItem,
  rawText: string,
  index: number,
  options: ResolveExperienceSourceOptions,
  filePath?: string,
): ExperienceEnvelope {
  const fetchedAt = options.now ?? new Date().toISOString();
  const sourceRef = sourceRefForItem(source, item, index, filePath);
  const hashBody = JSON.stringify({ source_id: source.id, source_ref: sourceRef, item });
  const sourceHash = computeHash(hashBody);
  const redactedSummary = summaryForItem(source, item, rawText);
  const privacy = evaluateExperiencePrivacy({
    mode: options.authorityMode,
    scopeHint: source.scope_default,
    channel: source.channel,
    text: itemText(item, rawText),
  });
  const signature = item.signature ?? item.problem_signature;

  return ExperienceEnvelopeSchema.parse({
    id: makeId("experience", `${source.name}_${sourceHash.slice(0, 16)}`),
    protocol_version: PROTOCOL_VERSION,
    type: "experience_envelope",
    source_id: source.id,
    agent: source.agent,
    channel: source.channel,
    source_ref: sourceRef,
    source_hash: sourceHash,
    scope_hint: source.scope_default,
    signature,
    problem_signature: item.problem_signature ?? signature,
    outcome: outcomeForItem(item),
    redacted_summary: redactedSummary,
    created_at: typeof item.created_at === "string" ? item.created_at : undefined,
    fetched_at: fetchedAt,
    privacy: {
      mode: options.authorityMode,
      verdict: privacy.verdict,
      reasons: privacy.reasons,
    },
    warnings: [],
  });
}

async function itemsFromFile(path: string, maxBytes: number, warnings: string[]): Promise<Array<{ item: RawExperienceItem; rawText: string; filePath: string }>> {
  let s;
  try {
    s = await stat(path);
  } catch {
    warnings.push(`source_not_found: ${path}`);
    return [];
  }
  if (!s.isFile()) {
    warnings.push(`source_not_file: ${path}`);
    return [];
  }
  if (extname(path).toLowerCase() === ".sqlite") {
    return itemsFromOpenClawSqlite(path, warnings);
  }
  if (s.size > maxBytes) {
    warnings.push(`oversize: ${path}`);
    return [];
  }
  const rawText = await readFile(path, "utf8");
  const parsed = parseJsonItems(rawText);
  if (parsed) {
    return parsed.map((item) => ({ item, rawText, filePath: path }));
  }
  return [{ item: { text: rawText }, rawText, filePath: path }];
}

async function itemsFromOpenClawSqlite(path: string, warnings: string[]): Promise<Array<{ item: RawExperienceItem; rawText: string; filePath: string }>> {
  const query = [
    "SELECT id, path, source, start_line, end_line, hash, text, updated_at",
    "FROM chunks",
    "WHERE text IS NOT NULL AND length(trim(text)) > 0",
    "ORDER BY updated_at DESC, id ASC",
    "LIMIT 200;",
  ].join(" ");
  try {
    const { stdout } = await execFileAsync("sqlite3", ["-json", path, query], { maxBuffer: 16 * 1024 * 1024 });
    const rows = JSON.parse(stdout || "[]") as OpenClawSqliteChunkRow[];
    return rows
      .filter((row) => typeof row.id === "string" && typeof row.path === "string" && typeof row.text === "string")
      .map((row) => {
        const text = row.text as string;
        const chunkId = row.id as string;
        const chunkPath = row.path as string;
        const signature = detectOpenClawProblemSignature(text);
        const item: RawExperienceItem = {
          id: chunkId,
          source_ref: `openclaw-memory://${chunkPath}#${chunkId}`,
          summary: summarizeText(text, "openclaw memory chunk"),
          text,
          raw_log: text,
          problem_signature: signature === "openclaw:unknown" ? undefined : signature,
          signature: signature === "openclaw:unknown" ? undefined : signature,
          created_at: typeof row.updated_at === "number" ? new Date(row.updated_at * 1000).toISOString() : undefined,
        };
        return { item, rawText: JSON.stringify({ ...row, text: item.summary }), filePath: path };
      });
  } catch (error) {
    warnings.push(`sqlite_read_failed: ${path}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function itemsFromPath(sourcePath: string, maxBytes: number, warnings: string[], root?: string): Promise<Array<{ item: RawExperienceItem; rawText: string; filePath: string }>> {
  const expanded = expandSourcePath(sourcePath, root);
  let s;
  try {
    s = await stat(expanded);
  } catch {
    warnings.push(`source_not_found: ${expanded}`);
    return [];
  }

  if (s.isDirectory()) {
    const files = await listFilesRecursively(expanded, maxBytes, warnings);
    const batches = await Promise.all(files.map((file) => itemsFromFile(file, maxBytes, warnings)));
    return batches.flat();
  }
  return itemsFromFile(expanded, maxBytes, warnings);
}

async function fetchJsonItems(
  source: ExperienceSourceConfig,
  options: ResolveExperienceSourceOptions,
): Promise<{ items: Array<{ item: RawExperienceItem; rawText: string }>; warnings: string[] }> {
  const warnings: string[] = [];
  const url = source.url;
  if (!url) {
    warnings.push("http source requires url");
    return { items: [], warnings };
  }
  const response = await (options.fetchImpl ?? fetch)(url);
  if (!response.ok) {
    warnings.push(`http_error: ${response.status} ${response.statusText}`);
    return { items: [], warnings };
  }
  const rawText = await response.text();
  const parsed = parseJsonItems(rawText);
  return {
    items: (parsed ?? [{ text: rawText }]).map((item) => ({ item, rawText })),
    warnings,
  };
}

async function fetchOpenClawApiItems(
  source: ExperienceSourceConfig,
  options: ResolveExperienceSourceOptions,
): Promise<{ items: Array<{ item: RawExperienceItem; rawText: string }>; warnings: string[] }> {
  const warnings: string[] = [];
  if (!source.remote) {
    warnings.push("openclaw-api source requires remote");
    return { items: [], warnings };
  }
  const env = options.env ?? process.env;
  const token = env.OPENCLAW_TOKEN;
  if (!token) {
    warnings.push("OPENCLAW_TOKEN is not set");
    return { items: [], warnings };
  }
  const baseUrl = (env.OPENCLAW_BASE_URL ?? "https://api.openclaw.dev").replace(/\/+$/, "");
  const url = new URL(`/v1/memory/${source.remote}`, baseUrl);
  url.searchParams.set("limit", String(options.limit ?? DEFAULT_LIMIT));
  const response = await (options.fetchImpl ?? fetch)(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) {
    warnings.push(`api_error: ${response.status} ${response.statusText}`);
    return { items: [], warnings };
  }
  const rawText = await response.text();
  const parsed = parseJsonItems(rawText);
  return {
    items: (parsed ?? []).map((item) => ({ item, rawText })),
    warnings,
  };
}

async function resolveSourceItems(
  root: string,
  source: ExperienceSourceConfig,
  options: ResolveExperienceSourceOptions,
): Promise<{ items: Array<{ item: RawExperienceItem; rawText: string; filePath?: string }>; warnings: string[] }> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (source.source_type === "local" || source.source_type === "file") {
    if (!source.path) return { items: [], warnings: [`${source.source_type} source requires path`] };
    const warnings: string[] = [];
    const items = await itemsFromPath(source.path, maxBytes, warnings, root);
    return { items, warnings };
  }
  if (source.source_type === "http") {
    return fetchJsonItems(source, options);
  }
  if (source.source_type === "ssh") {
    if (!source.host || !source.path) return { items: [], warnings: ["ssh source requires host and path"] };
    if (!options.runCommand) return { items: [], warnings: ["ssh source requires runCommand"] };
    const rawText = await options.runCommand("ssh", [source.host, "cat", source.path]);
    const parsed = parseJsonItems(rawText);
    return { items: (parsed ?? [{ text: rawText }]).map((item) => ({ item, rawText })), warnings: [] };
  }
  if (source.source_type === "git") {
    if (!source.repo || !source.path) return { items: [], warnings: ["git source requires repo and path"] };
    if (!options.runCommand) return { items: [], warnings: ["git source requires runCommand"] };
    const cacheRelative = `${protocolPaths.cacheRemotes}/${source.name}`;
    const cacheAbsolute = safePath(root, cacheRelative);
    try {
      await stat(cacheAbsolute);
      await options.runCommand("git", ["-C", cacheAbsolute, "pull", "--ff-only"]);
    } catch {
      await options.runCommand("git", ["clone", "--depth", "1", source.repo, cacheAbsolute]);
    }
    if (source.ref) await options.runCommand("git", ["-C", cacheAbsolute, "checkout", source.ref]);
    const warnings: string[] = [];
    const stagedPath = safePath(root, `${cacheRelative}/${source.path}`);
    const items = await itemsFromPath(stagedPath, maxBytes, warnings);
    return { items, warnings };
  }
  if (source.source_type === "openclaw-api") {
    return fetchOpenClawApiItems(source, options);
  }
  return { items: [], warnings: [`unsupported_source_type: ${source.source_type satisfies never}`] };
}

export async function resolveExperienceSource(
  root: string,
  source: ExperienceSourceConfig,
  options: ResolveExperienceSourceOptions,
): Promise<ResolvedExperienceSource> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const warnings: string[] = [];
  let rawItems: Array<{ item: RawExperienceItem; rawText: string; filePath?: string }> = [];

  try {
    const resolved = await resolveSourceItems(root, source, options);
    rawItems = resolved.items.slice(0, limit);
    warnings.push(...resolved.warnings);
  } catch (error) {
    warnings.push(`source_failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const envelopes = rawItems.map((entry, index) =>
    makeEnvelope(source, entry.item, entry.rawText, index, options, entry.filePath)
  );
  const rejected = envelopes.filter((envelope) => envelope.privacy.verdict === "reject").length;
  const humanRequired = envelopes.filter((envelope) => envelope.privacy.verdict === "human_required").length;
  const skipped = Math.max(0, rawItems.length - envelopes.length);
  const status = warnings.length > 0 || rejected > 0 || humanRequired > 0
    ? (envelopes.length > 0 ? "partial" : "failed")
    : "completed";

  return {
    source,
    status,
    scanned: rawItems.length,
    fetched: rawItems.length,
    enveloped: envelopes.length,
    rejected,
    humanRequired,
    skipped,
    envelopes,
    warnings,
  };
}

export async function writeExperienceEnvelope(root: string, envelope: ExperienceEnvelope): Promise<string> {
  const path = `${protocolPaths.stagingExperienceEnvelopes}/${envelope.id}.json`;
  await writeText(root, path, `${JSON.stringify(envelope, null, 2)}\n`);
  return path;
}
