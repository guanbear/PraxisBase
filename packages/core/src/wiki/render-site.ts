import { readdir, stat } from "node:fs/promises";
import { posix } from "node:path";
import matter from "gray-matter";
import { escapeHtml, escapeJsonForHtml } from "../build/html.js";
import { protocolPaths } from "../protocol/paths.js";
import { readJson, readText, writeJson, writeText } from "../store/file-store.js";
import { collectWikiSources } from "./collect.js";
import { inferWikiConfidence, inferWikiLifecycle, makeWikiSlug, type WikiSource } from "./model.js";
import { runWikiLint } from "./lint.js";
import { buildWikiQualityReport } from "./quality.js";
import { buildWikiGraphSlice } from "./graph-slices.js";
import { buildWikiGraph, type WikiGraph, type WikiPage } from "./resolver.js";
import { SITE_CSS, SITE_JS, SITE_OUTPUTS } from "./site-assets.js";
import { graphJsonLd, pageHref, renderSitemap } from "./site-html.js";
import type { BuildWikiSiteResult, WikiSitePage } from "./site-model.js";

interface SourceMetadata {
  id?: string;
  kind?: string;
  scope?: string;
  maturity?: string;
  confidence?: number;
  reference_count?: number;
  updated_at?: string;
  superseded_by?: string | null;
  signatures: string[];
  provenance_refs: Array<{ uri: string; hash?: string }>;
}

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

function provenanceRefsValue(value: unknown): Array<{ uri: string; hash?: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const uri = stringValue(record.uri);
    if (!uri) return [];
    return [{ uri, hash: stringValue(record.hash) }];
  });
}

