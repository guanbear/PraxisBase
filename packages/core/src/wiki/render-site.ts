import { readdir, rm, stat } from "node:fs/promises";
import { posix } from "node:path";
import matter from "gray-matter";
import { escapeHtml, escapeJsonForHtml } from "../build/html.js";
import { protocolPaths } from "../protocol/paths.js";
import { readJson, readText, safePath, writeJson, writeText } from "../store/file-store.js";
import { collectWikiSources } from "./collect.js";
import { inferWikiConfidence, inferWikiLifecycle, makeWikiSlug, type WikiSource } from "./model.js";
import { runWikiLint } from "./lint.js";
import { buildWikiQualityReport } from "./quality.js";
import { buildWikiGraphSlice } from "./graph-slices.js";
import { buildWikiGraph, type WikiGraph, type WikiPage } from "./resolver.js";
import { collectPendingWikiProposalCandidates, type PendingWikiProposalCandidate } from "./proposal-candidates.js";
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

function wikiLinkIndex(pages: WikiSitePage[]): Map<string, WikiSitePage | null> {
  const index = new Map<string, WikiSitePage | null>();
  const add = (key: string | undefined, page: WikiSitePage): void => {
    const normalized = key?.trim().toLowerCase();
    if (!normalized) return;
    const existing = index.get(normalized);
    if (existing === undefined) {
      index.set(normalized, page);
    } else if (existing !== null && existing.id !== page.id) {
      index.set(normalized, null);
    }
  };
  const pathAliases = (path: string | undefined): string[] => {
    if (!path) return [];
    const parts = path.replace(/\\/g, "/").split("/");
    const leaf = parts[parts.length - 1] ?? "";
    const withoutExtension = leaf === "SKILL.md" ? parts[parts.length - 2] ?? "" : leaf.replace(/\.md$/i, "");
    const slug = makeWikiSlug(withoutExtension);
    return slug.startsWith("wiki-") ? [slug, slug.slice(5)] : [slug];
  };
  for (const page of pages) {
    add(page.slug, page);
    add(page.id, page);
    add(page.title, page);
    add(makeWikiSlug(page.title), page);
    for (const alias of pathAliases(page.path)) {
      add(alias, page);
    }
  }
  return index;
}

function renderInlineMarkdown(text: string, linkIndex: Map<string, WikiSitePage | null>): string {
  const pattern = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  let html = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    html += escapeHtml(text.slice(lastIndex, match.index));
    const rawTarget = match[1].trim();
    const label = (match[2] ?? rawTarget).trim();
    const page = linkIndex.get(rawTarget.toLowerCase());
    if (page) {
      html += `<a href="${escapeHtml(`${page.slug}.html`)}">${escapeHtml(label)}</a>`;
    } else {
      html += escapeHtml(match[0]);
    }
    lastIndex = pattern.lastIndex;
  }
  html += escapeHtml(text.slice(lastIndex));
  return html;
}

function markdownToHtml(markdown: string, pages: WikiSitePage[] = []): string {
  const linkIndex = wikiLinkIndex(pages);
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | undefined;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInlineMarkdown(paragraph.join(" "), linkIndex)}</p>`);
    paragraph = [];
  };
  const flushList = (): void => {
    if (list.length === 0) return;
    html.push(`<ul>${list.map((item) => `<li>${renderInlineMarkdown(item, linkIndex)}</li>`).join("")}</ul>`);
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
      <a href="${escapeHtml(prefix)}wiki/index.md">Index</a>
      <a href="${escapeHtml(prefix)}review.html">Review</a>
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
  const dailyCards: Array<{ label: string; value: string; href?: string }> = [
    { label: "Sources", value: String(report.source_count) },
    { label: "Imported", value: String(report.imported) },
    { label: "Rejected", value: String(report.rejected) },
    { label: "Human required", value: String(report.human_required), href: "review.html#human-required" },
    { label: "Proposals", value: String(report.proposal_candidates), href: "review.html#pending-candidates" },
    { label: "Site pages", value: String(report.site_pages) },
  ];
  return `<section class="daily-update">
  <h2>Latest Daily Experience</h2>
  <p class="eyebrow">${escapeHtml(dateLabel)} &middot; ${escapeHtml(report.authority_mode)}</p>
  <div class="metrics">
    ${dailyCards.map((card) => card.href
      ? `<a class="metric-link" href="${escapeHtml(card.href)}"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></a>`
      : `<article><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></article>`).join("\n")}
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

