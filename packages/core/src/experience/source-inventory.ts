import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { promisify } from "node:util";
import { computeHash, slugifyId } from "../protocol/id.js";
import {
  SourceInventoryItemSchema,
  type EvidenceSpan,
  type SourceInventoryItem,
} from "./lesson-model.js";

const SUPPORTED_EXTENSIONS = new Set([".md", ".txt", ".json", ".jsonl", ".log"]);
const execFileAsync = promisify(execFile);

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

export interface BuildSourceInventoryOptions {
  agent: "codex" | "openclaw" | "claude-code" | "opencode" | "hermes" | "openhuman" | "generic";
  path: string;
  scope: "personal" | "project" | "team" | "global" | "org";
  origin: "local" | "trusted_personal_remote" | "team_git" | "external";
}

function classifySourceKind(fileName: string): SourceInventoryItem["source_kind"] {
  const lower = fileName.toLowerCase();
  if (lower === "memory.md" || lower.includes("memory")) return "memory_file";
  if (lower === "tools.md") return "tools_file";
  if (lower.endsWith(".sqlite")) return "sqlite_memory";
  if (lower.endsWith(".jsonl") || lower.endsWith(".json") || lower.endsWith(".log")) return "session";
  return "generic_file";
}

function classifyAuthorityHint(
  sourceKind: SourceInventoryItem["source_kind"],
): SourceInventoryItem["authority_hint"] {
  switch (sourceKind) {
    case "memory_file":
      return "agent_native_memory";
    case "tools_file":
      return "user_authored";
    case "skill":
      return "user_authored";
    case "session":
      return "session_transcript";
    case "report":
      return "generated_report";
    case "sidecar_import":
      return "external_sidecar";
    default:
      return "session_transcript";
  }
}

function parseMarkdownSpans(
  content: string,
  sourceItemId: string,
  sourceRef: string,
  sourceHash: string,
): EvidenceSpan[] {
  const lines = content.split("\n");
  const spans: EvidenceSpan[] = [];
  const headingPath: string[] = [];
  let byteOffset = 0;

  let currentSpanStart = -1;
  let currentSpanByteStart = 0;
  let currentSpanByteEnd = 0;
  let currentSpanKind: EvidenceSpan["span_kind"] | null = null;
  let currentSpanLines: string[] = [];

  function flushSpan(endLineIndex: number) {
    if (currentSpanStart < 0 || !currentSpanKind) return;

    const text = currentSpanLines.join("\n").trim();
    if (text.length === 0) {
      currentSpanStart = -1;
      currentSpanKind = null;
      currentSpanLines = [];
      return;
    }

    spans.push({
      source_item_id: sourceItemId,
      source_ref: sourceRef,
      source_hash: sourceHash,
      span_id: `${sourceItemId}_span_${spans.length}`,
      line_start: currentSpanStart + 1,
      line_end: endLineIndex,
      byte_start: currentSpanByteStart,
      byte_end: Math.max(currentSpanByteEnd, currentSpanByteStart + 1),
      heading_path: [...headingPath],
      excerpt: text.length > 500 ? text.slice(0, 500) + "..." : text,
      excerpt_hash: computeHash(text),
      span_kind: currentSpanKind,
    });

    currentSpanStart = -1;
    currentSpanKind = null;
    currentSpanLines = [];
    currentSpanByteEnd = 0;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTextByteLength = Buffer.byteLength(line, "utf8");
    const lineByteLength = lineTextByteLength + (i < lines.length - 1 ? 1 : 0);

    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushSpan(i);
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      headingPath.length = level - 1;
      headingPath.push(title);

      const headingText = title;
      spans.push({
        source_item_id: sourceItemId,
        source_ref: sourceRef,
        source_hash: sourceHash,
        span_id: `${sourceItemId}_span_${spans.length}`,
        line_start: i + 1,
        line_end: i + 1,
        byte_start: byteOffset,
        byte_end: byteOffset + lineTextByteLength,
        heading_path: [...headingPath],
        excerpt: headingText,
        excerpt_hash: computeHash(headingText),
        span_kind: "heading",
      });

      byteOffset += lineByteLength;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushSpan(i);
      const bulletText = line.replace(/^\s*[-*]\s+/, "").trim();
      if (bulletText) {
        spans.push({
          source_item_id: sourceItemId,
          source_ref: sourceRef,
          source_hash: sourceHash,
          span_id: `${sourceItemId}_span_${spans.length}`,
          line_start: i + 1,
          line_end: i + 1,
          byte_start: byteOffset,
          byte_end: byteOffset + lineTextByteLength,
          heading_path: [...headingPath],
          excerpt: bulletText.length > 500 ? bulletText.slice(0, 500) + "..." : bulletText,
          excerpt_hash: computeHash(bulletText),
          span_kind: "bullet",
        });
      }
      byteOffset += lineByteLength;
      continue;
    }

    if (line.trim() === "") {
      flushSpan(i);
      byteOffset += lineByteLength;
      continue;
    }

    if (currentSpanStart < 0) {
      currentSpanStart = i;
      currentSpanByteStart = byteOffset;
      currentSpanByteEnd = byteOffset + lineTextByteLength;
      currentSpanKind = "paragraph";
      currentSpanLines = [line];
    } else {
      currentSpanLines.push(line);
      currentSpanByteEnd = byteOffset + lineTextByteLength;
    }

    byteOffset += lineByteLength;
  }

  flushSpan(lines.length);

  return spans;
}

