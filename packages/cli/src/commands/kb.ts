import { auditKb, pruneKb, type KbMaintenanceReport } from "@praxisbase/core/kb/maintenance.js";
import { runDailyExperience } from "@praxisbase/core/experience/daily.js";

export interface KbCommandOptions {
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
  mode?: "personal" | "team-git";
  limit?: number;
  buildSite?: boolean;
  branch?: string;
  commit?: boolean;
  push?: boolean;
  pr?: boolean;
  now?: string;
  degraded?: boolean;
  noAi?: boolean;
  maxAiChunks?: number;
  aiTimeoutMs?: number;
  aiConcurrency?: number;
  retryFailedDistillOnly?: boolean;
  maxCurationProposals?: number;
}

export interface KbRebuildReport {
  type: "kb_rebuild_report";
  prune: KbMaintenanceReport;
  daily: Awaited<ReturnType<typeof runDailyExperience>>;
}

function authorityMode(mode?: "personal" | "team-git"): "personal-local" | "team-git" {
  return mode === "team-git" ? "team-git" : "personal-local";
}

function formatReport(
  subcommand: string,
  report: KbMaintenanceReport | KbRebuildReport,
  json?: boolean,
): string {
  if (json) return JSON.stringify({ ok: true, report }, null, 2);
  if (report.type === "kb_rebuild_report") {
    return `KB rebuild complete: pruned ${report.prune.deleted.length}, daily ${report.daily.id}`;
  }
  return `KB ${subcommand}: checked ${report.checked}, failed ${report.failed}, deleted ${report.deleted.length}`;
}

export async function kbCommand(root: string, subcommand: string, options: KbCommandOptions): Promise<string> {
  if (subcommand === "audit") {
    return formatReport(subcommand, await auditKb(root), options.json);
  }

  if (subcommand === "prune") {
    return formatReport(subcommand, await pruneKb(root, { yes: options.yes === true && options.dryRun !== true }), options.json);
  }

  if (subcommand === "rebuild") {
    const prune = await pruneKb(root, { yes: options.yes === true && options.dryRun !== true });
    const daily = await runDailyExperience(root, {
      authorityMode: authorityMode(options.mode),
      mode: "write",
      limit: options.limit,
      buildSite: options.buildSite,
      branch: options.branch,
      commit: options.commit,
      push: options.push,
      pr: options.pr,
      now: options.now,
      degraded: options.degraded,
      noAi: options.noAi,
      maxAiChunks: options.maxAiChunks,
      aiTimeoutMs: options.aiTimeoutMs,
      aiConcurrency: options.aiConcurrency,
      retryFailedDistillOnly: options.retryFailedDistillOnly,
      maxCurationProposals: options.maxCurationProposals,
    });
    return formatReport(subcommand, { type: "kb_rebuild_report", prune, daily }, options.json);
  }

  throw new Error(`Unknown subcommand "kb ${subcommand}". Use "kb audit", "kb prune", or "kb rebuild".`);
}
