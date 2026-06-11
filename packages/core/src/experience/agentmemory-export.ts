import { readdir } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { computeHash } from "../protocol/id.js";
import type { ExperienceSourceConfig } from "../protocol/schemas.js";
import { readText, safePath } from "../store/file-store.js";
import { AgentMemoryClient, type AgentMemoryRememberPayload } from "./agentmemory-client.js";
import { listExperienceSources } from "./source-config.js";
import { collectWikiPages } from "../wiki/render-site.js";
import type { WikiSitePage } from "../wiki/site-model.js";
import { stableOutputLeakReasons } from "./stable-output-safety.js";

const MAX_REMEMBER_CONTENT_CHARS = 4000;

export interface AgentMemoryExportPayload {
  payload: AgentMemoryRememberPayload;
  pagePath: string;
  authority: "stable_pb_page" | "promoted_skill";
  provenanceHash: string;
  idempotencyKey: string;
}

export type ExportPayload = AgentMemoryExportPayload;

export interface ExportAgentMemoryOptions {
  mode: "personal" | "team";
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  allowTeamExport?: boolean;
  sourceName?: string;
}

export interface ExportAgentMemoryResult {
  ok: boolean;
  mode: "personal" | "team";
  pages: number;
  payloads: AgentMemoryExportPayload[];
  exported: number;
  already_present: number;
  skipped: number;
  errors: string[];
  warnings: string[];
  summary: {
    pages_scanned: number;
    payloads_generated: number;
    exported: number;
    already_present: number;
    skipped: number;
    idempotency: "provenance_hash";
    authority: {
      exported_from: Array<"stable_pb_page" | "promoted_skill">;
      backend_role: "sidecar_export_sink";
      promotion_evidence: false;
    };
  };
}

interface StablePage {
  relativePath: string;
  content: string;
  title?: string;
  scope?: string;
  pageKind?: string;
  maturity?: string;
  signatures?: string[];
  sourceIds?: string[];
}

function emptyResult(mode: "personal" | "team", errors: string[] = [], warnings: string[] = []): ExportAgentMemoryResult {
  return {
    ok: errors.length === 0,
    mode,
    pages: 0,
    payloads: [],
    exported: 0,
    already_present: 0,
    skipped: 0,
    errors,
    warnings,
    summary: exportSummary({ pages: 0, payloads: 0, exported: 0, alreadyPresent: 0, skipped: 0 }),
  };
}

function exportSummary(input: {
  pages: number;
  payloads: number;
  exported: number;
  alreadyPresent: number;
  skipped: number;
}): ExportAgentMemoryResult["summary"] {
  return {
    pages_scanned: input.pages,
    payloads_generated: input.payloads,
    exported: input.exported,
    already_present: input.alreadyPresent,
    skipped: input.skipped,
    idempotency: "provenance_hash",
    authority: {
      exported_from: ["stable_pb_page", "promoted_skill"],
      backend_role: "sidecar_export_sink",
      promotion_evidence: false,
    },
  };
}