function parseJsonSpans(
  content: string,
  sourceItemId: string,
  sourceRef: string,
  sourceHash: string,
): EvidenceSpan[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  const spans: EvidenceSpan[] = [];
  const addSpan = (value: unknown, label: string): void => {
    if (typeof value !== "string" || value.trim().length === 0) return;
    const text = value.trim();
    const byteStart = Math.max(0, Buffer.byteLength(content.slice(0, Math.max(0, content.indexOf(value))), "utf8"));
    spans.push({
      source_item_id: sourceItemId,
      source_ref: sourceRef,
      source_hash: sourceHash,
      span_id: `${sourceItemId}_json_${spans.length}`,
      line_start: 1,
      line_end: content.split("\n").length,
      byte_start: byteStart,
      byte_end: byteStart + Buffer.byteLength(value, "utf8"),
      heading_path: [label],
      excerpt: text.length > 500 ? text.slice(0, 500) + "..." : text,
      excerpt_hash: computeHash(text),
      span_kind: "json_message",
    });
  };

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    addSpan(record.redacted_summary, "redacted_summary");
    addSpan(record.summary, "summary");
    addSpan(record.problem, "problem");
    addSpan(record.action, "action");
    if (Array.isArray(record.items)) {
      for (const [index, item] of record.items.entries()) {
        if (!item || typeof item !== "object") continue;
        const itemRecord = item as Record<string, unknown>;
        addSpan(itemRecord.redacted_summary, `items.${index}.redacted_summary`);
        addSpan(itemRecord.summary, `items.${index}.summary`);
      }
    }
  }

  return spans;
}

