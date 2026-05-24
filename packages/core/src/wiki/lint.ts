import { stat } from "node:fs/promises";
import { normalize, isAbsolute } from "node:path";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { appearsToBeRawLog } from "../protocol/redact.js";
import { writeJson } from "../store/file-store.js";
import { buildWikiGraph, type WikiPage } from "./resolver.js";

export type WikiLintRule =
  | "missing_source_hash"
  | "missing_citation"
  | "broken_wikilink"
  | "orphan_active_page"
  | "duplicate_slug"
  | "duplicate_title"
  | "duplicate_id"
  | "stale_active_page"
  | "personal_scope_leak"
  | "unsafe_patch_path"
  | "body_shrink_violation"
  | "raw_log_content"
  | "missing-root-artifact"
  | "missing-source-summary"
  | "raw-copy-page"
  | "source-summary-promoted-as-guidance"
  | "missing-agent-use-section"
  | "stale-or-superseded-conflict"
  | "unresolved-typed-edge";

export interface WikiLintFinding {
  rule: WikiLintRule;
  severity: "error" | "warning";
  path: string;
  message: string;
  page_id?: string;
  details?: Record<string, unknown>;
}

export interface WikiLintReport {
  id: string;
  protocol_version: typeof PROTOCOL_VERSION;
  type: "wiki_lint_report";
  findings: WikiLintFinding[];
  summary: { errors: number; warnings: number };
  changed_stable_knowledge: false;
  created_at: string;
}

export function isAllowedWikiPatchPath(relativePath: string): boolean {
  const normalized = normalize(relativePath);
  if (normalized.startsWith("..") || isAbsolute(normalized)) return false;

  if (/^kb\/(.+\/)?[^/]+\.md$/.test(normalized)) return true;
  if (/^skills\/(.+\/)?SKILL\.md$/.test(normalized)) return true;

  return false;
}

const PRIVATE_PATTERNS = [
  /\btoken\b/i,
  /\bcookie\b/i,
  /\bsecret\b/i,
  /\bpassword\b/i,
  /\bcredential\b/i,
  /BEGIN PRIVATE KEY/,
  /\bAKIA[A-Z0-9]{12,}\b/,
];