function renderMetricCard(card: { label: string; value: string; href?: string }): string {
  if (card.href) {
    return `<a class="metric-link" href="${escapeHtml(card.href)}"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></a>`;
  }
  return `<article><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></article>`;
}

function renderRelationshipDetails(item: PendingWikiProposalCandidate): string {
  const rows: string[] = [];
  if (item.required_links && item.required_links.length > 0) {
    rows.push(`<dt>Required links</dt><dd>${item.required_links.map((link) =>
      `<code>${escapeHtml(link.slug)}</code> ${escapeHtml(link.label)} <small>${escapeHtml(link.reason)}</small>`
    ).join("<br>")}</dd>`);
  }
  if (item.suggested_links && item.suggested_links.length > 0) {
    rows.push(`<dt>Suggested links</dt><dd>${item.suggested_links.map((link) =>
      `<code>${escapeHtml(link.slug)}</code> ${escapeHtml(link.label)} <small>${escapeHtml(link.reason)}</small>`
    ).join("<br>")}</dd>`);
  }
  if (item.merge_candidates && item.merge_candidates.length > 0) {
    rows.push(`<dt>Merge candidates</dt><dd>${item.merge_candidates.map((candidate) =>
      `${escapeHtml(candidate.title)} <code>${escapeHtml(candidate.path)}</code> <small>${escapeHtml(candidate.reason)}</small>`
    ).join("<br>")}</dd>`);
  }
  if (item.relationship_reasons && item.relationship_reasons.length > 0) {
    rows.push(`<dt>Relationship reasons</dt><dd>${escapeHtml(item.relationship_reasons.join(", "))}</dd>`);
  }
  return rows.join("\n");
}

function renderPendingCandidates(candidates: PendingWikiProposalCandidate[]): string {
  if (candidates.length === 0) return "";
  return `<section class="pending-candidates">
  <div class="section-heading">
    <div>
      <h2><a href="review.html#pending-candidates">Pending Experience Candidates</a></h2>
      <p>AI-generated wiki drafts waiting for review. Stable <code>kb/</code> files are unchanged until promotion.</p>
    </div>
    <strong>${escapeHtml(String(candidates.length))}</strong>
  </div>
  <ol class="experience-list">
    ${candidates.slice(0, 12).map((item) => `<li id="${escapeHtml(item.anchor)}">
      <p><strong>${escapeHtml(item.title)}</strong></p>
      <p>${escapeHtml(item.summary)}</p>
      <dl>
        <dt>Target</dt><dd><code>${escapeHtml(item.patch_path)}</code></dd>
        <dt>Kind</dt><dd>${escapeHtml(item.kind)}</dd>
        <dt>Scope</dt><dd>${escapeHtml(item.scope)}</dd>
        <dt>Source</dt><dd><code>${escapeHtml(item.source_id)}</code></dd>
        ${item.source_count !== undefined ? `<dt>Sources</dt><dd>${escapeHtml(String(item.source_count))}</dd>` : ""}
        ${item.confidence !== undefined ? `<dt>Confidence</dt><dd>${escapeHtml(item.confidence.toFixed(2))}</dd>` : ""}
        ${item.review_hint ? `<dt>Why review</dt><dd>${escapeHtml(item.review_hint.why_review)}</dd><dt>Suggested</dt><dd>${escapeHtml(item.review_hint.suggested_decision)}</dd>` : ""}
        ${item.review_hint && item.review_hint.risk_notes.length > 0 ? `<dt>Risk notes</dt><dd>${escapeHtml(item.review_hint.risk_notes.join("; "))}</dd>` : ""}
        ${item.guard_messages && item.guard_messages.length > 0 ? `<dt>Guard failures</dt><dd>${escapeHtml(item.guard_messages.join("; "))}</dd>` : ""}
        ${renderRelationshipDetails(item)}
      </dl>
    </li>`).join("\n")}
  </ol>
  <div class="command-strip" aria-label="Confirm pending candidates">
    <code>praxisbase review --auto</code>
    <code>praxisbase promote --auto</code>
    <code>praxisbase wiki build-site --json</code>
  </div>
</section>`;
}