async function sourceMetadata(root: string, source: WikiSource): Promise<SourceMetadata> {
  if (!source.path?.endsWith(".md")) {
    return { signatures: [], provenance_refs: [] };
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
      reference_count: numberValue(data.reference_count),
      updated_at: stringValue(data.updated_at),
      superseded_by: stringValue(data.superseded_by) ?? null,
      signatures: stringArrayValue(data.signatures),
      provenance_refs: provenanceRefsValue(data.sources),
    };
  } catch {
    return { signatures: [], provenance_refs: [] };
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
      lifecycle: inferWikiLifecycle({
        maturity: metadata.maturity ?? source.maturity,
        updated_at: metadata.updated_at ?? source.updated_at,
        superseded_by: metadata.superseded_by,
      }),
      source_ids: [source.id, source.source_hash].filter(Boolean).sort(),
      claims: [],
      outbound_links: [],
      body_markdown: body,
      path: source.path ?? source.source_ref ?? source.id,
      summary: source.summary,
      body_text: body,
      signatures: metadata.signatures,
      provenance_refs: metadata.provenance_refs,
      confidence: inferWikiConfidence({
        sourceCount: 1,
        maturity: metadata.maturity ?? source.maturity,
        referenceCount: metadata.reference_count,
        explicitConfidence: metadata.confidence,
      }),
      reference_count: metadata.reference_count,
      updated_at: metadata.updated_at ?? source.updated_at,
      superseded_by: metadata.superseded_by,
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

function renderLayout(input: { title: string; body: string; graph?: WikiGraph; pages: WikiSitePage[]; assetPrefix?: string }): string {
  const prefix = input.assetPrefix ?? "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title)}</title>
  <link rel="stylesheet" href="${escapeHtml(prefix)}style.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="${escapeHtml(prefix)}index.html">PraxisBase Wiki</a>
    <div class="search">
      <input id="searchInput" type="search" placeholder="Search knowledge" autocomplete="off">
      <div id="searchResults" class="search-results" hidden></div>
    </div>
    <nav class="topnav" aria-label="Wiki views">
      <a href="${escapeHtml(prefix)}graph.html">Graph</a>
      <a href="${escapeHtml(prefix)}issues.html">Issues</a>
    </nav>
  </header>
  ${input.body}
  <script>window.__WIKI_BASE__=${escapeJsonForHtml(prefix)};</script>
  <script>window.__WIKI_GRAPH__=${escapeJsonForHtml(input.graph ?? null)};</script>
  <script src="${escapeHtml(prefix)}site.js"></script>
</body>
</html>`;
}

function renderDailyUpdateSection(report: DailyReportSummary): string {
  const dateLabel = report.created_at.slice(0, 10);
  const dailyCards: [string, string][] = [
    ["Sources", String(report.source_count)],
    ["Imported", String(report.imported)],
    ["Rejected", String(report.rejected)],
    ["Human required", String(report.human_required)],
    ["Proposals", String(report.proposal_candidates)],
    ["Site pages", String(report.site_pages)],
  ];
  return `<section class="daily-update">
  <h2>Latest Daily Experience</h2>
  <p class="eyebrow">${escapeHtml(dateLabel)} &middot; ${escapeHtml(report.authority_mode)}</p>
  <div class="metrics">
    ${dailyCards.map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("\n")}
  </div>
</section>`;
}

interface ExperienceSummary {
  id: string;
  agent: string;
  kind: string;
  source_ref: string;
  summary: string;
  scope: string;
  created_at: string;
}

function renderExperienceSummaries(summaries: ExperienceSummary[]): string {
  if (summaries.length === 0) return "";
  return `<section class="experience-summaries">
  <h2>Latest Experience Summaries</h2>
  <ol class="experience-list">
    ${summaries.map((item) => `<li>
      <p>${escapeHtml(item.summary)}</p>
      <dl>
        <dt>Agent</dt><dd>${escapeHtml(item.agent)}</dd>
        <dt>Scope</dt><dd>${escapeHtml(item.scope)}</dd>
        <dt>Source</dt><dd><code>${escapeHtml(item.source_ref)}</code></dd>
      </dl>
    </li>`).join("\n")}
  </ol>
</section>`;
}

function renderDashboard(
  pages: WikiSitePage[],
  graph: WikiGraph,
  bundleStatus: string,
  stalePages: number,
  qualityFindings: number,
  dailyReport: DailyReportSummary | null,
  experienceSummaries: ExperienceSummary[]
): string {
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
    ["Stale", String(stalePages)],
    ["Quality findings", String(qualityFindings)],
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
  ${dailyReport ? renderDailyUpdateSection(dailyReport) : ""}
  ${renderExperienceSummaries(experienceSummaries)}
  <section class="dashboard-grid">
    <div>
      <h2>Recent Sources</h2>
      <ol class="link-list">
        ${recent.map((page) => `<li data-page-kind="${escapeHtml(page.page_kind ?? "note")}"><a href="${escapeHtml(pageHref(page))}">${escapeHtml(page.title)}</a><span>${escapeHtml(page.page_kind ?? "note")}</span></li>`).join("\n")}
      </ol>
    </div>
    <div>
      <h2>Top Signatures</h2>
      <ol class="link-list">
        ${signatures.length > 0 ? signatures.map((signature) => `<li><code>${escapeHtml(signature)}</code></li>`).join("\n") : "<li>No signatures indexed</li>"}
      </ol>
    </div>
  </section>
  <section class="filters" aria-label="Knowledge type filters">
    ${kindFilters(pages).map((kind) => `<button type="button" data-kind-filter="${escapeHtml(kind)}">${escapeHtml(kind === "all" ? "All" : kind)}</button>`).join("\n")}
  </section>
</main>`,
  });
}

