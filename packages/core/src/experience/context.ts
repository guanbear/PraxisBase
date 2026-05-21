import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import matter from "gray-matter";
import { makeId } from "../protocol/id.js";
import { PROTOCOL_VERSION, type AgentProfile } from "../protocol/types.js";
import { protocolPaths } from "../protocol/paths.js";
import { readText, writeJson } from "../store/file-store.js";
import { ContextResponseSchema, type ContextResponse, type ContextStage } from "../protocol/schemas.js";
import { rankWikiContextItems, type WikiContextCandidate } from "../wiki/retrieval.js";

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
  protocolPaths.rawVaultRefs,
] as const;

export interface BuildContextInput {
  root: string;
  agent: AgentProfile;
  workspace: string;
  stage: ContextStage;
  query?: string;
  maxBytes?: number;
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
  if (path.endsWith(".md")) return markdownCandidate(path, raw);
  if (path.endsWith(".json")) return jsonCandidate(path, raw);
  if (path.endsWith(".txt")) return textCandidate(path, raw);
  return undefined;
}

function serializeSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
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
    })),
  };
  withoutBodies.budget.used_bytes = serializeSize(withoutBodies);
  if (withoutBodies.budget.used_bytes <= maxBytes) return withoutBodies;

  const reduced: BuildContextOutput = { ...withoutBodies };
  while (serializeSize(reduced) > maxBytes && reduced.items.length > 1) {
    const removed = reduced.items.pop();
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

  for (const path of filePaths) {
    const raw = await readText(input.root, path);
    const candidate = buildCandidate(path, raw);
    if (candidate) candidates.push(candidate);
  }

  const selected = rankWikiContextItems(candidates, {
    query: input.query ?? "",
    stage: input.stage,
    maxItems: 8,
  });
  const id = makeId("context", `${input.agent}-${input.stage}-${input.query ?? "default"}`);
  const warnings = selected.length === 0 ? ["context_unavailable"] : [];

  const base = ContextResponseSchema.parse({
    agent: input.agent,
    stage: input.stage,
    items: selected.map((candidate) => ({
      id: makeId("context-item", candidate.path),
      path: candidate.path,
      kind: candidate.kind,
      summary: candidate.summary,
      body: candidate.body,
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
