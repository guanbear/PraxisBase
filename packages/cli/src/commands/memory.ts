import { importNativeMemory, ingestAgentMemory, planMemoryRefresh, scanAgentMemory } from "@praxisbase/core";
import type { AgentProfile } from "@praxisbase/core";

export interface MemoryCommandOptions {
  agent: AgentProfile;
  source?: string;
  sources?: string[];
  limit?: number;
  dryRun?: boolean;
  write?: boolean;
  scope?: "personal" | "project" | "team";
  target?: "context" | "instruction-snippet" | "patch-proposal";
  sourceRefs?: string[];
  json?: boolean;
}

type AgentMemoryProfile = "codex" | "openclaw";

function assertAgentMemoryProfile(agent: AgentProfile): asserts agent is AgentMemoryProfile {
  if (agent !== "codex" && agent !== "openclaw") {
    throw new Error(`memory scan/ingest requires --agent codex or --agent openclaw, got "${agent}".`);
  }
}

function sourceList(options: MemoryCommandOptions): string[] | undefined {
  if (options.sources && options.sources.length > 0) return options.sources;
  if (options.source) return [options.source];
  return undefined;
}

export async function memoryCommand(root: string, subcommand: string, options: MemoryCommandOptions): Promise<string> {
  if (subcommand === "scan") {
    assertAgentMemoryProfile(options.agent);
    const result = await scanAgentMemory(root, {
      agent: options.agent,
      sources: sourceList(options),
      limit: options.limit,
    });

    if (options.json) {
      return JSON.stringify({ ok: true, ...result }, null, 2);
    }
    return `Memory scan: ${result.candidates.length} candidates`;
  }

  if (subcommand === "ingest") {
    assertAgentMemoryProfile(options.agent);
    const report = await ingestAgentMemory(root, {
      agent: options.agent,
      sources: sourceList(options),
      limit: options.limit,
      scope: options.scope,
      mode: options.write ? "write" : "dry-run",
    });

    if (options.json) {
      return JSON.stringify({ ok: true, report }, null, 2);
    }
    return `Memory ingest: ${report.imported} imported`;
  }

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
      contextRefs: options.sourceRefs ?? [],
    });

    if (options.json) {
      return JSON.stringify({ ok: true, plan }, null, 2);
    }
    return `Memory refresh plan: ${plan.outputs.map((output) => output.kind).join(", ")}`;
  }

  throw new Error(`Unknown subcommand "memory ${subcommand}". Use "memory scan", "memory ingest", "memory import", or "memory refresh".`);
}
