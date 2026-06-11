import { MATURITY_ORDER, SCOPE_ORDER } from "./model.js";
import { readJson, readText } from "../store/file-store.js";
import { collectWikiPages } from "./render-site.js";
import { promotionTimeGuard } from "./promotion-quality.js";
import type { WikiGraph } from "./resolver.js";

export interface WikiContextCandidate {
  id: string;
  path: string;
  kind: string;
  title: string;
  summary: string;
  body?: string;
  maturity?: string;
  scope?: string;
  source_ids?: string[];
  outbound_links?: string[];
}

export interface RankWikiContextOptions {
  query: string;
  stage: "diagnosis" | "repair" | "verification" | "proposal";
  maxItems: number;
}

export interface RetrieveWikiContextOptions {
  query: string;
  stage?: RankWikiContextOptions["stage"];
  maxBytes?: number;
  includeRootArtifacts?: boolean;
  includeGraphNeighbors?: boolean;
  maxItems?: number;
}

export interface RetrievedWikiContext {
  text: string;
  items: WikiContextCandidate[];
  truncated: boolean;
}

interface ScoredCandidate {
  candidate: WikiContextCandidate;
  score: number;
  matched: boolean;
}

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function cjkBigrams(text: string): string[] {
  const matches = text.match(/[\u3400-\u9fff\uf900-\ufaff]+/g) ?? [];
  const tokens: string[] = [];
  for (const match of matches) {
    if (match.length === 1) {
      tokens.push(match);
      continue;
    }
    for (let index = 0; index < match.length - 1; index += 1) {
      tokens.push(match.slice(index, index + 2));
    }
  }
  return tokens;
}

export function tokenizeForWikiSearch(text: string): string[] {
  const lower = normalize(text);
  const english = lower.match(/[a-z0-9][a-z0-9:_./-]*/g) ?? [];
  return unique([...english, ...cjkBigrams(text)]);
}

function maturityWeight(value: string | undefined): number {
  return value ? (MATURITY_ORDER[value] ?? 0) : 0;
}

function scopeWeight(value: string | undefined): number {
  return value ? (SCOPE_ORDER[value] ?? 0) : 0;
}

function authorityWeight(candidate: WikiContextCandidate): number {
  if (candidate.path.startsWith("kb/") || candidate.path.startsWith("skills/")) return 1000;
  if (candidate.path.startsWith("dist/wiki/") || candidate.path.includes("/indexes/") || candidate.path.includes("/bundles/")) return 500;
  if (candidate.path.startsWith(".praxisbase/raw-vault/refs/")) return -500;
  return 0;
}

function stageWeight(candidate: WikiContextCandidate, stage: RankWikiContextOptions["stage"]): number {
  const kind = normalize(candidate.kind);
  const text = normalize(`${candidate.title}\n${candidate.summary}\n${candidate.body ?? ""}`);

  if (stage === "diagnosis" && (kind === "known_fix" || kind === "pitfall")) return 10;
  if (stage === "repair" && (kind === "skill" || kind === "procedure")) return 10;
  if (stage === "verification") {
    if (kind === "procedure" || kind === "known_fix") return 10;
    if (text.includes("verification") || text.includes("rollback")) return 8;
  }
  if (stage === "proposal" && ["note", "decision", "review", "proposal"].includes(kind)) return 10;

  return 0;
}

function aliases(candidate: WikiContextCandidate): string[] {
  const pathStem = candidate.path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? candidate.path;
  return unique([
    candidate.id,
    candidate.path,
    pathStem,
    candidate.title,
    normalize(candidate.title).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
  ].filter(Boolean).map(normalize));
}

function matchesReference(candidate: WikiContextCandidate, target: string): boolean {
  const normalizedTarget = normalize(target);
  return aliases(candidate).includes(normalizedTarget);
}

function scoreCandidate(candidate: WikiContextCandidate, query: string, tokens: string[], stage: RankWikiContextOptions["stage"]): ScoredCandidate {
  const title = normalize(candidate.title);
  const summary = normalize(candidate.summary);
  const body = normalize(candidate.body ?? "");
  const path = normalize(candidate.path);
  const id = normalize(candidate.id);
  const exact = normalize(query);
  let score = authorityWeight(candidate) + maturityWeight(candidate.maturity) * 2 + scopeWeight(candidate.scope) + stageWeight(candidate, stage);
  let matched = exact.length === 0;

  if (exact) {
    if (id === exact || path === exact || title === exact) {
      score += 140;
      matched = true;
    } else if ([id, path, title, summary, body].some((field) => field.includes(exact))) {
      score += 100;
      matched = true;
    }
  }

  for (const token of tokens) {
    if (!token) continue;
    let tokenMatched = false;
    if (title.includes(token)) {
      score += CJK_RE.test(token) ? 26 : 20;
      tokenMatched = true;
    }
    if (summary.includes(token)) {
      score += CJK_RE.test(token) ? 18 : 12;
      tokenMatched = true;
    }
    if (body.includes(token)) {
      score += CJK_RE.test(token) ? 12 : 8;
      tokenMatched = true;
    }
    if (path.includes(token) || id.includes(token)) {
      score += 6;
      tokenMatched = true;
    }
    matched = matched || tokenMatched;
  }

  return { candidate, score: matched ? score : 0, matched };
}

