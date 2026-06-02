import { readFile } from "node:fs/promises";
import { buildOpenClawRepairContext } from "@praxisbase/core/repair/context.js";

export async function repairContextCommand(
  scenario: string,
  options: { logs: string; json?: boolean }
): Promise<string> {
  if (scenario !== "openclaw") {
    throw new Error(`Unsupported repair scenario: ${scenario}`);
  }

  const logs = await readFile(options.logs, "utf8");
  const context = await buildOpenClawRepairContext({ logs, root: process.cwd() });
  return options.json ? JSON.stringify(context, null, 2) : context.problem_signature;
}
