import { PROTOCOL_VERSION } from "../protocol/types.js";
import { makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { WikiQualityReportSchema, type WikiQualityFinding, type WikiQualityReport } from "../protocol/schemas.js";
import { writeJson } from "../store/file-store.js";
import { buildWikiGraph, type WikiGraph, type WikiPage } from "./resolver.js";
import { containsPrivateMaterial, isAllowedWikiPatchPath } from "./lint.js";

export type QualityWikiPage = WikiPage & {
  path?: string;
  signatures?: string[];
  body_text?: string;
};

export interface BuildWikiQualityReportInput {
  pages: QualityWikiPage[];
  graph?: WikiGraph;
  now?: string;
}

export async function buildWikiQualityReport(
  root: string,
  input: BuildWikiQualityReportInput
): Promise<WikiQualityReport> {
  const now = input.now ?? new Date().toISOString();
  const graph = input.graph ?? buildWikiGraph(input.pages);
  const pagesById = new Map(input.pages.map((page) => [page.id, page]));
  const findings: WikiQualityFinding[] = [];

  for (const broken of graph.broken_links) {
    const page = pagesById.get(broken.from);
    findings.push({
      rule: "broken_link",
      severity: "error",
      path: pagePath(page),
      page_id: broken.from,
      message: `Broken wikilink target: ${broken.target}`,
      details: { target: broken.target },
    });
  }

  for (const page of input.pages) {
    const sourceIds = page.source_ids ?? [];
    if (sourceIds.length === 0) {
      findings.push({
        rule: "missing_citation",
        severity: "warning",
        path: pagePath(page),
        page_id: page.id,
        message: "Wiki page has no citation or source reference",
      });
    }
    if (!sourceIds.some((sourceId) => sourceId.startsWith("sha256:"))) {
      findings.push({
        rule: "missing_source_hash",
        severity: "warning",
        path: pagePath(page),
        page_id: page.id,
        message: "Wiki page has no source hash citation",
      });
    }
    if (page.lifecycle === "stale") {
      findings.push({
        rule: "stale_page",
        severity: "warning",
        path: pagePath(page),
        page_id: page.id,
        message: "Wiki page lifecycle is stale",
      });
    }
    if (page.path && !isAllowedWikiPatchPath(page.path)) {
      findings.push({
        rule: "unsafe_path",
        severity: "error",
        path: page.path,
        page_id: page.id,
        message: "Wiki page path is outside stable knowledge directories",
      });
    }
    const body = [page.title, page.body_markdown, page.body_text].filter(Boolean).join("\n");
    if (containsPrivateMaterial(body)) {
      findings.push({
        rule: "private_material",
        severity: "error",
        path: pagePath(page),
        page_id: page.id,
        message: "Wiki page may contain private or raw material",
      });
    }
  }

  for (const pageId of graph.orphans) {
    const page = pagesById.get(pageId);
    findings.push({
      rule: "orphan_page",
      severity: "warning",
      path: pagePath(page),
      page_id: pageId,
      message: "Wiki page has no graph relationships",
    });
  }

  for (const duplicate of duplicateSignatures(input.pages)) {
    findings.push({
      rule: "duplicate_signature",
      severity: "error",
      path: duplicate.paths.join(","),
      message: `Duplicate wiki signature: ${duplicate.signature}`,
      signature: duplicate.signature,
      details: { page_ids: duplicate.pageIds },
    });
  }

  findings.sort((a, b) => a.rule.localeCompare(b.rule) || a.path.localeCompare(b.path) || (a.page_id ?? "").localeCompare(b.page_id ?? ""));
  const byRule: Record<string, number> = {};
  for (const finding of findings) {
    byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1;
  }

  const report = WikiQualityReportSchema.parse({
    id: makeId("wiki-quality-report", now),
    protocol_version: PROTOCOL_VERSION,
    type: "wiki_quality_report",
    findings,
    summary: {
      total: findings.length,
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
      by_rule: byRule,
    },
    changed_stable_knowledge: false,
    created_at: now,
  });

  await writeJson(root, `${protocolPaths.reportsWikiQuality}/${report.id}.json`, report);
  return report;
}

function pagePath(page: QualityWikiPage | undefined): string {
  return page?.path ?? page?.slug ?? page?.id ?? "wiki";
}

function duplicateSignatures(pages: QualityWikiPage[]): Array<{ signature: string; paths: string[]; pageIds: string[] }> {
  const groups = new Map<string, QualityWikiPage[]>();
  for (const page of pages) {
    for (const signature of page.signatures ?? []) {
      const group = groups.get(signature);
      if (group) group.push(page);
      else groups.set(signature, [page]);
    }
  }

  return [...groups.entries()]
    .filter(([, pagesForSignature]) => pagesForSignature.length > 1)
    .map(([signature, pagesForSignature]) => ({
      signature,
      paths: pagesForSignature.map(pagePath).sort(),
      pageIds: pagesForSignature.map((page) => page.id).sort(),
    }))
    .sort((a, b) => a.signature.localeCompare(b.signature));
}
