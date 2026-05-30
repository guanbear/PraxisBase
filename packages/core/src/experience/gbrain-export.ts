import { computeHash } from "../protocol/id.js";
import { collectWikiPages } from "../wiki/render-site.js";
import { buildKnowledgeCatalog } from "../wiki/catalog.js";
import type { WikiSitePage } from "../wiki/site-model.js";
import { GBrainClient, type GBrainCommandRunner } from "./gbrain-client.js";
import { gbrainExecutable, readGBrainConfig, type GBrainConfig } from "./gbrain-config.js";
import { GBrainRemoteClient, type FetchLike } from "./gbrain-remote.js";
import { stableOutputLeakReasons } from "./stable-output-safety.js";

const MAX_CAPTURE_CONTENT_CHARS = 4000;

export interface GBrainExportPayload {
  pagePath: string;
  slug: string;
  type: string;
  title: string;
  content: string;
  provenanceHash: string;
  idempotencyKey: string;
}

export interface ExportGBrainOptions {
  mode: "personal" | "team";
  dryRun?: boolean;
  allowTeamExport?: boolean;
  sourceId?: string;
  executable?: string;
  runCommand?: GBrainCommandRunner;
  config?: GBrainConfig | null;
  fetchImpl?: FetchLike;
}

export interface ExportGBrainResult {
  ok: boolean;
  mode: "personal" | "team";
  pages: number;
  payloads: GBrainExportPayload[];
  exported: number;
  skipped: number;
  skills_exported: number;
  catalog_exported: number;
  errors: string[];
  warnings: string[];
  summary: {
    pages_scanned: number;
    payloads_generated: number;
    exported: number;
    skipped: number;
    skills_exported: number;
    catalog_exported: number;
    idempotency: "provenance_hash";
  };
}

function exportSummary(input: { pages: number; payloads: number; exported: number; skipped: number; skillsExported: number; catalogExported: number }): ExportGBrainResult["summary"] {
  return {
    pages_scanned: input.pages,
    payloads_generated: input.payloads,
    exported: input.exported,
    skipped: input.skipped,
    skills_exported: input.skillsExported,
    catalog_exported: input.catalogExported,
    idempotency: "provenance_hash",
  };
}

function emptyResult(mode: "personal" | "team", errors: string[] = [], warnings: string[] = []): ExportGBrainResult {
  return {
    ok: errors.length === 0,
    mode,
    pages: 0,
    payloads: [],
    exported: 0,
    skipped: 0,
    skills_exported: 0,
    catalog_exported: 0,
    errors,
    warnings,
    summary: exportSummary({ pages: 0, payloads: 0, exported: 0, skipped: 0, skillsExported: 0, catalogExported: 0 }),
  };
}

