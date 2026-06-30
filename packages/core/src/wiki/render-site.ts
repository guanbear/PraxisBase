import { readdir, rm, stat } from "node:fs/promises";
import { posix } from "node:path";
import matter from "gray-matter";
import { escapeHtml, escapeJsonForHtml } from "../build/html.js";
import { protocolPaths } from "../protocol/paths.js";
import { readJson, readText, safePath, writeJson, writeText } from "../store/file-store.js";
import { readProjectLanguageConfig, readProjectReviewUiConfig, type ProjectKnowledgeConfig, type ProjectLanguage, type ProjectReviewUiConfig } from "../config/project.js";
import { listExperienceSources } from "../experience/source-config.js";
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
  knowledge_base?: string;
  scope?: string;
  status?: string;
  maturity?: string;
  confidence?: number;
  reference_count?: number;
  updated_at?: string;
  superseded_by?: string | null;
  description?: string;
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
      knowledge_base: stringValue(data.knowledge_base) ?? stringValue(data.knowledge_source),
      scope: stringValue(data.scope),
      status: stringValue(data.status),
      maturity: stringValue(data.maturity),
      confidence: numberValue(data.confidence),
      reference_count: numberValue(data.reference_count),
      updated_at: stringValue(data.updated_at),
      superseded_by: stringValue(data.superseded_by) ?? null,
      description: stringValue(data.description),
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
    if (metadata.status === "archived" || metadata.maturity === "archived") continue;
    const title = source.title;
    const identity = pageIdentity(source, metadata, title);
    const body = source.body ?? source.summary;
    pages.push({
      id: identity.id,
      slug: identity.slug,
      title,
      page_kind: pageKind(source, metadata),
      knowledge_base: metadata.knowledge_base,
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
      description: metadata.description,
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

function renderLayout(input: { title: string; body: string; graph?: WikiGraph; pages: WikiSitePage[]; assetPrefix?: string; language?: ProjectLanguage }): string {
  const prefix = input.assetPrefix ?? "";
  const language = input.language ?? "en";
  const zh = language === "zh-CN";
  return `<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title)}</title>
  <link rel="stylesheet" href="${escapeHtml(prefix)}style.css">
  <script>(function(){try{var t=localStorage.getItem("praxisbase.theme");var d=t==="light"||t==="dark"?t:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",d);}catch(e){}})();</script>
</head>
<body>
  <header class="topbar">
    <a class="brand" href="${escapeHtml(prefix)}index.html" data-i18n="brand">${escapeHtml(zh ? "PraxisBase 知识库" : "PraxisBase Wiki")}</a>
    <div class="search">
      <input id="searchInput" type="search" placeholder="${escapeHtml(zh ? "搜索知识" : "Search knowledge")}" autocomplete="off">
      <div id="searchResults" class="search-results" hidden></div>
    </div>
    <nav class="topnav" aria-label="${escapeHtml(zh ? "知识库视图" : "Wiki views")}" data-i18n-aria-label="nav.aria">
      <a href="${escapeHtml(prefix)}index.html" data-i18n="nav.index">${escapeHtml(zh ? "总览" : "Overview")}</a>
      <a href="${escapeHtml(prefix)}review.html" data-i18n="nav.review">${escapeHtml(zh ? "审批" : "Approvals")}</a>
      <a href="${escapeHtml(prefix)}graph.html" data-i18n="nav.graph">${escapeHtml(zh ? "关系" : "Relationships")}</a>
      <a href="${escapeHtml(prefix)}issues.html" data-i18n="nav.issues">${escapeHtml(zh ? "质检" : "Quality")}</a>
      <div class="theme-switch" aria-label="${escapeHtml(zh ? "切换主题" : "Theme")}">
        <button type="button" data-theme-option="light" aria-pressed="false" title="${escapeHtml(zh ? "浅色" : "Light")}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"></path></svg>
        </button>
        <button type="button" data-theme-option="dark" aria-pressed="false" title="${escapeHtml(zh ? "深色" : "Dark")}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>
        </button>
      </div>
      <div class="language-switch" aria-label="${escapeHtml(zh ? "切换语言" : "Switch language")}" data-i18n-aria-label="language.switch">
        <svg class="language-switch-icon" aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M3 12h18"></path>
          <path d="M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9"></path>
          <path d="M12 3C9.6 5.5 8.4 8.5 8.4 12s1.2 6.5 3.6 9"></path>
        </svg>
        <button type="button" data-language-option="zh-CN" aria-pressed="${zh ? "true" : "false"}">中</button>
        <button type="button" data-language-option="en" aria-pressed="${!zh ? "true" : "false"}">EN</button>
        <select id="languageSelect" class="language-select-native" aria-label="Language" tabindex="-1">
          <option value="zh-CN"${zh ? " selected" : ""}>中文</option>
          <option value="en"${!zh ? " selected" : ""}>English</option>
        </select>
      </div>
    </nav>
  </header>
  ${input.body}
  <script>window.__PRAXISBASE_LANGUAGE__=${escapeJsonForHtml(language)};</script>
  <script>window.__WIKI_BASE__=${escapeJsonForHtml(prefix)};</script>
  <script>window.__WIKI_GRAPH__=${escapeJsonForHtml(input.graph ?? null)};</script>
  <script src="${escapeHtml(prefix)}site.js"></script>
</body>
</html>`;
}

function renderDailyUpdateSection(report: DailyReportSummary, language: ProjectLanguage = "en"): string {
  const useZh = zh(language);
  const label = (english: string, chinese: string) => useZh ? chinese : english;
  const dateLabel = report.created_at.slice(0, 10);
  const contextEconomy = report.context_economy;
  const contextJuice = report.context_juice;
  const semanticReview = report.semantic_review;
  const skillSynthesis = report.skill_synthesis;
  const dailyCards: Array<{ label: string; value: string; href?: string }> = [
    { label: label("Sources", "来源"), value: String(report.source_count) },
    { label: label("Imported", "已导入"), value: String(report.imported) },
    { label: label("Rejected", "已拒绝"), value: String(report.rejected) },
    { label: label("Human required", "需要人工"), value: String(report.human_required), href: "review.html#human-required" },
    { label: label("Proposals", "提案"), value: String(report.proposal_candidates), href: "review.html#pending-candidates" },
    { label: label("Site pages", "站点页面"), value: String(report.site_pages) },
  ];
  return `<section class="daily-update">
  <h2>${label("Latest Daily Experience", "最新 Daily 经验")}</h2>
  <p class="eyebrow">${escapeHtml(dateLabel)} &middot; ${escapeHtml(report.authority_mode)}</p>
  <div class="metrics">
    ${dailyCards.map((card) => card.href
      ? `<a class="metric-link" href="${escapeHtml(card.href)}"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></a>`
      : `<article><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></article>`).join("\n")}
    ${contextEconomy ? `<article><span>${label("Context Economy", "上下文瘦身")}</span><strong>${escapeHtml(contextEconomy.enabled ? label("On", "开启") : label("Off", "关闭"))}</strong></article>
    <article><span>${label("Reduced items", "已压缩项")}</span><strong>${escapeHtml(String(contextEconomy.items_reduced))}</strong></article>
    <article><span>${label("Saved bytes", "节省字节")}</span><strong>${escapeHtml(contextEconomy.saved_bytes.toLocaleString("en-US"))}</strong></article>` : ""}
    ${contextJuice ? `<article><span>${label("Context Juice", "上下文预算")}</span><strong>${escapeHtml(contextJuice.enabled ? label("On", "开启") : label("Off", "关闭"))}</strong></article>
    <article><span>${label("Budgeted items", "预算内项目")}</span><strong>${escapeHtml(String(contextJuice.items_budgeted))}</strong></article>
    <article><span>${label("Juice saved bytes", "预算节省字节")}</span><strong>${escapeHtml(contextJuice.saved_bytes.toLocaleString("en-US"))}</strong></article>
    <article><span>${label("Pre-summaries", "预摘要")}</span><strong>${escapeHtml(String(contextJuice.presummary_summarized))}</strong></article>` : ""}
	    ${semanticReview && semanticReview.enabled ? `<article><span>${label("Semantic review", "语义审核")}</span><strong>${escapeHtml(String(semanticReview.reviewed))} ${label("reviewed", "已审核")}</strong></article>
	    <article><span>${label("Semantic promote", "语义提升")}</span><strong>${escapeHtml(String(semanticReview.promote))}</strong></article>
	    <article><span>${label("Semantic reject", "语义拒绝")}</span><strong>${escapeHtml(String(semanticReview.reject))}</strong></article>
	    <article><span>${label("Semantic needs human", "语义需人工")}</span><strong>${escapeHtml(String(semanticReview.needs_human))}</strong></article>` : ""}
	    ${skillSynthesis && skillSynthesis.enabled ? `<article><span>${label("Skill synthesis", "技能合成")}</span><strong>${escapeHtml(String(skillSynthesis.reviewed))} ${label("reviewed", "已审核")}</strong></article>
	    <article><span>${label("Skill candidates", "技能候选")}</span><strong>${escapeHtml(String(skillSynthesis.candidates))}</strong></article>
	    <article><span>${label("Skill approved", "技能已批准")}</span><strong>${escapeHtml(String(skillSynthesis.approved))}</strong></article>
	    <article><span>${label("Skill skipped", "技能已跳过")}</span><strong>${escapeHtml(String(skillSynthesis.skipped ?? 0))}</strong></article>
	    <article><span>${label("Skill rejected signals", "技能拒绝信号")}</span><strong>${escapeHtml(String(skillSynthesis.rejected_signals ?? 0))}</strong></article>
	    <article><span>${label("Skill needs human", "技能需人工")}</span><strong>${escapeHtml(String(skillSynthesis.needs_human))}</strong></article>` : ""}
	    ${report.lifecycle ? (() => {
	      const decisions = report.lifecycle.proposals_by_decision;
	      const total = Object.values(decisions).reduce((sum, count) => sum + count, 0);
	      return total > 0 ? `<article><span>${label("Lifecycle proposals", "生命周期提案")}</span><strong>${escapeHtml(String(total))}</strong></article>
	      ${decisions["promote"] ? `<article><span>${label("Lifecycle promote", "生命周期提升")}</span><strong>${escapeHtml(String(decisions["promote"]))}</strong></article>` : ""}
	      ${decisions["decay"] ? `<article><span>${label("Lifecycle decay", "生命周期衰减")}</span><strong>${escapeHtml(String(decisions["decay"]))}</strong></article>` : ""}
	      ${decisions["archive"] ? `<article><span>${label("Lifecycle archive", "生命周期归档")}</span><strong>${escapeHtml(String(decisions["archive"]))}</strong></article>` : ""}
	      ${decisions["conflict"] ? `<article><span>${label("Lifecycle conflict", "生命周期冲突")}</span><strong>${escapeHtml(String(decisions["conflict"]))}</strong></article>` : ""}
	      ${decisions["no_op"] ? `<article><span>${label("Lifecycle no-op", "生命周期无操作")}</span><strong>${escapeHtml(String(decisions["no_op"]))}</strong></article>` : ""}` : "";
	    })() : ""}
	    ${report.skill_validation && report.skill_validation.total_reports > 0 ? `<article><span>${label("Skill validation reports", "技能验证报告")}</span><strong>${escapeHtml(String(report.skill_validation.total_reports))}</strong></article>
	    ${report.skill_validation.by_decision["pass"] ? `<article><span>${label("Validation pass", "验证通过")}</span><strong>${escapeHtml(String(report.skill_validation.by_decision["pass"]))}</strong></article>` : ""}
	    ${report.skill_validation.by_decision["fail"] ? `<article><span>${label("Validation fail", "验证失败")}</span><strong>${escapeHtml(String(report.skill_validation.by_decision["fail"]))}</strong></article>` : ""}
	    ${report.skill_validation.by_decision["needs_human"] ? `<article><span>${label("Validation needs human", "验证需人工")}</span><strong>${escapeHtml(String(report.skill_validation.by_decision["needs_human"]))}</strong></article>` : ""}
	    ${report.skill_validation.candidates_without_passing > 0 ? `<article><span>${label("Candidates needing validation", "需验证候选")}</span><strong>${escapeHtml(String(report.skill_validation.candidates_without_passing))}</strong></article>` : ""}` : ""}
	    ${report.lessons && report.lessons.enabled ? `<article><span>M25 Lessons</span><strong>${escapeHtml(String(report.lessons.deterministic_lessons + report.lessons.ai_lessons))} ${label("extracted", "已提取")}</strong></article>
	    <article><span>${label("Lesson active personal", "个人活跃 Lesson")}</span><strong>${escapeHtml(String(report.lessons.active_personal))}</strong></article>
	    <article><span>${label("Lesson wiki ready", "Wiki 就绪 Lesson")}</span><strong>${escapeHtml(String(report.lessons.wiki_ready))}</strong></article>
	    <article><span>${label("Lesson skill ready", "技能就绪 Lesson")}</span><strong>${escapeHtml(String(report.lessons.skill_ready))}</strong></article>
	    <article><span>${label("Lesson human required", "Lesson 需人工")}</span><strong>${escapeHtml(String(report.lessons.human_required))}</strong></article>
	    <article><span>${label("Lesson rejected", "Lesson 已拒绝")}</span><strong>${escapeHtml(String(report.lessons.rejected))}</strong></article>
	    <article><span>${label("Lesson wiki evidence", "Lesson Wiki 证据")}</span><strong>${escapeHtml(String(report.lessons.wiki_evidence))}</strong></article>
	    ${report.lessons.ai_cache && report.lessons.ai_cache.enabled ? `<article><span>${label("Lesson AI cache hits", "Lesson AI 缓存命中")}</span><strong>${escapeHtml(String(report.lessons.ai_cache.hits))}</strong></article>
	    <article><span>${label("Lesson AI cache misses", "Lesson AI 缓存未命中")}</span><strong>${escapeHtml(String(report.lessons.ai_cache.misses))}</strong></article>` : ""}
	    ${report.lessons.golden_validation && report.lessons.golden_validation.length > 0 ? report.lessons.golden_validation.map((gv) => `<article><span>Golden ${escapeHtml(gv.fixture)}</span><strong>${escapeHtml(String(gv.matches))} ${label("matches", "匹配")} / ${escapeHtml(String(gv.privateLeakCount))} ${label("leaks", "泄漏")}</strong></article>`).join("\n") : ""}` : ""}
	  </div>
  ${report.lessons?.details && report.lessons.details.length > 0 ? renderLessonDetails(report.lessons.details, language) : ""}
  ${report.personal_ga ? renderPersonalGaSection(report.personal_ga) : ""}
  ${renderAgentMemoryStatus(report)}
  ${renderGBrainStatus(report)}
  ${contextJuice && contextJuice.warnings.length > 0 ? `<p class="muted">${label("Context juice warnings", "上下文预算警告")}: ${escapeHtml(contextJuice.warnings.join("; "))}</p>` : ""}
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

function renderLessonDetails(details: NonNullable<DailyReportSummary["lessons"]>["details"], language: ProjectLanguage = "en"): string {
  const useZh = zh(language);
  return `<div class="review-section" id="lesson-candidates">
    <h2>${useZh ? "Lesson 候选" : "Lesson Candidates"}</h2>
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

function renderEmptyState(input: { message: string; cta?: { href: string; label: string } }): string {
  const cta = input.cta ? `<a href="${escapeHtml(input.cta.href)}">${escapeHtml(input.cta.label)}</a>` : "";
  return `<div class="empty-state"><span class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v11H4z"></path><path d="M2 20h20M9 16l3 4 3-4"></path></svg></span><strong>${escapeHtml(input.message)}</strong>${cta}</div>`;
}

function renderMetricCard(card: { label: string; value: string; href?: string; i18nKey?: string }): string {
  const label = card.i18nKey ? `<span data-i18n="${escapeHtml(card.i18nKey)}">${escapeHtml(card.label)}</span>` : `<span>${escapeHtml(card.label)}</span>`;
  if (card.href) {
    return `<a class="metric-link" href="${escapeHtml(card.href)}">${label}<strong>${escapeHtml(card.value)}</strong></a>`;
  }
  return `<article>${label}<strong>${escapeHtml(card.value)}</strong></article>`;
}

function renderActionCard(input: { href: string; label: string; value: string; description: string; tone?: "warn" | "danger" | "ok" | "info" }): string {
  return `<a class="action-card" href="${escapeHtml(input.href)}"${input.tone ? ` data-tone="${escapeHtml(input.tone)}"` : ""}>
    <span>${escapeHtml(input.label)}</span>
    <strong>${escapeHtml(input.value)}</strong>
    <p>${escapeHtml(input.description)}</p>
  </a>`;
}

function normalizeKnowledgeBaseId(value: string | undefined): string {
  return (value ?? "default").trim().toLowerCase().replace(/_/g, "-") || "default";
}

function fallbackKnowledgeBaseLabel(id: string): string {
  if (id === "openclaw") return "OpenClaw";
  if (id === "k8s") return "K8s";
  if (id === "container-repair") return "容器修复";
  if (id === "feishu") return "飞书";
  if (id === "codex") return "Codex";
  if (id === "default") return "默认";
  return id.split("-").map((part) => part ? part[0]!.toUpperCase() + part.slice(1) : part).join(" ");
}

function knowledgeBaseLabel(id: string, config: ProjectKnowledgeConfig): string {
  return config.bases.find((base) => normalizeKnowledgeBaseId(base.id) === id)?.label ?? fallbackKnowledgeBaseLabel(id);
}

function knowledgeBaseFromPage(page: WikiSitePage): string {
  if (page.knowledge_base) return normalizeKnowledgeBaseId(page.knowledge_base);
  const combined = [
    page.path,
    page.title,
    ...page.signatures,
    ...page.source_ids,
    ...(page.provenance_refs ?? []).map((ref) => ref.uri),
  ].filter(Boolean).join("\n").toLowerCase();
  if (/\bk8s\b|kubernetes|oomkilled|pod/.test(combined)) return "k8s";
  if (/openclaw|octoclaw|answer-bot/.test(combined)) return "openclaw";
  if (/container|docker/.test(combined)) return "container-repair";
  if (/feishu|lark/.test(combined)) return "feishu";
  if (/codex/.test(combined)) return "codex";
  return "default";
}

interface KnowledgeBaseOverviewItem {
  id: string;
  label: string;
  profile: string;
  filterMode: string;
  filterRules: string[];
  stablePages: number;
  sourceItems: number;
  pendingCuration: number;
  privacyBlocked: number;
}

function buildKnowledgeBaseOverview(
  pages: WikiSitePage[],
  dailyReport: DailyReportSummary | null,
  config: ProjectKnowledgeConfig,
): KnowledgeBaseOverviewItem[] {
  const ids = new Set(config.bases.map((base) => normalizeKnowledgeBaseId(base.id)));
  if (ids.size === 0) ids.add(normalizeKnowledgeBaseId(config.profile));

  const baseConfig = new Map(config.bases.map((base) => [normalizeKnowledgeBaseId(base.id), base]));
  const counts = new Map<string, Omit<KnowledgeBaseOverviewItem, "id" | "label" | "profile" | "filterMode" | "filterRules">>();
  const ensure = (id: string) => {
    const normalized = normalizeKnowledgeBaseId(id);
    ids.add(normalized);
    const current = counts.get(normalized) ?? { stablePages: 0, sourceItems: 0, pendingCuration: 0, privacyBlocked: 0 };
    counts.set(normalized, current);
    return current;
  };

  for (const page of pages) {
    ensure(knowledgeBaseFromPage(page)).stablePages += 1;
  }

  for (const item of dailyReport?.experience_coverage?.items ?? []) {
    const summary = ensure(knowledgeBaseFromCoverageItem(item));
    summary.sourceItems += 1;
    if (item.status === "privacy_blocked") summary.privacyBlocked += 1;
    if (item.status === "needs_curation" || item.status === "proposal") summary.pendingCuration += 1;
  }

  return Array.from(ids).sort((left, right) => left.localeCompare(right)).map((id) => {
    const item = counts.get(id) ?? { stablePages: 0, sourceItems: 0, pendingCuration: 0, privacyBlocked: 0 };
    const base = baseConfig.get(id);
    return {
      id,
      label: knowledgeBaseLabel(id, config),
      profile: base?.profile ?? id,
      filterMode: base?.filterMode ?? "balanced",
      filterRules: base?.filterRules ?? config.filterRules,
      ...item,
    };
  });
}

function ruleLabel(rule: string, language: ProjectLanguage): string {
  const useZh = zh(language);
  const normalized = rule.replace(/_/g, "-");
  const labels: Record<string, [string, string]> = {
    "keep-openclaw-repair": ["Keep OpenClaw repair actions", "保留 OpenClaw 修复动作"],
    "keep-openclaw-qa-policy": ["Keep OpenClaw Q&A policy", "保留 OpenClaw 问答口径"],
    "keep-repair-actions": ["Keep repair actions", "保留修复动作"],
    "keep-verification-or-escalation": ["Keep verification or escalation", "保留验证或升级边界"],
    "keep-k8s-repair": ["Keep K8s repair", "保留 K8s 修复经验"],
    "keep-container-repair": ["Keep container repair", "保留容器修复经验"],
    "reject-greeting-only": ["Reject greeting-only", "拒绝纯问候"],
  };
  const label = labels[normalized];
  return label ? label[useZh ? 1 : 0] : rule;
}

function renderKnowledgeBaseOverview(items: KnowledgeBaseOverviewItem[], language: ProjectLanguage): string {
  const useZh = zh(language);
  return `<section class="kb-overview panel" id="knowledge-bases">
  <h2>${useZh ? "知识库分布" : "Knowledge Bases"}</h2>
  <p class="section-subtitle">${useZh ? "每个知识库独立统计来源、隐私阻断、待提炼和稳定知识页，并展示当前筛选模式。" : "Each knowledge base tracks sources, privacy blockers, curation work, stable pages, and its active filter mode."}</p>
  <div class="kb-card-grid">
    ${items.map((item) => `<a class="kb-overview-card" href="#knowledge-pages" data-kb-filter-link="${escapeHtml(item.id)}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(String(item.stablePages))}</strong>
      <small>${escapeHtml(useZh ? `稳定页 · 来源 ${item.sourceItems} · 待提炼 ${item.pendingCuration} · 隐私 ${item.privacyBlocked}` : `stable pages · sources ${item.sourceItems} · curation ${item.pendingCuration} · privacy ${item.privacyBlocked}`)}</small>
      <em>${escapeHtml(`${item.profile} · ${item.filterMode}`)}</em>
      <ul>${item.filterRules.slice(0, 4).map((rule) => `<li>${escapeHtml(ruleLabel(rule, language))}</li>`).join("") || `<li>${escapeHtml(useZh ? "使用默认筛选" : "Default filtering")}</li>`}</ul>
    </a>`).join("\n")}
  </div>
</section>`;
}

function renderKnowledgeBaseRules(items: KnowledgeBaseOverviewItem[], language: ProjectLanguage): string {
  const useZh = zh(language);
  return `<section class="kb-rules panel" id="knowledge-rules">
  <h2>${escapeHtml(useZh ? "知识库筛选规则" : "Knowledge Base Filter Rules")}</h2>
  <p class="section-subtitle">${escapeHtml(useZh ? "配置来自 .praxisbase/config.yaml；allowlist 表示只有命中保留规则的内容进入提炼。" : "Configured in .praxisbase/config.yaml; allowlist bases only admit items that match keep rules.")}</p>
  <div class="rule-grid">
    ${items.map((item) => `<article class="rule-card">
      <div class="rule-card-head"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.id)}</span></div>
      <dl>
        <dt>${escapeHtml(useZh ? "画像" : "Profile")}</dt><dd>${escapeHtml(item.profile)}</dd>
        <dt>${escapeHtml(useZh ? "模式" : "Mode")}</dt><dd>${escapeHtml(item.filterMode)}</dd>
        <dt>${escapeHtml(useZh ? "规则" : "Rules")}</dt><dd><ul>${item.filterRules.map((rule) => `<li><code>${escapeHtml(rule)}</code><span>${escapeHtml(ruleLabel(rule, language))}</span></li>`).join("") || `<li><span>${escapeHtml(useZh ? "默认通用经验筛选" : "Default useful-experience filtering")}</span></li>`}</ul></dd>
      </dl>
    </article>`).join("\n")}
  </div>
</section>`;
}

interface ProcessStep {
  label: string;
  value: string;
  note: string;
  href?: string;
}

function renderProcessMap(input: { title: string; subtitle: string; steps: ProcessStep[]; id?: string }): string {
  const renderStep = (step: ProcessStep, index: number) => {
    const body = `<span class="process-index">${escapeHtml(String(index + 1))}</span>
      <span class="process-label">${escapeHtml(step.label)}</span>
      <strong>${escapeHtml(step.value)}</strong>
      <small>${escapeHtml(step.note)}</small>`;
    return step.href
      ? `<a class="process-step" href="${escapeHtml(step.href)}">${body}</a>`
      : `<article class="process-step">${body}</article>`;
  };
  return `<section class="process-map panel"${input.id ? ` id="${escapeHtml(input.id)}"` : ""}>
  <div class="section-heading compact-heading">
    <div>
      <h2>${escapeHtml(input.title)}</h2>
      <p>${escapeHtml(input.subtitle)}</p>
    </div>
  </div>
  <div class="process-grid">
    ${input.steps.map(renderStep).join("\n")}
  </div>
</section>`;
}

interface CountNote {
  label: string;
  value: string;
  text: string;
  href?: string;
}

function renderCountNotes(input: { title: string; subtitle: string; notes: CountNote[]; id?: string }): string {
  const renderNote = (note: CountNote) => {
    const body = `<span>${escapeHtml(note.label)}</span><strong>${escapeHtml(note.value)}</strong><p>${escapeHtml(note.text)}</p>`;
    return note.href
      ? `<a class="count-note" href="${escapeHtml(note.href)}">${body}</a>`
      : `<article class="count-note">${body}</article>`;
  };
  return `<section class="count-notes"${input.id ? ` id="${escapeHtml(input.id)}"` : ""}>
  <div class="section-heading compact-heading">
    <div>
      <h2>${escapeHtml(input.title)}</h2>
      <p>${escapeHtml(input.subtitle)}</p>
    </div>
  </div>
  <div class="count-note-grid">
    ${input.notes.map(renderNote).join("\n")}
  </div>
</section>`;
}

function renderTerminologyPanel(language: ProjectLanguage = "en"): string {
  const useZh = zh(language);
  const terms = useZh ? [
    ["来源条目", "OpenClaw 记忆或其他输入被切分后的处理单位；一个来源可能产生多个经验片段，也可能只作为证据。"],
    ["经验片段", "从来源中抽出的可复用修复经验，还没有变成稳定知识。"],
    ["提案", "AI 编译出的知识库改动草稿，审批通过并提升后才会写入 kb/ 或 skills/。"],
    ["稳定知识", "已经在 kb/ 或 skills/ 中的页面，Agent 检索时可以直接使用。"],
  ] : [
    ["Source item", "A chunk imported from OpenClaw memory or another input source. One source can produce multiple lessons or only evidence."],
    ["Lesson", "A reusable repair observation extracted from source material, before it becomes stable knowledge."],
    ["Proposal", "An AI-generated draft change. It only writes to kb/ or skills/ after approval and promotion."],
    ["Stable knowledge", "Pages already present in kb/ or skills/ and available to agents during retrieval."],
  ];
  return `<details class="terminology-panel">
  <summary>${escapeHtml(useZh ? "术语速查" : "Terminology")}</summary>
  <dl>
    ${terms.map(([term, description]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(description)}</dd>`).join("\n")}
  </dl>
