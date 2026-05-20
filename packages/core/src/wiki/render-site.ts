import { stat } from "node:fs/promises";
import { posix } from "node:path";
import matter from "gray-matter";
import { escapeHtml, escapeJsonForHtml } from "../build/html.js";
import { readText, writeJson, writeText } from "../store/file-store.js";
import { collectWikiSources } from "./collect.js";
import { makeWikiSlug, type WikiSource } from "./model.js";
import { buildWikiGraph, type WikiGraph, type WikiPage } from "./resolver.js";

export interface BuildWikiSiteResult {
  outputs: string[];
  pages: number;
  health: {
    sources: number;
    pages: number;
    broken_links: number;
    duplicates: number;
    orphans: number;
  };
}

interface WikiSitePage extends WikiPage {
  path: string;
  source_ids: string[];
  summary: string;
  body_text: string;
  signatures: string[];
  confidence?: number;
  updated_at?: string;
}

interface SourceMetadata {
  id?: string;
  kind?: string;
  scope?: string;
  maturity?: string;
  confidence?: number;
  updated_at?: string;
  signatures: string[];
}

const SITE_OUTPUTS = [
  "dist/index.html",
  "dist/search-index.json",
  "dist/graph.json",
  "dist/graph.jsonld",
  "dist/llms.txt",
  "dist/llms-full.txt",
  "dist/ai-readme.md",
  "dist/sitemap.xml",
  "dist/robots.txt",
  "dist/style.css",
  "dist/site.js",
];

function isStableSource(source: WikiSource): boolean {
  return Boolean(source.path) && (source.kind === "stable_kb" || source.kind === "skill");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

async function sourceMetadata(root: string, source: WikiSource): Promise<SourceMetadata> {
  if (!source.path?.endsWith(".md")) {
    return { signatures: [] };
  }

  try {
    const raw = await readText(root, source.path);
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    return {
      id: stringValue(data.id),
      kind: stringValue(data.knowledge_type) ?? stringValue(data.type),
      scope: stringValue(data.scope),
      maturity: stringValue(data.maturity),
      confidence: numberValue(data.confidence),
      updated_at: stringValue(data.updated_at),
      signatures: stringArrayValue(data.signatures),
    };
  } catch {
    return { signatures: [] };
  }
}

function pageKind(source: WikiSource, metadata: SourceMetadata): string {
  if (metadata.kind) return metadata.kind;
  if (source.kind === "skill") return "skill";
  if (source.path?.startsWith("kb/known-fixes/")) return "known_fix";
  if (source.path?.startsWith("kb/pitfalls/")) return "pitfall";
  return source.knowledge_type ?? "note";
}

export async function collectWikiPages(root: string): Promise<WikiSitePage[]> {
  const sources = (await collectWikiSources(root)).filter(isStableSource);
  const pages: WikiSitePage[] = [];

  for (const source of sources) {
    const metadata = await sourceMetadata(root, source);
    const title = source.title;
    const slug = makeWikiSlug(metadata.id ?? title);
    const body = source.body ?? source.summary;
    pages.push({
      id: metadata.id ?? slug,
      slug,
      title,
      page_kind: pageKind(source, metadata),
      scope: metadata.scope ?? source.scope,
      maturity: metadata.maturity ?? source.maturity ?? "draft",
      lifecycle: "reviewed",
      source_ids: [source.id, source.source_hash].filter(Boolean).sort(),
      claims: [],
      outbound_links: [],
      body_markdown: body,
      path: source.path ?? source.source_ref ?? source.id,
      summary: source.summary,
      body_text: body,
      signatures: metadata.signatures,
      confidence: metadata.confidence,
      updated_at: metadata.updated_at ?? source.updated_at,
    });
  }

  return pages.sort((a, b) => a.slug.localeCompare(b.slug) || a.path.localeCompare(b.path));
}

function relatedPages(page: WikiSitePage, pages: WikiSitePage[], graph: WikiGraph): WikiSitePage[] {
  const ids = new Set<string>();
  for (const link of graph.links) {
    if (link.from === page.id) ids.add(link.to);
    if (link.to === page.id) ids.add(link.from);
  }
  return pages
    .filter((candidate) => ids.has(candidate.id) && candidate.id !== page.id)
    .sort((a, b) => a.title.localeCompare(b.title));
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | undefined;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    html.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = (): void => {
    if (list.length === 0) return;
    html.push(`<ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
    list = [];
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (code) {
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = undefined;
      } else {
        flushParagraph();
        flushList();
        code = [];
      }
      continue;
    }

    if (code) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${escapeHtml(heading[2].trim())}</h${level}>`);
      continue;
    }

    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  if (code) html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  flushParagraph();
  flushList();
  return html.join("\n");
}

function pageHref(page: WikiSitePage): string {
  return `pages/${page.slug}.html`;
}

function renderLayout(input: { title: string; body: string; graph?: WikiGraph; pages: WikiSitePage[] }): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title)}</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/index.html">PraxisBase Wiki</a>
    <div class="search">
      <input id="searchInput" type="search" placeholder="Search knowledge" autocomplete="off">
      <div id="searchResults" class="search-results" hidden></div>
    </div>
  </header>
  ${input.body}
  <script>window.__WIKI_GRAPH__=${escapeJsonForHtml(input.graph ?? null)};</script>
  <script src="/site.js"></script>
