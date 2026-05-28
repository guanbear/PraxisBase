import { deriveDailyNextActions, runDailyExperience, type DailyNextActions, type DailyProgressEvent } from "@praxisbase/core/experience/daily.js";
import type { GitCommandRunner } from "@praxisbase/core/experience/git-workflow.js";
import type { GBrainCommandRunner } from "@praxisbase/core/experience/gbrain-client.js";

export interface DailyCommandOptions {
  mode?: "personal" | "team-git";
  runner?: "cron" | "launchd" | "gitlab";
  limit?: number;
  buildSite?: boolean;
  branch?: string;
  commit?: boolean;
  push?: boolean;
  pr?: boolean;
  json?: boolean;
  now?: string;
  degraded?: boolean;
  noAi?: boolean;
  maxAiChunks?: number;
  aiTimeoutMs?: number;
  aiConcurrency?: number;
  retryFailedDistillOnly?: boolean;
  maxCurationProposals?: number;
  maxSkillCandidates?: number;
  noContextEconomy?: boolean;
  semanticReview?: boolean;
  skillSynthesis?: boolean;
  publishGbrain?: boolean;
  allowTeamGbrainExport?: boolean;
  gbrainExecutable?: string;
  gbrainRunCommand?: GBrainCommandRunner;
  runCommand?: GitCommandRunner;
  progress?: boolean;
  progressSink?: (line: string) => void;
}

function authorityMode(mode?: "personal" | "team-git"): "personal-local" | "team-git" {
  return mode === "team-git" ? "team-git" : "personal-local";
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^([A-Z0-9_]+):/);
  return match?.[1] ?? "DAILY_COMMAND_FAILED";
}

function initNext(mode?: "personal" | "team-git"): string {
  if (mode === "team-git") {
    return "Run `praxisbase ai init --provider openai-compatible --model <model>` and configure team sources with `praxisbase source add ... --scope team`, then add a GitLab scheduled pipeline with PRAXISBASE_TASK=daily-harvest.";
  }
  return "Run `praxisbase ai init --provider openai-compatible --model <model>`, configure local sources with `praxisbase source add ...`, then run `praxisbase daily run --mode personal --build-site --json`.";
}

function personalSchedule(runner?: "cron" | "launchd" | "gitlab"): string {
  if (runner === "launchd") {
    return "launchd: run `praxisbase daily run --mode personal --build-site --json` from the PraxisBase workspace once per day after `praxisbase ai doctor` passes.";
  }
  return "cron: 0 8 * * * cd /path/to/praxisbase && praxisbase daily run --mode personal --build-site --json";
}

function formatProgressLine(event: DailyProgressEvent): string {
  const parts = [
    `status=${event.status}`,
    `stage=${event.current_stage ?? "starting"}`,
    event.current_source ? `source=${event.current_source}` : undefined,
    event.current_chunk ? `chunk=${event.current_chunk.index}/${event.current_chunk.total}` : undefined,
    event.current_chunk?.max_uncached_ai_chunks !== undefined
      ? `uncached=${event.current_chunk.uncached_ai_chunks ?? 0}/${event.current_chunk.max_uncached_ai_chunks}`
      : undefined,
    event.current_chunk?.skipped_by_budget
      ? `skipped_by_budget=${event.current_chunk.skipped_by_budget}`
      : undefined,
    `elapsed=${Math.round(event.elapsed_ms / 1000)}s`,
    `stage_elapsed=${Math.round(event.stage_elapsed_ms / 1000)}s`,
    `distilled=${event.ai_distill.distilled}/${event.ai_distill.chunks}`,
    `human_required=${event.ai_distill.human_required}`,
  ];
  return `[praxisbase daily] ${parts.filter((part): part is string => Boolean(part)).join(" ")}`;
}

function formatNextActions(nextActions: DailyNextActions): string {
  const lines = [
    `Next action: ${nextActions.status}`,
    ...nextActions.messages,
    ...nextActions.commands.map((command) => `Run: ${command}`),
  ];
  return lines.join("\n");
}

export async function dailyCommand(root: string, subcommand: string, options: DailyCommandOptions): Promise<string> {
  try {
    if (subcommand === "init") {
      const mode = options.mode ?? "personal";
      const result = {
        ok: true,
        mode,
        installed: false,
        next: initNext(mode),
      };
      return options.json ? JSON.stringify(result, null, 2) : result.next;
    }

    if (subcommand === "run") {
      const report = await runDailyExperience(root, {
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
        maxSkillCandidates: options.maxSkillCandidates,
        noContextEconomy: options.noContextEconomy,
        semanticReview: options.semanticReview,
        skillSynthesis: options.skillSynthesis,
        publishGbrain: options.publishGbrain,
        allowTeamGbrainExport: options.allowTeamGbrainExport,
        gbrainExecutable: options.gbrainExecutable,
        gbrainRunCommand: options.gbrainRunCommand,
        runCommand: options.runCommand,
        onProgress: options.progress
          ? async (event) => {
            (options.progressSink ?? console.error)(formatProgressLine(event));
          }
          : undefined,
      });
      const nextActions = deriveDailyNextActions(report);
      return options.json
        ? JSON.stringify({ ok: true, report, next_actions: nextActions }, null, 2)
        : `Daily experience run complete: ${report.id}\n${formatNextActions(nextActions)}`;
    }

    if (subcommand === "doctor") {
      return options.json
        ? JSON.stringify({ ok: true, checks: [{ id: "source-config", ok: true, message: "Run `praxisbase source list` to inspect configured sources." }] }, null, 2)
        : "Daily doctor: run `praxisbase source list` to inspect configured sources.";
    }

    if (subcommand === "schedule") {
      const gitlab = "GitLab schedule: set PRAXISBASE_TASK=daily-harvest and run `praxisbase daily run --mode team-git --branch harvest/daily-$CI_PIPELINE_ID --commit --build-site`.";
      const personal = personalSchedule(options.runner);
      return options.json ? JSON.stringify({ ok: true, installed: false, personal, gitlab }, null, 2) : (options.mode === "team-git" ? gitlab : personal);
    }

    throw new Error(`DAILY_COMMAND_INVALID: Unknown subcommand "daily ${subcommand}".`);
  } catch (error) {
    if (!options.json) throw error;
    return JSON.stringify({
      ok: false,
      code: errorCode(error),
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
    }, null, 2);
  }
}
