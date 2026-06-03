import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { computeHash, makeId } from "../protocol/id.js";
import type {
  ContextReducerRule,
  ContextReductionResult,
  ExperienceScopeHint,
  ExperienceSourceAgent,
  ExperienceSourceChannel,
  ExperienceSourceConfig,
  NormalizedReducerInput,
} from "../protocol/schemas.js";
import type { AgentProfile } from "../protocol/types.js";
import { contextReducerIdentitySalt, reduceContext } from "./context-reducer.js";

const execFileAsync = promisify(execFile);
const SUPPORTED_EXTENSIONS = new Set([".json", ".jsonl", ".md", ".txt", ".log", ".sqlite"]);
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_CHUNK_BYTES = 24 * 1024;

function agentProfileForChunking(agent: ExperienceSourceAgent): AgentProfile {
  return agent === "feishu" ? "generic" : agent;
}

export interface ExperienceChunk {
  source_id: string;
  agent: AgentProfile;
  channel: ExperienceSourceChannel;
  source_ref: string;
  source_hash: string;
  scope_hint: ExperienceScopeHint;
  chunk_id: string;
  chunk_hash: string;
  text: string;
  created_at?: string;
  reducer_identity_salt?: string;
}

export interface ChunkTextExperienceInput {
  source_id: string;
  agent: AgentProfile;
  channel: ExperienceSourceChannel;
  source_ref: string;
  source_hash: string;
  scope_hint: ExperienceScopeHint;
  text: string;
  maxChunkBytes?: number;
  created_at?: string;
  reducerIdentitySalt?: string;
}

export interface ChunkExperienceSourceOptions {
  maxBytes?: number;
  maxChunkBytes?: number;
  limit?: number;
  now?: string;
  contextReducer?: {
    projectRules?: ContextReducerRule[];
    recordResult?: (result: ContextReductionResult) => void;
  };
}

interface OpenClawSqliteChunkRow {
  id?: unknown;
  path?: unknown;
  text?: unknown;
  updated_at?: unknown;
}

function expandSourcePath(path: string, root?: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  if (root && !isAbsolute(path)) return join(root, path);
  return path;
}

function splitByBytes(text: string, maxBytes: number): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (Buffer.byteLength(normalized, "utf8") <= maxBytes) return [normalized];

  const chunks: string[] = [];
  let currentParts: string[] = [];
  let currentBytes = 0;
  for (const char of normalized) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (currentBytes > 0 && currentBytes + charBytes > maxBytes) {
      const chunk = currentParts.join("").trim();
      if (chunk) chunks.push(chunk);
      currentParts = [];
      currentBytes = 0;
    }
    currentParts.push(char);
    currentBytes += charBytes;
  }

  const tail = currentParts.join("").trim();
  if (tail) chunks.push(tail);

  return chunks;
}

function newestFilesFirst(files: string[]): string[] {
  return [...files].sort((a, b) => b.localeCompare(a));
}

function effectiveChunkLimit(input?: number): number {
  if (typeof input === "number" && Number.isFinite(input) && input >= 0) return input;
  return 200;
}

function effectiveFileBudget(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(limit * 3, 50);
}

function sortCandidateFiles(files: string[]): string[] {
  return newestFilesFirst(files);
}

function meaningfulText(rawText: string, agent: AgentProfile): string {
  const decoded = decodeJsonLineContent(rawText);
  const text = decoded.length > 0 ? decoded.join("\n") : rawText;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (agent === "codex" || agent === "claude-code" || agent === "opencode") {
    const patterns = [
      /\b(?:implemented|changed|fixed|added|updated|removed|created|refactored)\b/i,
      /\b(?:pnpm|npm|yarn)\s+(?:check|test|build|install|run)\b/i,
      /\btests?\s+(?:passed|failed)\b/i,
      /\bfinal\b/i,
      /\bsucceed(?:ed)?\b/i,
      /\bfailed\b/i,
      /\bopenclaw\b/i,
    ];
    const selected = lines.filter((line) => patterns.some((pattern) => pattern.test(line)));
    if (selected.length > 0) return selected.join("\n");
  }
  return lines.join("\n");
}

function decodeJsonLineContent(rawText: string): string[] {
  const contents: string[] = [];
  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object") {
        const content = (parsed as { content?: unknown; message?: { content?: unknown } }).content
          ?? (parsed as { message?: { content?: unknown } }).message?.content;
        if (typeof content === "string") {
          contents.push(content);
        } else if (Array.isArray(content)) {
          const text = content
            .map((part) => typeof part === "string"
              ? part
              : part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
                ? (part as { text: string }).text
                : "")
            .filter(Boolean)
            .join("\n");
          if (text) contents.push(text);
        }
      }
    } catch {
      return [];
    }
  }
  return contents;
}

function sourceRefForFile(source: ExperienceSourceConfig, filePath: string): string {
  const base = basename(filePath, extname(filePath));
  if (source.agent === "codex") return `raw-vault://codex/${base}`;
  if (source.agent === "claude-code") return `logs://${source.name}/${base}`;
  if (source.agent === "opencode") return `raw-vault://opencode/${base}`;
  return `log://openclaw/${basename(filePath)}`;
}

export function chunkTextExperience(input: ChunkTextExperienceInput): ExperienceChunk[] {
  const maxChunkBytes = input.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES;
  return splitByBytes(input.text, maxChunkBytes).map((text, index) => {
    const hashPayload: Record<string, unknown> = {
      source_ref: input.source_ref,
      source_hash: input.source_hash,
      index,
      text,
    };
    if (input.reducerIdentitySalt) {
      hashPayload.reducer_identity_salt = input.reducerIdentitySalt;
    }
    const chunkHash = computeHash(JSON.stringify(hashPayload));
    return {
      source_id: input.source_id,
      agent: input.agent,
      channel: input.channel,
      source_ref: input.source_ref,
      source_hash: input.source_hash,
      scope_hint: input.scope_hint,
      chunk_id: makeId("experience-chunk", `${input.source_id}_${chunkHash.slice(7, 23)}_${index}`),
      chunk_hash: chunkHash,
      text,
      created_at: input.created_at,
      reducer_identity_salt: input.reducerIdentitySalt,
    };
  });
}

