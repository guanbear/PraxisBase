import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import matter from "gray-matter";
import { makeId } from "../protocol/id.js";
import { PROTOCOL_VERSION, type AgentProfile } from "../protocol/types.js";
import { protocolPaths } from "../protocol/paths.js";
import { readText, writeJson } from "../store/file-store.js";
import { ContextResponseSchema, type ContextResponse, type ContextStage } from "../protocol/schemas.js";
import { rankWikiContextItems, type WikiContextCandidate } from "../wiki/retrieval.js";
import { promotionTimeGuard } from "../wiki/promotion-quality.js";
import { listExperienceSources } from "./source-config.js";
import { createAgentMemoryBackend } from "./agentmemory-adapter.js";
import { createGBrainBackend, createGBrainBackendFromConfig } from "./gbrain-adapter.js";
import { readGBrainConfig } from "./gbrain-config.js";
import type { BrainBackendName } from "./brain-backend.js";
import type { GBrainCommandRunner } from "./gbrain-client.js";

const DEFAULT_BUDGETS: Record<ContextStage, number> = {
  diagnosis: 16 * 1024,
  repair: 24 * 1024,
  verification: 12 * 1024,
  proposal: 16 * 1024,
};

const CONTEXT_ROOTS = [
  "kb",
  "skills",
  protocolPaths.indexes,
  protocolPaths.bundles,
] as const;

