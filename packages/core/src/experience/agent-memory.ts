import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { computeHash, makeId } from "../protocol/id.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { protocolPaths } from "../protocol/paths.js";
import {
  AgentMemoryCandidateSchema,
  AgentMemoryIngestReportSchema,
  ExperienceEnvelopeSchema,
  OpenClawRemoteMemoryEnvelopeSchema,
  ExceptionRecordSchema,
  RealWikiSmokeReportSchema,
  type AgentMemoryCandidate,
  type AgentMemoryIngestReport,
  type RealWikiSmokeReport,
} from "../protocol/schemas.js";
import { writeJson, readJson } from "../store/file-store.js";
import { detectOpenClawProblemSignature } from "../repair/signature.js";
import { containsPrivateMaterial } from "../wiki/lint.js";
import { compileWiki } from "../wiki/compile.js";
import { buildWikiGraph } from "../wiki/resolver.js";
import { buildWikiSite, collectWikiPages } from "../wiki/render-site.js";
import { buildContext } from "./context.js";
import { extractCodexExperienceText, isUsefulCodexExperience } from "./codex-signal.js";

const SUPPORTED_EXTENSIONS = new Set([".json", ".jsonl", ".md", ".txt", ".log"]);
const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_BYTES = 512 * 1024;
const MAX_SUMMARY_LENGTH = 1200;
type AgentMemoryAgent = "codex" | "openclaw" | "claude-code";

export interface ScanAgentMemoryInput {
  agent: AgentMemoryAgent;
  sources?: string[];
  limit?: number;
  maxBytes?: number;
  now?: string;
}

export interface ScanAgentMemoryResult {
  candidates: AgentMemoryCandidate[];
  skipped: number;
  warnings: string[];
}

async function listFilesRecursively(dir: string, maxBytes: number): Promise<{ path: string; size: number; warnings: string[] }[]> {
  const results: { path: string; size: number; warnings: string[] }[] = [];
  const warnings: string[] = [];

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
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
          continue;
        }
        let s;
        try {
          s = await stat(full);
        } catch {
          warnings.push(`stat_failed: ${full}`);
          continue;
        }
        if (s.size > maxBytes) {
          warnings.push(`oversize: ${full} (${s.size} bytes)`);
          continue;
        }
        results.push({ path: full, size: s.size, warnings: [] });
      }
    }
  }

  await walk(dir);
  return results;
}

function extractSummaryHint(text: string, agent: AgentMemoryAgent): string {
  if (agent === "openclaw") {
    return detectOpenClawProblemSignature(text);
  }

  const signalText = agent === "codex" ? extractCodexExperienceText(parseJsonForSignal(text) ?? text, text) : text;
  const meaningfulPatterns = [
    /\b(?:implement(?:ed|ing)?|change(?:d|s|ing)?|fix(?:ed|ing)?|add(?:ed|ing)?|update(?:d|s|ing)?|remove(?:d|ing)?|create(?:d|s|ing)?|refactor(?:ed|ing)?)\b/i,
    /\b(?:pnpm|npm|yarn)\s+(?:check|test|build|install|run)\b/i,
    /\btests?\s+(?:passed|failed)\b/i,
    /(?:实现|修复|调整|更新|新增|删除|重构|排查|定位|验证|测试|通过|失败|提交|生成|构建|部署)/,
  ];

  const lines = signalText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const meaningful = lines.filter((line) =>
    meaningfulPatterns.some((pattern) => pattern.test(line))
  );

  if (meaningful.length > 0) {
    const joined = meaningful.slice(0, 5).join(" ");
    return joined.length > MAX_SUMMARY_LENGTH
      ? joined.slice(0, MAX_SUMMARY_LENGTH) + "...[truncated]"
      : joined;
  }
  return agent === "claude-code" ? "claude-code repair log" : "codex session";
}

function parseJsonForSignal(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
  }

  const items: unknown[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    try {
      items.push(JSON.parse(l));
    } catch {
      return undefined;
    }
  }
  return items.length > 0 ? items : undefined;
}

function makeSourceRef(agent: AgentMemoryAgent, filePath: string): string {
  const base = basename(filePath, extname(filePath));
  if (agent === "codex") {
    return `raw-vault://codex/${base}`;
  }
  if (agent === "claude-code") {
    return `logs://claude-code/${base}`;
  }
  return `log://openclaw/${basename(filePath)}`;
}

