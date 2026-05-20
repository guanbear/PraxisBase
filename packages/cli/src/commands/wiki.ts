import { compileWiki } from "@praxisbase/core/wiki/compile.js";

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

  throw new Error(
    `Unknown subcommand "wiki ${subcommand}". Use "wiki compile", "wiki graph", or "wiki build-site".`
  );
}