export async function collectStableKbPages(root: string, relativeDir = "kb"): Promise<Array<{ relativePath: string; content: string }>> {
  if (relativeDir.split("/").includes(".praxisbase")) return [];

  let entries;
  try {
    entries = await readdir(safePath(root, relativeDir), { withFileTypes: true });
  } catch {
    return [];
  }

  const files: Array<{ relativePath: string; content: string }> = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = join(relativeDir, entry.name).replaceAll("\\", "/");
    if (relativePath.split("/").includes(".praxisbase")) continue;
    if (entry.isDirectory()) {
      files.push(...await collectStableKbPages(root, relativePath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const content = await readText(root, relativePath);
      files.push({ relativePath, content });
    }
  }
  return files;
}

export async function collectStableSkillsPages(root: string, relativeDir = "skills"): Promise<Array<{ relativePath: string; content: string }>> {
  if (relativeDir.split("/").includes(".praxisbase")) return [];

  let entries;
  try {
    entries = await readdir(safePath(root, relativeDir), { withFileTypes: true });
  } catch {
    return [];
  }

  const files: Array<{ relativePath: string; content: string }> = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = join(relativeDir, entry.name).replaceAll("\\", "/");
    if (relativePath.split("/").includes(".praxisbase")) continue;
    if (entry.isDirectory()) {
      files.push(...await collectStableSkillsPages(root, relativePath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const content = await readText(root, relativePath);
      files.push({ relativePath, content });
    }
  }
  return files;
}

function normalizedMarkdown(content: string): { body: string; data: Record<string, unknown> } {
  const parsed = matter(content);
  return {
    body: parsed.content.trim(),
    data: parsed.data as Record<string, unknown>,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function pathStem(relativePath: string): string {
  const parts = relativePath.split("/");
  const leaf = parts[parts.length - 1] ?? relativePath;
  return leaf === "SKILL.md" ? parts[parts.length - 2] ?? leaf : leaf.replace(/\.md$/i, "");
}

function wikiLinkConcepts(content: string): string[] {
  return [...content.matchAll(/\[\[([^\]|]+)/g)].map((match) => match[1].trim().toLowerCase());
}

function conceptList(page: StablePage, body: string): string[] | undefined {
  const values = [
    page.pageKind,
    page.scope,
    page.maturity,
    pathStem(page.relativePath),
    ...(page.signatures ?? []),
    ...wikiLinkConcepts(body),
  ].map((value) => value?.trim().toLowerCase()).filter((value): value is string => Boolean(value));
  const unique = [...new Set(values)].slice(0, 16);
  return unique.length > 0 ? unique : undefined;
}

function compactContent(body: string, provenance: string): string {
  const footer = `\n\n---\nPraxisBase provenance:\n${provenance.trim()}\n`;
  const budget = Math.max(200, MAX_REMEMBER_CONTENT_CHARS - footer.length);
  const compactBody = body.length > budget ? `${body.slice(0, budget - 16).trimEnd()}\n[truncated]` : body;
  return `${compactBody}${footer}`;
}

export function kbPageToRememberPayload(page: StablePage, provenanceHash?: string): AgentMemoryRememberPayload {
  const normalized = normalizedMarkdown(page.content);
  const headingMatch = normalized.body.match(/^#\s+(.+)$/m);
  const scope = page.scope ?? stringValue(normalized.data.scope) ?? "personal";
  const title = headingMatch?.[1]?.trim() ?? page.relativePath.split("/").pop()?.replace(/\.md$/i, "") ?? "untitled";
  const provenanceLines = [
    `- path: ${page.relativePath}`,
    provenanceHash ? `- hash: ${provenanceHash}` : undefined,
    page.sourceIds && page.sourceIds.length > 0 ? `- source_ids: ${page.sourceIds.join(", ")}` : undefined,
  ].filter((line): line is string => Boolean(line)).join("\n");

  return {
    title: page.title ?? title,
    content: compactContent(normalized.body, provenanceLines),
    concepts: conceptList(page, normalized.body),
    files: [page.relativePath],
    scope,
  };
}

function wikiPageToStablePage(page: WikiSitePage): StablePage {
  return {
    relativePath: page.path,
    content: page.body_markdown ?? page.body_text,
    title: page.title,
    scope: page.scope,
    pageKind: page.page_kind,
    maturity: page.maturity,
    signatures: page.signatures,
    sourceIds: page.source_ids,
  };
}

function filterExportSafePages(pages: StablePage[]): { pages: StablePage[]; warnings: string[] } {
  const warnings: string[] = [];
  const safePages = pages.filter((page) => {
    const reasons = stableOutputLeakReasons(page.content);
    if (reasons.length === 0) return true;
    warnings.push(`AGENTMEMORY_EXPORT_SKIPPED_PRIVATE: ${page.relativePath} (${reasons.join(",")})`);
    return false;
  });
  return { pages: safePages, warnings };
}

async function collectExportableStablePages(root: string): Promise<{ pages: StablePage[]; warnings: string[]; scanned: number }> {
  const pages = (await collectWikiPages(root)).map(wikiPageToStablePage);
  const filtered = filterExportSafePages(pages);
  return { ...filtered, scanned: pages.length };
}

function pageToExportPayload(page: StablePage): AgentMemoryExportPayload {
  const normalized = normalizedMarkdown(page.content);
  const title = page.title ?? normalized.body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? pathStem(page.relativePath);
  const provenanceHash = computeHash(JSON.stringify({
    path: page.relativePath,
    source_ids: page.sourceIds ?? [],
    title,
    body: normalized.body,
  }));
  return {
    payload: kbPageToRememberPayload(page, provenanceHash),
    pagePath: page.relativePath,
    authority: page.relativePath.startsWith("skills/") ? "promoted_skill" : "stable_pb_page",
    provenanceHash,
    idempotencyKey: provenanceHash,
  };
}

function hitContainsProvenanceHash(hit: { id?: string; title?: string; content?: string; [key: string]: unknown }, provenanceHash: string): boolean {
  return [
    hit.id,
    hit.title,
    hit.content,
    typeof hit.text === "string" ? hit.text : undefined,
    typeof hit.summary === "string" ? hit.summary : undefined,
  ].filter((value): value is string => typeof value === "string").some((value) => value.includes(provenanceHash));
}

export async function findAgentMemorySource(root: string, sourceName?: string): Promise<ExperienceSourceConfig | undefined> {
  const sources = (await listExperienceSources(root)).filter((source) => source.agent === "agentmemory");
  if (sourceName) return sources.find((source) => source.name === sourceName);
  return sources[0];
}

function createClient(source: ExperienceSourceConfig, options: ExportAgentMemoryOptions): AgentMemoryClient {
  if (!source.url) {
    throw new Error("AGENTMEMORY_SOURCE_INVALID: agentmemory source requires url.");
  }
  return new AgentMemoryClient({
    baseUrl: source.url,
    bearerTokenEnv: source.bearer_token_env,
    fetchImpl: options.fetchImpl,
    env: options.env,
    timeoutMs: 10_000,
  });
}

export async function exportAgentMemory(root: string, options: ExportAgentMemoryOptions): Promise<ExportAgentMemoryResult> {
  if (options.mode === "team" && options.allowTeamExport !== true) {
    return emptyResult(options.mode, ["AGENTMEMORY_TEAM_EXPORT_BLOCKED: team export requires explicit allowTeamExport flag."]);
  }

  const collected = await collectExportableStablePages(root);
  const pages = collected.pages;
  const warnings = [...collected.warnings];
  const payloads = pages.map(pageToExportPayload);

  if (options.dryRun) {
    return {
      ok: true,
      mode: options.mode,
      pages: collected.scanned,
      payloads,
      exported: 0,
      already_present: 0,
      skipped: payloads.length,
      errors: [],
      warnings,
      summary: exportSummary({
        pages: collected.scanned,
        payloads: payloads.length,
        exported: 0,
        alreadyPresent: 0,
        skipped: payloads.length,
      }),
    };
  }

  const errors: string[] = [];
  const source = await findAgentMemorySource(root, options.sourceName);
  if (!source) {
    return {
      ok: false,
      mode: options.mode,
      pages: collected.scanned,
      payloads,
      exported: 0,
      already_present: 0,
      skipped: payloads.length,
      errors: ["AGENTMEMORY_NO_SOURCE"],
      warnings,
      summary: exportSummary({
        pages: collected.scanned,
        payloads: payloads.length,
        exported: 0,
        alreadyPresent: 0,
        skipped: payloads.length,
      }),
    };
  }

  let client: AgentMemoryClient;
  try {
    client = createClient(source, options);
  } catch (error) {
    return {
      ok: false,
      mode: options.mode,
      pages: collected.scanned,
      payloads,
      exported: 0,
      already_present: 0,
      skipped: payloads.length,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings,
      summary: exportSummary({
        pages: collected.scanned,
        payloads: payloads.length,
        exported: 0,
        alreadyPresent: 0,
        skipped: payloads.length,
      }),
    };
  }

  let exported = 0;
  let alreadyPresent = 0;
  for (const exportPayload of payloads) {
    const existing = await client.smartSearch(exportPayload.provenanceHash, 5);
    if (existing.ok && (existing.hits ?? []).some((hit) => hitContainsProvenanceHash(hit, exportPayload.provenanceHash))) {
      alreadyPresent += 1;
      continue;
    }
    if (!existing.ok) {
      warnings.push(`${exportPayload.pagePath}: agentmemory_idempotency_check_failed:${existing.error ?? "unknown"}`);
    }
    const result = await client.remember(exportPayload.payload);
    if (result.ok) {
      exported += 1;
    } else {
      errors.push(`${exportPayload.pagePath}: ${result.error ?? "agentmemory_remember_failed"}`);
    }
  }

  return {
    ok: errors.length === 0,
    mode: options.mode,
    pages: collected.scanned,
    payloads,
    exported,
    already_present: alreadyPresent,
    skipped: payloads.length - exported,
    errors,
    warnings,
    summary: exportSummary({
      pages: collected.scanned,
      payloads: payloads.length,
      exported,
      alreadyPresent,
      skipped: payloads.length - exported,
    }),
  };
}