function makeKind(agent: AgentMemoryAgent, filePath: string): "codex_session" | "openclaw_log" | "openclaw_episode" | "claude_code_repair_log" {
  if (agent === "codex") {
    return "codex_session";
  }
  if (agent === "claude-code") {
    return "claude_code_repair_log";
  }
  const ext = extname(filePath).toLowerCase();
  if (ext === ".json" || ext === ".jsonl") {
    return "openclaw_episode";
  }
  return "openclaw_log";
}

function expandSourcePath(sourcePath: string): string {
  if (sourcePath === "~") {
    return homedir();
  }
  if (sourcePath.startsWith("~/")) {
    return join(homedir(), sourcePath.slice(2));
  }
  return sourcePath;
}

function parseStagedOpenClawEnvelope(content: string): {
  source_ref: string;
  source_hash: string;
  redacted_summary: string;
  warnings: string[];
} | undefined {
  try {
    const parsed = OpenClawRemoteMemoryEnvelopeSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return undefined;
    }
    return {
      source_ref: parsed.data.source_ref,
      source_hash: parsed.data.source_hash,
      redacted_summary: parsed.data.redacted_summary,
      warnings: parsed.data.warnings,
    };
  } catch {
    return undefined;
  }
}

function parseExperienceEnvelope(content: string): {
  agent: AgentMemoryAgent;
  kind: "codex_session" | "openclaw_episode" | "claude_code_repair_log";
  source_ref: string;
  source_hash: string;
  redacted_summary: string;
  scope_hint: "personal" | "project" | "team" | "org";
  privacy_verdict: "allow" | "reject" | "human_required";
  warnings: string[];
} | undefined {
  try {
    const parsed = ExperienceEnvelopeSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return undefined;
    }
    const kind = parsed.data.agent === "codex"
      ? "codex_session"
      : parsed.data.agent === "claude-code"
        ? "claude_code_repair_log"
        : "openclaw_episode";
    return {
      agent: parsed.data.agent,
      kind,
      source_ref: parsed.data.source_ref,
      source_hash: parsed.data.source_hash,
      redacted_summary: parsed.data.redacted_summary,
      scope_hint: parsed.data.scope_hint,
      privacy_verdict: parsed.data.privacy.verdict,
      warnings: parsed.data.warnings,
    };
  } catch {
    return undefined;
  }
}

function makeCandidateFromSource(
  input: ScanAgentMemoryInput,
  filePath: string,
  sizeBytes: number,
  content: string,
  now: string
): AgentMemoryCandidate | undefined {
  const experienceEnvelope = parseExperienceEnvelope(content);
  if (experienceEnvelope && experienceEnvelope.agent !== input.agent) {
    return undefined;
  }
  if (!experienceEnvelope && input.agent === "codex" && !isUsefulCodexExperience(parseJsonForSignal(content) ?? content, content)) {
    return undefined;
  }
  const stagedEnvelope = !experienceEnvelope && input.agent === "openclaw"
    ? parseStagedOpenClawEnvelope(content)
    : undefined;
  const sourceHash = experienceEnvelope?.source_hash ?? stagedEnvelope?.source_hash ?? computeHash(content);
  const sourceRef = experienceEnvelope?.source_ref ?? stagedEnvelope?.source_ref ?? makeSourceRef(input.agent, filePath);
  const kind = experienceEnvelope?.kind ?? (input.agent === "openclaw" && stagedEnvelope
    ? "openclaw_episode"
    : makeKind(input.agent, filePath));
  const summaryHint = experienceEnvelope?.redacted_summary ?? stagedEnvelope?.redacted_summary ?? extractSummaryHint(content, input.agent);

  return AgentMemoryCandidateSchema.parse({
    id: makeId("agent-memory-candidate", `${input.agent}_${kind}_${sourceHash.slice(0, 16)}`),
    agent: input.agent,
    kind,
    source_path: filePath,
    source_ref: sourceRef,
    source_hash: sourceHash,
    size_bytes: sizeBytes,
    created_at: now,
    summary_hint: summaryHint,
    warnings: experienceEnvelope?.warnings ?? stagedEnvelope?.warnings ?? [],
  });
}