</details>`;
}

function renderDailyOverviewSection(report: DailyReportSummary, language: ProjectLanguage = "en"): string {
  const useZh = zh(language);
  const label = (english: string, chinese: string) => useZh ? chinese : english;
  const dateLabel = report.created_at.slice(0, 10);
  const coverage = report.experience_coverage;
  const keyCards: Array<{ label: string; value: string; href?: string }> = [
    { label: label("Sources", "来源"), value: String(report.source_count) },
    { label: label("Imported", "已导入"), value: String(report.imported) },
    { label: label("Privacy review", "隐私待确认"), value: String(report.privacy_required), href: "review.html#human-required" },
    { label: label("Proposals", "待审核提案"), value: String(report.proposal_candidates), href: "review.html#pending-candidates" },
    { label: label("Current stable pages", "当前稳定知识页"), value: String(report.site_pages), href: "#knowledge-pages" },
  ];
  return `<section class="daily-update panel">
  <h2>${label("Today\'s Processing", "本次处理结果")}</h2>
  <p class="section-subtitle">${escapeHtml(`${dateLabel} · ${report.authority_mode}`)}${coverage ? escapeHtml(useZh ? ` · 覆盖 ${coverage.total_items} 条来源` : ` · ${coverage.total_items} source items covered`) : ""}</p>
  <div class="metrics">
    ${keyCards.map((card) => card.href
      ? `<a class="metric-link" href="${escapeHtml(card.href)}"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></a>`
      : `<article><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></article>`).join("\n")}
  </div>
  <details class="advanced-panel dashboard-advanced">
    <summary>${label("Show detailed pipeline counters", "展开详细流水线指标")}</summary>
    ${renderDailyUpdateSection(report, language)}
  </details>
