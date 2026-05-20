import { importNativeMemory, planMemoryRefresh } from "@praxisbase/core";
import type { AgentProfile } from "@praxisbase/core";

export interface MemoryCommandOptions {
  agent: AgentProfile;
  source?: string;
  target?: "context" | "instruction-snippet" | "patch-proposal";
  json?: boolean;
}

export async function memoryCommand(root: string, subcommand: string, options: MemoryCommandOptions): Promise<string> {
  if (subcommand === "import") {
    if (!options.source) {
      throw new Error("memory import requires --source <file>");
    }
    const report = await importNativeMemory(root, {
      agent: options.agent,
      source: options.source,
      json: options.json,
    });

    if (options.json) {
      return JSON.stringify({ ok: true, report }, null, 2);
    }
    return `Memory import report: ${report.id}`;
  }

  if (subcommand === "refresh") {
    const target = options.target ?? "context";
    const plan = await planMemoryRefresh({
      agent: options.agent,
      target,
      contextRefs: [],
    });

    if (options.json) {
      return JSON.stringify({ ok: true, plan }, null, 2);
    }
    return `Memory refresh plan: ${plan.outputs.map((output) => output.kind).join(", ")}`;
  }

  throw new Error(`Unknown subcommand "memory ${subcommand}". Use "memory import" or "memory refresh".`);
}
