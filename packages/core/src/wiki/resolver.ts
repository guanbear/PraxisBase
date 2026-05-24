import { makeWikiSlug } from "./model.js";

export interface WikiPage {
  id: string;
  slug: string;
  title: string;
  page_kind?: string;
  scope?: string;
  maturity?: string;
  lifecycle?: string;
  source_ids?: string[];
  claims?: unknown[];
  outbound_links?: string[];
  body_markdown?: string;
  path?: string;
}

export interface WikiGraphNode {
  id: string;
  slug: string;
  title: string;
  kind: string;
  scope: string;
  maturity: string;
  source_ids: string[];
}

export interface WikiGraphLink {
  from: string;
  to: string;
  type: "related" | "uses" | "depends_on" | "fixes" | "caused_by" | "verified_by" | "contradicts" | "supersedes" | "same_topic_as" | "source_overlap";
  weight: number;
  confidence?: number;
  source_refs?: string[];
}

export interface WikiGraph {
  protocol_version: "0.1";
  nodes: WikiGraphNode[];
  links: WikiGraphLink[];
  backlinks: Record<string, string[]>;
  broken_links: Array<{ from: string; target: string }>;
  orphans: string[];
  duplicates: Array<{
    field: "id" | "slug" | "title";
    value: string;
    page_ids: string[];
  }>;
}

function stripFencedCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "");
}

function stripInlineCode(text: string): string {
  return text.replace(/`[^`]*`/g, "");
}

function parseWikilinks(text: string): string[] {
  const slugs: string[] = [];
  const pattern = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    slugs.push(match[1].trim());
  }
  return slugs;
}

function addGraphLink(links: WikiGraphLink[], link: WikiGraphLink): void {
  if (links.some((existing) =>
    existing.from === link.from
    && existing.to === link.to
    && existing.type === link.type
  )) {
    return;
  }
  links.push(link);
}

function addAlias(index: Map<string, string | null>, key: string | undefined, pageId: string): void {
  const normalized = key?.trim().toLowerCase();
  if (!normalized) return;
  const existing = index.get(normalized);
  if (existing === undefined) {
    index.set(normalized, pageId);
  } else if (existing !== pageId) {
    index.set(normalized, null);
  }
}

function pathLeafAliases(path: string | undefined): string[] {
  if (!path) return [];
  const parts = path.replace(/\\/g, "/").split("/");
  const leaf = parts[parts.length - 1] ?? "";
  const withoutExtension = leaf === "SKILL.md" ? parts[parts.length - 2] ?? "" : leaf.replace(/\.md$/i, "");
  const slug = makeWikiSlug(withoutExtension);
  return slug.startsWith("wiki-") ? [slug, slug.slice(5)] : [slug];
}

export function resolveWikiLinks(
  pages: WikiPage[]
): Pick<WikiGraph, "links" | "broken_links"> {
  const targetIndex = new Map<string, string | null>();
  for (const page of pages) {
    addAlias(targetIndex, page.slug, page.id);
    addAlias(targetIndex, page.id, page.id);
    addAlias(targetIndex, page.title, page.id);
    addAlias(targetIndex, makeWikiSlug(page.title), page.id);
    for (const alias of pathLeafAliases(page.path)) {
      addAlias(targetIndex, alias, page.id);
    }
  }

  const links: WikiGraphLink[] = [];
  const brokenLinks: Array<{ from: string; target: string }> = [];

  for (const page of pages) {
    const body = page.body_markdown ?? "";
    const stripped = stripInlineCode(stripFencedCode(body));
    const wikilinkSlugs = parseWikilinks(stripped);

    const seen = new Set<string>();
    for (const slug of wikilinkSlugs) {
      if (seen.has(slug)) continue;
      seen.add(slug);

      const targetId = targetIndex.get(slug.toLowerCase());
      if (targetId !== undefined) {
        if (targetId !== null) {
          addGraphLink(links, {
            from: page.id,
            to: targetId,
            type: "related",
            weight: 1,
            confidence: 0.8,
          });
        } else {
          brokenLinks.push({ from: page.id, target: slug });
        }
      } else {
        brokenLinks.push({ from: page.id, target: slug });
      }
    }
  }

  return { links, broken_links: brokenLinks };
}

export function buildWikiGraph(pages: WikiPage[]): WikiGraph {
  const nodes: WikiGraphNode[] = pages.map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    kind: page.page_kind ?? "unknown",
    scope: page.scope ?? "project",
    maturity: page.maturity ?? "draft",
    source_ids: page.source_ids ?? [],
  }));

  const { links, broken_links } = resolveWikiLinks(pages);

  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const aSources = pages[i].source_ids ?? [];
      const bSources = new Set(pages[j].source_ids ?? []);
      const sharedSources = aSources.filter((s) => bSources.has(s)).sort();
      if (sharedSources.length > 0) {
        addGraphLink(links, {
          from: pages[i].id,
          to: pages[j].id,
          type: "source_overlap",
          weight: 0.5,
          confidence: 0.7,
          source_refs: sharedSources,
        });
        addGraphLink(links, {
          from: pages[j].id,
          to: pages[i].id,
          type: "source_overlap",
          weight: 0.5,
          confidence: 0.7,
          source_refs: sharedSources,
        });
      }
    }
  }

  links.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.type.localeCompare(b.type));

  const backlinks: Record<string, string[]> = {};
  for (const link of links) {
    if (!backlinks[link.to]) {
      backlinks[link.to] = [];
    }
    if (!backlinks[link.to]!.includes(link.from)) {
      backlinks[link.to]!.push(link.from);
    }
  }
  for (const key of Object.keys(backlinks)) {
    backlinks[key]!.sort();
  }

  const duplicates: Array<{
    field: "id" | "slug" | "title";
    value: string;
    page_ids: string[];
  }> = [];

  const idGroups = new Map<string, string[]>();
  const slugGroups = new Map<string, string[]>();
  const titleGroups = new Map<string, string[]>();

  for (const page of pages) {
    pushGroup(idGroups, page.id, page.id);
    pushGroup(slugGroups, page.slug, page.id);
    pushGroup(titleGroups, page.title.toLowerCase(), page.id);
  }

  for (const [value, pageIds] of idGroups) {
    if (pageIds.length > 1) {
      duplicates.push({ field: "id", value, page_ids: [...pageIds].sort() });
    }
  }
  for (const [value, pageIds] of slugGroups) {
    if (pageIds.length > 1) {
      duplicates.push({
        field: "slug",
        value,
        page_ids: [...pageIds].sort(),
      });
    }
  }
  for (const [value, pageIds] of titleGroups) {
    if (pageIds.length > 1) {
      duplicates.push({
        field: "title",
        value,
        page_ids: [...pageIds].sort(),
      });
    }
  }

  const orphans: string[] = [];
  if (pages.length > 1) {
    for (const page of pages) {
      const hasBacklinks = (backlinks[page.id]?.length ?? 0) > 0;
      const hasOutbound = links.some((l) => l.from === page.id);
      if (!hasBacklinks && !hasOutbound) {
        orphans.push(page.id);
      }
    }
    orphans.sort();
  }

  return {
    protocol_version: "0.1",
    nodes,
    links,
    backlinks,
    broken_links,
    orphans,
    duplicates,
  };
}

function pushGroup(
  map: Map<string, string[]>,
  key: string,
  value: string
): void {
  const arr = map.get(key);
  if (arr) {
    arr.push(value);
  } else {
    map.set(key, [value]);
  }
}