function renderPage(page: WikiSitePage, pages: WikiSitePage[], graph: WikiGraph): string {
  const related = relatedPages(page, pages, graph);
  const nav = pages.map((item) => `<a href="${escapeHtml(`${item.slug}.html`)}"${item.id === page.id ? " aria-current=\"page\"" : ""}>${escapeHtml(item.title)}</a>`).join("\n");
  const relatedHtml = related.length > 0
    ? related.map((item) => `<li><a href="${escapeHtml(`${item.slug}.html`)}">${escapeHtml(item.title)}</a></li>`).join("\n")
    : "<li>No related pages yet</li>";
  const provenanceHtml = page.provenance_refs && page.provenance_refs.length > 0
    ? page.provenance_refs.map((ref) => `<li><code>${escapeHtml(ref.uri)}</code>${ref.hash ? `<br><code>${escapeHtml(ref.hash)}</code>` : ""}</li>`).join("")
    : page.source_ids.map((sourceId) => `<li><code>${escapeHtml(sourceId)}</code></li>`).join("");

  return renderLayout({
    title: page.title,
    pages,
    graph,
    assetPrefix: "../",
    body: `<main class="page-shell">
  <nav class="side-nav" aria-label="Knowledge pages">${nav}</nav>
  <article class="content">
    ${markdownToHtml(page.body_markdown ?? "")}
  </article>
  <aside class="meta-rail">
    <section>
      <h2>Provenance</h2>
      <ul>${provenanceHtml}</ul>
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

function kindFilters(pages: WikiSitePage[]): string[] {
  return ["all", ...Array.from(new Set(pages.map((page) => page.page_kind ?? "note"))).sort()];
}

function renderGraphPage(pages: WikiSitePage[], graph: WikiGraph): string {
  return renderLayout({
    title: "PraxisBase Wiki Graph",
    pages,
    graph,
    body: `<main class="graph-shell">
  <section class="hero">
    <div>
      <p class="eyebrow">Knowledge graph</p>
      <h1>Graph</h1>
      <p class="lede">Backlinks, source overlap, and related repair knowledge for agent context.</p>
    </div>
  </section>
  <section class="filters" aria-label="Knowledge type filters">
    ${kindFilters(pages).map((kind) => `<button type="button" data-kind-filter="${escapeHtml(kind)}">${escapeHtml(kind === "all" ? "All" : kind)}</button>`).join("\n")}
  </section>
  <section class="graph-grid">
    <div class="graph-panel">
      <h2>Nodes</h2>
      <ol class="link-list">
        ${pages.map((page) => `<li data-page-kind="${escapeHtml(page.page_kind ?? "note")}"><a href="${escapeHtml(pageHref(page))}">${escapeHtml(page.title)}</a><span>${escapeHtml(page.page_kind ?? "note")}</span></li>`).join("\n")}
      </ol>
    </div>
    <div class="graph-panel">
      <h2>Links</h2>
      <ol class="link-list">
        ${graph.links.slice(0, 80).map((link) => `<li><code>${escapeHtml(link.from)} -> ${escapeHtml(link.to)}</code><span>${escapeHtml(link.type)}</span></li>`).join("\n")}
      </ol>
    </div>
  </section>
</main>`,
  });
}

function renderIssuesPage(
  pages: WikiSitePage[],
  graph: WikiGraph,
  qualityFindings: Array<{ rule: string; severity: string; path: string; message: string }>,
  dailyReport: DailyReportSummary | null
): string {
  return renderLayout({
    title: "PraxisBase Quality Issues",
    pages,
    graph,
    body: `<main class="issues-shell">
  <section class="hero">
    <div>
      <p class="eyebrow">Wiki quality</p>
      <h1>Quality Issues</h1>
      <p class="lede">Findings that should be reviewed before agents rely on this knowledge.</p>
    </div>
  </section>
  <section class="issues-panel">
    <ol class="issue-list">
      ${qualityFindings.length > 0 ? qualityFindings.map((finding) => `<li><strong>${escapeHtml(finding.rule)}</strong> <small>${escapeHtml(finding.severity)}</small><br>${escapeHtml(finding.message)}<br><small>${escapeHtml(finding.path)}</small></li>`).join("\n") : "<li>No quality issues found.</li>"}
    </ol>
  </section>
  ${dailyReport ? renderDailyPrivacyFindings(dailyReport) : ""}
</main>`,
  });
}

function renderDailyPrivacyFindings(report: DailyReportSummary): string {
  if (report.rejected === 0 && report.human_required === 0) {
    return "";
  }
  return `<section class="issues-panel">
  <h2>Daily Privacy Findings</h2>
  <dl>
    <dt>Rejected</dt><dd>${escapeHtml(String(report.rejected))}</dd>
    <dt>Human required</dt><dd>${escapeHtml(String(report.human_required))}</dd>
  </dl>
</section>`;
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

interface DailyReportSummary {
  created_at: string;
  authority_mode: string;
  source_count: number;
  imported: number;
  rejected: number;
  human_required: number;
  proposal_candidates: number;
  site_pages: number;
}

async function collectLatestDailyReport(root: string): Promise<DailyReportSummary | null> {
  const dir = safePathForReaddir(root, protocolPaths.reportsDaily);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }

  const jsonFiles = entries.filter((name) => name.endsWith(".json"));
  if (jsonFiles.length === 0) return null;

  const candidates: Array<{ created_at: string; sources?: Array<{ imported?: number; rejected?: number; human_required?: number }>; authority_mode?: string; proposal_candidates?: number; site_pages?: number; type?: string }> = [];

  for (const file of jsonFiles) {
    try {
      const report = await readJson<Record<string, unknown>>(root, `${protocolPaths.reportsDaily}/${file}`);
      if (report && report.type === "daily_experience_report" && typeof report.created_at === "string") {
        candidates.push(report as typeof candidates[number]);
      }
    } catch {
      continue;
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const latest = candidates[0];
  const sources = Array.isArray(latest.sources) ? latest.sources : [];

  return {
    created_at: latest.created_at,
    authority_mode: latest.authority_mode ?? "unknown",
    source_count: sources.length,
    imported: sources.reduce((sum, s) => sum + (s.imported ?? 0), 0),
    rejected: sources.reduce((sum, s) => sum + (s.rejected ?? 0), 0),
    human_required: sources.reduce((sum, s) => sum + (s.human_required ?? 0), 0),
    proposal_candidates: typeof latest.proposal_candidates === "number" ? latest.proposal_candidates : 0,
    site_pages: typeof latest.site_pages === "number" ? latest.site_pages : 0,
  };
}

function safePathForReaddir(root: string, relativePath: string): string {
  return posix.resolve(root, relativePath);
}

async function collectLatestExperienceSummaries(root: string, limit = 8): Promise<ExperienceSummary[]> {
  const dir = safePathForReaddir(root, protocolPaths.rawVaultRefs);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const summaries: ExperienceSummary[] = [];
  for (const file of entries.filter((name) => name.endsWith(".json")).sort()) {
    try {
      const value = await readJson<Record<string, unknown>>(root, `${protocolPaths.rawVaultRefs}/${file}`);
      const summary = stringValue(value.redacted_summary);
      const sourceRef = stringValue(value.source_ref);
      if (!summary || !sourceRef) continue;
      summaries.push({
        id: stringValue(value.id) ?? file.replace(/\.json$/i, ""),
        agent: stringValue(value.agent) ?? "unknown",
        kind: stringValue(value.kind) ?? stringValue(value.type) ?? "experience",
        source_ref: sourceRef,
        summary,
        scope: stringValue(value.scope_hint) ?? stringValue(value.scope) ?? "unknown",
        created_at: stringValue(value.created_at) ?? "",
      });
    } catch {
      continue;
    }
  }

  return summaries
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export async function buildWikiSite(root: string): Promise<BuildWikiSiteResult> {
  const pages = await collectWikiPages(root);
  const graph = buildWikiGraph(pages);
  const lintReport = await runWikiLint(root, { pages });
  const qualityReport = await buildWikiQualityReport(root, { pages, graph });
  const outputs = [...SITE_OUTPUTS];
  const dailyReport = await collectLatestDailyReport(root);
  const experienceSummaries = await collectLatestExperienceSummaries(root);
  const bundleStatus = await exists(root, "dist/repair-bundles/manifest.json") ? "ready" : "not built";
  const stalePages = lintReport.findings.filter((finding) => finding.rule === "stale_active_page").length;
  outputs.push(`${protocolPaths.reportsWikiQuality}/${qualityReport.id}.json`);

  await writeText(root, "dist/index.html", renderDashboard(pages, graph, bundleStatus, stalePages, qualityReport.summary.total, dailyReport, experienceSummaries));
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
  await writeJson(root, "dist/graph-slices/overview.json", buildWikiGraphSlice(graph, { mode: "overview", limit: 50 }));
  await writeText(root, "dist/graph.html", renderGraphPage(pages, graph));
  await writeText(root, "dist/issues.html", renderIssuesPage(pages, graph, qualityReport.findings, dailyReport));
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
      provenance_refs: page.provenance_refs ?? [],
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
      stale: stalePages,
      findings: lintReport.findings.length,
      quality_findings: qualityReport.summary.total,
    },
  };
}