</section>`;
}

function renderDataSourceSection(report: DailyReportSummary | null, language: ProjectLanguage = "en"): string {
  if (!report || report.sources.length === 0) return "";
  const useZh = zh(language);
  const dateLabel = report.created_at.slice(0, 19).replace("T", " ");
  const renderSource = (source: DailySourceSummary) => {
    const meta = [source.agent, source.channel, source.source_type, source.parser].filter(Boolean).join(" · ");
    const codeRows: Array<{ label: string; value: string }> = [
      source.repo ? { label: useZh ? "仓库" : "Repo", value: source.repo } : undefined,
      source.ref ? { label: useZh ? "分支" : "Ref", value: source.ref } : undefined,
      source.path ? { label: useZh ? "路径" : "Path", value: source.path } : undefined,
    ].filter((row): row is { label: string; value: string } => Boolean(row));
    return `<article class="source-card">
      <div class="source-card-head">
        <div>
          <strong>${escapeHtml(source.name)}</strong>
          <span>${escapeHtml(meta || (useZh ? "未配置来源类型" : "source type not configured"))}</span>
        </div>
        <span class="status-pill">${escapeHtml(source.status)}</span>
      </div>
      <div class="source-stats">
        <span>${escapeHtml(useZh ? `扫描 ${source.scanned}` : `scanned ${source.scanned}`)}</span>
        <span>${escapeHtml(useZh ? `获取 ${source.fetched}` : `fetched ${source.fetched}`)}</span>
        <span>${escapeHtml(useZh ? `入信封 ${source.enveloped}` : `enveloped ${source.enveloped}`)}</span>
        <span>${escapeHtml(useZh ? `隐私 ${source.human_required}` : `privacy ${source.human_required}`)}</span>
      </div>
      ${codeRows.length > 0 ? `<dl class="source-code-list">${codeRows.map((row) => `<dt>${escapeHtml(row.label)}</dt><dd><code>${escapeHtml(row.value)}</code></dd>`).join("")}</dl>` : ""}
      ${source.warnings.length > 0 ? `<p class="source-warning">${escapeHtml(source.warnings.join("; "))}</p>` : ""}
    </article>`;
  };
  return `<section class="data-sources panel" id="data-sources">
  <div class="section-heading compact-heading">
    <div>
      <h2>${escapeHtml(useZh ? "当前数据源" : "Current Data Source")}</h2>
      <p>${escapeHtml(useZh ? `最新处理报告：${dateLabel} · ${report.authority_mode}。这里只展示本次页面正在采用的来源。` : `Latest report: ${dateLabel} · ${report.authority_mode}. These are the sources used by this page.`)}</p>
    </div>
  </div>
  <div class="source-grid">
    ${report.sources.map(renderSource).join("\n")}
  </div>
</section>`;
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

function renderPendingCandidates(candidates: PendingWikiProposalCandidate[], language: ProjectLanguage = "en"): string {
  if (candidates.length === 0) return "";
  const useZh = zh(language);
  return `<section class="pending-candidates">
  <div class="section-heading">
    <div>
      <h2><a href="review.html#pending-candidates" data-i18n="pending.title">${escapeHtml(useZh ? "待审核经验候选" : "Pending Experience Candidates")}</a></h2>
      <p>${useZh ? "AI 生成的 wiki 草稿正在等待审核。稳定的 " : "AI-generated wiki drafts waiting for review. Stable "}<code>kb/</code>${useZh ? " 文件在提升前不会改变。" : " files are unchanged until promotion."}</p>
    </div>
    <strong>${escapeHtml(String(candidates.length))}</strong>
  </div>
  <ol class="experience-list">
    ${candidates.slice(0, 12).map((item) => `<li id="${escapeHtml(item.anchor)}">
      <p><strong>${escapeHtml(item.title)}</strong></p>
      <p>${escapeHtml(item.summary)}</p>
      <dl>
        <dt>${useZh ? "目标" : "Target"}</dt><dd><code>${escapeHtml(item.patch_path)}</code></dd>
        <dt>${useZh ? "类型" : "Kind"}</dt><dd>${escapeHtml(item.kind)}</dd>
        <dt>${useZh ? "范围" : "Scope"}</dt><dd>${escapeHtml(item.scope)}</dd>
        <dt>${useZh ? "来源" : "Source"}</dt><dd><code>${escapeHtml(item.source_id)}</code></dd>
        ${item.source_count !== undefined ? `<dt>${useZh ? "来源数" : "Sources"}</dt><dd>${escapeHtml(String(item.source_count))}</dd>` : ""}
        ${item.confidence !== undefined ? `<dt>${useZh ? "置信度" : "Confidence"}</dt><dd>${escapeHtml(item.confidence.toFixed(2))}</dd>` : ""}
        ${item.review_hint ? `<dt>${useZh ? "审核原因" : "Why review"}</dt><dd>${escapeHtml(item.review_hint.why_review)}</dd><dt>${useZh ? "建议" : "Suggested"}</dt><dd>${escapeHtml(item.review_hint.suggested_decision)}</dd>` : ""}
        ${item.review_hint && item.review_hint.risk_notes.length > 0 ? `<dt>${useZh ? "风险提示" : "Risk notes"}</dt><dd>${escapeHtml(item.review_hint.risk_notes.join("; "))}</dd>` : ""}
        ${item.guard_messages && item.guard_messages.length > 0 ? `<dt>${useZh ? "守卫失败" : "Guard failures"}</dt><dd>${escapeHtml(item.guard_messages.join("; "))}</dd>` : ""}
        ${renderRelationshipDetails(item)}
        ${item.review_hint && item.review_hint.risk_notes.length > 0 ? (() => { const sr = extractSemanticReviewFromRiskNotes(item.review_hint.risk_notes); return sr ? renderSemanticReviewHtml(sr) : ""; })() : ""}
      </dl>
    </li>`).join("\n")}
  </ol>
  <div class="command-strip" aria-label="${escapeHtml(useZh ? "确认待审核候选" : "Confirm pending candidates")}">
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
  privacy_reviewable: boolean;
  created_at: string;
  triage?: {
    classification?: string;
    decision?: string;
    confidence?: string;
    rationale?: string;
    suggested_redactions: string[];
    release_summary?: string;
    reviewer_id?: string;
  };
}

