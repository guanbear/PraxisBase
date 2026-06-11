import { readTeamReleaseAuditReport } from "@praxisbase/core/experience/team-release-audit.js";

export interface TeamCommandOptions {
  json?: boolean;
  now?: string;
}

export async function teamCommand(root: string, subcommand: string, options: TeamCommandOptions = {}): Promise<string> {
  if (subcommand === "release-audit") {
    const report = await readTeamReleaseAuditReport(root, { now: options.now });
    if (options.json) return JSON.stringify(report, null, 2);
    return report.ok
      ? "Team release audit passed."
      : `Team release audit failed: ${report.blocking_reasons.join(", ")}`;
  }
  throw new Error(`Unknown subcommand "team ${subcommand}". Use "team release-audit".`);
}