export function containsPrivateMaterial(text: string): boolean {
  for (const pattern of PRIVATE_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return appearsToBeRawLog(text);
}

export function validateBodyShrink(
  oldBody: string,
  newBody: string,
  action: "create" | "patch" | "archive" | "link"
): { ok: true } | { ok: false; reason: "body_shrink_violation"; ratio: number } {
  if (action === "archive" || action === "create" || action === "link") {
    return { ok: true };
  }

  if (oldBody.length === 0) return { ok: true };

  const ratio = newBody.length / oldBody.length;
  if (ratio >= 0.7) return { ok: true };

  return { ok: false, reason: "body_shrink_violation", ratio };
}

export async function runWikiLint(
  root: string,
  input: { pages: WikiPage[]; now?: string }
): Promise<WikiLintReport> {
  const now = input.now ?? new Date().toISOString();
  const graph = buildWikiGraph(input.pages);
  const findings: WikiLintFinding[] = [];
  const pageById = new Map(input.pages.map((page) => [page.id, page]));
  const nodeIds = new Set(graph.nodes.map((node) => node.id));

  for (const artifactPath of [
    "dist/wiki/index.md",
    "dist/wiki/log.md",
    "dist/wiki/purpose.md",
    "dist/wiki/schema.md",
    "dist/wiki/overview.md",
  ]) {
    if (!await exists(root, artifactPath)) {
      findings.push({
        rule: "missing-root-artifact",
        severity: "warning",
        path: artifactPath,
        message: `Missing root wiki artifact: ${artifactPath}`,
      });
    }
  }

  if (!await exists(root, ".praxisbase/reports/wiki-source-summaries")) {
    findings.push({
      rule: "missing-source-summary",
      severity: "warning",
      path: ".praxisbase/reports/wiki-source-summaries",
      message: "Wiki source summary reports are missing",
    });
  }

  for (const broken of graph.broken_links) {
    const page = pageById.get(broken.from);
    findings.push({
      rule: "broken_wikilink",
      severity: "error",
      path: pagePath(page),
      page_id: broken.from,
      message: `Broken wikilink target: ${broken.target}`,
      details: { target: broken.target },
    });
  }

  for (const duplicate of graph.duplicates) {
    findings.push({
      rule: duplicateRule(duplicate.field),
      severity: "error",
      path: duplicate.page_ids.map((pageId) => pagePath(pageById.get(pageId))).join(","),
      message: `Duplicate wiki ${duplicate.field}: ${duplicate.value}`,
      details: { value: duplicate.value, page_ids: duplicate.page_ids },
    });
  }

  for (const pageId of graph.orphans) {
    const page = pageById.get(pageId);
    findings.push({
      rule: "orphan_active_page",
      severity: "warning",
      path: pagePath(page),
      page_id: pageId,
      message: "Active wiki page has no backlinks or outbound links",
    });
  }

  for (const link of graph.links) {
    if (!nodeIds.has(link.from) || !nodeIds.has(link.to)) {
      findings.push({
        rule: "unresolved-typed-edge",
        severity: "error",
        path: "dist/graph.json",
        message: `Typed graph edge references an unknown page: ${link.from} -> ${link.to}`,
        details: { from: link.from, to: link.to, type: link.type },
      });
    }
  }

  for (const page of input.pages) {
    const body = page.body_markdown ?? "";
    if ((page.source_ids ?? []).length === 0) {
      findings.push({
        rule: "missing_source_hash",
        severity: "warning",
        path: pagePath(page),
        page_id: page.id,
        message: "Wiki page has no source ids",
      });
    }
    if (page.lifecycle === "stale") {
      findings.push({
        rule: "stale_active_page",
        severity: "warning",
        path: pagePath(page),
        page_id: page.id,
        message: "Wiki page lifecycle is stale",
      });
    }
    if ((page as WikiPage & { superseded_by?: string | null }).superseded_by && page.lifecycle === "active") {
      findings.push({
        rule: "stale-or-superseded-conflict",
        severity: "error",
        path: pagePath(page),
        page_id: page.id,
        message: "Wiki page is active but has superseded_by metadata",
      });
    }
    if (/```(?:json|txt|log)?\s*[\s\S]*?(?:\"raw\"|transcript|session_meta|tool_call|stdout|stderr)[\s\S]*?```/i.test(body) || appearsToBeRawLog(body)) {
      findings.push({
        rule: "raw-copy-page",
        severity: "error",
        path: pagePath(page),
        page_id: page.id,
        message: "Wiki page appears to copy raw evidence instead of synthesizing it",
      });
    }
    if ((page.page_kind === "source_summary" || /source-summary/i.test(pagePath(page))) && /^##\s+(What To Do|Fix|Procedure|Steps)/im.test(body)) {
      findings.push({
        rule: "source-summary-promoted-as-guidance",
        severity: "error",
        path: pagePath(page),
        page_id: page.id,
        message: "Source summary material must not be promoted as stable guidance",
      });
    }
    if (!/^##\s+Agent Use\b/im.test(body)) {
      findings.push({
        rule: "missing-agent-use-section",
        severity: "warning",
        path: pagePath(page),
        page_id: page.id,
        message: "Wiki page is missing an Agent Use section",
      });
    }
  }

  findings.sort((a, b) => a.rule.localeCompare(b.rule) || a.path.localeCompare(b.path));
  const reportId = makeId("wiki-lint-report", now);
  const report: WikiLintReport = {
    id: reportId,
    protocol_version: PROTOCOL_VERSION,
    type: "wiki_lint_report",
    findings,
    summary: {
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
    },
    changed_stable_knowledge: false,
    created_at: now,
  };

  await writeJson(root, `${protocolPaths.reportsWikiLint}/${reportId}.json`, report);
  await writeWikiLintExceptions(root, report, now);
  return report;
}

async function exists(root: string, relativePath: string): Promise<boolean> {
  try {
    await stat(normalize(`${root}/${relativePath}`));
    return true;
  } catch {
    return false;
  }
}

function duplicateRule(field: "id" | "slug" | "title"): WikiLintRule {
  if (field === "id") return "duplicate_id";
  if (field === "slug") return "duplicate_slug";
  return "duplicate_title";
}

function pagePath(page: WikiPage | undefined): string {
  if (!page) return "wiki";
  const path = (page as WikiPage & { path?: string }).path;
  return path ?? page.slug ?? page.id;
}

async function writeWikiLintExceptions(root: string, report: WikiLintReport, now: string): Promise<void> {
  for (const finding of report.findings.filter((item) => item.severity === "error")) {
    const category = finding.rule.startsWith("duplicate_") ? "conflict" : "human_required";
    const id = makeId(`wiki-${category}`, `${finding.rule}-${finding.path}-${now}`);
    const path = category === "conflict" ? protocolPaths.exceptionsConflicts : protocolPaths.exceptionsHumanRequired;
    await writeJson(root, `${path}/${id}.json`, {
      id,
      protocol_version: PROTOCOL_VERSION,
      type: "exception_record",
      category,
      rule: finding.rule,
      reason: finding.message,
      details: finding.details ?? {},
      created_at: now,
    });
  }
}
