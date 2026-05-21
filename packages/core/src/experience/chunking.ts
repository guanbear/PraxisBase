import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { computeHash, makeId } from "../protocol/id.js";
import type {
  ExperienceScopeHint,
  ExperienceSourceChannel,
  ExperienceSourceConfig,
} from "../protocol/schemas.js";
import type { AgentProfile } from "../protocol/types.js";

const execFileAsync = promisify(execFile);
const SUPPORTED_EXTENSIONS = new Set([".json", ".jsonl", ".md", ".txt", ".log", ".sqlite"]);
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_CHUNK_BYTES = 24 * 1024;

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
}

export interface ChunkExperienceSourceOptions {
  maxBytes?: number;
  maxChunkBytes?: number;
  limit?: number;
  now?: string;
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

function truncateByBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  let end = text.length;
  while (end > 0 && Buffer.byteLength(text.slice(0, end), "utf8") > maxBytes) {
    end--;
  }
  return text.slice(0, end);
}

function splitByBytes(text: string, maxBytes: number): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (Buffer.byteLength(normalized, "utf8") <= maxBytes) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > 0) {
    const chunk = truncateByBytes(remaining, maxBytes).trim();
    if (!chunk) break;
    chunks.push(chunk);
    remaining = remaining.slice(chunk.length).trim();
  }
  return chunks;
}

function meaningfulText(rawText: string, agent: AgentProfile): string {
  const decoded = decodeJsonLineContent(rawText);
  const text = decoded.length > 0 ? decoded.join("\n") : rawText;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (agent === "codex" || agent === "claude-code") {
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
  return `log://openclaw/${basename(filePath)}`;
}

export function chunkTextExperience(input: ChunkTextExperienceInput): ExperienceChunk[] {
  const maxChunkBytes = input.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES;
  return splitByBytes(input.text, maxChunkBytes).map((text, index) => {
    const chunkHash = computeHash(JSON.stringify({
      source_ref: input.source_ref,
      source_hash: input.source_hash,
      index,
      text,
    }));
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
      return chunkTextExperience({
        source_id: source.id,
        agent: source.agent,
        channel: source.channel,
        source_ref: sourceRef,
        source_hash: computeHash(JSON.stringify({ source_id: source.id, source_ref: sourceRef, text })),
        scope_hint: source.scope_default,
        text,
        maxChunkBytes,
        created_at: typeof row.updated_at === "number" ? new Date(row.updated_at * 1000).toISOString() : undefined,
      });
    });
}

async function chunksFromFile(
  source: ExperienceSourceConfig,
  filePath: string,
  maxBytes: number,
  maxChunkBytes: number,
): Promise<ExperienceChunk[]> {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".sqlite") return chunksFromOpenClawSqlite(source, filePath, maxChunkBytes);

  const s = await stat(filePath);
  if (s.size > maxBytes) return [];
  const rawText = await readFile(filePath, "utf8");
  const text = meaningfulText(rawText, source.agent);
  const sourceRef = sourceRefForFile(source, filePath);
  return chunkTextExperience({
    source_id: source.id,
    agent: source.agent,
    channel: source.channel,
    source_ref: sourceRef,
    source_hash: computeHash(rawText),
    scope_hint: source.scope_default,
    text,
    maxChunkBytes,
  });
}

export async function chunkExperienceSource(
  root: string,
  source: ExperienceSourceConfig,
  options: ChunkExperienceSourceOptions = {},
): Promise<ExperienceChunk[]> {
  if ((source.source_type !== "local" && source.source_type !== "file") || !source.path) return [];
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxChunkBytes = options.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES;
  const limit = options.limit ?? 200;
  const expanded = expandSourcePath(source.path, root);
  const s = await stat(expanded);
  const files = s.isDirectory() ? await listFilesRecursively(expanded, maxBytes) : [expanded];
  const chunks: ExperienceChunk[] = [];
  for (const file of files) {
    if (chunks.length >= limit) break;
    chunks.push(...await chunksFromFile(source, file, maxBytes, maxChunkBytes));
  }
  return chunks.slice(0, limit);
}