function knowledgeBaseFromCoverageItem(item: { source_id?: string; source_ref?: string; stable_kb_paths?: string[]; knowledge_base?: string }): string {
  if (item.knowledge_base) return item.knowledge_base;
  const combined = [item.source_id, item.source_ref, ...(item.stable_kb_paths ?? [])].filter(Boolean).join("\n").toLowerCase();
  if (/openclaw|answer-bot/.test(combined)) return "openclaw";
  if (/container|docker|k8s|kubernetes/.test(combined)) return "container-repair";
  if (/feishu|lark/.test(combined)) return "feishu";
  if (/codex/.test(combined)) return "codex";
  return "default";
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

function zh(language: ProjectLanguage | undefined): boolean {
  return language === "zh-CN";
}

function candidateStatusLabel(status: CandidateStatus, language: ProjectLanguage): string {
  if (!zh(language)) return statusLabel(status);
  if (status === "pending") return "待审核";
  if (status === "approved") return "已审核";
  if (status === "promoted") return "已沉淀";
  return "需要人工";
}

function coverageStatusLabel(status: string, language: ProjectLanguage): string {
  if (!zh(language)) return status;
  const labels: Record<string, string> = {
    raw_only: "仅原始数据",
    needs_curation: "待二次提炼",
    privacy_blocked: "隐私待确认",
    low_signal_rejected: "低信号已拒绝",
    lesson_only: "已成 Lesson",
    wiki_evidence: "已有 Wiki 证据",
    proposal: "待审核提案",
    stable_kb: "已进稳定知识库",
  };
  return labels[status] ?? status;
}

function privacyDecisionLabel(decision: string | undefined, language: ProjectLanguage): string {
  if (!decision || !zh(language)) return decision ?? "-";
  const labels: Record<string, string> = {
    auto_released: "自动释放",
    team_review_only: "团队人工确认",
    rejected_low_signal: "低信号拒绝",
    human_required: "需要人工",
    keep_human_required: "保持人工确认",
  };
  return labels[decision] ?? decision;
}

function coverageReasonLabel(item: { reason_code?: string; reason?: string }, language: ProjectLanguage): string {
  if (item.reason && zh(language)) return item.reason;
  if (item.reason && !zh(language)) return item.reason;
  return item.reason_code ?? "-";
}

function recommendedCandidateCommand(item: ReviewQueueCandidate): string {
  const status = item.status;
  if (status === "promoted") return "praxisbase gbrain export --mode personal --write --json";
  if (status === "approved") return "praxisbase promote --auto";
  if (item.kind === "skill" || item.source_kind === "skill_synthesis") return "praxisbase skill review --json";
  if (status === "needs_human") return "praxisbase review list --json";
  return "praxisbase review --auto";
}

function renderCandidateCard(item: ReviewQueueCandidate, language: ProjectLanguage = "en"): string {
  const useZh = zh(language);
  const validationStatus = item.validation_status
    ? ` <span class="status-pill">${escapeHtml(item.validation_status)}</span>`
    : "";
  const approvalControls = item.status === "pending" ? `<div class="approval-actions" data-review-actions data-proposal-id="${escapeHtml(item.id)}">
      <button type="button" data-review-decision="approve">${useZh ? "批准" : "Approve"}</button>
      <button type="button" data-review-decision="reject">${useZh ? "拒绝" : "Reject"}</button>
      <button type="button" data-review-decision="needs_human">${useZh ? "标记需修改" : "Mark for edit"}</button>
      <span class="approval-status" data-review-status>${useZh ? "需启动 praxisbase review serve" : "Start praxisbase review serve"}</span>
    </div>` : "";
  return `<li id="${escapeHtml(item.anchor)}" class="review-card">
    <p><strong>${escapeHtml(item.title)}</strong> <span class="status-pill">${escapeHtml(candidateStatusLabel(item.status, language))}</span>${validationStatus}</p>
    <p>${escapeHtml(item.summary)}</p>
    ${approvalControls}
    <dl>
      <dt>${useZh ? "目标" : "Target"}</dt><dd><code>${escapeHtml(item.patch_path)}</code></dd>
      <dt>${useZh ? "类型" : "Kind"}</dt><dd>${escapeHtml(item.kind)}</dd>
      <dt>${useZh ? "范围" : "Scope"}</dt><dd>${escapeHtml(item.scope)}</dd>
      <dt>${useZh ? "来源" : "Source"}</dt><dd><code>${escapeHtml(item.source_id)}</code></dd>
      ${item.source_count !== undefined ? `<dt>${useZh ? "来源数" : "Sources"}</dt><dd>${escapeHtml(String(item.source_count))}</dd>` : ""}
      ${item.confidence !== undefined ? `<dt>${useZh ? "置信度" : "Confidence"}</dt><dd>${escapeHtml(item.confidence.toFixed(2))}</dd>` : ""}
      <dt>${useZh ? "创建时间" : "Created"}</dt><dd>${escapeHtml(item.created_at)}</dd>
      ${item.review_hint ? `<dt>${useZh ? "审核原因" : "Why review"}</dt><dd>${escapeHtml(item.review_hint.why_review)}</dd><dt>${useZh ? "建议" : "Suggested"}</dt><dd>${escapeHtml(item.review_hint.suggested_decision)}</dd>` : ""}
      ${item.review_hint && item.review_hint.risk_notes.length > 0 ? `<dt>${useZh ? "风险提示" : "Risk notes"}</dt><dd>${escapeHtml(item.review_hint.risk_notes.join("; "))}</dd>` : ""}
      ${item.guard_messages && item.guard_messages.length > 0 ? `<dt>${useZh ? "守卫失败" : "Guard failures"}</dt><dd>${escapeHtml(item.guard_messages.join("; "))}</dd>` : ""}
      ${item.validation_status ? `<dt>${useZh ? "验证" : "Validation"}</dt><dd>${escapeHtml(item.validation_status)}</dd>` : ""}
      <dt>${useZh ? "建议命令" : "Recommended"}</dt><dd><code>${escapeHtml(recommendedCandidateCommand(item))}</code></dd>
    </dl>
    <details class="advanced-panel">
      <summary>${useZh ? "高级审核信息" : "Advanced review details"}</summary>
      <dl>
        ${renderRelationshipDetails(item)}
        ${item.review_hint && item.review_hint.risk_notes.length > 0 ? (() => { const sr = extractSemanticReviewFromRiskNotes(item.review_hint.risk_notes); return sr ? renderSemanticReviewHtml(sr) : ""; })() : ""}
      </dl>
    </details>
    <details>
      <summary>${useZh ? "预览生成的 Markdown" : "Preview generated markdown"}</summary>
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
  language?: ProjectLanguage;
}): string {
  const language = input.language ?? "en";
  const candidates = input.candidates.filter((item) => item.status === input.status);
  return `<section id="${escapeHtml(input.id)}" class="review-section" data-status="${escapeHtml(input.status)}">
  <div class="section-heading">
    <div>
      <h2>${input.aliasId ? `<span id="${escapeHtml(input.aliasId)}"></span>` : ""}${escapeHtml(input.title)}</h2>
      <p>${escapeHtml(candidates.length === 0 ? input.empty : zh(language) ? `${candidates.length} 条` : `${candidates.length} item(s)`)}</p>
    </div>
    <strong>${escapeHtml(String(candidates.length))}</strong>
  </div>
  ${input.commands.length > 0 ? `<div class="command-strip">${input.commands.map((command) => `<code>${escapeHtml(command)}</code>`).join("\n")}</div>` : ""}
  ${candidates.length > 0 ? `<ol class="experience-list">${candidates.map((item) => renderCandidateCard(item, language)).join("\n")}</ol>` : ""}
</section>`;
}

function renderHumanRequired(
  records: HumanRequiredRecord[],
  dailyReport: DailyReportSummary | null,
  privacyTriageReport: PrivacyTriageReportSummary | null,
  language: ProjectLanguage = "en",
): string {
  const useZh = zh(language);
  const latestPrivacyRequired = dailyReport?.privacy_required ?? records.length;
  const actionableRecords = records.filter(isActionablePrivacyRecord);
  const processedRecords = records.length - actionableRecords.length;
  const visibleRecords = actionableRecords.slice(0, 50);
  const isTeamGit = dailyReport?.authority_mode === "team-git";
  const triageCommand = isTeamGit
    ? "praxisbase privacy triage --mode team-git --team-auto-review --include-triaged --progress --json"
    : "praxisbase privacy triage --mode personal --auto-release --progress --json";
  const followupCommand = isTeamGit
    ? "praxisbase wiki build-site --json"
    : "praxisbase personal run --open --json";
  const privacyReviewCommand = "praxisbase review serve --port 4174";
  return `<section id="human-required" class="review-section" data-status="needs_human">
  <div class="section-heading">
    <div>
      <h2><span id="privacy-required"></span>${useZh ? "隐私待确认" : "Privacy Required"}</h2>
      <p>${useZh ? `当前可操作 ${escapeHtml(String(actionableRecords.length))} 条；本次报告 ${escapeHtml(String(latestPrivacyRequired))} 条，历史积压 ${escapeHtml(String(records.length))} 条。仅展示脱敏后的可审摘要。` : `${escapeHtml(String(actionableRecords.length))} actionable now; current run has ${escapeHtml(String(latestPrivacyRequired))}, backlog has ${escapeHtml(String(records.length))}. Cards show sanitized review previews only.`}</p>
    </div>
    <strong>${escapeHtml(String(actionableRecords.length))}</strong>
  </div>
  <div class="metrics">
    <article><span>${useZh ? "本次隐私" : "Current privacy"}</span><strong>${escapeHtml(String(latestPrivacyRequired))}</strong></article>
    <article><span>${useZh ? "隐私积压" : "Privacy backlog"}</span><strong>${escapeHtml(String(records.length))}</strong></article>
  </div>
  <details class="advanced-panel">
    <summary>${useZh ? "展开隐私处理命令" : "Show privacy commands"}</summary>
    <div class="command-strip">
      <code>${escapeHtml(triageCommand)}</code>
      <code>${escapeHtml(privacyReviewCommand)}</code>
      <code>${escapeHtml(followupCommand)}</code>
    </div>
  </details>
  ${privacyTriageReport ? `<dl class="queue-summary">
    <dt>${useZh ? "最近 triage" : "Latest triage"}</dt><dd>${escapeHtml(privacyTriageReport.created_at)}</dd>
    <dt>${useZh ? "已扫描" : "Scanned"}</dt><dd>${escapeHtml(String(privacyTriageReport.scanned))}</dd>
    <dt>${useZh ? "自动释放" : "Auto released"}</dt><dd>${escapeHtml(String(privacyTriageReport.auto_released))}</dd>
    <dt>${useZh ? "保持人工确认" : "Kept human-required"}</dt><dd>${escapeHtml(String(privacyTriageReport.keep_human_required))}</dd>
    <dt>${useZh ? "团队人工确认" : "Team review-only"}</dt><dd>${escapeHtml(String(privacyTriageReport.team_review_only))}</dd>
    <dt>${useZh ? "跳过已处理" : "Skipped already triaged"}</dt><dd>${escapeHtml(String(privacyTriageReport.skipped_already_triaged))}</dd>
    <dt>${useZh ? "跳过非隐私项" : "Skipped non-privacy"}</dt><dd>${escapeHtml(String(privacyTriageReport.skipped_non_privacy))}</dd>
  </dl>` : ""}
  ${processedRecords > 0 ? `<p class="muted">${useZh ? `已隐藏 ${escapeHtml(String(processedRecords))} 条已处理隐私记录（自动释放、低信号拒绝或人工已确认）。` : `${escapeHtml(String(processedRecords))} processed privacy record(s) are hidden from the action queue.`}</p>` : ""}
  ${actionableRecords.length > visibleRecords.length ? `<p class="muted">${useZh ? `仅展示最近 ${escapeHtml(String(visibleRecords.length))} 条待处理隐私记录；更早的历史待处理项默认隐藏，以便聚焦当天结果。` : `Showing the latest ${escapeHtml(String(visibleRecords.length))} pending privacy records. Older backlog is intentionally hidden from the default page to keep current daily work readable.`}</p>` : ""}
  ${visibleRecords.length > 0 ? `<ol class="experience-list">
    ${visibleRecords.map((item) => {
      const detailsReleased = humanRequiredDetailsReleased(item);
      const reviewPreview = privacyReviewPreview(item);
      const privacyActions = item.privacy_reviewable ? `<div class="approval-actions privacy-actions" data-privacy-actions data-privacy-id="${escapeHtml(item.id)}" data-privacy-path="${escapeHtml(item.path)}" data-privacy-release-summary="${escapeHtml(reviewPreview ?? item.redacted_summary ?? item.reason)}">
        <button type="button" data-privacy-decision="auto_released">${useZh ? "释放为脱敏经验" : "Release sanitized"}</button>
        <button type="button" data-privacy-decision="rejected_low_signal">${useZh ? "低信号拒绝" : "Reject low signal"}</button>
        <button type="button" data-privacy-decision="team_review_only">${useZh ? "保持人工" : "Keep manual"}</button>
        <span class="approval-status" data-privacy-status>${useZh ? "需要先启动本地审批服务。" : "Start the local review server first."}</span>
      </div>` : "";
      return `<li id="${escapeHtml(item.id)}" class="review-card">
      <p><strong>${escapeHtml(item.reason)}</strong> <span class="status-pill">${useZh ? "隐私待确认" : "Privacy required"}</span></p>
      <dl>
        <dt>${useZh ? "来源" : "Source"}</dt><dd><code>${escapeHtml(item.source_id)}</code></dd>
        <dt>${useZh ? "代理" : "Agent"}</dt><dd>${escapeHtml(item.agent ?? "unknown")}</dd>
        <dt>${useZh ? "范围" : "Scope"}</dt><dd>${escapeHtml(item.scope ?? "unknown")}</dd>
        ${detailsReleased ? `<dt>Ref</dt><dd><code>${escapeHtml(item.source_ref ?? "n/a")}</code></dd>` : ""}
        ${detailsReleased && item.redacted_summary ? `<dt>${useZh ? "摘要" : "Summary"}</dt><dd>${escapeHtml(item.redacted_summary)}</dd>` : ""}
        ${!detailsReleased && reviewPreview ? `<dt>${useZh ? "可审摘要" : "Review preview"}</dt><dd>${escapeHtml(reviewPreview)}</dd>` : ""}
        <dt>${useZh ? "文件" : "File"}</dt><dd><code>${escapeHtml(item.path)}</code></dd>
        <dt>${useZh ? "创建时间" : "Created"}</dt><dd>${escapeHtml(item.created_at)}</dd>
        <dt>${useZh ? "建议命令" : "Recommended"}</dt><dd><code>${escapeHtml(triageCommand)}</code></dd>
        ${item.triage ? `
        <dt>Triage</dt><dd>${escapeHtml(item.triage.classification ?? "unknown")} / ${escapeHtml(item.triage.decision ?? "unknown")}</dd>
        <dt>${useZh ? "置信度" : "Confidence"}</dt><dd>${escapeHtml(item.triage.confidence ?? "n/a")}</dd>
        ${detailsReleased ? `<dt>${useZh ? "理由" : "Rationale"}</dt><dd>${escapeHtml(item.triage.rationale ?? "n/a")}</dd>` : `<dt>${useZh ? "详情" : "Details"}</dt><dd>${useZh ? "原始敏感详情仍隐藏；请基于上面的可审摘要、分类和置信度审批。" : "Raw sensitive details stay hidden; review using the sanitized preview, classification, and confidence above."}</dd>`}
        ${!detailsReleased && item.triage.suggested_redactions.length > 0 ? `<dt>${useZh ? "脱敏提示" : "Redaction note"}</dt><dd>${useZh ? `${escapeHtml(String(item.triage.suggested_redactions.length))} 条脱敏建议已隐藏原文。` : `${escapeHtml(String(item.triage.suggested_redactions.length))} suggested redaction(s) hidden from the page.`}</dd>` : ""}
        ${detailsReleased && item.triage.suggested_redactions.length > 0 ? `<dt>${useZh ? "建议脱敏" : "Suggested Redactions"}</dt><dd>${escapeHtml(item.triage.suggested_redactions.join(", "))}</dd>` : ""}
        ` : ""}
      </dl>
      ${privacyActions}
    </li>`;
    }).join("\n")}
  </ol>` : `<p>${useZh ? "没有隐私待确认记录。" : "No privacy-required records."}</p>`}
</section>`;
}

function isActionablePrivacyRecord(item: HumanRequiredRecord): boolean {
  const decision = item.triage?.decision;
  if (!decision) return true;
  if (item.triage?.reviewer_id) return false;
  return decision === "team_review_only" || decision === "keep_human_required";
}

function humanRequiredDetailsReleased(item: HumanRequiredRecord): boolean {
  if (!item.triage) return false;
  return item.triage.decision === "auto_released";
}

function renderGitlabWritebackPanel(config: ProjectReviewUiConfig, language: ProjectLanguage): string {
  if (config.writeback !== "gitlab") return "";
  const useZh = zh(language);
  const apiBase = config.gitlabApiBase ?? "";
  const projectId = config.gitlabProjectId ?? "";
  const branch = config.gitlabBranch ?? "";
  return `<section class="gitlab-writeback-panel" data-gitlab-writeback-panel>
  <div>
    <strong>${escapeHtml(useZh ? "GitLab 页面审批" : "GitLab Page Approval")}</strong>
    <p>${escapeHtml(useZh ? "在 GitLab Pages 上粘贴具备 write_repository/API 权限的 token，审批按钮会把决定提交到仓库；后续 review/promote/build pipeline 会消费这些记录。token 只保存在当前浏览器。" : "Paste a token with write_repository/API permission on GitLab Pages. Approval buttons commit decisions to the repo; review/promote/build pipelines consume them. The token stays in this browser only.")}</p>
  </div>
  <dl>
    <dt>${escapeHtml(useZh ? "API" : "API")}</dt><dd><code>${escapeHtml(apiBase || "not configured")}</code></dd>
    <dt>${escapeHtml(useZh ? "项目" : "Project")}</dt><dd><code>${escapeHtml(projectId || "not configured")}</code></dd>
    <dt>${escapeHtml(useZh ? "分支" : "Branch")}</dt><dd><code>${escapeHtml(branch || "not configured")}</code></dd>
  </dl>
  <label class="gitlab-token-field">
    <span>${escapeHtml(useZh ? "GitLab Token" : "GitLab Token")}</span>
    <input type="password" autocomplete="off" data-gitlab-token-input placeholder="${escapeHtml(useZh ? "粘贴后点保存" : "Paste and save")}">
  </label>
  <div class="approval-actions gitlab-token-actions">
    <button type="button" data-gitlab-token-save>${escapeHtml(useZh ? "保存到浏览器" : "Save in browser")}</button>
    <button type="button" data-gitlab-token-clear>${escapeHtml(useZh ? "清除" : "Clear")}</button>
    <button type="button" data-gitlab-token-test>${escapeHtml(useZh ? "测试连接" : "Test connection")}</button>
    <span class="approval-status" data-gitlab-token-status>${escapeHtml(useZh ? "未保存 token" : "No token saved")}</span>
  </div>
</section>`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactLiteral(text: string, literal: string | undefined): string {
  if (!literal || literal.length < 3) return text;
  return text.replace(new RegExp(escapeRegExp(literal), "gi"), "[REDACTED]");
}

function privacyReviewPreview(item: HumanRequiredRecord): string | undefined {
  let preview = item.triage?.release_summary || item.redacted_summary;
  if (!preview) return undefined;
  for (const redaction of item.triage?.suggested_redactions ?? []) {
    preview = redactLiteral(preview, redaction);
  }
  preview = redactLiteral(preview, item.source_ref);
  preview = redactLiteral(preview, item.source_hash);
  return preview.length > 1200 ? `${preview.slice(0, 1200)}...` : preview;
}

function renderRejectedSection(dailyReport: DailyReportSummary | null, curationReport: WikiCurationReportSummary | null, language: ProjectLanguage = "en"): string {
  const useZh = zh(language);
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
      <h2>${useZh ? "已拒绝" : "Rejected"}</h2>
      <p>${useZh ? "低信号、重复、隐私或质量不达标的材料，不会进入 wiki。" : "Low-signal, duplicate, private, or quality-blocked material that intentionally did not become wiki."}</p>
    </div>
    <strong>${escapeHtml(String(total))}</strong>
  </div>
  <dl class="queue-summary">
    <dt>${useZh ? "Daily 拒绝" : "Daily rejected"}</dt><dd>${escapeHtml(String(dailyRejected))}</dd>
    <dt>${useZh ? "低信号" : "Low signal"}</dt><dd>${escapeHtml(String(lowSignal))}</dd>
    <dt>${useZh ? "质量拒绝" : "Quality rejected"}</dt><dd>${escapeHtml(String(qualityRejected))}</dd>
    <dt>${useZh ? "重复分组" : "Duplicate groups"}</dt><dd>${escapeHtml(String(duplicates))}</dd>
    <dt>${useZh ? "Curation 拒绝" : "Curation rejected"}</dt><dd>${escapeHtml(String(curationRejected))}</dd>
    <dt>${useZh ? "硬阻断" : "Hard blocks"}</dt><dd>${escapeHtml(String(hardBlocks))}</dd>
    <dt>${useZh ? "建议命令" : "Recommended"}</dt><dd><code>praxisbase wiki curate --review --json</code></dd>
  </dl>
</section>`;
}

function renderExperienceCoverage(dailyReport: DailyReportSummary | null, language: ProjectLanguage = "en"): string {
  const coverage = dailyReport?.experience_coverage;
  if (!coverage) return "";
  const useZh = zh(language);
  const statusCounts = coverage.items.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});
  const knowledgeBaseCounts = coverage.items.reduce<Record<string, number>>((counts, item) => {
    const kb = knowledgeBaseFromCoverageItem(item);
    counts[kb] = (counts[kb] ?? 0) + 1;
    return counts;
  }, {});
  const released = coverage.items.filter((item) => item.privacy_decision === "auto_released").length;
  const screenedOut = coverage.privacy_blocked + coverage.low_signal_rejected;
  const processSteps = [
    {
      label: useZh ? "采集" : "Collected",
      value: coverage.total_items,
      note: useZh ? "OpenClaw 原始单元" : "OpenClaw source items",
    },
    {
      label: useZh ? "隐私筛选" : "Privacy",
      value: released,
      note: useZh ? `${screenedOut} 条被阻断/拒绝` : `${screenedOut} blocked/rejected`,
    },
    {
      label: useZh ? "经验抽取" : "Lessons",
      value: coverage.total_lessons || coverage.with_lessons,
      note: useZh ? `${coverage.with_lessons} 个来源产出经验片段` : `${coverage.with_lessons} sources produced lessons`,
    },
    {
      label: useZh ? "知识编译" : "Curation",
      value: coverage.total_wiki_evidence || coverage.with_wiki_evidence,
      note: useZh ? `${coverage.with_wiki_evidence} 个来源形成证据，${coverage.pending_curation} 个待提炼` : `${coverage.with_wiki_evidence} sources, ${coverage.pending_curation} queued`,
    },
    {
      label: useZh ? "沉淀" : "Stable",
      value: coverage.stable_kb,
      note: useZh ? `涉及提案来源：${coverage.with_proposals}` : `${coverage.with_proposals} sources touched proposals`,
    },
  ];
  const statusOrder = ["stable_kb", "proposal", "wiki_evidence", "lesson_only", "needs_curation", "privacy_blocked", "low_signal_rejected", "raw_only"];
  const statusCards = statusOrder
    .filter((status) => (statusCounts[status] ?? 0) > 0)
    .map((status) => `<a href="#coverage-details" class="coverage-status-card coverage-status-${escapeHtml(status)}" data-coverage-filter="${escapeHtml(status)}">
      <span>${escapeHtml(coverageStatusLabel(status, language))}</span>
      <strong>${escapeHtml(String(statusCounts[status] ?? 0))}</strong>
    </a>`).join("\n");
  const kbCards = Object.entries(knowledgeBaseCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kb, count]) => `<button type="button" class="kb-chip" data-coverage-kb-filter="${escapeHtml(kb)}"><span>${escapeHtml(kb)}</span><strong>${escapeHtml(String(count))}</strong></button>`)
    .join("\n");
  const rows = coverage.items.slice(0, 80).map((item) => `<tr data-coverage-row data-coverage-status="${escapeHtml(item.status)}" data-coverage-kb="${escapeHtml(knowledgeBaseFromCoverageItem(item))}">
    <td><code>${escapeHtml(item.source_id)}</code></td>
    <td>${escapeHtml(knowledgeBaseFromCoverageItem(item))}</td>
    <td>${escapeHtml(privacyDecisionLabel(item.privacy_decision, language))}</td>
    <td>${escapeHtml(String(item.lesson_count))}</td>
    <td>${escapeHtml(String(item.wiki_evidence_count))}</td>
    <td>${escapeHtml(String(item.proposal_count))}</td>
    <td>${escapeHtml(coverageStatusLabel(item.status, language))}</td>
    <td>${escapeHtml(coverageReasonLabel(item, language))}</td>
    <td>${item.proposal_titles.length > 0 ? escapeHtml(item.proposal_titles.join("; ")) : item.lesson_claims.length > 0 ? `<ul class="compact-list">${item.lesson_claims.slice(0, 3).map((claim) => `<li>${escapeHtml(claim)}</li>`).join("")}</ul>` : "-"}</td>
  </tr>`).join("\n");
  return `<section class="review-section" id="experience-coverage">
    <h2>${useZh ? "经验覆盖与筛选过程" : "Experience Coverage and Screening"}</h2>
    <p class="section-lede">${useZh ? "从 OpenClaw 原始记忆到稳定知识的去向，不强行做成单向漏斗：一个来源可以产出多个 lesson，也可以等待二次提炼、人工隐私确认或合并到已有知识。" : "How OpenClaw memory items move toward stable knowledge. One source can produce multiple lessons, merge into existing pages, or wait for privacy/curation review."}</p>
    <div class="coverage-flow">
      ${processSteps.map((step, index) => `<article>
        <span class="flow-index">${escapeHtml(String(index + 1))}</span>
        <div><span>${escapeHtml(step.label)}</span><strong>${escapeHtml(String(step.value))}</strong><small>${escapeHtml(step.note)}</small></div>
      </article>`).join("\n")}
    </div>
    <div class="metrics">
      <a class="metric-link" href="#coverage-details" data-coverage-filter="all"><span>原始项</span><strong>${escapeHtml(String(coverage.total_items))}</strong></a>
      <a class="metric-link" href="#coverage-details" data-coverage-filter="privacy_blocked"><span>隐私待确认</span><strong>${escapeHtml(String(coverage.privacy_blocked))}</strong></a>
      <a class="metric-link" href="#coverage-details" data-coverage-filter="lesson_all"><span>${useZh ? "经验片段总数" : "Total lessons"}</span><strong>${escapeHtml(String(coverage.total_lessons || coverage.with_lessons))}</strong></a>
      <a class="metric-link" href="#coverage-details" data-coverage-filter="wiki_evidence_all"><span>${useZh ? `知识证据 ${coverage.total_wiki_evidence || coverage.with_wiki_evidence} / ${coverage.with_wiki_evidence} 个来源` : `Wiki evidence ${coverage.total_wiki_evidence || coverage.with_wiki_evidence} / ${coverage.with_wiki_evidence} sources`}</span><strong>${escapeHtml(String(coverage.total_wiki_evidence || coverage.with_wiki_evidence))}</strong></a>
      <a class="metric-link" href="#coverage-details" data-coverage-filter="proposal"><span>${useZh ? "涉及提案来源" : "Sources with proposals"}</span><strong>${escapeHtml(String(coverage.with_proposals))}</strong></a>
      <a class="metric-link" href="#coverage-details" data-coverage-filter="stable_kb"><span>${useZh ? "稳定知识" : "Stable KB"}</span><strong>${escapeHtml(String(coverage.stable_kb))}</strong></a>
    </div>
    <div class="kb-filter-bar">
      <button type="button" class="kb-chip is-active" data-coverage-kb-filter="all"><span>${useZh ? "全部知识库" : "All KBs"}</span><strong>${escapeHtml(String(coverage.total_items))}</strong></button>
      ${kbCards}
    </div>
    <div class="coverage-status-grid">${statusCards}</div>
    <details class="advanced-panel" id="coverage-details">
      <summary>${useZh ? "展开来源明细" : "Show source details"} <span class="filter-count" data-filter-count="coverage" style="margin-left:.4rem"></span></summary>
    <div class="table-scroll">
      <table class="coverage-table">
        <thead><tr><th>${useZh ? "来源" : "source"}</th><th>${useZh ? "知识库" : "KB"}</th><th>${useZh ? "隐私" : "privacy"}</th><th>${useZh ? "经验片段" : "lessons"}</th><th>${useZh ? "证据" : "evidence"}</th><th>${useZh ? "提案" : "proposals"}</th><th>${useZh ? "状态" : "status"}</th><th>${useZh ? "原因" : "reason"}</th><th>${useZh ? "标题" : "titles"}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan=\"9\">${useZh ? "没有覆盖记录。" : "No coverage records."}</td></tr>`}</tbody>
      </table>
    </div>
    </details>
  </section>`;
}

function renderReviewPage(
  pages: WikiSitePage[],
  graph: WikiGraph,
  queue: ReviewQueue,
  curationReport: WikiCurationReportSummary | null,
  dailyReport: DailyReportSummary | null,
  privacyTriageReport: PrivacyTriageReportSummary | null,
  reviewUiConfig: ProjectReviewUiConfig,
  language: ProjectLanguage = "en",
): string {
  const useZh = zh(language);
  const candidateHuman = queue.candidates.filter((item) => item.status === "needs_human").length;
  const currentPrivacyRequired = dailyReport?.experience_coverage?.privacy_blocked
    ?? dailyReport?.privacy_required
    ?? queue.human_required.length;
  const actionablePrivacy = queue.human_required.filter(isActionablePrivacyRecord).length;
  const counts = {
    pending: queue.candidates.filter((item) => item.status === "pending").length,
    approved: queue.candidates.filter((item) => item.status === "approved").length,
    promoted: queue.candidates.filter((item) => item.status === "promoted").length,
    current_privacy: currentPrivacyRequired,
    actionable_privacy: actionablePrivacy,
    backlog_privacy: queue.human_required.length,
    candidate_human: candidateHuman,
    rejected: (dailyReport?.rejected ?? 0) + (curationReport?.input_rejected ?? 0) + (curationReport?.compiler_hard_blocks ?? 0),
  };
  const approvalMode = reviewUiConfig.writeback === "gitlab"
    ? useZh ? "GitLab 页面回写已配置" : "GitLab Pages writeback configured"
    : useZh ? "当前仅本地审批，尚未接入 GitLab 页面回写" : "Local approval only; GitLab page writeback is not connected yet";
  const reviewNotes: CountNote[] = [
    {
      label: useZh ? "待审核提案" : "Pending proposals",
      value: String(counts.pending),
      text: useZh ? "只统计当前需要人工点批准/拒绝的 proposal；已经匹配稳定页的候选不会再出现在这里。" : "Only proposals that need an approve/reject decision now; already-stable candidates are excluded.",
      href: "#pending-candidates",
    },
    {
      label: useZh ? "隐私待确认" : "Privacy review",
      value: String(counts.actionable_privacy),
      text: useZh ? `当前可操作 ${counts.actionable_privacy} 条；全库历史积压 ${counts.backlog_privacy} 条。批准会释放脱敏摘要，拒绝会保留阻断。` : `${counts.actionable_privacy} actionable now; ${counts.backlog_privacy} in backlog. Approving releases sanitized summaries; rejecting keeps the block.`,
      href: "#human-required",
    },
    {
      label: useZh ? "当前队列已入库" : "Queue already stable",
      value: String(counts.promoted),
      text: useZh ? "表示候选目标已经存在于 kb/ 或 skills/，不是全库稳定知识总数。" : "Candidate targets already exist in kb/ or skills/; this is not the stable total.",
      href: "#promoted-candidates",
    },
    {
      label: useZh ? "稳定知识总量" : "Stable total",
      value: String(pages.length),
      text: useZh ? "首页稳定知识页展示的是全库可检索页面总数；审批通过并提升后才会增加。" : "The overview stable pages count is the total retrievable library; approvals increase it only after promotion.",
      href: "index.html#knowledge-pages",
    },
  ];
  const reviewSteps: ProcessStep[] = [
    { label: useZh ? "看队列" : "Scan", value: String(counts.current_privacy + counts.pending), note: useZh ? "先处理隐私和可审批提案" : "privacy plus actionable proposals", href: "#human-required" },
    { label: useZh ? "点决定" : "Decide", value: useZh ? "批准/拒绝" : "Approve/reject", note: useZh ? "页面写入审批记录" : "page records the decision", href: "#pending-candidates" },
    { label: useZh ? "重跑处理" : "Apply", value: useZh ? "每日处理 / 提升" : "daily / promote", note: useZh ? "消费审批记录并生成知识" : "consume decisions and write knowledge" },
    { label: useZh ? "确认入库" : "Verify", value: String(pages.length), note: useZh ? "回首页看稳定知识总量" : "return to stable total", href: "index.html#knowledge-pages" },
  ];

  return renderLayout({
    title: useZh ? "PraxisBase 审批中心" : "PraxisBase Approval Center",
    pages,
    graph,
    language,
    body: `<main class="review-shell">
  <section class="hero">
    <div>
      <p class="eyebrow">${useZh ? "审批中心" : "Approval center"}</p>
      <h1>${useZh ? "经验入库审批" : "Experience Approval"}</h1>
      <p class="lede">${useZh ? "先看本次需要处理什么，再逐条批准提案或隐私释放。审批只记录决定；重跑每日处理 / 提升入库后才会进入稳定知识库。" : "See what needs attention, then approve proposals or privacy releases. The page records decisions; daily/promote applies them to stable knowledge."}</p>
    </div>
  </section>
  <section class="action-grid" aria-label="${escapeHtml(useZh ? "待处理事项" : "Review actions")}">
    ${renderActionCard({ href: "#pending-candidates", label: useZh ? "待审核提案" : "Pending proposals", value: String(counts.pending), description: useZh ? "批准后可提升入库为稳定知识。" : "Approve before promotion into stable knowledge.", tone: counts.pending > 0 ? "warn" : "ok" })}
    ${renderActionCard({ href: "#human-required", label: useZh ? "隐私待确认" : "Current privacy", value: String(counts.actionable_privacy), description: useZh ? `当前可操作 ${counts.actionable_privacy} 条；全库 ${counts.backlog_privacy} 条。查看可审摘要，释放或拒绝。` : `${counts.actionable_privacy} actionable now; ${counts.backlog_privacy} in backlog. Inspect sanitized previews, release or reject.`, tone: counts.actionable_privacy > 0 ? "danger" : "ok" })}
    ${renderActionCard({ href: "#approved-candidates", label: useZh ? "已批准待提升" : "Approved waiting", value: String(counts.approved), description: useZh ? "下一步运行提升入库写入稳定知识。" : "Run promote to write stable pages.", tone: counts.approved > 0 ? "info" : "ok" })}
    ${renderActionCard({ href: "#promoted-candidates", label: useZh ? "当前队列已入库" : "Queue already stable", value: String(counts.promoted), description: useZh ? "候选目标已存在于 kb/ 或 skills/，不等于稳定知识总数。" : "Candidate targets already exist in kb/ or skills/; this is not the total stable count.", tone: "ok" })}
  </section>
  <nav class="review-tabs" aria-label="${escapeHtml(useZh ? "审批锚点" : "Approval sections")}">
    <a data-review-tab="pending-candidates" href="#pending-candidates">${useZh ? "待审核" : "Pending"} <span class="tab-badge">${counts.pending}</span></a>
    <a data-review-tab="human-required" href="#human-required">${useZh ? "隐私" : "Privacy"} <span class="tab-badge">${counts.actionable_privacy}</span></a>
    <a data-review-tab="approved-candidates" href="#approved-candidates">${useZh ? "已批准" : "Approved"} <span class="tab-badge">${counts.approved}</span></a>
    <a data-review-tab="rejected" href="#rejected">${useZh ? "已拒绝" : "Rejected"} <span class="tab-badge">${counts.rejected}</span></a>
    <a data-review-tab="promoted-candidates" href="#promoted-candidates">${useZh ? "已入库" : "Stable"} <span class="tab-badge">${counts.promoted}</span></a>
  </nav>
  <section class="status-strip">
    <strong>${useZh ? "审批服务" : "Approval service"}</strong>
    <span>${escapeHtml(approvalMode)}</span>
    ${reviewUiConfig.writeback === "gitlab"
      ? `<span>${useZh ? "API" : "API"}：<code>${escapeHtml(reviewUiConfig.gitlabApiBase ?? "not configured")}</code></span><span>${useZh ? "项目" : "Project"}：<code>${escapeHtml(reviewUiConfig.gitlabProjectId ?? "project missing")}</code></span><span>${useZh ? "分支" : "Branch"}：<code>${escapeHtml(reviewUiConfig.gitlabBranch ?? "branch missing")}</code></span>`
      : `<span><code>praxisbase review serve --port 4174</code></span>`}
  </section>
  ${renderGitlabWritebackPanel(reviewUiConfig, language)}
  ${renderCountNotes({ title: useZh ? "审批页数字怎么读" : "How to Read This Page", subtitle: useZh ? "这里的数字按“当前可操作队列”统计，所以会和首页全库总量不同。" : "These numbers describe the current action queue, so they differ from overview library totals.", notes: reviewNotes })}
  ${renderProcessMap({ title: useZh ? "审批闭环" : "Approval Loop", subtitle: useZh ? "页面只负责记录决定；真正写入知识库由下一次每日处理 / 提升入库完成。" : "This page records decisions; daily/promote applies them to the knowledge base.", steps: reviewSteps })}
  ${renderTerminologyPanel(language)}
  <details class="advanced-panel review-advanced">
    <summary>${useZh ? "展开高级流水线状态" : "Show advanced pipeline status"}</summary>
    ${dailyReport?.personal_ga ? renderPersonalGaSection(dailyReport.personal_ga) : ""}
    ${curationReport ? renderWikiCompilerSection(curationReport, language) : ""}
  </details>
  ${renderExperienceCoverage(dailyReport, language)}
  <section class="review-section" data-status="pending">
    <h2>${useZh ? "操作命令" : "Operational commands"}</h2>
    <p>${reviewUiConfig.writeback === "gitlab"
      ? escapeHtml(useZh ? "页面按钮会通过 GitLab API 写入审批记录。提交后等待下一次 review / promote / build pipeline 应用结果。" : "Page buttons write decisions through the GitLab API. After commit, wait for the next review / promote / build pipeline to apply them.")
      : escapeHtml(useZh ? "页面按钮现在写入本地审批服务；把 review_writeback 切到 gitlab 后可在 GitLab Pages 上直接审批。" : "Page buttons write to the local approval service. Set review_writeback=gitlab to approve directly on GitLab Pages.")}</p>
    <div class="command-strip">
      <code>praxisbase review serve --port 4174</code>
      <code>PRAXISBASE_REVIEW_WRITEBACK=gitlab praxisbase wiki build-site --json</code>
      <code>praxisbase review --auto</code>
      <code>praxisbase promote --auto</code>
      <code>praxisbase wiki build-site --json</code>
    </div>
  </section>
  ${renderCandidateSection({ id: "pending-candidates", aliasId: "review-required", title: useZh ? "待审核" : "Review Required", status: "pending", candidates: queue.candidates, empty: useZh ? "没有待审核候选项。" : "No review-required candidates.", commands: ["praxisbase review --auto", "praxisbase promote --auto", "praxisbase wiki build-site --json"], language })}
  ${renderCandidateSection({ id: "approved-candidates", title: useZh ? "已审核 / 已批准" : "Reviewed / Approved", status: "approved", candidates: queue.candidates, empty: useZh ? "没有等待提升的已批准候选项。" : "No approved candidates waiting for promotion.", commands: ["praxisbase promote --auto", "praxisbase wiki build-site --json"], language })}
  ${renderHumanRequired(queue.human_required, dailyReport, privacyTriageReport, language)}
  ${renderRejectedSection(dailyReport, curationReport, language)}
  ${renderCandidateSection({ id: "promoted-candidates", title: useZh ? "当前队列已入库" : "Queue Already Stable", status: "promoted", candidates: queue.candidates, empty: useZh ? "当前队列没有已入库候选项。" : "No already-stable candidates in the current queue.", commands: ["praxisbase gbrain export --mode personal --write --json", "praxisbase agentmemory export --mode personal --write --json"], language })}
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
  reviewQueue: ReviewQueue,
  curationReport: WikiCurationReportSummary | null,
  knowledgeConfig: ProjectKnowledgeConfig,
  language: ProjectLanguage = "en",
): string {
  const useZh = zh(language);
  const signatures = pages.flatMap((page) => page.signatures).slice(0, 8);
  const stablePages = [...pages]
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .map((page) => ({ page, kb: knowledgeBaseFromPage(page) }));
  const knowledgePageCount = pages.filter((page) => page.page_kind !== "skill").length;
  const skillPageCount = pages.filter((page) => page.page_kind === "skill").length;
  const stableTopicCount = new Set(pages.map((page) => makeWikiSlug(page.title))).size;
  const pendingReview = reviewQueue.candidates.filter((item) => item.status === "pending").length;
  const generatedProposals = dailyReport?.proposal_candidates ?? pendingCandidates.length;
  const coverage = dailyReport?.experience_coverage;
  const sourceItems = coverage?.total_items ?? dailyReport?.source_count ?? 0;
  const currentSourcePrivacy = coverage?.privacy_blocked ?? dailyReport?.privacy_required ?? dailyReport?.human_required ?? 0;
  const privacyQueue = reviewQueue.human_required.length;
  const privacyReview = dailyReport?.privacy_required ?? dailyReport?.human_required ?? Math.max(privacyQueue, currentSourcePrivacy);
  const curationBacklog = coverage?.pending_curation ?? 0;
  const lessonCount = coverage?.total_lessons ?? coverage?.with_lessons ?? 0;
  const rejected = (dailyReport?.rejected ?? 0) + (curationReport?.input_rejected ?? 0) + (curationReport?.compiler_hard_blocks ?? 0);
  const knowledgeBases = buildKnowledgeBaseOverview(pages, dailyReport, knowledgeConfig);
  const activeKnowledgeLabels = knowledgeBases.map((item) => item.label).join(" / ");
  const sourceNameSummary = dailyReport?.sources.length
    ? dailyReport.sources.map((source) => source.name).join(" / ")
    : useZh ? "已配置来源" : "configured sources";
  const processSteps: ProcessStep[] = [
    {
      label: useZh ? "来源采集" : "Collect",
      value: String(sourceItems),
      note: useZh ? `来自 ${sourceNameSummary}；这是原始条目，不是经验数量` : `from ${sourceNameSummary}; raw items, not lessons`,
      href: "#data-sources",
    },
    {
      label: useZh ? "隐私筛选" : "Privacy",
      value: String(currentSourcePrivacy),
      note: useZh ? `本次阻断 ${currentSourcePrivacy}；审批队列 ${privacyReview}` : `${currentSourcePrivacy} blocked this run; queue ${privacyReview}`,
      href: "review.html#human-required",
    },
    {
      label: useZh ? "经验提炼" : "Extract",
      value: String(lessonCount),
      note: useZh ? `${lessonCount} 个经验片段；${curationBacklog} 个来源待二次提炼` : `${lessonCount} lessons; ${curationBacklog} sources need curation`,
      href: "review.html#experience-coverage",
    },
    {
      label: useZh ? "提案审批" : "Review",
      value: String(pendingReview),
      note: useZh ? `当前可审批 ${pendingReview}；本次生成 ${generatedProposals}` : `${pendingReview} actionable; ${generatedProposals} generated`,
      href: "review.html#pending-candidates",
    },
    {
      label: useZh ? "稳定知识" : "Stable",
      value: String(pages.length),
      note: useZh ? `稳定页面：知识页 ${knowledgePageCount} + 技能 ${skillPageCount}；主题 ${stableTopicCount}` : `stable pages: ${knowledgePageCount} KB + ${skillPageCount} skills; ${stableTopicCount} topics`,
      href: "#knowledge-pages",
    },
  ];
  const num = (n: number) => `<strong class="num">${n}</strong>`;
  const dashboardConclusion = pendingReview > 0
    ? useZh
      ? `先处理 ${num(privacyReview)} 条隐私审批和 ${num(pendingReview)} 个可审批提案。稳定知识总量是 ${num(pages.length)}，不是本次新增数。`
      : `Handle ${num(privacyReview)} privacy decisions and ${num(pendingReview)} actionable proposals. Stable total is ${num(pages.length)}, not new pages this run.`
    : useZh
      ? `先处理 ${num(privacyReview)} 条隐私审批；当前没有可审批提案。稳定知识总量是 ${num(pages.length)}，不是本次新增数。`
      : `Handle ${num(privacyReview)} privacy decisions first; no actionable proposal is waiting now. Stable total is ${num(pages.length)}, not new pages this run.`;
  const cards = [
    { label: useZh ? "来源" : "Sources", value: String(new Set(pages.flatMap((page) => page.source_ids)).size), href: "#knowledge-pages", i18nKey: "dashboard.metric.sources" },
    { label: useZh ? "页面" : "Pages", value: String(pages.length), href: "#knowledge-pages", i18nKey: "dashboard.metric.pages" },
    { label: useZh ? "断链" : "Broken links", value: String(graph.broken_links.length), href: "issues.html", i18nKey: "dashboard.metric.brokenLinks" },
    { label: useZh ? "重复" : "Duplicates", value: String(graph.duplicates.length), href: "issues.html", i18nKey: "dashboard.metric.duplicates" },
    { label: useZh ? "孤立项" : "Orphans", value: String(graph.orphans.length), href: "graph.html", i18nKey: "dashboard.metric.orphans" },
    { label: useZh ? "过期" : "Stale", value: String(stalePages), href: "issues.html", i18nKey: "dashboard.metric.stale" },
    { label: useZh ? "质量问题" : "Quality findings", value: String(qualityFindings), href: "issues.html", i18nKey: "dashboard.metric.quality" },
    { label: useZh ? "包状态" : "Bundle status", value: bundleStatus, i18nKey: "dashboard.metric.bundle" },
  ];

  return renderLayout({
    title: useZh ? "PraxisBase 团队经验知识库" : "PraxisBase Team Experience Base",
    pages,
    graph,
    language,
    body: `<main class="dashboard">
  <section class="hero">
    <div>
      <p class="eyebrow" data-i18n="dashboard.eyebrow">${escapeHtml(useZh ? "团队经验知识中枢" : "Team experience knowledge hub")}</p>
      <h1 data-i18n="dashboard.title">${escapeHtml(useZh ? "团队经验知识库" : "Team Experience Base")}</h1>
      <p class="lede">${escapeHtml(useZh ? `统一查看 ${activeKnowledgeLabels} 的采集、隐私、审批和沉淀状态。` : `Track collection, privacy, review, and stable knowledge across ${activeKnowledgeLabels}.`)}</p>
    </div>
  </section>
  <section class="action-grid" aria-label="${escapeHtml(useZh ? "下一步操作" : "Next actions")}">
    ${renderActionCard({ href: "review.html#pending-candidates", label: useZh ? "可审批提案" : "Actionable proposals", value: String(pendingReview), description: useZh ? "当前能直接批准或拒绝的知识改动。" : "Knowledge changes ready to approve or reject.", tone: pendingReview > 0 ? "warn" : "ok" })}
    ${renderActionCard({ href: "review.html#human-required", label: useZh ? "隐私审批队列" : "Privacy queue", value: String(privacyReview), description: useZh ? `含历史待确认；本次阻断 ${currentSourcePrivacy}。` : `Includes backlog; ${currentSourcePrivacy} blocked this run.`, tone: privacyReview > 0 ? "danger" : "ok" })}
    ${renderActionCard({ href: "#knowledge-pages", label: useZh ? "稳定页面" : "Stable pages", value: String(pages.length), description: useZh ? `知识页 ${knowledgePageCount} + 技能 ${skillPageCount}；同一主题会合并说明。` : `${knowledgePageCount} KB pages + ${skillPageCount} skills; related artifacts are explained below.`, tone: "ok" })}
    ${renderActionCard({ href: "issues.html", label: useZh ? "质量阻断" : "Quality blockers", value: String(qualityFindings), description: useZh ? "断链、重复、过期和编译阻断统一在这里看。" : "Broken links, duplicates, stale pages, and compiler blockers.", tone: qualityFindings > 0 || rejected > 0 ? "info" : "ok" })}
  </section>
  <section class="status-strip">
    <strong>${useZh ? "当前结论" : "Current state"}</strong>
    <span>${dashboardConclusion}</span>
  </section>
  ${renderDataSourceSection(dailyReport, language)}
  ${renderProcessMap({ title: useZh ? "从来源到入库的处理链路" : "From Source to Stable Knowledge", subtitle: useZh ? "这些数字按阶段展示，不是简单相加。点击阶段可以跳到明细或审批入口。" : "Counts are stage-specific rather than additive. Click a stage to inspect details or act.", steps: processSteps })}
  ${renderKnowledgeBaseOverview(knowledgeBases, language)}
  ${renderKnowledgeBaseRules(knowledgeBases, language)}
  ${renderTerminologyPanel(language)}
  ${dailyReport ? renderDailyOverviewSection(dailyReport, language) : ""}
  <details class="advanced-panel dashboard-advanced">
    <summary>${useZh ? "展开运行、编译和候选详情" : "Show runtime, compiler, and candidate details"}</summary>
    <section class="metrics">
      ${cards.map(renderMetricCard).join("\n")}
    </section>
    ${renderRuntimeContextSection(agentBundleReport, personalFacetCounts)}
    ${curationReport ? renderWikiCompilerSection(curationReport, language) : ""}
    ${renderPendingCandidates(pendingCandidates, language)}
  </details>
  <section class="overview-grid">
    <div id="knowledge-pages" class="panel">
      <div class="panel-head">
        <h2 data-i18n="dashboard.knowledgePages">${escapeHtml(useZh ? "稳定知识" : "Stable Knowledge")}</h2>
        <div class="filters" aria-label="${escapeHtml(useZh ? "知识类型筛选" : "Knowledge type filters")}" data-i18n-aria-label="filters.knowledgeType">
          ${kindFilters(pages).map((kind) => `<button type="button" data-kind-filter="${escapeHtml(kind)}"${kind === "all" ? " data-i18n=\"filters.all\"" : ""}>${escapeHtml(kind === "all" ? useZh ? "全部" : "All" : kind)}</button>`).join("\n")}
          <span class="filter-count" data-filter-count="kind"></span>
        </div>
      </div>
      <p class="section-subtitle">${escapeHtml(useZh ? `共 ${pages.length} 个稳定页面：${knowledgePageCount} 个知识页 + ${skillPageCount} 个技能页，约 ${stableTopicCount} 个主题。审批通过并 promote 后会出现在这里。` : `${pages.length} stable page(s): ${knowledgePageCount} KB pages + ${skillPageCount} skills, about ${stableTopicCount} topics. Approved and promoted items appear here.`)}</p>
      ${stablePages.length > 0 ? (() => {
        const renderStableLi = ({ page, kb }: { page: WikiSitePage; kb: string }) => `<li data-page-kind="${escapeHtml(page.page_kind ?? "note")}" data-page-kb="${escapeHtml(kb)}"><a href="${escapeHtml(pageHref(page))}">${escapeHtml(page.title)}</a>${page.description ? `<em class="kb-desc">${escapeHtml(page.description)}</em>` : ""}<span>${escapeHtml(`${knowledgeBaseLabel(kb, knowledgeConfig)} · ${page.page_kind ?? "note"}`)}</span>${page.path.startsWith("kb/") || page.path.endsWith("/SKILL.md") ? `<div class="approval-actions revoke-actions" data-revoke-actions data-revoke-path="${escapeHtml(page.path)}"><button type="button" data-revoke-decision="archive">${useZh ? "撤回" : "Revoke"}</button><span class="approval-status" data-revoke-status>${useZh ? "撤回后会从稳定知识和检索中移除。" : "Revoking removes this from stable knowledge and retrieval."}</span></div>` : ""}</li>`;
        const groups = new Map<string, { kb: string; kind: string; label: string; items: { page: WikiSitePage; kb: string }[] }>();
        stablePages.forEach((entry) => {
          const label = knowledgeBaseLabel(entry.kb, knowledgeConfig);
          const kind = entry.page.page_kind ?? "note";
          const key = `${label}·${kind}`;
          if (!groups.has(key)) groups.set(key, { kb: entry.kb, kind, label, items: [] });
          groups.get(key)!.items.push(entry);
        });
        const sorted = Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label) || a.kind.localeCompare(b.kind));
        const maxCount = Math.max(...sorted.map((g) => g.items.length));
        return `<div class="kb-tree">
          ${sorted.map((g) => `<details${g.items.length === maxCount ? " open" : ""} class="kb-tree-group" data-kb="${escapeHtml(g.kb)}" data-kind="${escapeHtml(g.kind)}">
            <summary>${escapeHtml(g.label)} · ${escapeHtml(g.kind)} <span class="tree-count">${g.items.length}</span></summary>
            <ol class="link-list">
              ${g.items.map(renderStableLi).join("\n")}
            </ol>
          </details>`).join("\n")}
        </div>`;
      })() : renderEmptyState({ message: useZh ? "还没有稳定知识页。审批通过并提升入库后会出现在这里。" : "No stable knowledge yet. Approved and promoted items appear here.", cta: pendingReview > 0 || privacyReview > 0 ? { href: "review.html", label: useZh ? "去审批处理" : "Go to approvals" } : undefined })}
    </div>
    <div class="panel">
      <h2 data-i18n="dashboard.topSignatures">${escapeHtml(useZh ? "高频特征" : "Top Signatures")}</h2>
      <p class="section-subtitle">${escapeHtml(useZh ? "用于检索和匹配相似故障的关键词。" : "Signals used to retrieve and match similar incidents.")}</p>
      ${signatures.length > 0 ? `<ol class="link-list">
        ${signatures.map((signature) => `<li><code>${escapeHtml(signature)}</code></li>`).join("\n")}
      </ol>` : renderEmptyState({ message: useZh ? "暂无特征索引" : "No signatures indexed" })}
    </div>
  </section>
</main>`,
  });
}

