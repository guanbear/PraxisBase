import { runHarvest } from "@praxisbase/core/experience/harvest.js";

export interface HarvestCommandOptions {
  all?: boolean;
  codex?: string[];
  openclaw?: string[];
  openclawExports?: string[];
  remote?: string[];
  limit?: number;
  buildSite?: boolean;
  contextQuery?: string;
  team?: boolean;
  branch?: string;
  commit?: boolean;
  push?: boolean;
  pr?: boolean;
  autoReview?: boolean;
  autoPromote?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export async function harvestCommand(root: string, options: HarvestCommandOptions): Promise<string> {
  const report = await runHarvest(root, {
    codexSources: options.codex,
    openclawSources: options.openclaw,
    openclawExports: options.openclawExports,
    remoteNames: options.remote,
    limit: options.limit,
    buildSite: options.buildSite,
    contextQuery: options.contextQuery,
    team: options.team,
    branch: options.branch,
    commit: options.commit,
    push: options.push,
    pr: options.pr,
    dryRun: options.dryRun,
    autoReview: options.autoReview,
    autoPromote: options.autoPromote,
  });
  return options.json ? JSON.stringify({ ok: true, report }, null, 2) : `Harvest complete: ${report.id}`;
}
