import { runPrivacyTriage, type AiJsonClient } from "@praxisbase/core";

export interface PrivacyCommandOptions {
  mode?: "personal" | "team-git";
  autoRelease?: boolean;
  limit?: number;
  aiTimeoutMs?: number;
  json?: boolean;
  now?: string;
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

export async function privacyCommand(root: string, subcommand: string, options: PrivacyCommandOptions): Promise<string> {
  try {
    if (subcommand === "triage") {
      const report = await runPrivacyTriage(root, {
        authorityMode: authorityMode(options.mode),
        mode: "write",
        autoRelease: options.autoRelease,
        limit: options.limit,
        aiTimeoutMs: options.aiTimeoutMs,
        now: options.now,
        env: options.env,
        aiClient: options.aiClient,
      });
      return options.json ? JSON.stringify({ ok: true, report }, null, 2) : `Privacy triage complete: ${report.id}`;
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
