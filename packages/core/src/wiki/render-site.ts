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
import { findFreshPassingValidationReport } from "../synthesis/skill-validation.js";
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

function skillPageSlug(path: string | undefined): string | undefined {
  if (!path?.startsWith("skills/")) return undefined;
  const withoutSkill = path.replace(/\\/g, "/").replace(/^skills\//, "").replace(/\/SKILL\.md$/i, "");
  return makeWikiSlug(`skill ${withoutSkill.replace(/\//g, " ")}`);
}

function pageIdentity(source: WikiSource, metadata: SourceMetadata, title: string): { id: string; slug: string } {
  if (source.kind === "skill") {
    const slug = skillPageSlug(source.path) ?? makeWikiSlug(`skill ${metadata.id ?? title}`);
    return { id: slug, slug };
  }
  const slug = makeWikiSlug(metadata.id ?? title);
  return { id: metadata.id ?? slug, slug };
}

export async function collectWikiPages(root: string): Promise<WikiSitePage[]> {
  const sources = (await collectWikiSources(root)).filter(isStableSource);
  const pages: WikiSitePage[] = [];

  for (const source of sources) {
    const metadata = await sourceMetadata(root, source);
    const title = source.title;
    const identity = pageIdentity(source, metadata, title);
    const body = source.body ?? source.summary;
    pages.push({
      id: identity.id,
      slug: identity.slug,
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
  const pathAliases = (path: string | undefined, options: { includeLeaf?: boolean } = {}): string[] => {
    if (!path) return [];
    const normalized = path.replace(/\\/g, "/").replace(/^\.\/+/, "");
    const parts = normalized.split("/");
    const leaf = parts[parts.length - 1] ?? "";
    const withoutExtension = leaf === "SKILL.md" ? parts[parts.length - 2] ?? "" : leaf.replace(/\.md$/i, "");
    const slug = makeWikiSlug(withoutExtension);
    const aliases = [
      normalized,
      normalized.replace(/\.md$/i, ""),
      normalized.replace(/\/SKILL\.md$/i, ""),
      ...(options.includeLeaf === false ? [] : [
        slug,
        ...(slug.startsWith("wiki-") ? [slug.slice(5)] : []),
      ]),
    ];
    return Array.from(new Set(aliases.filter(Boolean)));
  };
  for (const page of pages) {
    add(page.slug, page);
    add(page.id, page);
    const isSkill = page.page_kind === "skill";
    if (!isSkill) {
      add(page.title, page);
      add(makeWikiSlug(page.title), page);
    }
    for (const alias of pathAliases(page.path, { includeLeaf: !isSkill })) {
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
  const contextEconomy = report.context_economy;
  const contextJuice = report.context_juice;
  const semanticReview = report.semantic_review;
  const skillSynthesis = report.skill_synthesis;
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
    ${contextEconomy ? `<article><span>Context Economy</span><strong>${escapeHtml(contextEconomy.enabled ? "On" : "Off")}</strong></article>
    <article><span>Reduced items</span><strong>${escapeHtml(String(contextEconomy.items_reduced))}</strong></article>
    <article><span>Saved bytes</span><strong>${escapeHtml(contextEconomy.saved_bytes.toLocaleString("en-US"))}</strong></article>` : ""}
    ${contextJuice ? `<article><span>Context Juice</span><strong>${escapeHtml(contextJuice.enabled ? "On" : "Off")}</strong></article>
    <article><span>Budgeted items</span><strong>${escapeHtml(String(contextJuice.items_budgeted))}</strong></article>
    <article><span>Juice saved bytes</span><strong>${escapeHtml(contextJuice.saved_bytes.toLocaleString("en-US"))}</strong></article>
    <article><span>Pre-summaries</span><strong>${escapeHtml(String(contextJuice.presummary_summarized))}</strong></article>` : ""}
	    ${semanticReview && semanticReview.enabled ? `<article><span>Semantic review</span><strong>${escapeHtml(String(semanticReview.reviewed))} reviewed</strong></article>
	    <article><span>Semantic promote</span><strong>${escapeHtml(String(semanticReview.promote))}</strong></article>
	    <article><span>Semantic reject</span><strong>${escapeHtml(String(semanticReview.reject))}</strong></article>
	    <article><span>Semantic needs human</span><strong>${escapeHtml(String(semanticReview.needs_human))}</strong></article>` : ""}
	    ${skillSynthesis && skillSynthesis.enabled ? `<article><span>Skill synthesis</span><strong>${escapeHtml(String(skillSynthesis.reviewed))} reviewed</strong></article>
	    <article><span>Skill candidates</span><strong>${escapeHtml(String(skillSynthesis.candidates))}</strong></article>
	    <article><span>Skill approved</span><strong>${escapeHtml(String(skillSynthesis.approved))}</strong></article>
	    <article><span>Skill skipped</span><strong>${escapeHtml(String(skillSynthesis.skipped ?? 0))}</strong></article>
	    <article><span>Skill rejected signals</span><strong>${escapeHtml(String(skillSynthesis.rejected_signals ?? 0))}</strong></article>
	    <article><span>Skill needs human</span><strong>${escapeHtml(String(skillSynthesis.needs_human))}</strong></article>` : ""}
	    ${report.lifecycle ? (() => {
	      const decisions = report.lifecycle.proposals_by_decision;
	      const total = Object.values(decisions).reduce((sum, count) => sum + count, 0);
	      return total > 0 ? `<article><span>Lifecycle proposals</span><strong>${escapeHtml(String(total))}</strong></article>
	      ${decisions["promote"] ? `<article><span>Lifecycle promote</span><strong>${escapeHtml(String(decisions["promote"]))}</strong></article>` : ""}
	      ${decisions["decay"] ? `<article><span>Lifecycle decay</span><strong>${escapeHtml(String(decisions["decay"]))}</strong></article>` : ""}
	      ${decisions["archive"] ? `<article><span>Lifecycle archive</span><strong>${escapeHtml(String(decisions["archive"]))}</strong></article>` : ""}
	      ${decisions["conflict"] ? `<article><span>Lifecycle conflict</span><strong>${escapeHtml(String(decisions["conflict"]))}</strong></article>` : ""}
	      ${decisions["no_op"] ? `<article><span>Lifecycle no-op</span><strong>${escapeHtml(String(decisions["no_op"]))}</strong></article>` : ""}` : "";
	    })() : ""}
	    ${report.skill_validation && report.skill_validation.total_reports > 0 ? `<article><span>Skill validation reports</span><strong>${escapeHtml(String(report.skill_validation.total_reports))}</strong></article>
	    ${report.skill_validation.by_decision["pass"] ? `<article><span>Validation pass</span><strong>${escapeHtml(String(report.skill_validation.by_decision["pass"]))}</strong></article>` : ""}
	    ${report.skill_validation.by_decision["fail"] ? `<article><span>Validation fail</span><strong>${escapeHtml(String(report.skill_validation.by_decision["fail"]))}</strong></article>` : ""}
	    ${report.skill_validation.by_decision["needs_human"] ? `<article><span>Validation needs human</span><strong>${escapeHtml(String(report.skill_validation.by_decision["needs_human"]))}</strong></article>` : ""}
	    ${report.skill_validation.candidates_without_passing > 0 ? `<article><span>Candidates needing validation</span><strong>${escapeHtml(String(report.skill_validation.candidates_without_passing))}</strong></article>` : ""}` : ""}
	    ${report.lessons && report.lessons.enabled ? `<article><span>M25 Lessons</span><strong>${escapeHtml(String(report.lessons.deterministic_lessons + report.lessons.ai_lessons))} extracted</strong></article>
	    <article><span>Lesson active personal</span><strong>${escapeHtml(String(report.lessons.active_personal))}</strong></article>
	    <article><span>Lesson wiki ready</span><strong>${escapeHtml(String(report.lessons.wiki_ready))}</strong></article>
	    <article><span>Lesson skill ready</span><strong>${escapeHtml(String(report.lessons.skill_ready))}</strong></article>
	    <article><span>Lesson human required</span><strong>${escapeHtml(String(report.lessons.human_required))}</strong></article>
	    <article><span>Lesson rejected</span><strong>${escapeHtml(String(report.lessons.rejected))}</strong></article>
	    <article><span>Lesson wiki evidence</span><strong>${escapeHtml(String(report.lessons.wiki_evidence))}</strong></article>
	    ${report.lessons.ai_cache && report.lessons.ai_cache.enabled ? `<article><span>Lesson AI cache hits</span><strong>${escapeHtml(String(report.lessons.ai_cache.hits))}</strong></article>
	    <article><span>Lesson AI cache misses</span><strong>${escapeHtml(String(report.lessons.ai_cache.misses))}</strong></article>` : ""}
	    ${report.lessons.golden_validation && report.lessons.golden_validation.length > 0 ? report.lessons.golden_validation.map((gv) => `<article><span>Golden ${escapeHtml(gv.fixture)}</span><strong>${escapeHtml(String(gv.matches))} matches / ${escapeHtml(String(gv.privateLeakCount))} leaks</strong></article>`).join("\n") : ""}` : ""}
	  </div>
  ${report.lessons?.details && report.lessons.details.length > 0 ? renderLessonDetails(report.lessons.details) : ""}
  ${report.personal_ga ? renderPersonalGaSection(report.personal_ga) : ""}
  ${renderAgentMemoryStatus(report)}
  ${renderGBrainStatus(report)}
  ${contextJuice && contextJuice.warnings.length > 0 ? `<p class="muted">Context juice warnings: ${escapeHtml(contextJuice.warnings.join("; "))}</p>` : ""}
</section>`;
}

function renderPersonalGaSection(report: NonNullable<DailyReportSummary["personal_ga"]>): string {
  const dispositionCounts = countBy(report.dispositions, (item) => item.decision);
  const blockerCounts = countBy(
    report.dispositions.filter((item) => item.blocking_reason),
    (item) => item.blocking_reason ?? "blocked",
  );
  const queued = report.dispositions
    .filter((item) => item.decision === "queued_for_next_run" || item.decision === "delayed_by_budget" || item.decision === "blocked_by_privacy")
    .slice(0, 8);
  return `<div class="review-section" id="personal-ga">
    <h2>Personal GA</h2>
    <div class="metrics">
      <article><span>Mode</span><strong>${escapeHtml(report.mode)}</strong></article>
      <article><span>Production ready</span><strong>${escapeHtml(report.production_ready ? "yes" : "no")}</strong></article>
      <article><span>Lessons</span><strong>${escapeHtml(String(report.lesson_count))}</strong></article>
      <article><span>Dispositions</span><strong>${escapeHtml(String(report.disposition_count))}</strong></article>
      <article><span>AI cache</span><strong>${escapeHtml(`${report.cache.hits}/${report.cache.misses}`)}</strong></article>
      <article><span>Leakage scan</span><strong>${escapeHtml(report.leakage_scan.passed ? "passed" : "blocked")}</strong></article>
    </div>
    ${report.blocking_reasons.length > 0 ? `<p class="muted">Blockers: ${escapeHtml(report.blocking_reasons.join("; "))}</p>` : ""}
    ${report.warnings && report.warnings.length > 0 ? `<p class="muted">Warnings: ${escapeHtml(report.warnings.join("; "))}</p>` : ""}
    <h3>Experience Sources</h3>
    <ol class="link-list">
      ${report.source_coverage.length > 0 ? report.source_coverage.map((source) => `<li>
        <strong>${escapeHtml(`${source.agent} / ${source.source_kind}`)}</strong>
        <span>${escapeHtml(source.available ? "available" : "missing")} / items ${escapeHtml(String(source.items))}${typeof source.content_spans === "number" ? ` / spans ${escapeHtml(String(source.content_spans))}` : ""}</span>
      </li>`).join("\n") : "<li>No configured personal sources reported.</li>"}
    </ol>
    <h3>Lesson Disposition</h3>
    <div class="metrics">
      ${Object.entries(dispositionCounts).sort(([a], [b]) => a.localeCompare(b)).map(([decision, count]) => `<article><span>${escapeHtml(decision)}</span><strong>${escapeHtml(String(count))}</strong></article>`).join("\n")}
    </div>
    ${queued.length > 0 ? `<ol class="link-list">
      ${queued.map((item) => `<li><strong>${escapeHtml(item.lesson_id)}</strong><span>${escapeHtml(item.decision)}${item.blocking_reason ? ` / ${escapeHtml(item.blocking_reason)}` : ""}</span></li>`).join("\n")}
    </ol>` : ""}
    <h3>Golden Validation</h3>
    <p>${escapeHtml(`${report.golden_validation.matched} / ${report.golden_validation.required}`)} matched${report.golden_validation.missed.length > 0 ? `; missed ${escapeHtml(report.golden_validation.missed.join(", "))}` : ""}</p>
    <h3>Privacy Review</h3>
    ${Object.keys(blockerCounts).length > 0 ? `<div class="metrics">
      ${Object.entries(blockerCounts).sort(([a], [b]) => a.localeCompare(b)).map(([reason, count]) => `<article><span>${escapeHtml(reason)}</span><strong>${escapeHtml(String(count))}</strong></article>`).join("\n")}
    </div>` : "<p>No privacy blockers reported.</p>"}
    <h3>Agent Use</h3>
    <ol class="link-list">
      ${report.agent_consumption.length > 0 ? report.agent_consumption.map((item) => `<li>
        <strong>${escapeHtml(item.surface)}</strong>
        <span>${escapeHtml(item.available ? "available" : "unavailable")} / ${escapeHtml(item.authority.join(", "))}</span>
      </li>`).join("\n") : "<li>No agent consumption surfaces reported.</li>"}
    </ol>
  </div>`;
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function renderLessonDetails(details: NonNullable<DailyReportSummary["lessons"]>["details"]): string {
  return `<div class="review-section" id="lesson-candidates">
    <h2>Lesson Candidates</h2>
    <ol class="link-list">
      ${details.map((lesson) => `<li>
        <strong>${escapeHtml(lesson.safe_claim)}</strong>
        <span>${escapeHtml(lesson.state)} / ${escapeHtml(lesson.privacy_tier)}${lesson.applies_to_systems.length > 0 ? ` / ${escapeHtml(lesson.applies_to_systems.join(", "))}` : ""}</span>
        ${lesson.span_refs.length > 0 ? `<br><code>${escapeHtml(lesson.span_refs.slice(0, 2).join(" "))}</code>` : ""}
      </li>`).join("\n")}
    </ol>
  </div>`;
}

interface AgentBundleReportSummary {
  id: string;
  mode: string;
  query?: string;
  total_bytes: number;
  budget_bytes: number;
  trust_summary: Record<string, number>;
  skill_matched: number;
  skill_skipped: number;
  skill_reasons: string[];
  omitted_item_count: number;
  created_at: string;
}

interface PersonalFacetCounts {
  active: number;
  provisional: number;
  candidate: number;
  pinned: number;
  forgotten: number;
}

function renderRuntimeContextSection(bundle: AgentBundleReportSummary | null, personal: PersonalFacetCounts): string {
  if (!bundle && Object.values(personal).every((count) => count === 0)) return "";
  const trust = bundle ? Object.entries(bundle.trust_summary)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tier, count]) => `${tier}:${count}`)
    .join(" ") : "none";
  const skillReasons = bundle?.skill_reasons.slice(0, 5) ?? [];
  return `<section class="daily-update" id="runtime-context">
  <h2>Runtime Context</h2>
  <div class="metrics">
    ${bundle ? `<article><span>Bundle bytes</span><strong>${escapeHtml(`${bundle.total_bytes}/${bundle.budget_bytes}`)}</strong></article>
    <article><span>Trust tiers</span><strong>${escapeHtml(trust)}</strong></article>
    <article><span>Skill matched</span><strong>${escapeHtml(String(bundle.skill_matched))}</strong></article>
    <article><span>Skill skipped</span><strong>${escapeHtml(String(bundle.skill_skipped))}</strong></article>
    <article><span>Bundle omitted</span><strong>${escapeHtml(String(bundle.omitted_item_count))}</strong></article>` : ""}
    <article><span>Personal active</span><strong>${escapeHtml(String(personal.active + personal.pinned))}</strong></article>
    <article><span>Personal provisional</span><strong>${escapeHtml(String(personal.provisional))}</strong></article>
    <article><span>Personal forgotten</span><strong>${escapeHtml(String(personal.forgotten))}</strong></article>
  </div>
  ${skillReasons.length > 0 ? `<ol class="link-list">${skillReasons.map((reason) => `<li><span>${escapeHtml(reason)}</span></li>`).join("\n")}</ol>` : ""}
  <div class="command-strip">
    <code>praxisbase context bundle --query &lt;task&gt; --mode personal --json</code>
    <code>praxisbase skill inject-preview --query &lt;task&gt; --json</code>
    <code>praxisbase personal profile rebuild --json</code>
  </div>
</section>`;
}

function renderAgentMemoryStatus(report: DailyReportSummary): string {
  if (report.agentmemory_sources.length === 0) return "";
  return `<div class="agentmemory-status">
    <h3>AgentMemory</h3>
    <ol class="link-list">
      ${report.agentmemory_sources.map((source) => `<li><strong>${escapeHtml(source.name)}</strong><span>${escapeHtml(source.status)} / imported ${escapeHtml(String(source.imported))}</span>${source.warnings.length > 0 ? `<br><small>${escapeHtml(source.warnings.join("; "))}</small>` : ""}</li>`).join("\n")}
    </ol>
  </div>`;
}

function renderGBrainStatus(report: DailyReportSummary): string {
  const gbrain = report.brain_backends?.gbrain;
  if (!gbrain?.enabled) return "";
  const detail = `${gbrain.publish_status} / exported ${gbrain.exported}`;
  const notes = [...gbrain.warnings, ...gbrain.errors];
  return `<div class="agentmemory-status">
    <h3>GBrain</h3>
    <ol class="link-list">
      <li><strong>${escapeHtml(gbrain.doctor_status)}</strong><span>${escapeHtml(detail)}</span>${notes.length > 0 ? `<br><small>${escapeHtml(notes.join("; "))}</small>` : ""}</li>
    </ol>
  </div>`;
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

interface SemanticReviewInfo {
  decision: string;
  score: string;
  reason: string;
}

function extractSemanticReviewFromRiskNotes(riskNotes: string[]): SemanticReviewInfo | null {
  const decision = riskNotes.find((note) => note.startsWith("semantic_review:") && note !== "semantic_review:unavailable")?.split(":")[1];
  const score = riskNotes.find((note) => note.startsWith("semantic_score:"))?.split(":")[1];
  const reason = riskNotes.find((note) => note.startsWith("semantic_reason:"))?.substring("semantic_reason:".length);
  if (!decision && !score && !reason) return null;
  return { decision: decision ?? "n/a", score: score ?? "n/a", reason: reason ?? "" };
}

function renderSemanticReviewHtml(info: SemanticReviewInfo): string {
  return `<dt>Semantic review</dt><dd>${escapeHtml(info.decision)} &middot; score ${escapeHtml(info.score)}${info.reason ? ` &middot; ${escapeHtml(info.reason)}` : ""}</dd>`;
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
        ${item.review_hint && item.review_hint.risk_notes.length > 0 ? (() => { const sr = extractSemanticReviewFromRiskNotes(item.review_hint.risk_notes); return sr ? renderSemanticReviewHtml(sr) : ""; })() : ""}
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
  validation_status?: string;
}

interface HumanRequiredRecord {
  id: string;
  path: string;
  source_id: string;
  reason: string;
  redacted_summary?: string;
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

function recommendedCandidateCommand(item: ReviewQueueCandidate): string {
  const status = item.status;
  if (status === "promoted") return "praxisbase gbrain export --mode personal --write --json";
  if (status === "approved") return "praxisbase promote --auto";
  if (item.kind === "skill" || item.source_kind === "skill_synthesis") return "praxisbase skill review --json";
  if (status === "needs_human") return "praxisbase review list --json";
  return "praxisbase review --auto";
}

function renderCandidateCard(item: ReviewQueueCandidate): string {
  const validationStatus = item.validation_status
    ? ` <span class="status-pill">${escapeHtml(item.validation_status)}</span>`
    : "";
  return `<li id="${escapeHtml(item.anchor)}" class="review-card">
    <p><strong>${escapeHtml(item.title)}</strong> <span class="status-pill">${escapeHtml(statusLabel(item.status))}</span>${validationStatus}</p>
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
      ${item.validation_status ? `<dt>Validation</dt><dd>${escapeHtml(item.validation_status)}</dd>` : ""}
      <dt>Recommended</dt><dd><code>${escapeHtml(recommendedCandidateCommand(item))}</code></dd>
      ${renderRelationshipDetails(item)}
      ${item.review_hint && item.review_hint.risk_notes.length > 0 ? (() => { const sr = extractSemanticReviewFromRiskNotes(item.review_hint.risk_notes); return sr ? renderSemanticReviewHtml(sr) : ""; })() : ""}
    </dl>
    <details>
      <summary>Preview generated markdown</summary>
      <pre><code>${escapeHtml(item.patch_content)}</code></pre>
    </details>
  </li>`;
}

function renderCandidateSection(input: {
  id: string;
  aliasId?: string;
  title: string;
  status: CandidateStatus;
  candidates: ReviewQueueCandidate[];
  empty: string;
  commands: string[];
}): string {
  const candidates = input.candidates.filter((item) => item.status === input.status);
  return `<section id="${escapeHtml(input.id)}" class="review-section" data-status="${escapeHtml(input.status)}">
  <div class="section-heading">
    <div>
      <h2>${input.aliasId ? `<span id="${escapeHtml(input.aliasId)}"></span>` : ""}${escapeHtml(input.title)}</h2>
      <p>${escapeHtml(candidates.length === 0 ? input.empty : `${candidates.length} item(s)`)}</p>
    </div>
    <strong>${escapeHtml(String(candidates.length))}</strong>
  </div>
  ${input.commands.length > 0 ? `<div class="command-strip">${input.commands.map((command) => `<code>${escapeHtml(command)}</code>`).join("\n")}</div>` : ""}
  ${candidates.length > 0 ? `<ol class="experience-list">${candidates.map(renderCandidateCard).join("\n")}</ol>` : ""}
</section>`;
}

function renderHumanRequired(
  records: HumanRequiredRecord[],
  dailyReport: DailyReportSummary | null,
  privacyTriageReport: PrivacyTriageReportSummary | null
): string {
  const latestPrivacyRequired = dailyReport?.privacy_required ?? records.length;
  const visibleRecords = records.slice(0, 50);
  const isTeamGit = dailyReport?.authority_mode === "team-git";
  const triageCommand = isTeamGit
    ? "praxisbase privacy triage --mode team-git --include-triaged --progress --json"
    : "praxisbase privacy triage --mode personal --auto-release --progress --json";
  const followupCommand = isTeamGit
    ? "praxisbase wiki build-site --json"
    : "praxisbase personal run --open --json";
  return `<section id="human-required" class="review-section" data-status="needs_human">
  <div class="section-heading">
    <div>
      <h2><span id="privacy-required"></span>Privacy Required</h2>
      <p>Latest daily blocked ${escapeHtml(String(latestPrivacyRequired))} item(s); historical backlog has ${escapeHtml(String(records.length))} record(s).</p>
    </div>
    <strong>${escapeHtml(String(latestPrivacyRequired))}</strong>
  </div>
  <div class="command-strip">
    <code>${escapeHtml(triageCommand)}</code>
    <code>${escapeHtml(followupCommand)}</code>
  </div>
  ${privacyTriageReport ? `<dl class="queue-summary">
    <dt>Latest triage</dt><dd>${escapeHtml(privacyTriageReport.created_at)}</dd>
    <dt>Scanned</dt><dd>${escapeHtml(String(privacyTriageReport.scanned))}</dd>
    <dt>Auto released</dt><dd>${escapeHtml(String(privacyTriageReport.auto_released))}</dd>
    <dt>Kept human-required</dt><dd>${escapeHtml(String(privacyTriageReport.keep_human_required))}</dd>
    <dt>Team review-only</dt><dd>${escapeHtml(String(privacyTriageReport.team_review_only))}</dd>
    <dt>Skipped already triaged</dt><dd>${escapeHtml(String(privacyTriageReport.skipped_already_triaged))}</dd>
    <dt>Skipped non-privacy</dt><dd>${escapeHtml(String(privacyTriageReport.skipped_non_privacy))}</dd>
  </dl>` : ""}
  ${records.length > visibleRecords.length ? `<p class="muted">Showing the latest ${escapeHtml(String(visibleRecords.length))} privacy records. Older backlog is intentionally hidden from the default page to keep current daily work readable.</p>` : ""}
  ${visibleRecords.length > 0 ? `<ol class="experience-list">
    ${visibleRecords.map((item) => {
      const detailsReleased = humanRequiredDetailsReleased(item);
      return `<li id="${escapeHtml(item.id)}" class="review-card">
      <p><strong>${escapeHtml(item.reason)}</strong> <span class="status-pill">Privacy required</span></p>
      <dl>
        <dt>Source</dt><dd><code>${escapeHtml(item.source_id)}</code></dd>
        <dt>Agent</dt><dd>${escapeHtml(item.agent ?? "unknown")}</dd>
        <dt>Scope</dt><dd>${escapeHtml(item.scope ?? "unknown")}</dd>
        ${detailsReleased ? `<dt>Ref</dt><dd><code>${escapeHtml(item.source_ref ?? "n/a")}</code></dd>` : ""}
        ${detailsReleased && item.redacted_summary ? `<dt>Summary</dt><dd>${escapeHtml(item.redacted_summary)}</dd>` : ""}
        <dt>File</dt><dd><code>${escapeHtml(item.path)}</code></dd>
        <dt>Created</dt><dd>${escapeHtml(item.created_at)}</dd>
        <dt>Recommended</dt><dd><code>${escapeHtml(triageCommand)}</code></dd>
        ${item.triage ? `
        <dt>Triage</dt><dd>${escapeHtml(item.triage.classification ?? "unknown")} / ${escapeHtml(item.triage.decision ?? "unknown")}</dd>
        <dt>Confidence</dt><dd>${escapeHtml(item.triage.confidence ?? "n/a")}</dd>
        ${detailsReleased ? `<dt>Rationale</dt><dd>${escapeHtml(item.triage.rationale ?? "n/a")}</dd>` : `<dt>Details</dt><dd>Sensitive details hidden until privacy triage releases this record.</dd>`}
        ${detailsReleased && item.triage.suggested_redactions.length > 0 ? `<dt>Suggested Redactions</dt><dd>${escapeHtml(item.triage.suggested_redactions.join(", "))}</dd>` : ""}
        ` : ""}
      </dl>
    </li>`;
    }).join("\n")}
  </ol>` : "<p>No privacy-required records.</p>"}
</section>`;
}

function humanRequiredDetailsReleased(item: HumanRequiredRecord): boolean {
  if (!item.triage) return false;
  return item.triage.decision === "auto_released";
}

function renderRejectedSection(dailyReport: DailyReportSummary | null, curationReport: WikiCurationReportSummary | null): string {
  const dailyRejected = dailyReport?.rejected ?? 0;
  const lowSignal = dailyReport?.rejected_low_signal ?? 0;
  const qualityRejected = (dailyReport?.rejected_quality ?? 0) + (curationReport?.compiler_hard_blocks ?? 0);
  const duplicates = curationReport?.compiler_duplicate_source_hash_groups ?? 0;
  const curationRejected = curationReport?.input_rejected ?? 0;
  const hardBlocks = curationReport?.compiler_hard_blocks ?? 0;
  const total = dailyRejected + curationRejected + hardBlocks;
  return `<section id="rejected" class="review-section" data-status="rejected">
  <div class="section-heading">
    <div>
      <h2>Rejected</h2>
      <p>Low-signal, duplicate, private, or quality-blocked material that intentionally did not become wiki.</p>
    </div>
    <strong>${escapeHtml(String(total))}</strong>
  </div>
  <dl class="queue-summary">
    <dt>Daily rejected</dt><dd>${escapeHtml(String(dailyRejected))}</dd>
    <dt>Low signal</dt><dd>${escapeHtml(String(lowSignal))}</dd>
    <dt>Quality rejected</dt><dd>${escapeHtml(String(qualityRejected))}</dd>
    <dt>Duplicate groups</dt><dd>${escapeHtml(String(duplicates))}</dd>
    <dt>Curation rejected</dt><dd>${escapeHtml(String(curationRejected))}</dd>
    <dt>Hard blocks</dt><dd>${escapeHtml(String(hardBlocks))}</dd>
    <dt>Recommended</dt><dd><code>praxisbase wiki curate --review --json</code></dd>
  </dl>
</section>`;
}

function renderReviewPage(
  pages: WikiSitePage[],
  graph: WikiGraph,
  queue: ReviewQueue,
  curationReport: WikiCurationReportSummary | null,
  dailyReport: DailyReportSummary | null,
  privacyTriageReport: PrivacyTriageReportSummary | null
): string {
  const candidateHuman = queue.candidates.filter((item) => item.status === "needs_human").length;
  const currentPrivacyRequired = dailyReport?.privacy_required ?? queue.human_required.length;
  const counts = {
    pending: queue.candidates.filter((item) => item.status === "pending").length,
    approved: queue.candidates.filter((item) => item.status === "approved").length,
    promoted: queue.candidates.filter((item) => item.status === "promoted").length,
    current_privacy: currentPrivacyRequired,
    backlog_privacy: queue.human_required.length,
    candidate_human: candidateHuman,
    rejected: (dailyReport?.rejected ?? 0) + (curationReport?.input_rejected ?? 0) + (curationReport?.compiler_hard_blocks ?? 0),
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
    <a class="metric-link" href="#pending-candidates"><span>Review required</span><strong>${escapeHtml(String(counts.pending))}</strong></a>
    <a class="metric-link" href="#approved-candidates"><span>Approved</span><strong>${escapeHtml(String(counts.approved))}</strong></a>
    <a class="metric-link" href="#human-required"><span>Current privacy</span><strong>${escapeHtml(String(counts.current_privacy))}</strong></a>
    <a class="metric-link" href="#human-required"><span>Privacy backlog</span><strong>${escapeHtml(String(counts.backlog_privacy))}</strong></a>
    ${counts.candidate_human > 0 ? `<a class="metric-link" href="#human-required"><span>Candidate human</span><strong>${escapeHtml(String(counts.candidate_human))}</strong></a>` : ""}
    <a class="metric-link" href="#rejected"><span>Rejected</span><strong>${escapeHtml(String(counts.rejected))}</strong></a>
    <a class="metric-link" href="#promoted-candidates"><span>Promoted</span><strong>${escapeHtml(String(counts.promoted))}</strong></a>
  </section>
  ${dailyReport?.personal_ga ? renderPersonalGaSection(dailyReport.personal_ga) : ""}
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
  ${renderCandidateSection({ id: "pending-candidates", aliasId: "review-required", title: "Review Required", status: "pending", candidates: queue.candidates, empty: "No review-required candidates.", commands: ["praxisbase review --auto", "praxisbase promote --auto", "praxisbase wiki build-site --json"] })}
  ${renderCandidateSection({ id: "approved-candidates", title: "Reviewed / Approved", status: "approved", candidates: queue.candidates, empty: "No approved candidates waiting for promotion.", commands: ["praxisbase promote --auto", "praxisbase wiki build-site --json"] })}
  ${renderHumanRequired(queue.human_required, dailyReport, privacyTriageReport)}
  ${renderRejectedSection(dailyReport, curationReport)}
  ${renderCandidateSection({ id: "promoted-candidates", title: "Promoted", status: "promoted", candidates: queue.candidates, empty: "No promoted candidates from the current inbox.", commands: ["praxisbase gbrain export --mode personal --write --json", "praxisbase agentmemory export --mode personal --write --json"] })}
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
  agentBundleReport: AgentBundleReportSummary | null,
  personalFacetCounts: PersonalFacetCounts,
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
  ${renderRuntimeContextSection(agentBundleReport, personalFacetCounts)}
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
    ${report.proposal_limit !== undefined ? `<article><span>Proposal limit</span><strong>${escapeHtml(String(report.proposal_limit))}</strong></article>` : ""}
    ${report.limit_reason ? `<article><span>Limit reason</span><strong>${escapeHtml(report.limit_reason)}</strong></article>` : ""}
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
  privacy_required: number;
  rejected_low_signal: number;
  rejected_quality: number;
  proposal_candidates: number;
  site_pages: number;
  context_economy?: {
    enabled: boolean;
    items_seen: number;
    items_reduced: number;
    saved_bytes: number;
    rule_set_hash: string;
    report_ref?: string;
    warnings: string[];
  };
  context_juice?: {
    enabled: boolean;
    items_seen: number;
    items_budgeted: number;
    items_microcompacted: number;
    saved_bytes: number;
    presummary_summarized: number;
    presummary_saved_bytes: number;
    report_ref?: string;
    warnings: string[];
  };
	  semantic_review?: {
    enabled: boolean;
    reviewed: number;
    promote: number;
    reject: number;
	    needs_human: number;
	  };
	  skill_synthesis?: {
	    enabled: boolean;
	    signals: number;
	    rejected_signals: number;
	    clusters: number;
	    candidates: number;
	    reviewed: number;
	    approved: number;
	    rejected: number;
	    needs_human: number;
	    skipped: number;
	    promoted: number;
	  };
	  lifecycle?: {
	    proposals_by_decision: Record<string, number>;
	  };
	  skill_validation?: {
	    total_reports: number;
	    by_decision: Record<string, number>;
	    candidates_without_passing: number;
	  };
	  lessons?: {
	    enabled: boolean;
	    source_items: number;
	    selected_spans: number;
	    deterministic_lessons: number;
	    ai_lessons: number;
	    active_personal: number;
	    wiki_ready: number;
	    skill_ready: number;
	    human_required: number;
	    rejected: number;
	    wiki_evidence: number;
	    ai_cache?: {
	      enabled: boolean;
	      hits: number;
	      misses: number;
	      writes: number;
	      corrupt: number;
	    };
	    golden_validation: Array<{
	      fixture: string;
	      matches: number;
	      privateLeakCount: number;
	    }>;
	    details: Array<{
	      safe_claim: string;
	      state: string;
	      privacy_tier: string;
	      applies_to_systems: string[];
	      span_refs: string[];
	    }>;
	    report_ref?: string;
	  };
	  personal_ga?: {
	    mode: string;
	    source_coverage: Array<{
	      agent: string;
	      source_kind: string;
	      configured: boolean;
	      available: boolean;
	      items: number;
	      content_spans?: number;
	      origin?: string;
	      privacy_scope?: string;
	      blocking?: boolean;
	    }>;
	    lesson_count: number;
	    disposition_count: number;
	    golden_validation: {
	      matched: number;
	      required: number;
	      missed: string[];
	    };
	    leakage_scan: {
	      passed: boolean;
	      findings: string[];
	    };
	    cache: {
	      hits: number;
	      misses: number;
	      writes: number;
	    };
	    agent_consumption: Array<{
	      surface: string;
	      available: boolean;
	      authority: string[];
	    }>;
	    dispositions: Array<{
	      lesson_id: string;
	      state: string;
	      decision: string;
	      target?: string;
	      reason: string;
	      blocking_reason?: string;
	      privacy_tier: string;
	      portability: string;
	      applies_to_agents: string[];
	      applies_to_systems: string[];
	    }>;
	    production_ready: boolean;
	    blocking_reasons: string[];
	    warnings: string[];
	  };
	  agentmemory_sources: Array<{
    name: string;
    status: string;
    imported: number;
    warnings: string[];
  }>;
  brain_backends?: {
    gbrain?: {
      enabled: boolean;
      doctor_status: string;
      publish_status: string;
      pages: number;
      exported: number;
      skipped: number;
      imported: number;
      warnings: string[];
      errors: string[];
    };
  };
}

interface PrivacyTriageReportSummary {
  created_at: string;
  scanned: number;
  skipped_already_triaged: number;
  skipped_non_privacy: number;
  auto_released: number;
  keep_human_required: number;
  team_review_only: number;
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
  proposal_limit?: number;
  limit_reason?: string;
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

  const candidates: Array<{
    created_at: string;
    sources?: Array<{
      name?: string;
      source_type?: string;
      status?: string;
	      imported?: number;
	      rejected?: number;
	      human_required?: number;
	      warnings?: string[];
	    }>;
	    authority_mode?: string;
	    proposal_candidates?: number;
	    site_pages?: number;
    ai_distill?: {
      rejected_low_signal?: number;
      rejected_quality?: number;
      review_required?: number;
      privacy_required?: number;
    };
    context_economy?: {
      enabled?: boolean;
      items_seen?: number;
      items_reduced?: number;
      saved_bytes?: number;
      rule_set_hash?: string;
      report_ref?: string;
      warnings?: string[];
    };
    context_juice?: {
      enabled?: boolean;
      items_seen?: number;
      items_budgeted?: number;
      items_microcompacted?: number;
      saved_bytes?: number;
      presummary_summarized?: number;
      presummary_saved_bytes?: number;
      report_ref?: string;
      warnings?: string[];
    };
	    semantic_review?: {
      enabled?: boolean;
      reviewed?: number;
      promote?: number;
      reject?: number;
	      needs_human?: number;
	    };
	    skill_synthesis?: {
	      enabled?: boolean;
	      signals?: number;
	      rejected_signals?: number;
	      clusters?: number;
	      candidates?: number;
	      reviewed?: number;
	      approved?: number;
	      rejected?: number;
	      needs_human?: number;
	      skipped?: number;
	      promoted?: number;
	    };
	    lifecycle?: {
	      proposals_by_decision?: Record<string, number>;
	    };
	    skill_validation?: {
	      total_reports?: number;
	      by_decision?: Record<string, number>;
	      candidates_without_passing?: number;
	    };
	    lessons?: {
	      enabled?: boolean;
	      source_items?: number;
	      selected_spans?: number;
	      deterministic_lessons?: number;
	      ai_lessons?: number;
	      active_personal?: number;
	      wiki_ready?: number;
	      skill_ready?: number;
	      human_required?: number;
	      rejected?: number;
	      wiki_evidence?: number;
	      golden_validation?: Array<Record<string, unknown>>;
	      report_ref?: string;
	    };
	    personal_ga?: Record<string, unknown>;
    brain_backends?: {
      gbrain?: {
        enabled?: boolean;
        doctor_status?: string;
        publish_status?: string;
        pages?: number;
        exported?: number;
        skipped?: number;
        imported?: number;
        warnings?: string[];
        errors?: string[];
      };
    };
	    type?: string;
  }> = [];

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
  const contextEconomy = latest.context_economy;
  const contextJuice = latest.context_juice;
  const gbrain = latest.brain_backends?.gbrain;
  const latestLessons = latest.lessons && (latest.lessons as Record<string, unknown>).enabled
    ? latest.lessons as Record<string, unknown>
    : undefined;
  const lessonDetails = typeof latestLessons?.report_ref === "string"
    ? await collectLessonDetails(root, latestLessons.report_ref)
    : [];

  return {
    created_at: latest.created_at,
    authority_mode: latest.authority_mode ?? "unknown",
    source_count: sources.length,
    imported: sources.reduce((sum, s) => sum + (s.imported ?? 0), 0),
    rejected: sources.reduce((sum, s) => sum + (s.rejected ?? 0), 0),
    human_required: sources.reduce((sum, s) => sum + (s.human_required ?? 0), 0),
    privacy_required: Math.max(
      sources.reduce((sum, s) => sum + (s.human_required ?? 0), 0),
      typeof latest.ai_distill?.privacy_required === "number" ? latest.ai_distill.privacy_required : 0,
    ),
    rejected_low_signal: typeof latest.ai_distill?.rejected_low_signal === "number" ? latest.ai_distill.rejected_low_signal : 0,
    rejected_quality: typeof latest.ai_distill?.rejected_quality === "number" ? latest.ai_distill.rejected_quality : 0,
    proposal_candidates: typeof latest.proposal_candidates === "number" ? latest.proposal_candidates : 0,
    site_pages: typeof latest.site_pages === "number" ? latest.site_pages : 0,
    context_economy: contextEconomy ? {
      enabled: contextEconomy.enabled === true,
      items_seen: typeof contextEconomy.items_seen === "number" ? contextEconomy.items_seen : 0,
      items_reduced: typeof contextEconomy.items_reduced === "number" ? contextEconomy.items_reduced : 0,
      saved_bytes: typeof contextEconomy.saved_bytes === "number" ? contextEconomy.saved_bytes : 0,
      rule_set_hash: contextEconomy.rule_set_hash ?? "unknown",
      report_ref: contextEconomy.report_ref,
      warnings: Array.isArray(contextEconomy.warnings) ? contextEconomy.warnings : [],
    } : undefined,
    context_juice: contextJuice ? {
      enabled: contextJuice.enabled === true,
      items_seen: typeof contextJuice.items_seen === "number" ? contextJuice.items_seen : 0,
      items_budgeted: typeof contextJuice.items_budgeted === "number" ? contextJuice.items_budgeted : 0,
      items_microcompacted: typeof contextJuice.items_microcompacted === "number" ? contextJuice.items_microcompacted : 0,
      saved_bytes: typeof contextJuice.saved_bytes === "number" ? contextJuice.saved_bytes : 0,
      presummary_summarized: typeof contextJuice.presummary_summarized === "number" ? contextJuice.presummary_summarized : 0,
      presummary_saved_bytes: typeof contextJuice.presummary_saved_bytes === "number" ? contextJuice.presummary_saved_bytes : 0,
      report_ref: contextJuice.report_ref,
      warnings: Array.isArray(contextJuice.warnings) ? contextJuice.warnings : [],
    } : undefined,
	    semantic_review: latest.semantic_review ? {
      enabled: latest.semantic_review.enabled === true,
      reviewed: typeof latest.semantic_review.reviewed === "number" ? latest.semantic_review.reviewed : 0,
      promote: typeof latest.semantic_review.promote === "number" ? latest.semantic_review.promote : 0,
      reject: typeof latest.semantic_review.reject === "number" ? latest.semantic_review.reject : 0,
	      needs_human: typeof latest.semantic_review.needs_human === "number" ? latest.semantic_review.needs_human : 0,
	    } : undefined,
	    skill_synthesis: latest.skill_synthesis ? {
	      enabled: latest.skill_synthesis.enabled === true,
	      signals: typeof latest.skill_synthesis.signals === "number" ? latest.skill_synthesis.signals : 0,
	      rejected_signals: typeof latest.skill_synthesis.rejected_signals === "number" ? latest.skill_synthesis.rejected_signals : 0,
	      clusters: typeof latest.skill_synthesis.clusters === "number" ? latest.skill_synthesis.clusters : 0,
	      candidates: typeof latest.skill_synthesis.candidates === "number" ? latest.skill_synthesis.candidates : 0,
	      reviewed: typeof latest.skill_synthesis.reviewed === "number" ? latest.skill_synthesis.reviewed : 0,
	      approved: typeof latest.skill_synthesis.approved === "number" ? latest.skill_synthesis.approved : 0,
	      rejected: typeof latest.skill_synthesis.rejected === "number" ? latest.skill_synthesis.rejected : 0,
	      needs_human: typeof latest.skill_synthesis.needs_human === "number" ? latest.skill_synthesis.needs_human : 0,
	      skipped: typeof latest.skill_synthesis.skipped === "number" ? latest.skill_synthesis.skipped : 0,
	      promoted: typeof latest.skill_synthesis.promoted === "number" ? latest.skill_synthesis.promoted : 0,
	    } : undefined,
	    lifecycle: latest.lifecycle ? {
	      proposals_by_decision: latest.lifecycle.proposals_by_decision && typeof latest.lifecycle.proposals_by_decision === "object" && !Array.isArray(latest.lifecycle.proposals_by_decision)
	        ? latest.lifecycle.proposals_by_decision as Record<string, number>
	        : {},
	    } : undefined,
	    skill_validation: latest.skill_validation ? {
	      total_reports: typeof latest.skill_validation.total_reports === "number" ? latest.skill_validation.total_reports : 0,
	      by_decision: latest.skill_validation.by_decision && typeof latest.skill_validation.by_decision === "object" && !Array.isArray(latest.skill_validation.by_decision)
	        ? latest.skill_validation.by_decision as Record<string, number>
	        : {},
	      candidates_without_passing: typeof latest.skill_validation.candidates_without_passing === "number" ? latest.skill_validation.candidates_without_passing : 0,
	    } : undefined,
	    lessons: latestLessons ? (() => {
	      const l = latestLessons;
	      const gv = Array.isArray(l.golden_validation) ? (l.golden_validation as Array<Record<string, unknown>>).filter((item) => item && typeof item === "object").map((item) => ({
	        fixture: typeof item.fixture === "string" ? item.fixture : "",
	        matches: typeof item.matches === "number" ? item.matches : 0,
	        privateLeakCount: typeof item.privateLeakCount === "number" ? item.privateLeakCount : 0,
	      })) : [];
	      return {
	        enabled: true,
	        source_items: typeof l.source_items === "number" ? l.source_items : 0,
	        selected_spans: typeof l.selected_spans === "number" ? l.selected_spans : 0,
	        deterministic_lessons: typeof l.deterministic_lessons === "number" ? l.deterministic_lessons : 0,
	        ai_lessons: typeof l.ai_lessons === "number" ? l.ai_lessons : 0,
	        active_personal: typeof l.active_personal === "number" ? l.active_personal : 0,
	        wiki_ready: typeof l.wiki_ready === "number" ? l.wiki_ready : 0,
	        skill_ready: typeof l.skill_ready === "number" ? l.skill_ready : 0,
	        human_required: typeof l.human_required === "number" ? l.human_required : 0,
	        rejected: typeof l.rejected === "number" ? l.rejected : 0,
	        wiki_evidence: typeof l.wiki_evidence === "number" ? l.wiki_evidence : 0,
	        ai_cache: l.ai_cache && typeof l.ai_cache === "object" ? (() => {
	          const cache = l.ai_cache as Record<string, unknown>;
	          return {
	            enabled: Boolean(cache.enabled),
	            hits: typeof cache.hits === "number" ? cache.hits : 0,
	            misses: typeof cache.misses === "number" ? cache.misses : 0,
	            writes: typeof cache.writes === "number" ? cache.writes : 0,
	            corrupt: typeof cache.corrupt === "number" ? cache.corrupt : 0,
	          };
	        })() : undefined,
	        golden_validation: gv,
	        details: lessonDetails,
	        report_ref: typeof l.report_ref === "string" ? l.report_ref : undefined,
	      };
	    })() : undefined,
	    personal_ga: latest.personal_ga ? parsePersonalGaSummary(latest.personal_ga) : undefined,
	    agentmemory_sources: sources
      .filter((source) => source.source_type === "agentmemory")
      .map((source) => ({
        name: source.name ?? "agentmemory",
        status: source.status ?? "unknown",
        imported: source.imported ?? 0,
        warnings: Array.isArray(source.warnings) ? source.warnings : [],
      })),
    brain_backends: gbrain ? {
      gbrain: {
        enabled: gbrain.enabled === true,
        doctor_status: typeof gbrain.doctor_status === "string" ? gbrain.doctor_status : "unknown",
        publish_status: typeof gbrain.publish_status === "string" ? gbrain.publish_status : "not_requested",
        pages: typeof gbrain.pages === "number" ? gbrain.pages : 0,
        exported: typeof gbrain.exported === "number" ? gbrain.exported : 0,
        skipped: typeof gbrain.skipped === "number" ? gbrain.skipped : 0,
        imported: typeof gbrain.imported === "number" ? gbrain.imported : 0,
        warnings: Array.isArray(gbrain.warnings) ? gbrain.warnings : [],
        errors: Array.isArray(gbrain.errors) ? gbrain.errors : [],
      },
    } : undefined,
  };
}

async function collectLessonDetails(
  root: string,
  reportRef: string,
): Promise<NonNullable<DailyReportSummary["lessons"]>["details"]> {
  try {
    const report = await readJson<Record<string, unknown>>(root, reportRef);
    const lessons = Array.isArray(report.lessons) ? report.lessons : [];
    return lessons
      .filter((lesson): lesson is Record<string, unknown> => Boolean(lesson) && typeof lesson === "object")
      .slice(0, 8)
      .map((lesson) => {
        const spans = Array.isArray(lesson.evidence_spans) ? lesson.evidence_spans : [];
        return {
          safe_claim: typeof lesson.safe_claim === "string" ? lesson.safe_claim : "Untitled lesson",
          state: typeof lesson.state === "string" ? lesson.state : "candidate",
          privacy_tier: typeof lesson.privacy_tier === "string" ? lesson.privacy_tier : "human_required",
          applies_to_systems: Array.isArray(lesson.applies_to_systems)
            ? lesson.applies_to_systems.filter((item): item is string => typeof item === "string")
            : [],
          span_refs: spans
            .filter((span): span is Record<string, unknown> => Boolean(span) && typeof span === "object")
            .map((span) => {
              const sourceRef = typeof span.source_ref === "string" ? span.source_ref : "unknown-source";
              const spanId = typeof span.span_id === "string" ? span.span_id : "unknown-span";
              return `${sourceRef}#${spanId}`;
            }),
        };
      });
  } catch {
    return [];
  }
}