type CandidateStatus = "pending" | "approved" | "needs_human" | "promoted";

interface ReviewQueueCandidate extends PendingWikiProposalCandidate {
  status: CandidateStatus;
  review_decision?: string;
}

interface HumanRequiredRecord {
  id: string;
  path: string;
  source_id: string;
  reason: string;
  agent?: string;
  scope?: string;
  source_ref?: string;
  source_hash?: string;
  created_at: string;
  triage?: {
    classification?: string;
    decision?: string;
    confidence?: string;
    rationale?: string;
    suggested_redactions: string[];
  };
}

interface ReviewQueue {
  candidates: ReviewQueueCandidate[];
  human_required: HumanRequiredRecord[];
}

function statusLabel(status: CandidateStatus): string {
  if (status === "pending") return "Pending";
  if (status === "approved") return "Reviewed / Approved";
  if (status === "promoted") return "Promoted";
  return "Human required";
}

function renderCandidateCard(item: ReviewQueueCandidate): string {
  return `<li id="${escapeHtml(item.anchor)}" class="review-card">
    <p><strong>${escapeHtml(item.title)}</strong> <span class="status-pill">${escapeHtml(statusLabel(item.status))}</span></p>
    <p>${escapeHtml(item.summary)}</p>
    <dl>
      <dt>Target</dt><dd><code>${escapeHtml(item.patch_path)}</code></dd>
      <dt>Kind</dt><dd>${escapeHtml(item.kind)}</dd>
      <dt>Scope</dt><dd>${escapeHtml(item.scope)}</dd>
      <dt>Source</dt><dd><code>${escapeHtml(item.source_id)}</code></dd>
      ${item.source_count !== undefined ? `<dt>Sources</dt><dd>${escapeHtml(String(item.source_count))}</dd>` : ""}
      ${item.confidence !== undefined ? `<dt>Confidence</dt><dd>${escapeHtml(item.confidence.toFixed(2))}</dd>` : ""}
      <dt>Created</dt><dd>${escapeHtml(item.created_at)}</dd>
      ${item.review_hint ? `<dt>Why review</dt><dd>${escapeHtml(item.review_hint.why_review)}</dd><dt>Suggested</dt><dd>${escapeHtml(item.review_hint.suggested_decision)}</dd>` : ""}
      ${item.review_hint && item.review_hint.risk_notes.length > 0 ? `<dt>Risk notes</dt><dd>${escapeHtml(item.review_hint.risk_notes.join("; "))}</dd>` : ""}
      ${item.guard_messages && item.guard_messages.length > 0 ? `<dt>Guard failures</dt><dd>${escapeHtml(item.guard_messages.join("; "))}</dd>` : ""}
      ${renderRelationshipDetails(item)}
    </dl>
    <details>
      <summary>Preview generated markdown</summary>
      <pre><code>${escapeHtml(item.patch_content)}</code></pre>
    </details>
  </li>`;
}

function renderCandidateSection(input: { id: string; title: string; status: CandidateStatus; candidates: ReviewQueueCandidate[]; empty: string }): string {
  const candidates = input.candidates.filter((item) => item.status === input.status);
  return `<section id="${escapeHtml(input.id)}" class="review-section" data-status="${escapeHtml(input.status)}">
  <div class="section-heading">
    <div>
      <h2>${escapeHtml(input.title)}</h2>
      <p>${escapeHtml(candidates.length === 0 ? input.empty : `${candidates.length} item(s)`)}</p>
    </div>
    <strong>${escapeHtml(String(candidates.length))}</strong>
  </div>
  ${candidates.length > 0 ? `<ol class="experience-list">${candidates.map(renderCandidateCard).join("\n")}</ol>` : ""}
</section>`;
}