export async function scanAgentMemory(
  root: string,
  input: ScanAgentMemoryInput
): Promise<ScanAgentMemoryResult> {
  const limit = input.limit ?? DEFAULT_LIMIT;
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const now = input.now ?? new Date().toISOString();
  const warnings: string[] = [];
  const candidates: AgentMemoryCandidate[] = [];

  const sources = input.sources ?? [];
  if (sources.length === 0) {
    return { candidates: [], skipped: 0, warnings: ["no_sources_provided"] };
  }

  let totalSkipped = 0;
  for (const rawSourcePath of sources) {
    const sourcePath = expandSourcePath(rawSourcePath);
    let s;
    try {
      s = await stat(sourcePath);
    } catch {
      warnings.push(`source_not_found: ${sourcePath}`);
      continue;
    }

    if (s.isDirectory()) {
      const files = await listFilesRecursively(sourcePath, maxBytes);
      for (const file of files) {
        if (candidates.length >= limit) break;
        warnings.push(...file.warnings);
        totalSkipped += file.warnings.length;

        let content: string;
        try {
          content = await readFile(file.path, "utf8");
        } catch {
          warnings.push(`read_failed: ${file.path}`);
          totalSkipped++;
          continue;
        }

        const candidate = makeCandidateFromSource(input, file.path, file.size, content, now);
        if (candidate) {
          candidates.push(candidate);
        } else {
          totalSkipped++;
        }
      }
    } else if (s.isFile()) {
      const ext = extname(sourcePath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        warnings.push(`unsupported_format: ${sourcePath}`);
        totalSkipped++;
        continue;
      }
      if (s.size > maxBytes) {
        warnings.push(`oversize: ${sourcePath}`);
        totalSkipped++;
        continue;
      }

      let content: string;
      try {
        content = await readFile(sourcePath, "utf8");
      } catch {
        warnings.push(`read_failed: ${sourcePath}`);
        totalSkipped++;
        continue;
      }

      const candidate = makeCandidateFromSource(input, sourcePath, s.size, content, now);
      if (candidate) {
        candidates.push(candidate);
      } else {
        totalSkipped++;
      }
    }
  }

  candidates.sort((a, b) => a.source_ref.localeCompare(b.source_ref));

  return {
    candidates: candidates.slice(0, limit),
    skipped: totalSkipped,
    warnings,
  };
}

export interface IngestAgentMemoryInput extends ScanAgentMemoryInput {
  mode?: "dry-run" | "write";
  scope?: "personal" | "project" | "team";
}

export interface RunRealWikiSmokeInput extends IngestAgentMemoryInput {
  query?: string;
}

async function loadExistingHashes(root: string, dirs: string[]): Promise<Set<string>> {
  const hashes = new Set<string>();
  for (const dir of dirs) {
    try {
      const files = await readdir(join(root, dir));
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const data = await readJson<{ source_hash?: string; artifacts?: Array<{ source_hash?: string }> }>(root, `${dir}/${file}`);
          if (data.source_hash) {
            hashes.add(data.source_hash);
          }
          for (const artifact of data.artifacts ?? []) {
            if (artifact.source_hash) {
              hashes.add(artifact.source_hash);
            }
          }
        } catch {
        }
      }
    } catch {
    }
  }
  return hashes;
}

function generateRedactedSummary(text: string, hint?: string): string {
  if (hint && hint.length > 0) {
    return hint.length > MAX_SUMMARY_LENGTH
      ? hint.slice(0, MAX_SUMMARY_LENGTH) + "...[truncated]"
      : hint;
  }

  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const joined = lines.slice(0, 5).join(" ");
  if (joined.length > MAX_SUMMARY_LENGTH) {
    return joined.slice(0, MAX_SUMMARY_LENGTH) + "...[truncated]";
  }
  return joined || "agent memory";
}