function slugForPage(page: WikiSitePage): string {
  return `praxisbase/${page.path.replace(/\.md$/i, "").replace(/[^a-zA-Z0-9/_-]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function compactContent(page: WikiSitePage, provenanceHash: string): string {
  const body = page.body_markdown ?? page.body_text;
  const sourceHashes = Array.from(new Set([
    provenanceHash,
    ...page.provenance_refs?.map((ref) => ref.hash).filter((hash): hash is string => Boolean(hash)) ?? [],
  ])).sort();
  const metadata = [
    "generated_by: praxisbase",
    `praxisbase_kind: ${page.page_kind ?? "note"}`,
    `praxisbase_path: ${page.path}`,
    "promotion_id: unavailable",
    "review_id: unavailable",
    `scope: ${page.scope ?? "project"}`,
    `maturity: ${page.maturity ?? "draft"}`,
    "source_hashes:",
    ...sourceHashes.map((hash) => `  - ${hash}`),
  ].join("\n");
  const provenance = [
    "",
    "---",
    "PraxisBase provenance:",
    metadata,
    `- path: ${page.path}`,
    `- hash: ${provenanceHash}`,
    page.source_ids.length > 0 ? `- source_ids: ${page.source_ids.join(", ")}` : undefined,
  ].filter((line): line is string => Boolean(line)).join("\n");
  const budget = Math.max(200, MAX_CAPTURE_CONTENT_CHARS - provenance.length - 2);
  const compactBody = body.length > budget ? `${body.slice(0, budget - 16).trimEnd()}\n[truncated]` : body;
  return `${compactBody}\n${provenance}`;
}

function compactSkillContent(page: WikiSitePage, provenanceHash: string): string {
  const body = page.body_markdown ?? page.body_text;
  const triggerSection = extractSection(body, "When To Use");
  const procedureSection = extractSection(body, "Procedure");
  const verificationSection = extractSection(body, "Verification");
  const pitfallsSection = extractSection(body, "Pitfalls");

  const sourceHashes = Array.from(new Set([
    provenanceHash,
    ...page.provenance_refs?.map((ref) => ref.hash).filter((hash): hash is string => Boolean(hash)) ?? [],
  ])).sort();

  const parts = [
    `skill: ${page.title}`,
    `path: ${page.path}`,
    `scope: ${page.scope ?? "project"}`,
    `maturity: ${page.maturity ?? "draft"}`,
    "",
    triggerSection ? `## Trigger\n${triggerSection}` : "",
    procedureSection ? `## Procedure\n${procedureSection}` : "",
    verificationSection ? `## Verification\n${verificationSection}` : "",
    pitfallsSection ? `## Pitfalls\n${pitfallsSection}` : "",
    "",
    "## Provenance",
    ...sourceHashes.map((h) => `- ${h}`),
  ].filter(Boolean);

  const result = parts.join("\n");
  return result.length > MAX_CAPTURE_CONTENT_CHARS
    ? `${result.slice(0, MAX_CAPTURE_CONTENT_CHARS - 16).trimEnd()}\n[truncated]`
    : result;
}

