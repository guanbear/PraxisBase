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
import { extractCodexExperienceText, isUsefulCodexExperience } from "./codex-signal.js";
import { resolveAgentMemorySource } from "./agentmemory-adapter.js";
import { GBrainClient, type GBrainQueryHit, type GBrainCommandRunner } from "./gbrain-client.js";
import { resolveFeishuSource } from "./feishu-adapter.js";

const execFileAsync = promisify(execFile);

const SUPPORTED_EXTENSIONS = new Set([".json", ".jsonl", ".md", ".txt", ".log", ".sqlite"]);
const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_BYTES = 512 * 1024;
const MAX_SUMMARY_LENGTH = 1200;
const MAX_TRAJECTORY_ITEMS = 32;
const MAX_STRUCTURED_STRING_LENGTH = 500;

function extractCodingAgentExperienceText(item: RawExperienceItem, rawText: string): string {
  const text = item.text ?? item.raw_log ?? rawText;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const patterns = [
    /\b(?:goal|task|objective|implement|fix|refactor|add|create|remove)\b/i,
    /\b(?:pnpm|npm|yarn|cargo|go|git)\s+/i,
    /\b(?:edited|modified|changed|created|deleted)\s+(?:file|files)\b/i,
    /\b(?:error|fail|failure|exception|traceback)\b/i,
    /\b(?:tests?\s+(?:passed|failed)|✓|✗|PASS|FAIL)\b/i,
    /\b(?:success|succeed|done|complete|resolved|fixed)\b/i,
    /\b(?:lesson|learned|takeaway|insight)\b/i,
  ];
  const selected = lines.filter((line) => patterns.some((p) => p.test(line)));
  return selected.length > 0 ? selected.join("\n") : lines.slice(0, 20).join("\n");
}

export interface ResolveExperienceSourceOptions {
  authorityMode: EvaluateExperiencePrivacyInput["mode"];
  limit?: number;
  maxBytes?: number;
  now?: string;
  fetchImpl?: typeof fetch;
  runCommand?: GitCommandRunner;
  gbrainRunCommand?: GBrainCommandRunner;
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
  skippedByFilter: number;
  skippedByLimit: number;
  envelopes: ExperienceEnvelope[];
  warnings: string[];
}