</body>
</html>`;
}

function renderDashboard(pages: WikiSitePage[], graph: WikiGraph, bundleStatus: string): string {
  const signatures = pages.flatMap((page) => page.signatures).slice(0, 8);
  const recent = [...pages]
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .slice(0, 6);
  const cards = [
    ["Sources", String(new Set(pages.flatMap((page) => page.source_ids)).size)],
    ["Pages", String(pages.length)],
    ["Broken links", String(graph.broken_links.length)],
    ["Duplicates", String(graph.duplicates.length)],
    ["Orphans", String(graph.orphans.length)],
    ["Bundle status", bundleStatus],
  ];

  return renderLayout({
    title: "PraxisBase Knowledge Health",
    pages,
    graph,
    body: `<main class="dashboard">
  <section class="hero">
    <div>
      <p class="eyebrow">Agent-ready knowledge base</p>
      <h1>Knowledge Health</h1>
      <p class="lede">Reviewed fixes, skills, provenance, and graph context for repair workflows.</p>
    </div>
  </section>
  <section class="metrics">
    ${cards.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("\n")}
  </section>
  <section class="dashboard-grid">
    <div>
      <h2>Recent Sources</h2>
      <ol class="link-list">
        ${recent.map((page) => `<li><a href="${escapeHtml(pageHref(page))}">${escapeHtml(page.title)}</a><span>${escapeHtml(page.page_kind ?? "note")}</span></li>`).join("\n")}
      </ol>
    </div>
    <div>
      <h2>Top Signatures</h2>
      <ol class="link-list">
        ${signatures.length > 0 ? signatures.map((signature) => `<li><code>${escapeHtml(signature)}</code></li>`).join("\n") : "<li>No signatures indexed</li>"}
      </ol>
    </div>
  </section>
</main>`,
  });
}

function renderPage(page: WikiSitePage, pages: WikiSitePage[], graph: WikiGraph): string {
  const related = relatedPages(page, pages, graph);
  const nav = pages.map((item) => `<a href="/${escapeHtml(pageHref(item))}"${item.id === page.id ? " aria-current=\"page\"" : ""}>${escapeHtml(item.title)}</a>`).join("\n");
  const relatedHtml = related.length > 0
    ? related.map((item) => `<li><a href="/${escapeHtml(pageHref(item))}">${escapeHtml(item.title)}</a></li>`).join("\n")
    : "<li>No related pages yet</li>";

  return renderLayout({
    title: page.title,
    pages,
    graph,
    body: `<main class="page-shell">
  <nav class="side-nav" aria-label="Knowledge pages">${nav}</nav>
  <article class="content">
    ${markdownToHtml(page.body_markdown ?? "")}
  </article>
  <aside class="meta-rail">
    <section>
      <h2>Provenance</h2>
      <ul>${page.source_ids.map((sourceId) => `<li><code>${escapeHtml(sourceId)}</code></li>`).join("")}</ul>
    </section>
    <section>
      <h2>Related</h2>
      <ul>${relatedHtml}</ul>
    </section>
    <section>
      <h2>Metadata</h2>
      <dl>
        <dt>Scope</dt><dd>${escapeHtml(page.scope ?? "project")}</dd>
        <dt>Maturity</dt><dd>${escapeHtml(page.maturity ?? "draft")}</dd>
        <dt>Confidence</dt><dd>${page.confidence === undefined ? "n/a" : escapeHtml(page.confidence.toFixed(2))}</dd>
      </dl>
    </section>
  </aside>
