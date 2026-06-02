import { doctorOpenClawRemote } from "@praxisbase/core/experience/openclaw-remote.js";
import type { OpenClawRemoteProvider } from "@praxisbase/core";

export interface DoctorCommandOptions {
  provider?: OpenClawRemoteProvider;
  json?: boolean;
  writeReport?: boolean;
  env?: Record<string, string | undefined>;
}

export async function doctorCommand(root: string, subcommand: string, options: DoctorCommandOptions): Promise<string> {
  if (subcommand !== "openclaw-remote") {
    throw new Error(`Unknown subcommand "doctor ${subcommand}". Use "doctor openclaw-remote".`);
  }
  if (!options.provider) {
    throw new Error("doctor openclaw-remote requires --provider <exported-json|openclaw-api|openclaw-cli>.");
  }

  const report = await doctorOpenClawRemote(root, {
    provider: options.provider,
    runtimeMode: "source",
    writeReport: options.writeReport,
    env: options.env,
  });

  if (options.json) {
    return JSON.stringify({ ok: true, report }, null, 2);
  }
  return report.ok
    ? "OpenClaw remote provider is ready"
    : `OpenClaw remote provider is not ready: ${report.warnings.join("; ")}`;
}