export function rankWikiContextItems(
  candidates: WikiContextCandidate[],
  options: RankWikiContextOptions
): WikiContextCandidate[] {
  const tokens = tokenizeForWikiSearch(options.query);
  const scored = candidates.map((candidate) => scoreCandidate(candidate, options.query, tokens, options.stage));

  for (const seed of scored.filter((item) => item.matched)) {
    const outbound = seed.candidate.outbound_links ?? [];
    for (const target of outbound) {
      const linked = scored.find((item) => matchesReference(item.candidate, target));
      if (linked && !linked.matched) {
        linked.score += 70 + stageWeight(linked.candidate, options.stage);
      }
    }

    for (const sourceId of seed.candidate.source_ids ?? []) {
      for (const related of scored) {
        if (related.candidate.id === seed.candidate.id || related.matched) continue;
        if ((related.candidate.source_ids ?? []).includes(sourceId)) {
          related.score += 25;
        }
      }
    }
  }

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.path.localeCompare(b.candidate.path))
    .slice(0, options.maxItems)
    .map((item) => item.candidate);
}

export async function retrieveWikiContext(root: string, options: RetrieveWikiContextOptions): Promise<RetrievedWikiContext> {
  const maxBytes = options.maxBytes ?? 16 * 1024;
  const pages = (await collectWikiPages(root)).filter((page) =>
    !(page.path.startsWith("kb/") && promotionTimeGuard(page.body_markdown ?? page.body_text)),
  );
  const candidates: WikiContextCandidate[] = pages.map((page) => ({
    id: page.id,
    path: page.path,
    kind: page.page_kind ?? "note",
    title: page.title,
    summary: page.summary,
    body: page.body_text,
    maturity: page.maturity,
    scope: page.scope,
    source_ids: page.source_ids,
    outbound_links: page.outbound_links,
  }));
  const selected = rankWikiContextItems(candidates, {
    query: options.query,
    stage: options.stage ?? "repair",
    maxItems: options.maxItems ?? 8,
  });

  const sections: string[] = ["# PraxisBase Wiki Context", ""];
  if (options.includeRootArtifacts) {
    sections.push(...await rootArtifactSections(root));
  }

  for (const item of selected) {
    sections.push(
      `## ${item.title}`,
      `Path: ${item.path}`,
      `Kind: ${item.kind}`,
      "",
      item.body ?? item.summary,
      "",
      "### Provenance",
      ...(item.source_ids && item.source_ids.length > 0 ? item.source_ids.map((sourceId) => `- ${sourceId}`) : ["- unavailable"]),
      "",
    );
  }

  if (options.includeGraphNeighbors) {
    const neighbors = await graphNeighborSections(root, selected);
    if (neighbors.length > 0) sections.push(...neighbors);
  }

  return enforceTextBudget(sections.join("\n"), selected, maxBytes);
}

async function rootArtifactSections(root: string): Promise<string[]> {
  const sections: string[] = [];
  for (const path of ["dist/wiki/purpose.md", "dist/wiki/schema.md", "dist/wiki/index.md"]) {
    const content = await readOptionalText(root, path);
    if (!content) continue;
    const title = path.split("/").pop()!.replace(/\.md$/, "");
    sections.push(`## Root Artifact: ${title}`, content.slice(0, 1200), "");
  }
  return sections;
}

async function graphNeighborSections(root: string, selected: WikiContextCandidate[]): Promise<string[]> {
  const graph = await readOptionalJson<WikiGraph>(root, "dist/graph.json");
  if (!graph) return [];
  const selectedIds = new Set(selected.map((item) => item.id));
  const pageById = new Map(graph.nodes.map((node) => [node.id, node]));
  const lines: string[] = [];
  for (const link of graph.links) {
    const fromSelected = selectedIds.has(link.from);
    const toSelected = selectedIds.has(link.to);
    if (!fromSelected && !toSelected) continue;
    const neighborId = fromSelected ? link.to : link.from;
    if (selectedIds.has(neighborId)) continue;
    const neighbor = pageById.get(neighborId);
    if (!neighbor) continue;
    lines.push(`- ${link.type}: ${neighbor.title} (${neighbor.id})`);
    if (lines.length >= 5) break;
  }
  return lines.length > 0 ? ["## Graph Neighbors", ...lines, ""] : [];
}

function enforceTextBudget(text: string, items: WikiContextCandidate[], maxBytes: number): RetrievedWikiContext {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return { text, items, truncated: false };
  }
  const marker = "\n...[truncated]";
  const budget = Math.max(0, maxBytes - Buffer.byteLength(marker, "utf8"));
  let truncated = text;
  while (Buffer.byteLength(truncated, "utf8") > budget && truncated.length > 0) {
    truncated = truncated.slice(0, Math.floor(truncated.length * 0.9));
  }
  return { text: `${truncated}${marker}`, items, truncated: true };
}

async function readOptionalText(root: string, path: string): Promise<string | undefined> {
  try {
    return await readText(root, path);
  } catch {
    return undefined;
  }
}

async function readOptionalJson<T>(root: string, path: string): Promise<T | undefined> {
  try {
    return await readJson<T>(root, path);
  } catch {
    return undefined;
  }
}