</main>`,
  });
}

function graphJsonLd(pages: WikiSitePage[], graph: WikiGraph): unknown {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: pages.map((page, index) => ({
      "@type": "TechArticle",
      position: index + 1,
      name: page.title,
      url: `pages/${page.slug}.html`,
      about: graph.links.filter((link) => link.from === page.id).map((link) => link.to),
    })),
  };
}

function renderLlms(pages: WikiSitePage[], full: boolean): string {
  const lines = ["# PraxisBase Wiki", "", "Agent-readable knowledge exports.", ""];
  for (const page of pages) {
    lines.push(`## ${page.title}`, `Path: ${page.path}`, `Kind: ${page.page_kind ?? "note"}`, "");
    lines.push(full ? page.body_text : page.summary);
    lines.push("");
  }
  return lines.join("\n");
}

function renderAiReadme(result: { pages: WikiSitePage[]; graph: WikiGraph }): string {
  return [
    "# PraxisBase AI Readme",
    "",
    "- Start at `dist/index.html` for health and search.",
    "- Use `dist/search-index.json` for local retrieval.",
    "- Use `dist/graph.json` or `dist/graph.jsonld` for backlinks and related context.",
    `- Indexed pages: ${result.pages.length}.`,
    `- Broken wikilinks: ${result.graph.broken_links.length}.`,
    "",
  ].join("\n");
}

async function exists(root: string, path: string): Promise<boolean> {
  try {
    await stat(posix.join(root, path));
    return true;
  } catch {
    return false;
  }
}

export async function buildWikiSite(root: string): Promise<BuildWikiSiteResult> {
  const pages = await collectWikiPages(root);
  const graph = buildWikiGraph(pages);
  const outputs = [...SITE_OUTPUTS];
  const bundleStatus = await exists(root, "dist/repair-bundles/manifest.json") ? "ready" : "not built";

  await writeText(root, "dist/index.html", renderDashboard(pages, graph, bundleStatus));
  await writeJson(root, "dist/search-index.json", {
    protocol_version: "0.1",
    documents: pages.map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      path: page.path,
      kind: page.page_kind,
      text: `${page.title}\n${page.summary}\n${page.body_text}`,
    })),
  });
  await writeJson(root, "dist/graph.json", graph);
  await writeJson(root, "dist/graph.jsonld", graphJsonLd(pages, graph));
  await writeText(root, "dist/llms.txt", renderLlms(pages, false));
  await writeText(root, "dist/llms-full.txt", renderLlms(pages, true));
  await writeText(root, "dist/ai-readme.md", renderAiReadme({ pages, graph }));
  await writeText(root, "dist/sitemap.xml", renderSitemap(pages));
  await writeText(root, "dist/robots.txt", "User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n");
  await writeText(root, "dist/style.css", SITE_CSS);
  await writeText(root, "dist/site.js", SITE_JS);

  for (const page of pages) {
    const base = `dist/pages/${page.slug}`;
    await writeText(root, `${base}.html`, renderPage(page, pages, graph));
    await writeText(root, `${base}.txt`, `${page.title}\n\n${page.body_text}\n`);
    await writeJson(root, `${base}.json`, {
      id: page.id,
      slug: page.slug,
      title: page.title,
      path: page.path,
      kind: page.page_kind,
      scope: page.scope,
      maturity: page.maturity,
      source_ids: page.source_ids,
      signatures: page.signatures,
      body: page.body_text,
    });
    outputs.push(`${base}.html`, `${base}.txt`, `${base}.json`);
  }

  outputs.sort();
  return {
    outputs,
    pages: pages.length,
    health: {
      sources: new Set(pages.flatMap((page) => page.source_ids)).size,
      pages: pages.length,
      broken_links: graph.broken_links.length,
      duplicates: graph.duplicates.length,
      orphans: graph.orphans.length,
    },
  };
}