function renderHumanRequired(records: HumanRequiredRecord[]): string {
  return `<section id="human-required" class="review-section" data-status="needs_human">
  <div class="section-heading">
    <div>
      <h2>Human Required</h2>
      <p>Items blocked by privacy, weak evidence, conflicts, or checks that should not be automated.</p>
    </div>
    <strong>${escapeHtml(String(records.length))}</strong>
  </div>
  ${records.length > 0 ? `<ol class="experience-list">
    ${records.map((item) => `<li id="${escapeHtml(item.id)}" class="review-card">
      <p><strong>${escapeHtml(item.reason)}</strong> <span class="status-pill">Human required</span></p>
      <dl>
        <dt>Source</dt><dd><code>${escapeHtml(item.source_id)}</code></dd>
        <dt>Agent</dt><dd>${escapeHtml(item.agent ?? "unknown")}</dd>
        <dt>Scope</dt><dd>${escapeHtml(item.scope ?? "unknown")}</dd>
        <dt>Ref</dt><dd><code>${escapeHtml(item.source_ref ?? "n/a")}</code></dd>
        <dt>File</dt><dd><code>${escapeHtml(item.path)}</code></dd>
        <dt>Created</dt><dd>${escapeHtml(item.created_at)}</dd>
        ${item.triage ? `
        <dt>Triage</dt><dd>${escapeHtml(item.triage.classification ?? "unknown")} / ${escapeHtml(item.triage.decision ?? "unknown")}</dd>
        <dt>Confidence</dt><dd>${escapeHtml(item.triage.confidence ?? "n/a")}</dd>
        <dt>Rationale</dt><dd>${escapeHtml(item.triage.rationale ?? "n/a")}</dd>
        ${item.triage.suggested_redactions.length > 0 ? `<dt>Suggested Redactions</dt><dd>${escapeHtml(item.triage.suggested_redactions.join(", "))}</dd>` : ""}
        ` : ""}
      </dl>
    </li>`).join("\n")}
  </ol>` : "<p>No human-required records.</p>"}
</section>`;
}

function renderReviewPage(pages: WikiSitePage[], graph: WikiGraph, queue: ReviewQueue, curationReport: WikiCurationReportSummary | null): string {
  const counts = {
    pending: queue.candidates.filter((item) => item.status === "pending").length,
    approved: queue.candidates.filter((item) => item.status === "approved").length,
    promoted: queue.candidates.filter((item) => item.status === "promoted").length,
    human: queue.human_required.length + queue.candidates.filter((item) => item.status === "needs_human").length,
  };

  return renderLayout({
    title: "PraxisBase Review Queue",
    pages,
    graph,
    body: `<main class="review-shell">
  <section class="hero">
    <div>
      <p class="eyebrow">Review center</p>
      <h1>Review Queue</h1>
      <p class="lede">Confirm AI-generated wiki candidates, inspect blocked records, and see what has reached stable knowledge.</p>
    </div>
  </section>
  <section class="metrics">
    <a class="metric-link" href="#pending-candidates"><span>Pending candidates</span><strong>${escapeHtml(String(counts.pending))}</strong></a>
    <a class="metric-link" href="#approved-candidates"><span>Approved</span><strong>${escapeHtml(String(counts.approved))}</strong></a>
    <a class="metric-link" href="#human-required"><span>Human required</span><strong>${escapeHtml(String(counts.human))}</strong></a>
    <a class="metric-link" href="#promoted-candidates"><span>Promoted</span><strong>${escapeHtml(String(counts.promoted))}</strong></a>
  </section>
  ${curationReport ? renderWikiCompilerSection(curationReport) : ""}
  <section class="review-section" data-status="pending">
    <h2>Confirm from Terminal</h2>
    <p>This static site cannot execute local commands. Run these after inspecting candidates you want to accept.</p>
    <div class="command-strip">
      <code>praxisbase review --auto</code>
      <code>praxisbase promote --auto</code>
      <code>praxisbase wiki build-site --json</code>
    </div>
  </section>
  ${renderCandidateSection({ id: "pending-candidates", title: "Pending Candidates", status: "pending", candidates: queue.candidates, empty: "No pending candidates." })}
  ${renderCandidateSection({ id: "approved-candidates", title: "Reviewed / Approved", status: "approved", candidates: queue.candidates, empty: "No approved candidates waiting for promotion." })}
  ${renderHumanRequired(queue.human_required)}
  ${renderCandidateSection({ id: "promoted-candidates", title: "Promoted", status: "promoted", candidates: queue.candidates, empty: "No promoted candidates from the current inbox." })}
</main>`,
  });
}

