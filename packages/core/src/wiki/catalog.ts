import { makeId, computeHash } from "../protocol/id.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { collectWikiPages } from "./render-site.js";
import type { WikiSitePage } from "./site-model.js";
import {
  CatalogEntrySchema,
  KnowledgeCatalogSchema,
  type CatalogEntry,
  type KnowledgeCatalog,
} from "../protocol/schemas.js";

interface CatalogOptions {
  now?: string;
}

function stableCatalogTimestamp(pages: WikiSitePage[]): string {
  const observed = pages
    .map((page) => page.updated_at)
    .filter((value): value is string => Boolean(value))
    .sort();
  return observed.at(-1) ?? "1970-01-01T00:00:00.000Z";
}

function toCatalogEntry(page: WikiSitePage): CatalogEntry {
  const sourceRefs = page.provenance_refs?.map((r) => r.uri).filter((u): u is string => Boolean(u)) ?? [];
  const sourceHashes = page.provenance_refs?.map((r) => r.hash).filter((h): h is string => Boolean(h)) ?? [];
  const relatedSkills = page.page_kind === "skill"
    ? [page.path]
    : page.body_text
      ? Array.from(page.body_text.matchAll(/skills\/[^/\s]+\/[^/\s]+\/SKILL\.md/g)).map((m) => m[0])
      : [];

  return CatalogEntrySchema.parse({
    page_id: page.id,
    page_path: page.path,
    title: page.title,
    scope: page.scope,
    layer: undefined,
    page_kind: page.page_kind,
    maturity: page.maturity,
    related_skills: relatedSkills,
    source_refs: sourceRefs,
    source_hashes: sourceHashes,
    last_observed: page.updated_at,
    last_validated: page.updated_at,
  });
}

function groupBy<K extends string>(entries: CatalogEntry[], key: (e: CatalogEntry) => K | undefined): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const entry of entries) {
    const k = key(entry) ?? "unknown";
    if (!result[k]) result[k] = [];
    result[k].push(entry.page_id);
  }
  return result;
}

export function buildKnowledgeCatalog(pages: WikiSitePage[], options?: CatalogOptions): KnowledgeCatalog {
  const now = options?.now ?? stableCatalogTimestamp(pages);
  const entries = pages.map(toCatalogEntry);

  return KnowledgeCatalogSchema.parse({
    id: makeId("catalog", computeHash(JSON.stringify({
      entries: entries
        .map((entry) => ({
          page_id: entry.page_id,
          page_path: entry.page_path,
          source_hashes: entry.source_hashes,
          last_observed: entry.last_observed,
        }))
        .sort((a, b) => a.page_id.localeCompare(b.page_id)),
      now,
    }))),
    protocol_version: PROTOCOL_VERSION,
    type: "knowledge_catalog",
    entries,
    grouped_by_scope: groupBy(entries, (e) => e.scope),
    grouped_by_layer: groupBy(entries, (e) => e.layer),
    grouped_by_type: groupBy(entries, (e) => e.page_kind),
    grouped_by_maturity: groupBy(entries, (e) => e.maturity),
    changed_stable_knowledge: false,
    warnings: [],
    created_at: now,
  });
}

export async function generateKnowledgeCatalog(root: string, options?: CatalogOptions): Promise<KnowledgeCatalog> {
  const pages = await collectWikiPages(root);
  return buildKnowledgeCatalog(pages, options);
}