function renderSitemap(pages: WikiSitePage[]): string {
  const urls = ["index.html", ...pages.map(pageHref)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>/${escapeHtml(url)}</loc></url>`).join("\n")}
</urlset>
`;
}

const SITE_CSS = `:root {
  color-scheme: light;
  --ink: #17211b;
  --muted: #5f6d66;
  --line: #d8e0da;
  --panel: #f7f8f5;
  --accent: #146c5c;
  --accent-2: #8b2f58;
  --warn: #9a5a00;
}
* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); background: #fbfcf8; font: 15px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.topbar { position: sticky; top: 0; z-index: 10; display: grid; grid-template-columns: 220px minmax(220px, 560px); gap: 1rem; align-items: center; padding: .75rem 1rem; border-bottom: 1px solid var(--line); background: rgba(251, 252, 248, .96); }
.brand { color: var(--ink); font-weight: 750; }
.search { position: relative; }
.search input { width: 100%; height: 38px; border: 1px solid var(--line); border-radius: 6px; padding: 0 .75rem; background: white; color: var(--ink); }
.search-results { position: absolute; top: 42px; left: 0; right: 0; border: 1px solid var(--line); border-radius: 6px; background: white; box-shadow: 0 12px 28px rgba(23, 33, 27, .12); overflow: hidden; }
.search-results a { display: block; padding: .7rem .8rem; border-bottom: 1px solid var(--line); }
.dashboard { max-width: 1180px; margin: 0 auto; padding: 2rem 1rem 4rem; }
.hero { min-height: 240px; display: flex; align-items: end; padding: 2rem 0; border-bottom: 1px solid var(--line); }
.eyebrow { margin: 0 0 .5rem; color: var(--accent-2); font-weight: 700; text-transform: uppercase; font-size: .78rem; }
h1 { margin: 0; font-size: clamp(2.2rem, 6vw, 5.2rem); line-height: .96; letter-spacing: 0; }
.lede { max-width: 62ch; color: var(--muted); font-size: 1.05rem; }
.metrics { display: grid; grid-template-columns: repeat(6, minmax(120px, 1fr)); gap: .75rem; margin: 1.25rem 0; }
.metrics article { border: 1px solid var(--line); border-radius: 8px; padding: .85rem; background: white; }
.metrics span { display: block; color: var(--muted); font-size: .78rem; }
.metrics strong { display: block; margin-top: .3rem; font-size: 1.45rem; }
.dashboard-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
.dashboard-grid > div { border-top: 3px solid var(--accent); padding-top: .8rem; }
.link-list { list-style: none; margin: 0; padding: 0; }
.link-list li { display: flex; justify-content: space-between; gap: 1rem; padding: .65rem 0; border-bottom: 1px solid var(--line); }
.link-list span, .link-list code { color: var(--muted); }
.page-shell { display: grid; grid-template-columns: 230px minmax(0, 760px) 260px; gap: 1.25rem; max-width: 1280px; margin: 0 auto; padding: 1.25rem 1rem 4rem; }
.side-nav, .meta-rail { position: sticky; top: 68px; align-self: start; max-height: calc(100vh - 88px); overflow: auto; }
.side-nav a { display: block; padding: .55rem .65rem; border-radius: 6px; color: var(--ink); }
.side-nav a[aria-current="page"] { background: #e8f2ed; color: var(--accent); font-weight: 700; }
.content { background: white; border: 1px solid var(--line); border-radius: 8px; padding: 1.25rem; }
.content h1 { font-size: 2rem; line-height: 1.1; margin-bottom: 1rem; }
.content h2 { margin-top: 1.8rem; border-top: 1px solid var(--line); padding-top: 1rem; }
.content pre { overflow: auto; background: #18231d; color: #f2f7f2; border-radius: 6px; padding: 1rem; }
.meta-rail section { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: .9rem; margin-bottom: .85rem; }
.meta-rail h2 { margin: 0 0 .55rem; font-size: .92rem; }
.meta-rail ul { margin: 0; padding-left: 1.1rem; }
.meta-rail code { overflow-wrap: anywhere; }
.meta-rail dl { display: grid; grid-template-columns: 90px 1fr; gap: .35rem .6rem; margin: 0; }
.meta-rail dt { color: var(--muted); }
@media (max-width: 900px) {
  .topbar { grid-template-columns: 1fr; }
  .metrics, .dashboard-grid, .page-shell { grid-template-columns: 1fr; }
  .side-nav, .meta-rail { position: static; max-height: none; }
}`;

const SITE_JS = `(() => {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResults");
  if (!input || !box) return;
  let docs = [];
  fetch("/search-index.json").then((res) => res.json()).then((data) => { docs = data.documents || []; }).catch(() => {});
  const render = () => {
    const query = input.value.trim().toLowerCase();
    if (!query) { box.hidden = true; box.innerHTML = ""; return; }
    const matches = docs.filter((doc) => [doc.title, doc.path, doc.text].join("\\n").toLowerCase().includes(query)).slice(0, 8);
    box.innerHTML = matches.map((doc) => \`<a href="/pages/\${doc.slug}.html"><strong>\${escapeText(doc.title)}</strong><br><small>\${escapeText(doc.path)}</small></a>\`).join("");
    box.hidden = matches.length === 0;
  };
  const escapeText = (value) => String(value).replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
  input.addEventListener("input", render);
  window.addEventListener("keydown", (event) => {
    if ((event.key === "/" && document.activeElement !== input) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
      event.preventDefault();
      input.focus();
    }
  });
})();`;