async function collectLatestAgentBundleReport(root: string): Promise<AgentBundleReportSummary | null> {
  const dir = safePathForReaddir(root, protocolPaths.reportsAgentBundles);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }

  const reports: AgentBundleReportSummary[] = [];
  for (const file of entries.filter((name) => name.endsWith(".json")).sort()) {
    try {
      const value = await readJson<Record<string, unknown>>(root, `${protocolPaths.reportsAgentBundles}/${file}`);
      if (value.type !== "agent_context_bundle") continue;
      const skillDecisions = Array.isArray(value.skill_decisions)
        ? value.skill_decisions.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        : [];
      const trust = value.trust_summary && typeof value.trust_summary === "object" && !Array.isArray(value.trust_summary)
        ? value.trust_summary as Record<string, unknown>
        : {};
      reports.push({
        id: stringValue(value.id) ?? file.replace(/\.json$/i, ""),
        mode: stringValue(value.mode) ?? "unknown",
        query: stringValue(value.query),
        total_bytes: numberValue(value.total_bytes) ?? 0,
        budget_bytes: numberValue(value.budget_bytes) ?? 0,
        trust_summary: Object.fromEntries(Object.entries(trust).map(([key, count]) => [key, typeof count === "number" ? count : 0])),
        skill_matched: skillDecisions.filter((decision) => decision.decision === "matched").length,
        skill_skipped: skillDecisions.filter((decision) => decision.decision === "skipped").length,
        skill_reasons: skillDecisions.map((decision) => `${stringValue(decision.skill_id) ?? "skill"}: ${stringValue(decision.reason) ?? "no reason"}`),
        omitted_item_count: numberValue(value.omitted_item_count) ?? 0,
        created_at: stringValue(value.created_at) ?? "",
      });
    } catch {
      continue;
    }
  }

  if (reports.length === 0) return null;
  return reports.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))[0];
}

