import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { makeId } from "../protocol/id.js";
import { PROTOCOL_VERSION, type AgentProfile } from "../protocol/types.js";
import { protocolPaths } from "../protocol/paths.js";
import { readText, writeJson } from "../store/file-store.js";
import { ContextResponseSchema, type ContextResponse, type ContextStage } from "../protocol/schemas.js";

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
}

export type BuildContextOutput = ContextResponse & {
  id: string;
  workspace: string;
};

interface Candidate {
  path: string;
  kind: string;
  body: string;
  score: number;
}

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

function scoreText(path: string, body: string, query: string): number {
  if (!query.trim()) return 1;
  const haystack = `${path}\n${body}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function kindFromPath(path: string): string {
  if (path.startsWith("skills/")) return "skill";
  if (path.startsWith("kb/known-fixes/")) return "known_fix";
  if (path.startsWith("kb/")) return "knowledge";
  if (path.includes("/bundles/")) return "bundle";
  if (path.includes("/indexes/")) return "index";
  return "context";
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

  const reduced: BuildContextOutput = { ...withoutBodies, items: [] };
  reduced.budget.used_bytes = serializeSize(reduced);
  return reduced;
}

export async function buildContext(input: BuildContextInput): Promise<BuildContextOutput> {
  const maxBytes = input.maxBytes ?? DEFAULT_BUDGETS[input.stage];
  const filePaths = (await Promise.all(CONTEXT_ROOTS.map((dir) => listFiles(input.root, dir)))).flat();
  const candidates: Candidate[] = [];

  for (const path of filePaths) {
    const body = await readText(input.root, path);
    const score = scoreText(path, body, input.query ?? "");
    if (score <= 0) continue;
    candidates.push({ path, kind: kindFromPath(path), body, score });
  }

  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const selected = candidates.slice(0, 8);
  const id = makeId("context", `${input.agent}-${input.stage}-${input.query ?? "default"}`);
  const warnings = selected.length === 0 ? ["context_unavailable"] : [];

  const base = ContextResponseSchema.parse({
    agent: input.agent,
    stage: input.stage,
    items: selected.map((candidate) => ({
      id: makeId("context-item", candidate.path),
      path: candidate.path,
      kind: candidate.kind,
      summary: candidate.body.slice(0, 240),
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