export interface BuildContextInput {
  root: string;
  agent: AgentProfile;
  workspace: string;
  stage: ContextStage;
  query?: string;
  maxBytes?: number;
  withAgentMemory?: boolean;
  withGbrain?: boolean;
  withBackends?: string[];
  agentMemorySourceName?: string;
  gbrainExecutable?: string;
  gbrainRunCommand?: GBrainCommandRunner;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

export type BuildContextOutput = ContextResponse & {
  id: string;
  workspace: string;
};

async function listFiles(root: string, relativeDir: string): Promise<string[]> {
  const absoluteDir = join(root, relativeDir);
  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const relativePath = `${relativeDir}${sep}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, relativePath));
    } else if (entry.isFile() && /\.(md|json|txt)$/i.test(entry.name)) {
      files.push(relativePath.split(sep).join("/"));
    }
  }
  return files;
}

function kindFromPath(path: string): string {
  if (path.startsWith("skills/")) return "skill";
  if (path.startsWith("kb/known-fixes/")) return "known_fix";
  if (path.startsWith("kb/")) return "knowledge";
  if (path.includes("/bundles/")) return "bundle";
  if (path.includes("/indexes/")) return "index";
  return "context";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function sourceIdsValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.length > 0) return [item];
    if (isRecord(item)) {
      return [stringValue(item.id), stringValue(item.uri), stringValue(item.hash)].filter((entry): entry is string => Boolean(entry));
    }
    return [];
  });
}

function extractTitle(content: string, data: Record<string, unknown>, fallback: string): string {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  return stringValue(data.title) ?? stringValue(data.id) ?? fallback;
}

function stripMarkdownCode(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
}

function extractWikiTargets(content: string): string[] {
  const stripped = stripMarkdownCode(content);
  const targets: string[] = [];
  for (const match of stripped.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
    targets.push(match[1].trim());
  }
  return Array.from(new Set(targets)).sort();
}

function idFromPath(path: string): string {
  const fileName = path.split("/").pop() ?? path;
  return fileName.replace(/\.(md|json|txt)$/i, "") || path;
}

function markdownCandidate(path: string, raw: string): WikiContextCandidate {
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  const body = parsed.content.trim();
  const fallback = idFromPath(path);
  const signatures = stringArrayValue(data.signatures);
  const sources = [
    ...stringArrayValue(data.source_ids),
    ...stringArrayValue(data.sourceIds),
    ...sourceIdsValue(data.sources),
  ];
  const summary = stringValue(data.summary) ?? [body.slice(0, 240), ...signatures].filter(Boolean).join("\n");

  return {
    id: stringValue(data.id) ?? fallback,
    path,
    kind: stringValue(data.knowledge_type) ?? stringValue(data.type) ?? kindFromPath(path),
    title: extractTitle(parsed.content, data, fallback),
    summary,
    body,
    maturity: stringValue(data.maturity),
    scope: stringValue(data.scope),
    source_ids: Array.from(new Set(sources)).sort(),
    outbound_links: extractWikiTargets(body),
  };
}

function jsonCandidate(path: string, raw: string): WikiContextCandidate | undefined {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)) return undefined;
    const fallback = idFromPath(path);
    const redactedSummary = stringValue(value.redacted_summary);
    const sourceHash = stringValue(value.source_hash);
    const sourceRef = stringValue(value.source_ref);
    const summary = redactedSummary ?? stringValue(value.summary) ?? stringValue(value.title) ?? raw.slice(0, 240);
    return {
      id: stringValue(value.id) ?? fallback,
      path,
      kind: stringValue(value.knowledge_type) ?? stringValue(value.type) ?? kindFromPath(path),
      title: stringValue(value.title) ?? stringValue(value.id) ?? fallback,
      summary,
      body: stringValue(value.body) ?? redactedSummary ?? raw,
      maturity: stringValue(value.maturity),
      scope: stringValue(value.scope) ?? stringValue(value.scope_hint),
      source_ids: [
        ...stringArrayValue(value.source_ids),
        ...sourceIdsValue(value.sources),
        sourceHash,
        sourceRef,
      ].filter((entry): entry is string => Boolean(entry)).sort(),
      outbound_links: stringArrayValue(value.outbound_links).sort(),
    };
  } catch {
    return undefined;
  }
}

function textCandidate(path: string, raw: string): WikiContextCandidate {
  const fallback = idFromPath(path);
  return {
    id: fallback,
    path,
    kind: kindFromPath(path),
    title: fallback,
    summary: raw.slice(0, 240),
    body: raw,
    outbound_links: extractWikiTargets(raw),
  };
}

function buildCandidate(path: string, raw: string): WikiContextCandidate | undefined {
  if (path.startsWith("kb/") && path.endsWith(".md") && promotionTimeGuard(raw)) {
    return undefined;
  }
  if (path.endsWith(".md")) return markdownCandidate(path, raw);
  if (path.endsWith(".json")) return jsonCandidate(path, raw);
  if (path.endsWith(".txt")) return textCandidate(path, raw);
  return undefined;
}

function wantsBackend(input: BuildContextInput, name: BrainBackendName): boolean {
  if (name === "agentmemory" && input.withAgentMemory) return true;
  if (name === "gbrain" && input.withGbrain) return true;
  return (input.withBackends ?? []).includes(name);
}

function sourceRankForCandidate(candidate: WikiContextCandidate): string {
  if (candidate.kind === "gbrain_sidecar" || candidate.path.startsWith("gbrain://")) return "gbrain_sidecar";
  if (candidate.kind === "agentmemory_sidecar" || candidate.path.startsWith("agentmemory://")) return "agentmemory_sidecar";
  if (candidate.path.startsWith("kb/") || candidate.path.startsWith("skills/")) return "pb_stable";
  if (candidate.path.includes("/indexes/") || candidate.path.includes("/bundles/")) return "pb_catalog";
  if (candidate.path.startsWith(".praxisbase/raw-vault/refs/")) return "raw_debug";
  return "raw_debug";
}

function promotionEvidenceForCandidate(candidate: WikiContextCandidate): boolean {
  return sourceRankForCandidate(candidate) === "pb_stable";
}

async function agentMemorySidecarCandidates(input: BuildContextInput): Promise<{ candidates: WikiContextCandidate[]; warnings: string[] }> {
  if (!wantsBackend(input, "agentmemory")) return { candidates: [], warnings: [] };

  const sources = (await listExperienceSources(input.root)).filter((source) => source.source_type === "agentmemory");
  const source = input.agentMemorySourceName
    ? sources.find((candidate) => candidate.name === input.agentMemorySourceName)
    : sources[0];
  if (!source) {
    return { candidates: [], warnings: ["agentmemory_sidecar_unavailable: no configured agentmemory source"] };
  }

  const backend = createAgentMemoryBackend(source, {
    authorityMode: "personal-local",
    fetchImpl: input.fetchImpl,
    env: input.env,
  });
  return backend.retrieve({
    query: input.query?.trim() || input.stage,
    stage: input.stage,
    limit: 4,
  });
}

async function gbrainSidecarCandidates(input: BuildContextInput): Promise<{ candidates: WikiContextCandidate[]; warnings: string[] }> {
  if (!wantsBackend(input, "gbrain")) return { candidates: [], warnings: [] };

  const backend = createGBrainBackend({
    executable: input.gbrainExecutable,
    runCommand: input.gbrainRunCommand,
  });
  const config = await readGBrainConfig(input.root);
  if (config) {
    const configuredBackend = createGBrainBackendFromConfig(config, {
      executable: input.gbrainExecutable,
      runCommand: input.gbrainRunCommand,
      fetch: input.fetchImpl,
    });
    return configuredBackend.retrieve({
      query: input.query?.trim() || input.stage,
      stage: input.stage,
      limit: 4,
    });
  }
  return backend.retrieve({
    query: input.query?.trim() || input.stage,
    stage: input.stage,
    limit: 4,
  });
}

function serializeSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}

function isSidecarContextItem(item: ContextResponse["items"][number]): boolean {
  return item.source_rank === "gbrain_sidecar" ||
    item.source_rank === "agentmemory_sidecar" ||
    item.path.startsWith("gbrain://") ||
    item.path.startsWith("agentmemory://");
}

function removableContextItemIndex(items: ContextResponse["items"]): number {
  const sidecarCount = items.filter(isSidecarContextItem).length;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (!isSidecarContextItem(items[index]) || sidecarCount > 1) return index;
  }
  return items.length - 1;
}

function enforceBudget(output: BuildContextOutput, maxBytes: number): BuildContextOutput {
  if (serializeSize(output) <= maxBytes) return output;

  const withoutBodies: BuildContextOutput = {
    ...output,
    truncated: true,
    items: output.items.map((item) => ({
      id: item.id,
      path: item.path,
      kind: item.kind,
      summary: item.summary,
      source_rank: item.source_rank,
      promotion_evidence: item.promotion_evidence,
    })),
  };
  withoutBodies.budget.used_bytes = serializeSize(withoutBodies);
  if (withoutBodies.budget.used_bytes <= maxBytes) return withoutBodies;

  const reduced: BuildContextOutput = { ...withoutBodies };
  while (serializeSize(reduced) > maxBytes && reduced.items.length > 1) {
    const removeIndex = removableContextItemIndex(reduced.items);
    const [removed] = reduced.items.splice(removeIndex, 1);
    if (removed) {
      reduced.citations = reduced.citations.filter((citation) => citation.path !== removed.path);
    }
  }
  if (serializeSize(reduced) > maxBytes) {
    reduced.items = [];
    reduced.citations = [];
  }
  reduced.budget.used_bytes = serializeSize(reduced);
  return reduced;
}

export async function buildContext(input: BuildContextInput): Promise<BuildContextOutput> {
  const maxBytes = input.maxBytes ?? DEFAULT_BUDGETS[input.stage];
  const filePaths = (await Promise.all(CONTEXT_ROOTS.map((dir) => listFiles(input.root, dir)))).flat();
  const candidates: WikiContextCandidate[] = [];
  const warnings: string[] = [];

  for (const path of filePaths) {
    const raw = await readText(input.root, path);
    const candidate = buildCandidate(path, raw);
    if (candidate) candidates.push(candidate);
  }
  const sidecars = await Promise.all([
    agentMemorySidecarCandidates(input),
    gbrainSidecarCandidates(input),
  ]);
  const sidecarCandidates = sidecars.flatMap((sidecar) => sidecar.candidates);
  warnings.push(...sidecars.flatMap((sidecar) => sidecar.warnings));

  const selectedStable = rankWikiContextItems(candidates, {
    query: input.query ?? "",
    stage: input.stage,
    maxItems: 8,
  });
  const sidecarLimit = sidecarCandidates.length > 0 && selectedStable.length >= 8
    ? 2
    : Math.max(0, 8 - selectedStable.length);
  const selectedSidecars = rankWikiContextItems(sidecarCandidates, {
    query: input.query ?? "",
    stage: input.stage,
    maxItems: sidecarLimit,
  });
  const selected = [...selectedStable, ...selectedSidecars];
  const id = makeId("context", `${input.agent}-${input.stage}-${input.query ?? "default"}`);
  if (selected.length === 0) warnings.push("context_unavailable");

  const base = ContextResponseSchema.parse({
    agent: input.agent,
    stage: input.stage,
    items: selected.map((candidate) => ({
      id: makeId("context-item", candidate.path),
      path: candidate.path,
      kind: candidate.kind,
      summary: candidate.summary,
      body: candidate.body,
      source_rank: sourceRankForCandidate(candidate),
      promotion_evidence: promotionEvidenceForCandidate(candidate),
    })),
    citations: selected.map((candidate) => ({
      id: makeId("citation", candidate.path),
      path: candidate.path,
    })),
    warnings,
    truncated: false,
    budget: {
      max_bytes: maxBytes,
      used_bytes: 0,
    },
  });

  const output = enforceBudget({
    ...base,
    id,
    workspace: relative(input.root, input.workspace) || input.workspace,
  }, maxBytes);

  output.budget.used_bytes = serializeSize(output);
  await writeJson(input.root, `${protocolPaths.reportsContext}/${id}.json`, {
    ...output,
    protocol_version: PROTOCOL_VERSION,
    type: "context_report",
    changed_stable_knowledge: false,
    created_at: new Date().toISOString(),
  });

  return output;
}