export async function ingestAgentMemory(
  root: string,
  input: IngestAgentMemoryInput
): Promise<AgentMemoryIngestReport> {
  const mode = input.mode ?? "dry-run";
  const now = input.now ?? new Date().toISOString();
  const scope = input.scope ?? (input.agent === "openclaw" ? "project" : "personal");

  const scanResult = await scanAgentMemory(root, input);

  const existingHashes = await loadExistingHashes(root, [
    protocolPaths.rawVaultRefs,
    protocolPaths.outboxCaptures,
    protocolPaths.reportsMemory,
    protocolPaths.reportsMemoryIngest,
  ]);

  let imported = 0;
  let duplicates = 0;
  let skipped = scanResult.skipped;
  let unsafe = 0;
  const outputs: string[] = [];
  const warnings = [...scanResult.warnings];

  for (const candidate of scanResult.candidates) {
    if (existingHashes.has(candidate.source_hash)) {
      duplicates++;
      continue;
    }

    let rawContent: string;
    try {
      rawContent = await readFile(candidate.source_path, "utf8");
    } catch {
      warnings.push(`read_failed: ${candidate.source_path}`);
      skipped++;
      continue;
    }

    const experienceEnvelope = parseExperienceEnvelope(rawContent);
    if (experienceEnvelope && experienceEnvelope.privacy_verdict !== "allow") {
      unsafe++;
      if (mode === "write") {
        const exceptionId = makeId("exception", `human-required-experience_${candidate.source_hash.slice(0, 16)}`);
        const exception = ExceptionRecordSchema.parse({
          id: exceptionId,
          protocol_version: PROTOCOL_VERSION,
          type: "exception_record",
          category: "human_required",
          source_id: candidate.id,
          reason: `Experience envelope privacy verdict is ${experienceEnvelope.privacy_verdict}`,
          details: {
            agent: candidate.agent,
            source_ref: candidate.source_ref,
            source_hash: candidate.source_hash,
          },
          created_at: now,
        });
        const exceptionPath = `${protocolPaths.exceptionsHumanRequired}/${exceptionId}.json`;
        await writeJson(root, exceptionPath, exception);
        outputs.push(exceptionPath);
      }
      continue;
    }

    const privateScanText = experienceEnvelope?.redacted_summary ?? rawContent;
    if (containsPrivateMaterial(privateScanText)) {
      unsafe++;
      if (mode === "write") {
        const exceptionId = makeId("exception", `human-required_${candidate.source_hash.slice(0, 16)}`);
        const exception = ExceptionRecordSchema.parse({
          id: exceptionId,
          protocol_version: PROTOCOL_VERSION,
          type: "exception_record",
          category: "human_required",
          source_id: candidate.id,
          reason: "Private material detected in agent memory source",
          details: {
            agent: candidate.agent,
            source_ref: candidate.source_ref,
            source_hash: candidate.source_hash,
          },
          created_at: now,
        });
        const exceptionPath = `${protocolPaths.exceptionsHumanRequired}/${exceptionId}.json`;
        await writeJson(root, exceptionPath, exception);
        outputs.push(exceptionPath);
      }
      continue;
    }

    // Security: redacted summary must never contain raw source body
    const summary = experienceEnvelope?.redacted_summary ?? generateRedactedSummary(rawContent, candidate.summary_hint);

    if (containsPrivateMaterial(summary)) {
      unsafe++;
      if (mode === "write") {
        const exceptionId = makeId("exception", `human-required-summary_${candidate.source_hash.slice(0, 16)}`);
        const exception = ExceptionRecordSchema.parse({
          id: exceptionId,
          protocol_version: PROTOCOL_VERSION,
          type: "exception_record",
          category: "human_required",
          source_id: candidate.id,
          reason: "Private material detected in generated summary",
          details: {
            agent: candidate.agent,
            source_ref: candidate.source_ref,
            source_hash: candidate.source_hash,
          },
          created_at: now,
        });
        const exceptionPath = `${protocolPaths.exceptionsHumanRequired}/${exceptionId}.json`;
        await writeJson(root, exceptionPath, exception);
        outputs.push(exceptionPath);
      }
      continue;
    }

    imported++;
    existingHashes.add(candidate.source_hash);

    if (mode === "write") {
      const refId = makeId("raw_ref", `${candidate.agent}_${candidate.kind}_${candidate.source_hash.slice(0, 16)}`);
      const refPath = `${protocolPaths.rawVaultRefs}/${refId}.json`;
      await writeJson(root, refPath, {
        id: refId,
        protocol_version: PROTOCOL_VERSION,
        type: "raw_vault_ref",
        agent: candidate.agent,
        kind: candidate.kind,
        source_ref: candidate.source_ref,
        source_hash: candidate.source_hash,
        redacted_summary: summary,
        scope_hint: experienceEnvelope?.scope_hint ?? scope,
        created_at: now,
      });
      outputs.push(refPath);

      const captureId = makeId("capture", `${candidate.agent}-${candidate.source_hash}`);
      const capturePath = `${protocolPaths.outboxCaptures}/${captureId}.json`;
      await writeJson(root, capturePath, {
        id: captureId,
        protocol_version: PROTOCOL_VERSION,
        type: "capture_record",
        agent: candidate.agent,
        workspace: root,
        scope_hint: experienceEnvelope?.scope_hint ?? scope,
        result: "unknown",
        triggers: ["agent-memory-ingest"],
        signals: [],
        artifacts: [{
          kind: candidate.kind,
          source_ref: candidate.source_ref,
          source_hash: candidate.source_hash,
          redacted_summary: summary,
        }],
        created_at: now,
      });
      outputs.push(capturePath);
    }
  }

  const reportId = makeId("agent-memory-ingest", `${input.agent}_${now.replace(/[^a-z0-9]/gi, "-")}`);
  const runId = makeId("run", `memory-ingest_${input.agent}_${now.replace(/[^a-z0-9]/gi, "-")}`);
  const reportPath = `${protocolPaths.reportsMemoryIngest}/${reportId}.json`;
  const runPath = `${protocolPaths.runsMemoryIngest}/${runId}.json`;
  const reportOutputs = mode === "write" ? [...outputs, reportPath, runPath] : outputs;

  const report = AgentMemoryIngestReportSchema.parse({
    id: reportId,
    protocol_version: PROTOCOL_VERSION,
    type: "agent_memory_ingest_report",
    agent: input.agent,
    mode,
    scanned: scanResult.candidates.length + scanResult.skipped,
    imported,
    duplicates,
    skipped,
    unsafe,
    outputs: reportOutputs,
    warnings,
    changed_stable_knowledge: false as const,
    created_at: now,
  });

  if (mode === "write") {
    await writeJson(root, reportPath, report);

    await writeJson(root, runPath, {
      id: runId,
      protocol_version: PROTOCOL_VERSION,
      command: "memory-ingest",
      status: "completed",
      started_at: now,
      finished_at: now,
      counts: { scanned: report.scanned, imported, duplicates, skipped, unsafe },
      errors: [],
    });
  }

  return report;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

export async function runRealWikiSmoke(root: string, input: RunRealWikiSmokeInput): Promise<RealWikiSmokeReport> {
  const now = input.now ?? new Date().toISOString();
  const ingestReport = await ingestAgentMemory(root, {
    ...input,
    mode: "write",
    now,
  });
  const compileReport = await compileWiki(root, { mode: "review", now });
  const pages = await collectWikiPages(root);
  const graph = buildWikiGraph(pages);
  const site = await buildWikiSite(root);
  const context = await buildContext({
    root,
    workspace: root,
    agent: input.agent,
    stage: "repair",
    query: input.query ?? "wiki compile",
  });

  return RealWikiSmokeReportSchema.parse({
    id: makeId("real-wiki-smoke", `${input.agent}_${now.replace(/[^a-z0-9]/gi, "-")}`),
    protocol_version: PROTOCOL_VERSION,
    type: "real_wiki_smoke_report",
    agent: input.agent,
    scanned: ingestReport.scanned,
    imported: ingestReport.imported,
    duplicates: ingestReport.duplicates,
    skipped: ingestReport.skipped,
    unsafe: ingestReport.unsafe,
    proposal_candidates: compileReport.candidate_ids.length,
    graph_nodes: graph.nodes.length,
    graph_broken_links: graph.broken_links.length,
    graph_duplicates: graph.duplicates.length,
    graph_orphans: graph.orphans.length,
    quality_findings: site.health.quality_findings,
    site_pages: site.pages,
    context_items: context.items.length,
    outputs: uniqueSorted([
      ...ingestReport.outputs,
      `${protocolPaths.reportsWikiCompile}/${compileReport.id}.json`,
      `${protocolPaths.reportsContext}/${context.id}.json`,
      ...site.outputs,
    ]),
    warnings: ingestReport.warnings,
    changed_stable_knowledge: false as const,
    created_at: now,
  });
}