async function parseSqliteSpans(
  fullPath: string,
  sourceItemId: string,
  sourceRef: string,
): Promise<{ sourceHash: string; spans: EvidenceSpan[] }> {
  const query = `
    SELECT id, path, source, start_line, end_line, hash, text, updated_at
    FROM chunks
    WHERE text IS NOT NULL AND length(text) > 0
    ORDER BY updated_at DESC
    LIMIT 200
  `;
  let rows: OpenClawSqliteChunkRow[] = [];
  try {
    const { stdout } = await execFileAsync("sqlite3", ["-json", fullPath, query], { maxBuffer: 16 * 1024 * 1024 });
    rows = JSON.parse(stdout || "[]") as OpenClawSqliteChunkRow[];
  } catch {
    return { sourceHash: computeHash(fullPath), spans: [] };
  }

  const sourceHash = computeHash(JSON.stringify(rows));
  const spans = rows.flatMap((row, index): EvidenceSpan[] => {
    if (typeof row.text !== "string" || row.text.trim().length === 0) return [];
    const text = row.text.trim();
    const rowPath = typeof row.path === "string" && row.path.trim() ? row.path.trim() : "sqlite-memory";
    const rowId = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `row-${index}`;
    const rowHash = typeof row.hash === "string" && row.hash.trim() ? `sha256:${row.hash.trim()}` : computeHash(text);
    const lineStart = typeof row.start_line === "number" && Number.isInteger(row.start_line) && row.start_line > 0
      ? row.start_line
      : 1;
    const lineEnd = typeof row.end_line === "number" && Number.isInteger(row.end_line) && row.end_line >= lineStart
      ? row.end_line
      : lineStart;
    return [{
      source_item_id: sourceItemId,
      source_ref: `${sourceRef}#${rowId}`,
      source_hash: rowHash,
      span_id: `${sourceItemId}_sqlite_${index}`,
      line_start: lineStart,
      line_end: lineEnd,
      byte_start: 0,
      byte_end: Buffer.byteLength(text, "utf8"),
      heading_path: [rowPath],
      excerpt: text.length > 500 ? text.slice(0, 500) + "..." : text,
      excerpt_hash: computeHash(text),
      span_kind: "sqlite_row",
    }];
  });

  return { sourceHash, spans };
}

export async function buildSourceInventory(
  root: string,
  options: BuildSourceInventoryOptions,
): Promise<SourceInventoryItem[]> {
  const items: SourceInventoryItem[] = [];

  async function scanFile(fullPath: string, fileName = basename(fullPath)): Promise<void> {
    const ext = extname(fileName).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext) && ext !== ".sqlite") return;

    let fileStat;
    try {
      fileStat = await stat(fullPath);
    } catch {
      return;
    }
    if (!fileStat.isFile()) return;

    const relPath = relative(root, fullPath);
    const sourceKind = classifySourceKind(fileName);
    const authorityHint = classifyAuthorityHint(sourceKind);
    const sourceItemId = `src_${options.agent}_${slugifyId(relPath)}`;
    const sourceRef = `source-inventory://${options.agent}/${relPath}`;

    let sourceHash = "";
    let contentSpans: EvidenceSpan[] = [];
    if (ext === ".sqlite") {
      const sqlite = await parseSqliteSpans(fullPath, sourceItemId, sourceRef);
      sourceHash = sqlite.sourceHash;
      contentSpans = sqlite.spans;
    } else {
      let content: string;
      try {
        content = await readFile(fullPath, "utf8");
      } catch {
        content = "";
      }

      sourceHash = computeHash(content);
      const spans = parseMarkdownSpans(
        content,
        sourceItemId,
        sourceRef,
        sourceHash,
      );
      const jsonSpans = ext === ".json"
        ? parseJsonSpans(content, sourceItemId, sourceRef, sourceHash)
        : [];
      contentSpans = [...jsonSpans, ...spans];
    }

    items.push(
      SourceInventoryItemSchema.parse({
        source_item_id: sourceItemId,
        source_ref: sourceRef,
        source_hash: sourceHash,
        agent: options.agent,
        source_kind: sourceKind,
        authority_hint: authorityHint,
        scope_hint: options.scope,
        origin: options.origin,
        mtime: fileStat.mtime.toISOString(),
        size_bytes: fileStat.size,
        parser_identity: "m25-source-inventory-v1",
        content_spans: contentSpans,
        privacy_precheck: "allow_for_ai",
      }),
    );
  }

  async function scanDir(dirPath: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      await scanFile(fullPath, entry.name);
    }
  }

  try {
    const rootStat = await stat(options.path);
    if (rootStat.isFile()) {
      await scanFile(options.path);
    } else {
      await scanDir(options.path);
    }
  } catch {
    await scanDir(options.path);
  }
  return items;
}