function renderDashboard(
  pages: WikiSitePage[],
  graph: WikiGraph,
  bundleStatus: string,
  stalePages: number,
  qualityFindings: number,
  dailyReport: DailyReportSummary | null,
  experienceSummaries: ExperienceSummary[],
  pendingCandidates: PendingWikiProposalCandidate[],
  curationReport: WikiCurationReportSummary | null
): string {
  const signatures = pages.flatMap((page) => page.signatures).slice(0, 8);
  const recent = [...pages]
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .slice(0, 6);
  const cards = [
    { label: "Sources", value: String(new Set(pages.flatMap((page) => page.source_ids)).size), href: "#knowledge-pages" },
    { label: "Pages", value: String(pages.length), href: "#knowledge-pages" },
    { label: "Broken links", value: String(graph.broken_links.length), href: "issues.html" },
    { label: "Duplicates", value: String(graph.duplicates.length), href: "issues.html" },
    { label: "Orphans", value: String(graph.orphans.length), href: "graph.html" },
    { label: "Stale", value: String(stalePages), href: "issues.html" },
    { label: "Quality findings", value: String(qualityFindings), href: "issues.html" },
    { label: "Bundle status", value: bundleStatus },
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
    ${cards.map(renderMetricCard).join("\n")}
  </section>
  ${dailyReport ? renderDailyUpdateSection(dailyReport) : ""}
  ${curationReport ? renderWikiCompilerSection(curationReport) : ""}
  ${renderPendingCandidates(pendingCandidates)}
  <section class="dashboard-grid">
    <div id="knowledge-pages">
      <h2>Knowledge Pages</h2>
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
    ${markdownToHtml(page.body_markdown ?? "", pages)}
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

function renderWikiCompilerSection(report: WikiCurationReportSummary): string {
  const dateLabel = report.created_at.slice(0, 10);
  const planCards = [
    { label: "Create", value: String(report.compiler_page_plans_create) },
    { label: "Update", value: String(report.compiler_page_plans_update) },
    { label: "Merge", value: String(report.compiler_page_plans_merge) },
    { label: "Supersede", value: String(report.compiler_page_plans_supersede) },
    { label: "Archive", value: String(report.compiler_page_plans_archive) },
  ];
  const relationshipCards = [
    { label: "Required links", value: report.relationship_required_links },
    { label: "Suggested links", value: report.relationship_suggested_links },
    { label: "Merge plans", value: report.relationship_merge_plans },
    { label: "Ambiguous merges", value: report.relationship_ambiguous_merge_targets },
    { label: "Isolated topics", value: report.relationship_isolated_topics },
    { label: "Orphan risk after plan", value: report.relationship_orphan_risk_after_plan },
  ];
  const hasRelationshipCounts = relationshipCards.some((card) => card.value > 0);
  const aiLabel = report.ai_configured ? `AI ${report.ai_mode}` : "Deterministic";
  return `<section class="wiki-compiler-status">
  <h2>Wiki Compiler</h2>
  <p class="eyebrow">${escapeHtml(dateLabel)} &middot; ${escapeHtml(report.mode)} &middot; ${escapeHtml(aiLabel)}${report.ai_model ? ` &middot; ${escapeHtml(report.ai_model)}` : ""}</p>
  <div class="metrics">
    <article><span>Observations</span><strong>${escapeHtml(String(report.compiler_observations))}</strong></article>
    <article><span>Topics</span><strong>${escapeHtml(String(report.compiler_topics))}</strong></article>
    ${planCards.map((card) => `<article><span>Plan ${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></article>`).join("\n")}
    <article><span>Dup source-hash groups</span><strong>${escapeHtml(String(report.compiler_duplicate_source_hash_groups))}</strong></article>
    <article><span>Hard blocks</span><strong>${escapeHtml(String(report.compiler_hard_blocks))}</strong></article>
    <article><span>Quality review needed</span><strong>${escapeHtml(String(report.compiler_human_required_quality))}</strong></article>
    <article><span>Written proposals</span><strong>${escapeHtml(String(report.output_written_proposals))}</strong></article>
    ${report.input_human_required > 0 ? `<article><span>Input/privacy triage</span><strong>${escapeHtml(String(report.input_human_required))}</strong></article>` : ""}
    ${hasRelationshipCounts ? relationshipCards.map((card) =>
      `<article><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(String(card.value))}</strong></article>`
    ).join("\n") : ""}
  </div>
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

async function writeRootWikiArtifacts(root: string, pages: WikiSitePage[], graph: WikiGraph, now: string): Promise<string[]> {
  const byKind = new Map<string, WikiSitePage[]>();
  for (const page of pages) {
    const kind = page.page_kind ?? "note";
    const bucket = byKind.get(kind) ?? [];
    bucket.push(page);
    byKind.set(kind, bucket);
  }

  const indexLines = ["# Wiki Index", ""];
  for (const [kind, bucket] of Array.from(byKind.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    indexLines.push(`## ${kind}`, "");
    for (const page of bucket.sort((a, b) => a.title.localeCompare(b.title))) {
      const summary = page.summary ? ` - ${page.summary}` : "";
      indexLines.push(`- [[${page.id}|${page.title}]]${summary}`);
    }
    indexLines.push("");
  }

  const artifacts: Array<{ path: string; body: string }> = [
    { path: "dist/wiki/index.md", body: indexLines.join("\n") },
    { path: "dist/wiki/log.md", body: `# Wiki Log\n\n## ${now}\n\n- build-site: ${pages.length} page(s)\n- graph links: ${graph.links.length}\n- broken links: ${graph.broken_links.length}\n` },
    { path: "dist/wiki/purpose.md", body: "# Wiki Purpose\n\nPraxisBase compiles agent experience into reusable, provenance-backed operational knowledge for humans and agents.\n" },
    { path: "dist/wiki/schema.md", body: "# Wiki Schema\n\nStable pages should include durable instructions, verification guidance, reusable lessons, provenance, lifecycle metadata, and links to related knowledge.\n" },
    { path: "dist/wiki/overview.md", body: `# Wiki Overview\n\nCompiled pages: ${pages.length}.\nGraph links: ${graph.links.length}.\nBroken links: ${graph.broken_links.length}.\n` },
  ];

  for (const artifact of artifacts) {
    await writeText(root, artifact.path, artifact.body);
  }
  return artifacts.map((artifact) => artifact.path);
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

interface WikiCurationReportSummary {
  created_at: string;
  mode: string;
  ai_configured: boolean;
  ai_mode: string;
  ai_model: string | undefined;
  input_human_required: number;
  input_evidence_items: number;
  input_filtered_noise: number;
  input_rejected: number;
  input_clusters: number;
  output_curated_proposals: number;
  output_written_proposals: number;
  output_conflicts: number;
  compiler_observations: number;
  compiler_topics: number;
  compiler_page_plans_create: number;
  compiler_page_plans_update: number;
  compiler_page_plans_merge: number;
  compiler_page_plans_supersede: number;
  compiler_page_plans_archive: number;
  compiler_duplicate_source_hash_groups: number;
  compiler_hard_blocks: number;
  compiler_human_required_quality: number;
  relationship_required_links: number;
  relationship_suggested_links: number;
  relationship_merge_plans: number;
  relationship_ambiguous_merge_targets: number;
  relationship_isolated_topics: number;
  relationship_orphan_risk_after_plan: number;
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

async function collectLatestWikiCurationReport(root: string): Promise<WikiCurationReportSummary | null> {
  const dir = safePathForReaddir(root, ".praxisbase/reports/wiki-curation");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }

  const jsonFiles = entries.filter((name) => name.endsWith(".json"));
  if (jsonFiles.length === 0) return null;

  const candidates: Array<Record<string, unknown>> = [];
  for (const file of jsonFiles) {
    try {
      const report = await readJson<Record<string, unknown>>(root, `.praxisbase/reports/wiki-curation/${file}`);
      if (report && report.type === "wiki_curation_report" && typeof report.created_at === "string") {
        candidates.push(report);
      }
    } catch {
      continue;
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const latest = candidates[0];

  const ai = detailsRecord(latest.ai);
  const inputCounts = detailsRecord(latest.input_counts);
  const outputCounts = detailsRecord(latest.output_counts);
  const compilerCounts = detailsRecord(latest.compiler_counts);
  const pagePlans = detailsRecord(compilerCounts.page_plans_by_action);
  const relationshipCounts = detailsRecord(compilerCounts.relationship_counts);

  return {
    created_at: String(latest.created_at),
    mode: stringValue(latest.mode) ?? "unknown",
    ai_configured: ai.configured === true,
    ai_mode: stringValue(ai.mode) ?? "unknown",
    ai_model: stringValue(ai.model),
    input_human_required: numberValue(inputCounts.human_required) ?? 0,
    input_evidence_items: numberValue(inputCounts.evidence_items) ?? 0,
    input_filtered_noise: numberValue(inputCounts.filtered_noise) ?? 0,
    input_rejected: numberValue(inputCounts.rejected) ?? 0,
    input_clusters: numberValue(inputCounts.clusters) ?? 0,
    output_curated_proposals: numberValue(outputCounts.curated_proposals) ?? 0,
    output_written_proposals: numberValue(outputCounts.written_proposals) ?? 0,
    output_conflicts: numberValue(outputCounts.conflicts) ?? 0,
    compiler_observations: numberValue(compilerCounts.observations) ?? 0,
    compiler_topics: numberValue(compilerCounts.topics) ?? 0,
    compiler_page_plans_create: numberValue(pagePlans.create) ?? 0,
    compiler_page_plans_update: numberValue(pagePlans.update) ?? 0,
    compiler_page_plans_merge: numberValue(pagePlans.merge) ?? 0,
    compiler_page_plans_supersede: numberValue(pagePlans.supersede) ?? 0,
    compiler_page_plans_archive: numberValue(pagePlans.archive) ?? 0,
    compiler_duplicate_source_hash_groups: numberValue(compilerCounts.duplicate_source_hash_groups) ?? 0,
    compiler_hard_blocks: numberValue(compilerCounts.hard_blocks) ?? 0,
    compiler_human_required_quality: numberValue(compilerCounts.human_required_quality) ?? 0,
    relationship_required_links: numberValue(relationshipCounts.required_links) ?? 0,
    relationship_suggested_links: numberValue(relationshipCounts.suggested_links) ?? 0,
    relationship_merge_plans: numberValue(relationshipCounts.merge_plans) ?? 0,
    relationship_ambiguous_merge_targets: numberValue(relationshipCounts.ambiguous_merge_targets) ?? 0,
    relationship_isolated_topics: numberValue(relationshipCounts.isolated_topics) ?? 0,
    relationship_orphan_risk_after_plan: numberValue(relationshipCounts.orphan_risk_after_plan) ?? 0,
  };
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

function detailsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function collectHumanRequiredRecords(root: string): Promise<HumanRequiredRecord[]> {
  const dir = safePathForReaddir(root, protocolPaths.exceptionsHumanRequired);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const records: HumanRequiredRecord[] = [];
  for (const file of entries.filter((name) => name.endsWith(".json")).sort()) {
    const path = `${protocolPaths.exceptionsHumanRequired}/${file}`;
    try {
      const value = await readJson<Record<string, unknown>>(root, path);
      const details = detailsRecord(value.details);
      const privacy = detailsRecord(details.privacy);
      const triage = detailsRecord(details.triage);
      const suggestedRedactions = Array.isArray(triage.suggested_redactions)
        ? triage.suggested_redactions.map(stringValue).filter((item): item is string => Boolean(item))
        : [];
      records.push({
        id: stringValue(value.id) ?? file.replace(/\.json$/i, ""),
        path,
        source_id: stringValue(value.source_id) ?? stringValue(details.source_id) ?? "unknown",
        reason: stringValue(value.reason) ?? "Human review required",
        agent: stringValue(details.agent),
        scope: stringValue(details.scope_hint) ?? stringValue(details.scope) ?? stringValue(privacy.mode),
        source_ref: stringValue(details.source_ref),
        source_hash: stringValue(details.source_hash),
        created_at: stringValue(value.created_at) ?? "",
        triage: Object.keys(triage).length > 0 ? {
          classification: stringValue(triage.classification),
          decision: stringValue(triage.decision),
          confidence: typeof triage.confidence === "number" ? String(triage.confidence) : stringValue(triage.confidence),
          rationale: stringValue(triage.rationale),
          suggested_redactions: suggestedRedactions,
        } : undefined,
      });
    } catch {
      continue;
    }
  }

  return records.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.path.localeCompare(b.path));
}

async function collectReviewDecisions(root: string): Promise<Map<string, string>> {
  const dir = safePathForReaddir(root, protocolPaths.inboxReviews);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return new Map();
  }

  const decisions = new Map<string, string>();
  for (const file of entries.filter((name) => name.endsWith(".json")).sort()) {
    try {
      const value = await readJson<Record<string, unknown>>(root, `${protocolPaths.inboxReviews}/${file}`);
      const proposalId = stringValue(value.proposal_id);
      const decision = stringValue(value.decision);
      if (proposalId && decision) decisions.set(proposalId, decision);
    } catch {
      continue;
    }
  }
  return decisions;
}

async function buildReviewQueue(root: string, candidates: PendingWikiProposalCandidate[]): Promise<ReviewQueue> {
  const decisions = await collectReviewDecisions(root);
  const humanRequired = await collectHumanRequiredRecords(root);
  const reviewCandidates: ReviewQueueCandidate[] = [];

  for (const candidate of candidates) {
    const promoted = await exists(root, candidate.patch_path);
    const decision = decisions.get(candidate.id);
    const status: CandidateStatus = promoted
      ? "promoted"
      : decision === "approve"
        ? "approved"
        : decision
          ? "needs_human"
          : "pending";
    reviewCandidates.push({ ...candidate, status, review_decision: decision });
  }

  return { candidates: reviewCandidates, human_required: humanRequired };
}

export async function buildWikiSite(root: string): Promise<BuildWikiSiteResult> {
  const pages = await collectWikiPages(root);
  const pendingCandidates = await collectPendingWikiProposalCandidates(root);
  const reviewQueue = await buildReviewQueue(root, pendingCandidates);
  const graph = buildWikiGraph(pages);
  const lintReport = await runWikiLint(root, { pages });
  const qualityReport = await buildWikiQualityReport(root, { pages, graph });
  const outputs = [...SITE_OUTPUTS];
  const dailyReport = await collectLatestDailyReport(root);
  const curationReport = await collectLatestWikiCurationReport(root);
  const experienceSummaries = await collectLatestExperienceSummaries(root);
  const bundleStatus = await exists(root, "dist/repair-bundles/manifest.json") ? "ready" : "not built";
  const stalePages = lintReport.findings.filter((finding) => finding.rule === "stale_active_page").length;
  outputs.push(`${protocolPaths.reportsWikiQuality}/${qualityReport.id}.json`);
  outputs.push(...await writeRootWikiArtifacts(root, pages, graph, new Date().toISOString()));

  await writeText(root, "dist/index.html", renderDashboard(pages, graph, bundleStatus, stalePages, qualityReport.summary.total, dailyReport, experienceSummaries, pendingCandidates, curationReport));
  await writeText(root, "dist/review.html", renderReviewPage(pages, graph, reviewQueue, curationReport));
  await writeJson(root, "dist/search-index.json", {
    protocol_version: "0.1",
    documents: [
      ...pages.map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      path: page.path,
      kind: page.page_kind,
      text: `${page.title}\n${page.summary}\n${page.body_text}`,
      })),
      ...pendingCandidates.map((candidate) => ({
        id: candidate.id,
        slug: candidate.anchor,
        title: candidate.title,
        path: candidate.patch_path,
        kind: `pending:${candidate.kind}`,
        href: `review.html#${candidate.anchor}`,
        text: `${candidate.title}\n${candidate.summary}\n${candidate.patch_path}\n${candidate.source_id}`,
      })),
    ],
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

  await rm(safePath(root, "dist/pages"), { recursive: true, force: true });
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
