import { runHarvest } from "@praxisbase/core/experience/harvest.js";
import type { RemoteCommandRunner } from "@praxisbase/core/experience/remote-adapters.js";

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
  currentBranchForTests?: string;
  autoReview?: boolean;
  autoPromote?: boolean;
  dryRun?: boolean;
  runRemoteCommandForTests?: RemoteCommandRunner;
  json?: boolean;
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^([A-Z0-9_]+):/);
  return match?.[1] ?? "HARVEST_ERROR";
}

export async function harvestCommand(root: string, options: HarvestCommandOptions): Promise<string> {
  try {
    const report = await runHarvest(root, {
      all: options.all,
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
      currentBranchForTests: options.currentBranchForTests,
      dryRun: options.dryRun,
      autoReview: options.autoReview,
      autoPromote: options.autoPromote,
      runRemoteCommandForTests: options.runRemoteCommandForTests,
    });
    return options.json ? JSON.stringify({ ok: true, report }, null, 2) : `Harvest complete: ${report.id}`;
  } catch (error) {
    if (!options.json) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ ok: false, code: errorCode(error), message, retryable: false }, null, 2);
  }
}