function extractSection(body: string, heading: string): string {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${heading}\\s*$`, "i").test(line));
  if (start < 0) return "";
  const collected: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) break;
    collected.push(lines[i]);
  }
  return collected.join("\n").trim();
}

function catalogPayload(catalogJson: string, catalogId: string): GBrainExportPayload {
  const provenanceHash = computeHash(catalogJson);
  return {
    pagePath: ".praxisbase/catalog/catalog.json",
    slug: `praxisbase/catalog/${catalogId}`,
    type: "knowledge_catalog",
    title: "PraxisBase Knowledge Catalog",
    content: catalogJson,
    provenanceHash,
    idempotencyKey: provenanceHash,
  };
}

function pageToPayload(page: WikiSitePage): GBrainExportPayload {
  const provenanceHash = computeHash(JSON.stringify({
    path: page.path,
    source_ids: page.source_ids,
    title: page.title,
    body: page.body_markdown ?? page.body_text,
  }));
  return {
    pagePath: page.path,
    slug: slugForPage(page),
    type: page.page_kind ?? "note",
    title: page.title,
    content: compactContent(page, provenanceHash),
    provenanceHash,
    idempotencyKey: provenanceHash,
  };
}

function isTeamSafePage(page: WikiSitePage): boolean {
  return page.scope === "team" || page.scope === "org";
}

function isExportSafePage(page: WikiSitePage, warnings: string[]): boolean {
  const content = page.body_markdown ?? page.body_text;
  const reasons = stableOutputLeakReasons(content);
  if (reasons.length === 0) return true;
  warnings.push(`GBRAIN_EXPORT_SKIPPED_PRIVATE: ${page.path} (${reasons.join(",")})`);
  return false;
}

async function resolveExportConfig(root: string, options: ExportGBrainOptions): Promise<GBrainConfig | null> {
  if (options.config !== undefined) return options.config;
  return readGBrainConfig(root);
}

export async function exportGBrain(root: string, options: ExportGBrainOptions): Promise<ExportGBrainResult> {
  if (options.mode === "team" && options.allowTeamExport !== true) {
    return emptyResult(options.mode, ["GBRAIN_TEAM_EXPORT_BLOCKED: team export requires explicit allowTeamExport flag."]);
  }

  const config = await resolveExportConfig(root, options);
  const sourceId = options.sourceId ?? config?.source_id;
  const pages = await collectWikiPages(root);
  const warnings: string[] = [];

  const scopeFilteredPages = options.mode === "team"
    ? pages.filter((page) => {
      if (!isTeamSafePage(page)) {
        warnings.push(page.scope === "personal"
          ? `GBRAIN_TEAM_EXPORT_SKIPPED_PERSONAL: ${page.path}`
          : `GBRAIN_TEAM_EXPORT_SKIPPED_NOT_TEAM_SAFE: ${page.path}`);
        return false;
      }
      return true;
    })
    : pages;
  const exportablePages = scopeFilteredPages.filter((page) => isExportSafePage(page, warnings));

  const wikiPayloads = exportablePages
    .filter((page) => page.page_kind !== "skill")
    .map(pageToPayload);

  const skillPages = exportablePages.filter((page) => page.page_kind === "skill");
  const skillPayloads = skillPages.map((page) => {
    const provenanceHash = computeHash(JSON.stringify({
      path: page.path,
      source_ids: page.source_ids,
      title: page.title,
      body: page.body_markdown ?? page.body_text,
    }));
    return {
      pagePath: page.path,
      slug: slugForPage(page),
      type: "skill",
      title: page.title,
      content: compactSkillContent(page, provenanceHash),
      provenanceHash,
      idempotencyKey: provenanceHash,
    };
  });

  const catalog = buildKnowledgeCatalog(exportablePages);
  const catalogJson = JSON.stringify(catalog);
  const catPayload = catalogPayload(catalogJson, catalog.id);

  const payloads = [...wikiPayloads, ...skillPayloads, catPayload];

  if (options.dryRun) {
    return {
      ok: true,
      mode: options.mode,
      pages: pages.length,
      payloads,
      exported: 0,
      skipped: pages.length,
      skills_exported: skillPayloads.length,
      catalog_exported: 1,
      errors: [],
      warnings,
      summary: exportSummary({
        pages: pages.length,
        payloads: payloads.length,
        exported: 0,
        skipped: pages.length,
        skillsExported: skillPayloads.length,
        catalogExported: 1,
      }),
    };
  }

  const publishPayloads = async (payloadsToPublish: GBrainExportPayload[]): Promise<{ exported: number; errors: string[] }> => {
    const errors: string[] = [];
    let exported = 0;

    if (config?.mode === "remote") {
      const client = new GBrainRemoteClient(config, { fetch: options.fetchImpl });
      for (const payload of payloadsToPublish) {
        const result = await client.publishPage({
          slug: payload.slug,
          content: payload.content,
          title: payload.title,
          type: payload.type,
          sourceId,
        });
        if (result.ok) exported++;
        else errors.push(`${payload.pagePath}: ${result.error ?? "gbrain_remote_publish_failed"}`);
      }
    } else {
      const client = new GBrainClient({
        executable: options.executable ?? (config ? gbrainExecutable(config) : undefined),
        timeoutMs: config?.mode === "local" ? config.timeout_ms : undefined,
        runCommand: options.runCommand,
      });
      for (const payload of payloadsToPublish) {
        const result = await client.capture(payload.content, { slug: payload.slug, type: payload.type, sourceId });
        if (result.ok) exported++;
        else errors.push(`${payload.pagePath}: ${result.error ?? "gbrain_capture_failed"}`);
      }
    }

    return { exported, errors };
  };

  const { exported, errors } = await publishPayloads(payloads);

  return {
    ok: errors.length === 0,
    mode: options.mode,
    pages: pages.length,
    payloads,
    exported,
    skipped: payloads.length - exported,
    skills_exported: skillPayloads.length,
    catalog_exported: 1,
    errors,
    warnings,
    summary: exportSummary({
      pages: pages.length,
      payloads: payloads.length,
      exported,
      skipped: payloads.length - exported,
      skillsExported: skillPayloads.length,
      catalogExported: 1,
    }),
  };
}