async function collectPersonalFacetCounts(root: string): Promise<PersonalFacetCounts> {
  const counts: PersonalFacetCounts = {
    active: 0,
    provisional: 0,
    candidate: 0,
    pinned: 0,
    forgotten: 0,
  };
  let raw = "";
  try {
    raw = await readText(root, protocolPaths.personalFacets);
  } catch {
    return counts;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const value = JSON.parse(trimmed) as Record<string, unknown>;
      const state = stringValue(value.state);
      if (state === "active" || state === "provisional" || state === "candidate" || state === "pinned" || state === "forgotten") {
        counts[state]++;
      }
    } catch {
      continue;
    }
  }
  return counts;
}

async function collectLatestPrivacyTriageReport(root: string): Promise<PrivacyTriageReportSummary | null> {
  const dir = safePathForReaddir(root, protocolPaths.reportsPrivacyTriage);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }

  const candidates: Array<Record<string, unknown>> = [];
  for (const file of entries.filter((name) => name.endsWith(".json"))) {
    try {
      const report = await readJson<Record<string, unknown>>(root, `${protocolPaths.reportsPrivacyTriage}/${file}`);
      if (report && report.type === "privacy_triage_report" && typeof report.created_at === "string") {
        candidates.push(report);
      }
    } catch {
      continue;
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const latest = candidates[0];
  const summary = detailsRecord(latest.summary);

  return {
    created_at: String(latest.created_at),
    scanned: numberValue(summary.scanned) ?? 0,
    skipped_already_triaged: numberValue(summary.skipped_already_triaged) ?? 0,
    skipped_non_privacy: numberValue(summary.skipped_non_privacy) ?? 0,
    auto_released: numberValue(summary.auto_released) ?? 0,
    keep_human_required: numberValue(summary.keep_human_required) ?? 0,
    team_review_only: numberValue(summary.team_review_only) ?? 0,
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
    proposal_limit: numberValue(latest.proposal_limit),
    limit_reason: stringValue(latest.limit_reason),
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

function parsePersonalGaSummary(value: unknown): DailyReportSummary["personal_ga"] | undefined {
  const report = detailsRecord(value);
  if (Object.keys(report).length === 0) return undefined;
  const golden = detailsRecord(report.golden_validation);
  const leakage = detailsRecord(report.leakage_scan);
  const cache = detailsRecord(report.cache);
  const sources = Array.isArray(report.source_coverage)
    ? report.source_coverage.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((item) => ({
      agent: stringValue(item.agent) ?? "unknown",
      source_kind: stringValue(item.source_kind) ?? "unknown",
      configured: item.configured === true,
      available: item.available === true,
      items: numberValue(item.items) ?? 0,
      content_spans: numberValue(item.content_spans),
      origin: stringValue(item.origin),
      privacy_scope: stringValue(item.privacy_scope),
      blocking: item.blocking === true,
    }))
    : [];
  const dispositions = Array.isArray(report.dispositions)
    ? report.dispositions.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((item) => ({
      lesson_id: stringValue(item.lesson_id) ?? "unknown-lesson",
      state: stringValue(item.state) ?? "unknown",
      decision: stringValue(item.decision) ?? "needs_human",
      target: stringValue(item.target),
      reason: stringValue(item.reason) ?? "n/a",
      blocking_reason: stringValue(item.blocking_reason),
      privacy_tier: stringValue(item.privacy_tier) ?? "human_required",
      portability: stringValue(item.portability) ?? "project",
      applies_to_agents: stringArray(item.applies_to_agents),
      applies_to_systems: stringArray(item.applies_to_systems),
    }))
    : [];
  const agentConsumption = Array.isArray(report.agent_consumption)
    ? report.agent_consumption.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((item) => ({
      surface: stringValue(item.surface) ?? "unknown",
      available: item.available === true,
      authority: stringArray(item.authority),
    }))
    : [];
  return {
    mode: stringValue(report.mode) ?? "degraded_no_ai",
    source_coverage: sources,
    lesson_count: numberValue(report.lesson_count) ?? 0,
    disposition_count: numberValue(report.disposition_count) ?? dispositions.length,
    golden_validation: {
      matched: numberValue(golden.matched) ?? 0,
      required: numberValue(golden.required) ?? 0,
      missed: stringArray(golden.missed),
    },
    leakage_scan: {
      passed: leakage.passed === true,
      findings: stringArray(leakage.findings),
    },
    cache: {
      hits: numberValue(cache.hits) ?? 0,
      misses: numberValue(cache.misses) ?? 0,
      writes: numberValue(cache.writes) ?? 0,
    },
    agent_consumption: agentConsumption,
    dispositions,
    production_ready: report.production_ready === true,
    blocking_reasons: stringArray(report.blocking_reasons),
    warnings: stringArray(report.warnings),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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
        redacted_summary: stringValue(details.redacted_summary),
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

    const isSkillCandidate = candidate.source_kind === "skill_synthesis" || candidate.kind === "skill";
    let validationStatus: string | undefined;
    if (isSkillCandidate) {
      const sourceHashes = candidate.source_hash.split(",").map((hash) => hash.trim()).filter(Boolean);
      const validation = await findFreshPassingValidationReport(root, {
        id: candidate.id,
        target_path: candidate.patch_path,
        source_hashes: sourceHashes,
      });
      validationStatus = validation.status === "pass"
        ? "validated"
        : validation.status === "missing"
          ? "validation needed"
          : validation.status === "stale"
            ? "validation stale"
            : validation.status === "mismatched"
              ? "validation mismatched"
              : "validation failed";
    }

    reviewCandidates.push({ ...candidate, status, review_decision: decision, validation_status: validationStatus });
  }

  return { candidates: reviewCandidates, human_required: humanRequired };
}

export async function buildWikiSite(root: string): Promise<BuildWikiSiteResult> {
  const pages = await collectWikiPages(root);
  const pendingCandidates = await collectPendingWikiProposalCandidates(root);
  const reviewQueue = await buildReviewQueue(root, pendingCandidates);
  const graph = buildWikiGraph(pages);
  const rootArtifactOutputs = await writeRootWikiArtifacts(root, pages, graph, new Date().toISOString());
  const lintReport = await runWikiLint(root, { pages });
  const qualityReport = await buildWikiQualityReport(root, { pages, graph });
  const outputs = [...SITE_OUTPUTS];
  const dailyReport = await collectLatestDailyReport(root);
  const agentBundleReport = await collectLatestAgentBundleReport(root);
  const personalFacetCounts = await collectPersonalFacetCounts(root);
  const privacyTriageReport = await collectLatestPrivacyTriageReport(root);
  const curationReport = await collectLatestWikiCurationReport(root);
  const experienceSummaries = await collectLatestExperienceSummaries(root);
  const bundleStatus = await exists(root, "dist/repair-bundles/manifest.json") ? "ready" : "not built";
  const stalePages = lintReport.findings.filter((finding) => finding.rule === "stale_active_page").length;
  outputs.push(`${protocolPaths.reportsWikiQuality}/${qualityReport.id}.json`);
  outputs.push(...rootArtifactOutputs);

  await writeText(root, "dist/index.html", renderDashboard(pages, graph, bundleStatus, stalePages, qualityReport.summary.total, dailyReport, agentBundleReport, personalFacetCounts, experienceSummaries, pendingCandidates, curationReport));
  await writeText(root, "dist/review.html", renderReviewPage(pages, graph, reviewQueue, curationReport, dailyReport, privacyTriageReport));
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
