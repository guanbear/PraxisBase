import { runPrivacyTriage, writeManualPrivacyReview, type AiJsonClient } from "@praxisbase/core";

export interface PrivacyCommandOptions {
  mode?: "personal" | "team-git";
  autoRelease?: boolean;
  teamAutoReview?: boolean;
  limit?: number;
  aiConcurrency?: number;
  aiTimeoutMs?: number;
  includeTriaged?: boolean;
  progress?: boolean;
  progressSink?: (line: string) => void;
  json?: boolean;
  now?: string;
  id?: string;
  decision?: "auto_released" | "keep_human_required" | "team_review_only" | "rejected_low_signal";
  releaseSummary?: string;
  note?: string;
  env?: Record<string, string | undefined>;
  aiClient?: AiJsonClient;
}

function authorityMode(mode?: "personal" | "team-git"): "personal-local" | "team-git" {
  return mode === "team-git" ? "team-git" : "personal-local";
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^([A-Z0-9_]+):/);
  return match?.[1] ?? "PRIVACY_COMMAND_FAILED";
}

function formatProgressLine(event: {
  status: "running" | "completed";
  total: number;
  completed: number;
  skipped_already_triaged: number;
  skipped_non_privacy: number;
  current_exception_id?: string;
  summary: {
    auto_released: number;
    keep_human_required: number;
    team_review_only: number;
  };
}): string {
  const parts = [
    `[praxisbase privacy] status=${event.status}`,
    `completed=${event.completed}/${event.total}`,
    `skipped_already_triaged=${event.skipped_already_triaged}`,
    `skipped_non_privacy=${event.skipped_non_privacy}`,
    `auto_released=${event.summary.auto_released}`,
    `keep_human_required=${event.summary.keep_human_required}`,
    `team_review_only=${event.summary.team_review_only}`,
  ];
  if (event.current_exception_id) parts.splice(2, 0, `exception=${event.current_exception_id}`);
  return parts.join(" ");
}

export async function privacyCommand(root: string, subcommand: string, options: PrivacyCommandOptions): Promise<string> {
  try {
    if (subcommand === "triage") {
      const report = await runPrivacyTriage(root, {
        authorityMode: authorityMode(options.mode),
        mode: "write",
        autoRelease: options.autoRelease,
        teamAutoReview: options.teamAutoReview,
        limit: options.limit,
        aiConcurrency: options.aiConcurrency,
        aiTimeoutMs: options.aiTimeoutMs,
        includeTriaged: options.includeTriaged,
        onProgress: options.progress
          ? (event) => {
              (options.progressSink ?? console.error)(formatProgressLine(event));
            }
          : undefined,
        now: options.now,
        env: options.env,
        aiClient: options.aiClient,
      });
      return options.json ? JSON.stringify({ ok: true, report }, null, 2) : `Privacy triage complete: ${report.id}`;
    }

    if (subcommand === "review") {
      if (!options.id || !options.decision) {
        throw new Error(`PRIVACY_COMMAND_INVALID: privacy review requires --id and --decision.`);
      }
      const result = await writeManualPrivacyReview(root, {
        exceptionId: options.id,
        decision: options.decision,
        releaseSummary: options.releaseSummary,
        note: options.note,
        reviewerId: "praxisbase-cli",
        now: options.now,
      });
      return options.json ? JSON.stringify({ ok: true, result }, null, 2) : `Privacy review recorded: ${result.decision} ${result.exception_path}`;
    }

    throw new Error(`PRIVACY_COMMAND_INVALID: Unknown subcommand "privacy ${subcommand}".`);
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
