import { planInstall } from "@praxisbase/core";
import type { AgentProfile } from "@praxisbase/core";

export interface InstallOptions {
  agent: AgentProfile;
  dryRun?: boolean;
  json?: boolean;
}

export async function installCommand(root: string, options: InstallOptions): Promise<string> {
  const result = await planInstall(root, options.agent, { dryRun: options.dryRun === true });

  if (options.json) {
    return JSON.stringify({ ok: true, ...result }, null, 2);
  }

  const prefix = result.dry_run ? "Install plan" : "Install complete";
  return `${prefix}: ${result.writes.map((write) => write.path).join(", ")}`;
}