function renderPage(page: WikiSitePage, pages: WikiSitePage[], graph: WikiGraph, language: ProjectLanguage = "en"): string {
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
    language,
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

function renderGraphPage(pages: WikiSitePage[], graph: WikiGraph, language: ProjectLanguage = "en"): string {
  const useZh = zh(language);
  return renderLayout({
    title: useZh ? "PraxisBase 知识关系" : "PraxisBase Knowledge Relationships",
    pages,
    graph,
    language,
    body: `<main class="graph-shell">
  <section class="hero">
    <div>
      <p class="eyebrow" data-i18n="graph.eyebrow">${escapeHtml(useZh ? "知识关系" : "Knowledge relationships")}</p>
      <h1 data-i18n="graph.title">${escapeHtml(useZh ? "关系视图" : "Relationships")}</h1>
      <p class="lede" data-i18n="graph.lede">${escapeHtml(useZh ? "查看哪些稳定知识互相引用、哪些来源被合并，以及 Agent 检索时可能拿到的关联上下文。" : "See cross-links, merged sources, and related context agents may retrieve together.")}</p>
    </div>
  </section>
  <section class="action-grid" aria-label="${escapeHtml(useZh ? "关系概览" : "Relationship summary")}">
    ${renderActionCard({ href: "#nodes", label: useZh ? "知识节点" : "Knowledge nodes", value: String(pages.length), description: useZh ? "稳定页面和技能页面。" : "Stable pages and skill pages.", tone: "ok" })}
    ${renderActionCard({ href: "#links", label: useZh ? "引用关系" : "Links", value: String(graph.links.length), description: useZh ? "页面之间的显式或推断关联。" : "Explicit or inferred page relationships.", tone: "info" })}
    ${renderActionCard({ href: "issues.html", label: useZh ? "断链" : "Broken links", value: String(graph.broken_links.length), description: useZh ? "需要修复的无效引用。" : "Invalid references to fix.", tone: graph.broken_links.length > 0 ? "danger" : "ok" })}
    ${renderActionCard({ href: "issues.html", label: useZh ? "重复" : "Duplicates", value: String(graph.duplicates.length), description: useZh ? "可能需要合并的重复知识。" : "Potentially mergeable duplicated knowledge.", tone: graph.duplicates.length > 0 ? "warn" : "ok" })}
  </section>
  <section class="status-strip">
    <strong>${useZh ? "怎么用" : "How to use"}</strong>
    <span>${escapeHtml(useZh ? "这里用于看知识之间的引用、重复和上下文邻居；审批请回到“审批”页，质量阻断请看“质检”页。" : "Use this page for references, duplicates, and retrieval neighbors; approvals live on the approval page and blockers on quality.")}</span>
  </section>
  ${pages.length > 0 ? (() => {
    const KIND_COLORS: Record<string, string> = { known_fix: "#146c5c", procedure: "#5a6da8", note: "#9a5a00", pitfall: "#8b2f58", decision: "#10795f", memory: "#6b4fa0", other: "#7c8580" };
    const kindColor = (k: string) => KIND_COLORS[k] ?? KIND_COLORS.other;
    const distinctKinds = Array.from(new Set(pages.map((p) => p.page_kind ?? "note"))).sort();
    const legendChips = distinctKinds.map((kind) => `<span><i style="background:${kindColor(kind)}"></i>${escapeHtml(kind)}</span>`).join("");
    const descriptions: Record<string, string> = {};
    pages.forEach((p) => { if (p.description) descriptions[p.slug] = p.description; });
    return `<section class="graph-canvas-wrap panel">
    <div class="graph-legend">${legendChips}<span class="graph-legend-link"><i style="background:var(--line)"></i>${useZh ? "引用关系" : "Link"}</span><span class="graph-legend-hint">${useZh ? "滚轮缩放 · 拖拽节点或背景" : "Scroll to zoom · Drag nodes or background"}</span></div>
    <svg class="graph-canvas" data-graph-canvas aria-label="${escapeHtml(useZh ? "知识关系图" : "Knowledge relationship graph")}" role="img"></svg>
    <script>window.__WIKI_NODE_DESCRIPTIONS__=${escapeJsonForHtml(descriptions)};</script>
  </section>`;
  })() : ""}
  <section class="graph-grid">
    <div class="graph-panel" id="nodes">
      <div class="panel-head">
        <h2 data-i18n="graph.nodes">${escapeHtml(useZh ? "节点" : "Nodes")}</h2>
        <div class="filters" aria-label="${escapeHtml(useZh ? "知识类型筛选" : "Knowledge type filters")}" data-i18n-aria-label="filters.knowledgeType">
          ${kindFilters(pages).map((kind) => `<button type="button" data-kind-filter="${escapeHtml(kind)}"${kind === "all" ? " data-i18n=\"filters.all\"" : ""}>${escapeHtml(kind === "all" ? useZh ? "全部" : "All" : kind)}</button>`).join("\n")}
          <span class="filter-count" data-filter-count="kind"></span>
        </div>
      </div>
      ${pages.length > 0 ? `<ol class="link-list">
        ${pages.map((page) => `<li data-page-kind="${escapeHtml(page.page_kind ?? "note")}"><a href="${escapeHtml(pageHref(page))}">${escapeHtml(page.title)}</a><span>${escapeHtml(page.page_kind ?? "note")}</span></li>`).join("\n")}
      </ol>` : renderEmptyState({ message: useZh ? "还没有知识节点。审批通过并提升后会出现在这里。" : "No knowledge nodes yet. Approved and promoted items appear here.", cta: { href: "review.html", label: useZh ? "去审批处理" : "Go to approvals" } })}
    </div>
    <div class="graph-panel" id="links">
      <h2 data-i18n="graph.links">${escapeHtml(useZh ? "关系" : "Links")}</h2>
      ${graph.links.length > 0 ? `<ol class="link-list">
        ${graph.links.slice(0, 80).map((link) => `<li><code>${escapeHtml(link.from)} -> ${escapeHtml(link.to)}</code><span>${escapeHtml(link.type)}</span></li>`).join("\n")}
      </ol>` : renderEmptyState({ message: useZh ? "当前没有显式引用关系。" : "No explicit links between knowledge pages." })}
    </div>
  </section>
</main>`,
  });
}

function renderIssuesPage(
  pages: WikiSitePage[],
  graph: WikiGraph,
  qualityFindings: Array<{ rule: string; severity: string; path: string; message: string }>,
  dailyReport: DailyReportSummary | null,
  language: ProjectLanguage = "en",
): string {
  const useZh = zh(language);
  return renderLayout({
    title: useZh ? "PraxisBase 质量检查" : "PraxisBase Quality Checks",
    pages,
    graph,
    language,
    body: `<main class="issues-shell">
  <section class="hero">
    <div>
      <p class="eyebrow" data-i18n="issues.eyebrow">${escapeHtml(useZh ? "知识质检" : "Knowledge quality")}</p>
      <h1 data-i18n="issues.title">${escapeHtml(useZh ? "质量检查" : "Quality Checks")}</h1>
      <p class="lede" data-i18n="issues.lede">${escapeHtml(useZh ? "展示会影响沉淀、引用或 Agent 使用可靠性的阻断项。" : "Findings that affect promotion, linking, or reliable agent use.")}</p>
    </div>
  </section>
  <section class="action-grid" aria-label="${escapeHtml(useZh ? "质量概览" : "Quality summary")}">
    ${renderActionCard({ href: "#quality-findings", label: useZh ? "质检发现" : "Findings", value: String(qualityFindings.length), description: useZh ? "当前构建发现的问题。" : "Current build findings.", tone: qualityFindings.length > 0 ? "warn" : "ok" })}
    ${renderActionCard({ href: "graph.html", label: useZh ? "断链" : "Broken links", value: String(graph.broken_links.length), description: useZh ? "来自关系图的无效链接。" : "Invalid links from the relationship graph.", tone: graph.broken_links.length > 0 ? "danger" : "ok" })}
    ${renderActionCard({ href: "graph.html", label: useZh ? "重复" : "Duplicates", value: String(graph.duplicates.length), description: useZh ? "需要合并或消重的页面。" : "Pages that may need merging or dedupe.", tone: graph.duplicates.length > 0 ? "warn" : "ok" })}
    ${renderActionCard({ href: "review.html#human-required", label: useZh ? "隐私阻断" : "Privacy blockers", value: String(dailyReport?.human_required ?? 0), description: useZh ? "Daily 中仍需人工判断的项。" : "Daily items still needing human decision.", tone: (dailyReport?.human_required ?? 0) > 0 ? "danger" : "ok" })}
  </section>
  <section class="status-strip">
    <strong>${useZh ? "怎么用" : "How to use"}</strong>
    <span>${escapeHtml(useZh ? "这里展示会影响入库或 Agent 使用可靠性的阻断项。没有发现时，代表当前静态知识站点没有阻塞性质量问题。" : "This page lists blockers that affect promotion or reliable agent use. No findings means the static knowledge site has no blocking quality issue.")}</span>
  </section>
  <section class="issues-panel" id="quality-findings">
    <h2>${escapeHtml(useZh ? "质检发现" : "Findings")}</h2>
    ${qualityFindings.length > 0 ? `<ol class="issue-list">
      ${qualityFindings.map((finding) => `<li><strong>${escapeHtml(finding.rule)}</strong> <small>${escapeHtml(finding.severity)}</small><br>${escapeHtml(finding.message)}<br><small>${escapeHtml(finding.path)}</small></li>`).join("\n")}
    </ol>` : renderEmptyState({ message: useZh ? "当前没有阻塞性质量问题。" : "No blocking quality issues found." })}
  </section>
  ${dailyReport ? renderDailyPrivacyFindings(dailyReport, language) : ""}
</main>`,
  });
}

function renderDailyPrivacyFindings(report: DailyReportSummary, language: ProjectLanguage = "en"): string {
  if (report.rejected === 0 && report.human_required === 0) {
    return "";
  }
  const useZh = zh(language);
  return `<section class="issues-panel">
  <h2 data-i18n="issues.dailyPrivacy">${escapeHtml(useZh ? "Daily 隐私发现" : "Daily Privacy Findings")}</h2>
  <div class="privacy-summary-card">
    <div class="metric"><span>${useZh ? "已拒绝" : "Rejected"}</span><strong>${escapeHtml(String(report.rejected))}</strong></div>
    <div class="metric"><span>${useZh ? "需要人工" : "Human required"}</span><strong>${escapeHtml(String(report.human_required))}</strong></div>
  </div>
</section>`;
}

function renderWikiCompilerSection(report: WikiCurationReportSummary, language: ProjectLanguage = "en"): string {
  const useZh = zh(language);
  const dateLabel = report.created_at.slice(0, 10);
  const planCards = [
    { label: useZh ? "新建" : "Create", value: String(report.compiler_page_plans_create) },
    { label: useZh ? "更新" : "Update", value: String(report.compiler_page_plans_update) },
    { label: useZh ? "合并" : "Merge", value: String(report.compiler_page_plans_merge) },
    { label: useZh ? "替代" : "Supersede", value: String(report.compiler_page_plans_supersede) },
    { label: useZh ? "归档" : "Archive", value: String(report.compiler_page_plans_archive) },
  ];
  const relationshipCards = [
    { label: useZh ? "必需链接" : "Required links", value: report.relationship_required_links },
    { label: useZh ? "建议链接" : "Suggested links", value: report.relationship_suggested_links },
    { label: useZh ? "合并计划" : "Merge plans", value: report.relationship_merge_plans },
    { label: useZh ? "歧义合并" : "Ambiguous merges", value: report.relationship_ambiguous_merge_targets },
    { label: useZh ? "孤立主题" : "Isolated topics", value: report.relationship_isolated_topics },
    { label: useZh ? "孤儿风险" : "Orphan risk after plan", value: report.relationship_orphan_risk_after_plan },
  ];
  const hasRelationshipCounts = relationshipCards.some((card) => card.value > 0);
  const aiLabel = report.ai_configured ? `AI ${report.ai_mode}` : useZh ? "确定性模式" : "Deterministic";
  return `<section class="wiki-compiler-status">
  <h2>${useZh ? "Wiki 编译器" : "Wiki Compiler"}</h2>
  <p class="eyebrow">${escapeHtml(dateLabel)} &middot; ${escapeHtml(report.mode)} &middot; ${escapeHtml(aiLabel)}${report.ai_model ? ` &middot; ${escapeHtml(report.ai_model)}` : ""}</p>
  <div class="metrics">
    <article><span>${useZh ? "观察项" : "Observations"}</span><strong>${escapeHtml(String(report.compiler_observations))}</strong></article>
    <article><span>${useZh ? "主题" : "Topics"}</span><strong>${escapeHtml(String(report.compiler_topics))}</strong></article>
    ${planCards.map((card) => `<article><span>${useZh ? "计划" : "Plan"} ${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></article>`).join("\n")}
    <article><span>${useZh ? "重复 source-hash 分组" : "Dup source-hash groups"}</span><strong>${escapeHtml(String(report.compiler_duplicate_source_hash_groups))}</strong></article>
    <article><span>${useZh ? "硬阻断" : "Hard blocks"}</span><strong>${escapeHtml(String(report.compiler_hard_blocks))}</strong></article>
    <article><span>${useZh ? "需质量审核" : "Quality review needed"}</span><strong>${escapeHtml(String(report.compiler_human_required_quality))}</strong></article>
    <article><span>${useZh ? "已写入提案" : "Written proposals"}</span><strong>${escapeHtml(String(report.output_written_proposals))}</strong></article>
    ${report.proposal_limit !== undefined ? `<article><span>${useZh ? "提案上限" : "Proposal limit"}</span><strong>${escapeHtml(String(report.proposal_limit))}</strong></article>` : ""}
    ${report.limit_reason ? `<article><span>${useZh ? "上限原因" : "Limit reason"}</span><strong>${escapeHtml(report.limit_reason)}</strong></article>` : ""}
    ${report.input_human_required > 0 ? `<article><span>${useZh ? "输入/隐私 triage" : "Input/privacy triage"}</span><strong>${escapeHtml(String(report.input_human_required))}</strong></article>` : ""}
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
  sources: DailySourceSummary[];
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
	  experience_coverage?: {
	    total_items: number;
	    with_privacy_result: number;
	    with_lessons: number;
	    with_wiki_evidence: number;
	    with_proposals: number;
	    stable_kb: number;
	    total_lessons: number;
	    total_wiki_evidence: number;
	    pending_curation: number;
	    privacy_blocked: number;
	    low_signal_rejected: number;
	    items: Array<{
	      source_id: string;
	      source_ref?: string;
	      knowledge_base?: string;
	      privacy_decision?: string;
	      lesson_count: number;
	      lesson_claims: string[];
	      wiki_evidence_count: number;
	      proposal_count: number;
	      proposal_titles: string[];
	      stable_kb_paths: string[];
	      status: string;
        reason_code?: string;
        reason?: string;
	    }>;
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

interface DailySourceSummary {
  name: string;
  agent?: string;
  channel?: string;
  source_type?: string;
  parser?: string;
  scope_default?: string;
  status: string;
  scanned: number;
  fetched: number;
  enveloped: number;
  imported: number;
  rejected: number;
  human_required: number;
  repo?: string;
  ref?: string;
  path?: string;
  warnings: string[];
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
      agent?: string;
      channel?: string;
      source_type?: string;
      status?: string;
      scanned?: number;
      fetched?: number;
      enveloped?: number;
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
	    experience_coverage?: Record<string, unknown>;
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
  const configuredSources = new Map((await listExperienceSources(root)).map((source) => [source.name, source]));
  const sourceDetails: DailySourceSummary[] = sources.map((source) => {
    const config = configuredSources.get(source.name ?? "");
    return {
      name: source.name ?? config?.name ?? "unknown",
      agent: source.agent ?? config?.agent,
      channel: source.channel ?? config?.channel,
      source_type: source.source_type ?? config?.source_type,
      parser: config?.parser,
      scope_default: config?.scope_default,
      status: source.status ?? "unknown",
      scanned: source.scanned ?? 0,
      fetched: source.fetched ?? 0,
      enveloped: source.enveloped ?? 0,
      imported: source.imported ?? 0,
      rejected: source.rejected ?? 0,
      human_required: source.human_required ?? 0,
      repo: config?.repo,
      ref: config?.ref,
      path: config?.path,
      warnings: Array.isArray(source.warnings) ? source.warnings : [],
    };
  });
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
    sources: sourceDetails,
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
	    experience_coverage: latest.experience_coverage && typeof latest.experience_coverage === "object" ? (() => {
	      const coverage = latest.experience_coverage as Record<string, unknown>;
	      const rawItems = Array.isArray(coverage.items) ? coverage.items : [];
	      return {
	        total_items: typeof coverage.total_items === "number" ? coverage.total_items : rawItems.length,
	        with_privacy_result: typeof coverage.with_privacy_result === "number" ? coverage.with_privacy_result : 0,
	        with_lessons: typeof coverage.with_lessons === "number" ? coverage.with_lessons : 0,
	        with_wiki_evidence: typeof coverage.with_wiki_evidence === "number" ? coverage.with_wiki_evidence : 0,
	        with_proposals: typeof coverage.with_proposals === "number" ? coverage.with_proposals : 0,
	        stable_kb: typeof coverage.stable_kb === "number" ? coverage.stable_kb : 0,
	        total_lessons: typeof coverage.total_lessons === "number" ? coverage.total_lessons : 0,
	        total_wiki_evidence: typeof coverage.total_wiki_evidence === "number" ? coverage.total_wiki_evidence : 0,
	        pending_curation: typeof coverage.pending_curation === "number" ? coverage.pending_curation : 0,
	        privacy_blocked: typeof coverage.privacy_blocked === "number" ? coverage.privacy_blocked : 0,
	        low_signal_rejected: typeof coverage.low_signal_rejected === "number" ? coverage.low_signal_rejected : 0,
	        items: rawItems.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))).map((item) => {
            const normalized = {
	            source_id: typeof item.source_id === "string" ? item.source_id : "unknown",
	            source_ref: typeof item.source_ref === "string" ? item.source_ref : undefined,
	            knowledge_base: typeof item.knowledge_base === "string" ? item.knowledge_base : undefined,
	            privacy_decision: typeof item.privacy_decision === "string" ? item.privacy_decision : undefined,
	            lesson_count: typeof item.lesson_count === "number" ? item.lesson_count : 0,
	            lesson_claims: Array.isArray(item.lesson_claims) ? item.lesson_claims.filter((claim): claim is string => typeof claim === "string") : [],
	            wiki_evidence_count: typeof item.wiki_evidence_count === "number" ? item.wiki_evidence_count : 0,
	            proposal_count: typeof item.proposal_count === "number" ? item.proposal_count : 0,
	            proposal_titles: Array.isArray(item.proposal_titles) ? item.proposal_titles.filter((title): title is string => typeof title === "string") : [],
	            stable_kb_paths: Array.isArray(item.stable_kb_paths) ? item.stable_kb_paths.filter((path): path is string => typeof path === "string") : [],
	            status: typeof item.status === "string" ? item.status : "raw_only",
                reason_code: typeof item.reason_code === "string" ? item.reason_code : undefined,
                reason: typeof item.reason === "string" ? item.reason : undefined,
            };
            return { ...normalized, knowledge_base: knowledgeBaseFromCoverageItem(normalized) };
	        }),
	      };
	    })() : undefined,
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
      const reason = stringValue(value.reason) ?? "Human review required";
      const privacyReviewable = /^Experience privacy verdict human_required\b/i.test(reason)
        || stringValue(privacy.verdict) === "human_required"
        || stringValue(details.privacy_verdict) === "human_required";
      if (!privacyReviewable) continue;
      const suggestedRedactions = Array.isArray(triage.suggested_redactions)
        ? triage.suggested_redactions.map(stringValue).filter((item): item is string => Boolean(item))
        : [];
      records.push({
        id: stringValue(value.id) ?? file.replace(/\.json$/i, ""),
        path,
        source_id: stringValue(value.source_id) ?? stringValue(details.source_id) ?? "unknown",
        reason,
        redacted_summary: stringValue(details.redacted_summary),
        agent: stringValue(details.agent),
        scope: stringValue(details.scope_hint) ?? stringValue(details.scope) ?? stringValue(privacy.mode),
        source_ref: stringValue(details.source_ref),
        source_hash: stringValue(details.source_hash),
        privacy_reviewable: privacyReviewable,
        created_at: stringValue(value.created_at) ?? "",
        triage: Object.keys(triage).length > 0 ? {
          classification: stringValue(triage.classification),
          decision: stringValue(triage.decision),
          confidence: typeof triage.confidence === "number" ? String(triage.confidence) : stringValue(triage.confidence),
          rationale: stringValue(triage.rationale),
          suggested_redactions: suggestedRedactions,
          release_summary: stringValue(triage.release_summary),
          reviewer_id: stringValue(triage.reviewer_id),
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
  const languageConfig = await readProjectLanguageConfig(root);
  const reviewUiConfig = await readProjectReviewUiConfig(root);
  const uiLanguage = languageConfig.uiLanguage;
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

  await writeText(root, "dist/index.html", renderDashboard(pages, graph, bundleStatus, stalePages, qualityReport.summary.total, dailyReport, agentBundleReport, personalFacetCounts, experienceSummaries, pendingCandidates, reviewQueue, curationReport, languageConfig.knowledge, uiLanguage));
  await writeText(root, "dist/review.html", renderReviewPage(pages, graph, reviewQueue, curationReport, dailyReport, privacyTriageReport, reviewUiConfig, uiLanguage));
  await writeJson(root, "dist/search-index.json", {
    protocol_version: "0.1",
    documents: [
      ...pages.map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      path: page.path,
      kind: page.page_kind,
      description: page.description,
      text: `${page.title}\n${page.description ?? ""}\n${page.summary}\n${page.body_text}`,
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
  await writeText(root, "dist/graph.html", renderGraphPage(pages, graph, uiLanguage));
  await writeText(root, "dist/issues.html", renderIssuesPage(pages, graph, qualityReport.findings, dailyReport, uiLanguage));
  await writeJson(root, "dist/graph.jsonld", graphJsonLd(pages, graph));
  await writeText(root, "dist/llms.txt", renderLlms(pages, false));
  await writeText(root, "dist/llms-full.txt", renderLlms(pages, true));
  await writeText(root, "dist/ai-readme.md", renderAiReadme({ pages, graph }));
  await writeText(root, "dist/sitemap.xml", renderSitemap(pages));
  await writeText(root, "dist/robots.txt", "User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n");
  await writeJson(root, "dist/review-config.json", {
    protocol_version: "0.1",
    review_api_base: reviewUiConfig.reviewApiBase,
    writeback: reviewUiConfig.writeback,
    ...(reviewUiConfig.gitlabApiBase ? { gitlab_api_base: reviewUiConfig.gitlabApiBase } : {}),
    ...(reviewUiConfig.gitlabProjectId ? { gitlab_project_id: reviewUiConfig.gitlabProjectId } : {}),
    ...(reviewUiConfig.gitlabBranch ? { gitlab_branch: reviewUiConfig.gitlabBranch } : {}),
  });
  await writeJson(root, "dist/knowledge-config.json", {
    protocol_version: "0.1",
    profile: languageConfig.knowledge.profile,
    bases: languageConfig.knowledge.bases,
    global_filter_rules: languageConfig.knowledge.filterRules,
    curation_include_auto_released: languageConfig.knowledge.curationIncludeAutoReleased,
  });
  await writeText(root, "dist/style.css", SITE_CSS);
  await writeText(root, "dist/site.js", SITE_JS);

  await rm(safePath(root, "dist/pages"), { recursive: true, force: true });
  for (const page of pages) {
    const base = `dist/pages/${page.slug}`;
    await writeText(root, `${base}.html`, renderPage(page, pages, graph, uiLanguage));
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
