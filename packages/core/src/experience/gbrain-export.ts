import { computeHash } from "../protocol/id.js";
import { collectWikiPages } from "../wiki/render-site.js";
import type { WikiSitePage } from "../wiki/site-model.js";
import { GBrainClient, type GBrainCommandRunner } from "./gbrain-client.js";
import { gbrainExecutable, readGBrainConfig, type GBrainConfig } from "./gbrain-config.js";
import { GBrainRemoteClient, type FetchLike } from "./gbrain-remote.js";

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
  errors: string[];
  warnings: string[];
  summary: {
    pages_scanned: number;
    payloads_generated: number;
    exported: number;
    skipped: number;
    idempotency: "provenance_hash";
  };
}

function exportSummary(input: { pages: number; payloads: number; exported: number; skipped: number }): ExportGBrainResult["summary"] {
  return {
    pages_scanned: input.pages,
    payloads_generated: input.payloads,
    exported: input.exported,
    skipped: input.skipped,
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
    errors,
    warnings,
    summary: exportSummary({ pages: 0, payloads: 0, exported: 0, skipped: 0 }),
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
  const exportablePages = options.mode === "team"
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
  const payloads = exportablePages.map(pageToPayload);

  if (options.dryRun) {
    return {
      ok: true,
      mode: options.mode,
      pages: pages.length,
      payloads,
      exported: 0,
      skipped: pages.length,
      errors: [],
      warnings,
      summary: exportSummary({ pages: pages.length, payloads: payloads.length, exported: 0, skipped: pages.length }),
    };
  }

  if (config?.mode === "remote") {
    const client = new GBrainRemoteClient(config, { fetch: options.fetchImpl });
    const errors: string[] = [];
    let exported = 0;
    for (const payload of payloads) {
      const result = await client.publishPage({
        slug: payload.slug,
        content: payload.content,
        title: payload.title,
        type: payload.type,
        sourceId,
      });
      if (result.ok) {
        exported += 1;
      } else {
        errors.push(`${payload.pagePath}: ${result.error ?? "gbrain_remote_publish_failed"}`);
      }
    }

    return {
      ok: errors.length === 0,
      mode: options.mode,
      pages: pages.length,
      payloads,
      exported,
      skipped: pages.length - exported,
      errors,
      warnings,
      summary: exportSummary({ pages: pages.length, payloads: payloads.length, exported, skipped: pages.length - exported }),
    };
  }

  const client = new GBrainClient({
    executable: options.executable ?? (config ? gbrainExecutable(config) : undefined),
    timeoutMs: config?.mode === "local" ? config.timeout_ms : undefined,
    runCommand: options.runCommand,
  });
  const errors: string[] = [];
  let exported = 0;
  for (const payload of payloads) {
    const result = await client.capture(payload.content, { slug: payload.slug, type: payload.type, sourceId });
    if (result.ok) {
      exported += 1;
    } else {
      errors.push(`${payload.pagePath}: ${result.error ?? "gbrain_capture_failed"}`);
    }
  }

  return {
    ok: errors.length === 0,
    mode: options.mode,
    pages: pages.length,
    payloads,
    exported,
    skipped: pages.length - exported,
    errors,
    warnings,
    summary: exportSummary({ pages: pages.length, payloads: payloads.length, exported, skipped: pages.length - exported }),
  };
}