export interface TrustedOpenClawRawStage {
  sourcePath?: string;
  files: number;
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

function isOpenClawDreamingRef(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes("memory/dreaming/") ||
    lower.includes("memory/.dreams/") ||
    lower.includes("/.dreams/") ||
    lower.includes("dream-diary");
}

function isOpenClawCandidateCorpusText(value: string): boolean {
  const lower = value.toLowerCase();
  if (!lower.includes("candidate:")) return false;
  const signals = [
    lower.includes("confidence: 0.00"),
    lower.includes("confidence: 0.58"),
    lower.includes("memory/.dreams/session-corpus"),
    lower.includes("conversation info (untrusted metadata)"),
    lower.includes("status: staged"),
  ].filter(Boolean).length;
  return signals >= 2;
}

function isOpenClawDreamingNoiseItem(item: RawExperienceItem, rawText: string): boolean {
  const refs = [
    item.source_ref,
    item.id,
    item.remote_id,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  if (refs.some(isOpenClawDreamingRef)) return true;
  const itemTextFields = [
    item.summary,
    item.redacted_summary,
    item.raw_log,
    item.text,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  const textForNoiseCheck = itemTextFields.length > 0 ? itemTextFields.join("\n") : rawText;
  return isOpenClawCandidateCorpusText(textForNoiseCheck);
}

function expandSourcePath(path: string, root?: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  if (root && !isAbsolute(path)) return join(root, path);
  return path;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function trustedOpenClawRoot(source: ExperienceSourceConfig): string {
  const sourcePath = source.path ?? "";
  const match = sourcePath.match(/^(.*\/\.openclaw)(?:\/|$)/);
  if (match?.[1]) return match[1];
  return "~/.openclaw";
}

function stagedFileName(index: number, remotePath: string): string {
  const base = basename(remotePath).replace(/[^a-zA-Z0-9._-]/g, "_") || `remote-${index}`;
  const hash = computeHash(remotePath).replace(/^sha256:/, "").slice(0, 12);
  return `${String(index).padStart(3, "0")}-${hash}-${base}`;
}

function buildTrustedOpenClawFetchScript(source: ExperienceSourceConfig): string {
  const remoteRoot = trustedOpenClawRoot(source);
  const primaryPath = source.path ?? `${remoteRoot}/praxisbase/latest.json`;
  const maxBytes = 1024 * 1024;
  const quotedRoot = shellQuote(remoteRoot);
  const quotedPrimary = shellQuote(primaryPath);
  return `
set +e
OPENCLAW_ROOT=${quotedRoot}
PRIMARY_PATH=${quotedPrimary}
MAX_BYTES=${maxBytes}
b64_text() { printf '%s' "$1" | base64 | tr -d '\\n'; }
b64_file() { base64 "$1" 2>/dev/null | tr -d '\\n'; }
emit_content() {
  p="$1"
  content="$2"
  if [ -n "$content" ]; then
    printf '__PB_FILE__\\t%s\\t%s\\n' "$(b64_text "$p")" "$(b64_text "$content")"
  fi
}
emit_file() {
  p="$1"
  [ -f "$p" ] || return 0
  size=$(wc -c < "$p" 2>/dev/null | tr -d ' ')
  case "$size" in ''|*[!0-9]*) return 0 ;; esac
  [ "$size" -le "$MAX_BYTES" ] || return 0
  encoded=$(b64_file "$p")
  [ -n "$encoded" ] || return 0
  printf '__PB_FILE__\\t%s\\t%s\\n' "$(b64_text "$p")" "$encoded"
}
emit_file "$PRIMARY_PATH"
emit_file "$OPENCLAW_ROOT/MEMORY.md"
emit_file "$OPENCLAW_ROOT/TOOLS.md"
emit_file "$OPENCLAW_ROOT/workspace/MEMORY.md"
emit_file "$OPENCLAW_ROOT/workspace/TOOLS.md"
emit_file "$OPENCLAW_ROOT/.openclaw/workspace/MEMORY.md"
emit_file "$OPENCLAW_ROOT/.openclaw/workspace/TOOLS.md"
emit_file "$OPENCLAW_ROOT/memory/MEMORY.md"
emit_file "$OPENCLAW_ROOT/memory/TOOLS.md"
if command -v sqlite3 >/dev/null 2>&1 && [ -f "$OPENCLAW_ROOT/memory/main.sqlite" ]; then
  rows=$(sqlite3 -json "$OPENCLAW_ROOT/memory/main.sqlite" "SELECT id, path, source, start_line, end_line, hash, text, updated_at FROM chunks WHERE text IS NOT NULL AND length(trim(text)) > 0 AND lower(COALESCE(path, '')) NOT LIKE 'memory/dreaming/%' AND lower(COALESCE(path, '')) NOT LIKE '%/.dreams/%' AND lower(COALESCE(path, '')) NOT LIKE '%dream-diary%' ORDER BY CASE WHEN lower(COALESCE(path, '')) = 'memory.md' OR lower(COALESCE(path, '')) LIKE '%/memory.md' THEN 0 WHEN lower(COALESCE(path, '')) GLOB 'memory/[0-9]*' THEN 1 ELSE 2 END, updated_at DESC LIMIT 200;" 2>/dev/null)
  emit_content "$OPENCLAW_ROOT/memory/main.sqlite.query.json" "$rows"
elif command -v python3 >/dev/null 2>&1 && [ -f "$OPENCLAW_ROOT/memory/main.sqlite" ]; then
  rows=$(python3 - "$OPENCLAW_ROOT/memory/main.sqlite" <<'PY' 2>/dev/null
import json
import sqlite3
import sys

db = sys.argv[1]
query = """
SELECT id, path, source, start_line, end_line, hash, text, updated_at
FROM chunks
WHERE text IS NOT NULL AND length(trim(text)) > 0
  AND lower(COALESCE(path, '')) NOT LIKE 'memory/dreaming/%'
  AND lower(COALESCE(path, '')) NOT LIKE '%/.dreams/%'
  AND lower(COALESCE(path, '')) NOT LIKE '%dream-diary%'
ORDER BY
  CASE
    WHEN lower(COALESCE(path, '')) = 'memory.md' OR lower(COALESCE(path, '')) LIKE '%/memory.md' THEN 0
    WHEN lower(COALESCE(path, '')) GLOB 'memory/[0-9]*' THEN 1
    ELSE 2
  END,
  updated_at DESC
LIMIT 200
"""
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row
rows = [dict(row) for row in conn.execute(query)]
print(json.dumps(rows, ensure_ascii=False))
PY
)
  emit_content "$OPENCLAW_ROOT/memory/main.sqlite.query.json" "$rows"
fi
if [ -d "$OPENCLAW_ROOT/reports" ]; then
  find "$OPENCLAW_ROOT/reports" -type f \\( -name '*.md' -o -name '*.txt' -o -name '*.json' -o -name '*.jsonl' -o -name '*.log' \\) 2>/dev/null | sort | tail -20 | while IFS= read -r report_file; do
    emit_file "$report_file"
  done
fi
`.trim();
}

export async function stageTrustedOpenClawRemoteRaw(
  root: string,
  source: ExperienceSourceConfig,
  options: Pick<ResolveExperienceSourceOptions, "runCommand" | "now">,
): Promise<TrustedOpenClawRawStage> {
  if (source.agent !== "openclaw" || source.source_type !== "ssh" || source.privacy_trust !== "trusted_personal_remote") {
    return { files: 0, warnings: [] };
  }
  if (!source.host) return { files: 0, warnings: ["trusted_openclaw_raw_stage_requires_host"] };
  if (!options.runCommand) return { files: 0, warnings: ["trusted_openclaw_raw_stage_requires_runCommand"] };

  const warnings: string[] = [];
  const stageId = computeHash(JSON.stringify({
    source_id: source.id,
    host: source.host,
    path: source.path,
    now: options.now ?? "",
  })).replace(/^sha256:/, "").slice(0, 16);
  const stageDir = `${protocolPaths.stagingTrustedRemoteOpenClaw}/${source.id}/${stageId}`;

  let output = "";
  try {
    output = await options.runCommand("ssh", [
      source.host,
      `sh -lc ${shellQuote(buildTrustedOpenClawFetchScript(source))}`,
    ]);
  } catch (error) {
    return {
      files: 0,
      warnings: [`trusted_openclaw_raw_stage_failed:${error instanceof Error ? error.message : String(error)}`],
    };
  }

  let files = 0;
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith("__PB_FILE__\t")) continue;
    const [, pathB64, contentB64] = line.split("\t");
    if (!pathB64 || !contentB64) continue;
    let remotePath = "";
    let content = "";
    try {
      remotePath = Buffer.from(pathB64, "base64").toString("utf8");
      content = Buffer.from(contentB64, "base64").toString("utf8");
    } catch {
      warnings.push("trusted_openclaw_raw_stage_decode_failed");
      continue;
    }
    if (!content.trim()) continue;
    files++;
    await writeText(root, `${stageDir}/${stagedFileName(files, remotePath)}`, content);
  }

  if (files === 0) warnings.push("trusted_openclaw_raw_stage_empty");
  return {
    sourcePath: files > 0 ? stageDir : undefined,
    files,
    warnings,
  };
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
  if (source.agent === "codex") {
    return summarizeText(extractCodexExperienceText(item, rawText), "codex experience");
  }
  if (source.agent === "claude-code" || source.agent === "opencode") {
    return summarizeText(extractCodingAgentExperienceText(item, rawText), `${source.agent} experience`);
  }
  return summarizeText(item.text ?? item.raw_log ?? rawText, `${source.agent} experience`);
}

function outcomeForItem(item: RawExperienceItem): ExperienceOutcome | undefined {
  if (item.outcome === "success" || item.outcome === "failed" || item.outcome === "partial" || item.outcome === "unknown") {
    return item.outcome;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_STRUCTURED_STRING_LENGTH
    ? `${trimmed.slice(0, MAX_STRUCTURED_STRING_LENGTH)}...[truncated]`
    : trimmed;
}

function arrayFromAliases(item: RawExperienceItem, aliases: string[]): unknown[] {
  for (const alias of aliases) {
    const value = item[alias];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function stringArrayFromAliases(item: RawExperienceItem, aliases: string[]): string[] | undefined {
  const values = arrayFromAliases(item, aliases)
    .map(trimmedString)
    .filter((value): value is string => Boolean(value))
    .slice(0, MAX_TRAJECTORY_ITEMS);
  return values.length > 0 ? Array.from(new Set(values)) : undefined;
}

function trajectoryStepsForItem(item: RawExperienceItem): Array<{ goal?: string; action?: string; tool?: string; outcome?: string }> | undefined {
  const values = arrayFromAliases(item, ["trajectory_steps", "trajectory", "steps", "stages"]);
  const steps = values
    .filter(isRecord)
    .map((entry) => ({
      goal: trimmedString(entry.goal ?? entry.stage ?? entry.phase ?? entry.objective),
      action: trimmedString(entry.action ?? entry.summary ?? entry.description),
      tool: trimmedString(entry.tool ?? entry.command),
      outcome: trimmedString(entry.outcome ?? entry.result ?? entry.status),
    }))
    .filter((entry) => entry.goal || entry.action || entry.tool || entry.outcome)
    .slice(0, MAX_TRAJECTORY_ITEMS);
  return steps.length > 0 ? steps : undefined;
}

function resultCategory(value: unknown): "success" | "failure" | "partial" | "unknown" {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (/^(success|succeeded|pass|passed|ok|completed)$/.test(normalized)) return "success";
  if (/^(failure|failed|fail|error|errored)$/.test(normalized)) return "failure";
  if (/^(partial|warning|warn|degraded)$/.test(normalized)) return "partial";
  return "unknown";
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function toolOutcomesForItem(item: RawExperienceItem): Array<{ tool: string; result_category: "success" | "failure" | "partial" | "unknown"; failure_snippet?: string; verification_marker?: boolean }> | undefined {
  const values = arrayFromAliases(item, ["tool_outcomes", "tool_results", "tools"]);
  const outcomes = values
    .filter(isRecord)
    .map((entry) => {
      const tool = trimmedString(entry.tool ?? entry.name ?? entry.command);
      if (!tool) return undefined;
      const failureSnippet = trimmedString(entry.failure_snippet ?? entry.error ?? entry.stderr);
      const verificationMarker = booleanValue(entry.verification_marker ?? entry.verification);
      return {
        tool,
        result_category: resultCategory(entry.result_category ?? entry.result ?? entry.status ?? entry.outcome),
        ...(failureSnippet ? { failure_snippet: failureSnippet } : {}),
        ...(verificationMarker !== undefined ? { verification_marker: verificationMarker } : {}),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, MAX_TRAJECTORY_ITEMS);
  return outcomes.length > 0 ? outcomes : undefined;
}

function skillEffectivenessHintsForItem(item: RawExperienceItem): Array<"helped" | "hurt" | "missing" | "stale" | "ignored"> | undefined {
  const allowed = new Set(["helped", "hurt", "missing", "stale", "ignored"]);
  const values = arrayFromAliases(item, ["skill_effectiveness_hints", "skill_hints"])
    .map((value) => typeof value === "string" ? value.trim().toLowerCase() : "")
    .filter((value): value is "helped" | "hurt" | "missing" | "stale" | "ignored" => allowed.has(value))
    .slice(0, MAX_TRAJECTORY_ITEMS);
  return values.length > 0 ? Array.from(new Set(values)) : undefined;
}

function structuredTrajectoryFields(item: RawExperienceItem): Record<string, unknown> {
  return {
    trajectory_steps: trajectoryStepsForItem(item),
    tool_outcomes: toolOutcomesForItem(item),
    read_skills: stringArrayFromAliases(item, ["read_skills", "skills_read", "used_skills"]),
    modified_skills: stringArrayFromAliases(item, ["modified_skills", "skills_modified"]),
    injected_context: stringArrayFromAliases(item, ["injected_context", "context_injected"]),
    verification_events: stringArrayFromAliases(item, ["verification_events", "verification", "verifications"]),
    skill_effectiveness_hints: skillEffectivenessHintsForItem(item),
  };
}

function sourceRefForItem(source: ExperienceSourceConfig, item: RawExperienceItem, index: number, filePath?: string): string {
  if (item.source_ref) return item.source_ref;
  const itemId = item.remote_id ?? item.id ?? (filePath ? basename(filePath, extname(filePath)) : `item-${index}`);
  if (source.agent === "codex") return `raw-vault://codex/${itemId}`;
  if (source.agent === "claude-code") return `logs://${source.name}/${itemId}`;
  if (source.agent === "opencode") return `raw-vault://opencode/${itemId}`;
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

function shouldUseItem(source: ExperienceSourceConfig, item: RawExperienceItem, rawText: string): boolean {
  if (source.agent === "openclaw" && isOpenClawDreamingNoiseItem(item, rawText)) return false;
  if (source.agent !== "codex") return true;
  return isUsefulCodexExperience(item, rawText);
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
  const privacyReasons = [...privacy.reasons];
  let privacyVerdict = privacy.verdict;
  if (
    options.authorityMode === "team-git" &&
    source.channel === "feishu" &&
    source.source_type !== "feishu"
  ) {
    privacyVerdict = privacyVerdict === "reject" ? "reject" : "human_required";
    if (!privacyReasons.includes("feishu_channel_team_review_first")) privacyReasons.push("feishu_channel_team_review_first");
  }
  if (
    options.authorityMode === "team-git" &&
    source.source_type === "feishu" &&
    source.parser === "feishu-chat"
  ) {
    privacyVerdict = privacyVerdict === "reject" ? "reject" : "human_required";
    if (!privacyReasons.includes("feishu_group_chat_requires_review")) privacyReasons.push("feishu_group_chat_requires_review");
  }
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
    ...structuredTrajectoryFields(item),
    created_at: typeof item.created_at === "string" ? item.created_at : undefined,
    fetched_at: fetchedAt,
    privacy: {
      mode: options.authorityMode,
      verdict: privacyVerdict,
      reasons: privacyReasons,
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
    return parsed.map((item) => ({ item, rawText: JSON.stringify(item), filePath: path }));
  }
  return [{ item: { text: rawText }, rawText, filePath: path }];
}

async function itemsFromOpenClawSqlite(path: string, warnings: string[]): Promise<Array<{ item: RawExperienceItem; rawText: string; filePath: string }>> {
  const query = [
    "SELECT id, path, source, start_line, end_line, hash, text, updated_at",
    "FROM chunks",
    "WHERE text IS NOT NULL AND length(trim(text)) > 0",
    "AND lower(COALESCE(path, '')) NOT LIKE 'memory/dreaming/%'",
    "AND lower(COALESCE(path, '')) NOT LIKE '%/.dreams/%'",
    "AND lower(COALESCE(path, '')) NOT LIKE '%dream-diary%'",
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

function rawItemFromGBrainHit(hit: GBrainQueryHit): RawExperienceItem {
  return {
    id: hit.slug,
    source_ref: `gbrain://${hit.source ?? "praxisbase"}/${hit.slug}`,
    summary: hit.chunk_text,
    text: hit.chunk_text,
    signature: hit.title ?? hit.slug,
    problem_signature: hit.title ?? hit.slug,
  };
}

async function fetchGBrainItems(
  source: ExperienceSourceConfig,
  options: ResolveExperienceSourceOptions,
): Promise<{ items: Array<{ item: RawExperienceItem; rawText: string }>; warnings: string[] }> {
  const query = source.remote ?? source.path;
  if (!query) {
    return { items: [], warnings: ["gbrain source requires remote query or path query"] };
  }
  const client = new GBrainClient({
    runCommand: options.gbrainRunCommand,
    preferJson: true,
  });
  const result = await client.query(query, {
    limit: options.limit ?? DEFAULT_LIMIT,
    sourceId: source.name,
  });
  if (!result.ok) {
    return { items: [], warnings: [`gbrain_fetch_failed: ${result.error ?? "query failed"}`] };
  }
  return {
    items: result.hits.map((hit) => {
      const item = rawItemFromGBrainHit(hit);
      return { item, rawText: JSON.stringify(hit) };
    }),
    warnings: [],
  };
}

async function resolveSourceItems(
  root: string,
  source: ExperienceSourceConfig,
  options: ResolveExperienceSourceOptions,
): Promise<{ items: Array<{ item: RawExperienceItem; rawText: string; filePath?: string }>; warnings: string[]; preRejected?: number }> {
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
  if (source.source_type === "agentmemory") {
    return { items: [], warnings: ["agentmemory source is resolved by the dedicated adapter"] };
  }
  if (source.source_type === "gbrain") {
    return fetchGBrainItems(source, options);
  }
  if (source.source_type === "feishu") {
    const resolved = await resolveFeishuSource(source, options);
    return { items: resolved.items, warnings: resolved.warnings, preRejected: resolved.rejected };
  }
  return { items: [], warnings: [`unsupported_source_type: ${source.source_type satisfies never}`] };
}

export async function resolveExperienceSource(
  root: string,
  source: ExperienceSourceConfig,
  options: ResolveExperienceSourceOptions,
): Promise<ResolvedExperienceSource> {
  if (source.source_type === "agentmemory") {
    return resolveAgentMemorySource(root, source, options);
  }

  const limit = options.limit ?? DEFAULT_LIMIT;
  const warnings: string[] = [];
  if (source.source_type === "gbrain") {
    warnings.push("gbrain_source_imported_as_evidence: sidecar pages only become PB evidence after explicit source configuration.");
  }
  let resolvedItems: Array<{ item: RawExperienceItem; rawText: string; filePath?: string }> = [];
  let preRejected = 0;

  try {
    const resolved = await resolveSourceItems(root, source, options);
    resolvedItems = resolved.items;
    preRejected = resolved.preRejected ?? 0;
    warnings.push(...resolved.warnings);
  } catch (error) {
    warnings.push(`source_failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const usableItems = resolvedItems
    .filter((entry) => shouldUseItem(source, entry.item, entry.rawText));
  const rawItems = usableItems.slice(0, limit);
  const envelopes = rawItems.map((entry, index) =>
    makeEnvelope(source, entry.item, entry.rawText, index, options, entry.filePath)
  );
  const rejected = preRejected + envelopes.filter((envelope) => envelope.privacy.verdict === "reject").length;
  const humanRequired = envelopes.filter((envelope) => envelope.privacy.verdict === "human_required").length;
  const skippedByFilter = Math.max(0, resolvedItems.length - usableItems.length);
  const skippedByLimit = Math.max(0, usableItems.length - envelopes.length);
  const skipped = skippedByFilter + skippedByLimit;
  const status = warnings.length > 0 || rejected > 0 || humanRequired > 0
    ? (envelopes.length > 0 ? "partial" : "failed")
    : "completed";

  return {
    source,
    status,
    scanned: resolvedItems.length,
    fetched: rawItems.length,
    enveloped: envelopes.length,
    rejected,
    humanRequired,
    skipped,
    skippedByFilter,
    skippedByLimit,
    envelopes,
    warnings,
  };
}

export async function writeExperienceEnvelope(root: string, envelope: ExperienceEnvelope): Promise<string> {
  const path = `${protocolPaths.stagingExperienceEnvelopes}/${envelope.id}.json`;
  await writeText(root, path, `${JSON.stringify(envelope, null, 2)}\n`);
  return path;
}
