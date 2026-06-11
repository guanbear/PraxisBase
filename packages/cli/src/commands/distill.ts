import { runDistill } from "@praxisbase/core";

export interface DistillCommandOptions {
  json?: boolean;
}

export async function distillCommand(root: string, subcommand: string, options: DistillCommandOptions): Promise<string> {
  if (subcommand !== "run") {
    throw new Error(`Unknown subcommand "distill ${subcommand}". Use "distill run".`);
  }

  const report = await runDistill(root, { json: options.json });
  if (options.json) {
    return JSON.stringify({ ok: true, report }, null, 2);
  }
  return `Distill report: ${report.id}`;
}