async function listFilesRecursively(dir: string, maxBytes: number): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
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
      const s = await stat(full);
      if (ext !== ".sqlite" && s.size > maxBytes) continue;
      results.push(full);
    }
  }
  await walk(dir);
  return results.sort();
}

async function chunksFromOpenClawSqlite(
  source: ExperienceSourceConfig,
  filePath: string,
  maxChunkBytes: number,
  contextReducer?: ChunkExperienceSourceOptions["contextReducer"],
): Promise<ExperienceChunk[]> {
  const query = [
    "SELECT id, path, text, updated_at",
    "FROM chunks",
    "WHERE text IS NOT NULL AND length(trim(text)) > 0",
    "ORDER BY updated_at DESC, id ASC",
    "LIMIT 200;",
  ].join(" ");
  const { stdout } = await execFileAsync("sqlite3", ["-json", filePath, query], { maxBuffer: 16 * 1024 * 1024 });
  const rows = JSON.parse(stdout || "[]") as OpenClawSqliteChunkRow[];
  return rows
    .filter((row) => typeof row.id === "string" && typeof row.path === "string" && typeof row.text === "string")
    .flatMap((row) => {
      const sourceRef = `openclaw-memory://${row.path as string}#${row.id as string}`;
      const text = row.text as string;
      const sourceHash = computeHash(JSON.stringify({ source_id: source.id, source_ref: sourceRef, text }));
      const reduced = reduceTextForChunking({
        text,
        sourceRef,
        sourceHash,
        contextReducer,
        sourceMetadata: {
          agent: agentProfileForChunking(source.agent),
          source_id: source.id,
          source_type: source.source_type,
          path: row.path as string,
          adapter: "openclaw-sqlite",
        },
      });
      return chunkTextExperience({
        source_id: source.id,
        agent: agentProfileForChunking(source.agent),
        channel: source.channel,
        source_ref: sourceRef,
        source_hash: sourceHash,
        scope_hint: source.scope_default,
        text: reduced.text,
        maxChunkBytes,
        created_at: typeof row.updated_at === "number" ? new Date(row.updated_at * 1000).toISOString() : undefined,
        reducerIdentitySalt: reduced.reducerIdentitySalt,
      });
    });
}

async function chunksFromFile(
  source: ExperienceSourceConfig,
  filePath: string,
  maxBytes: number,
  maxChunkBytes: number,
  contextReducer?: ChunkExperienceSourceOptions["contextReducer"],
): Promise<ExperienceChunk[]> {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".sqlite") return chunksFromOpenClawSqlite(source, filePath, maxChunkBytes, contextReducer);

  const s = await stat(filePath);
  if (s.size > maxBytes) return [];
  const rawText = await readFile(filePath, "utf8");
  const text = meaningfulText(rawText, agentProfileForChunking(source.agent));
  const sourceRef = sourceRefForFile(source, filePath);
  const sourceHash = computeHash(rawText);
  const reduced = reduceTextForChunking({
    text,
    sourceRef,
    sourceHash,
    contextReducer,
    sourceMetadata: {
      agent: agentProfileForChunking(source.agent),
      source_id: source.id,
      source_type: source.source_type,
      path: filePath,
      extension: ext,
    },
  });
  return chunkTextExperience({
    source_id: source.id,
    agent: agentProfileForChunking(source.agent),
    channel: source.channel,
    source_ref: sourceRef,
    source_hash: sourceHash,
    scope_hint: source.scope_default,
    text: reduced.text,
    maxChunkBytes,
    reducerIdentitySalt: reduced.reducerIdentitySalt,
  });
}

function reduceTextForChunking(input: {
  text: string;
  sourceRef: string;
  sourceHash: string;
  sourceMetadata: Record<string, unknown>;
  contextReducer?: ChunkExperienceSourceOptions["contextReducer"];
}): { text: string; reducerIdentitySalt?: string } {
  if (!input.contextReducer) return { text: input.text };
  const reducerInput: NormalizedReducerInput = {
    combined_text: input.text,
    source_metadata: input.sourceMetadata,
    source_ref: input.sourceRef,
    source_hash: input.sourceHash,
  };
  const result = reduceContext(reducerInput, {
    projectRules: input.contextReducer.projectRules,
  });
  input.contextReducer.recordResult?.(result);
  return {
    text: result.text,
    reducerIdentitySalt: contextReducerIdentitySalt(result),
  };
}

export async function chunkExperienceSource(
  root: string,
  source: ExperienceSourceConfig,
  options: ChunkExperienceSourceOptions = {},
): Promise<ExperienceChunk[]> {
  if ((source.source_type !== "local" && source.source_type !== "file") || !source.path) return [];
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxChunkBytes = options.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES;
  const limit = effectiveChunkLimit(options.limit);
  const expanded = expandSourcePath(source.path, root);
  const s = await stat(expanded);
  const allFiles = s.isDirectory() ? await listFilesRecursively(expanded, maxBytes) : [expanded];
  const files = sortCandidateFiles(allFiles).slice(0, effectiveFileBudget(limit));
  const chunks: ExperienceChunk[] = [];
  for (const file of files) {
    if (chunks.length >= limit) break;
    chunks.push(...await chunksFromFile(source, file, maxBytes, maxChunkBytes, options.contextReducer));
  }
  return chunks.slice(0, limit);
}
