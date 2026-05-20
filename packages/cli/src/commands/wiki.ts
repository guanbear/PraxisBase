import { compileWiki } from "@praxisbase/core/wiki/compile.js";
import { runWikiLint } from "@praxisbase/core/wiki/lint.js";
import { buildWikiGraph } from "@praxisbase/core/wiki/resolver.js";
import { buildWikiSite, collectWikiPages } from "@praxisbase/core/wiki/render-site.js";
import { writeJson } from "@praxisbase/core/store/file-store.js";

export interface WikiCommandOptions {
  dryRun?: boolean;
  review?: boolean;
  json?: boolean;
}

export async function wikiCommand(
  root: string,
  subcommand: string,
  options: WikiCommandOptions
): Promise<string> {
  if (subcommand === "compile") {
    const mode = options.dryRun ? "dry-run" as const : "review" as const;
    const report = await compileWiki(root, { mode });
    if (options.json) {
      return JSON.stringify({ ok: true, report }, null, 2);
    }
    return `Wiki compile report: ${report.id}`;
  }

  if (subcommand === "graph") {
    const pages = await collectWikiPages(root);
    const graph = buildWikiGraph(pages);
    const lint = await runWikiLint(root, { pages });
    const health = {
      sources: new Set(pages.flatMap((page) => page.source_ids ?? [])).size,
      pages: pages.length,
      broken_links: graph.broken_links.length,
      duplicates: graph.duplicates.length,
      orphans: graph.orphans.length,
      findings: lint.findings.length,
    };
    await writeJson(root, "dist/graph.json", graph);
    if (options.json) {
      return JSON.stringify({ ok: true, graph, health }, null, 2);
    }
    return `Wiki graph: ${graph.nodes.length} nodes`;
  }

  if (subcommand === "build-site") {
    const result = await buildWikiSite(root);
    if (options.json) {
      return JSON.stringify({ ok: true, result }, null, 2);
    }
    return `Wiki site: ${result.pages} pages`;
  }

  throw new Error(
    `Unknown subcommand "wiki ${subcommand}". Use "wiki compile", "wiki graph", or "wiki build-site".`
  );
}
