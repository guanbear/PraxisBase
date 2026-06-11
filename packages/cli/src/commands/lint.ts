import { lintWorkspace } from "@praxisbase/core/lint/index.js";

export interface LintCommandOptions {
  json?: boolean;
}

export async function lintCommand(root: string, options: LintCommandOptions = {}): Promise<string> {
  const result = await lintWorkspace(root);
  if (options.json) {
    return JSON.stringify(result.report, null, 2);
  }
  return `Lint complete. errors=${result.report.summary.errors} warnings=${result.report.summary.warnings}`;
}
