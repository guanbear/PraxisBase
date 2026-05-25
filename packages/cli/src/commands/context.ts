import { buildContext } from "@praxisbase/core";
import type { AgentProfile, ContextStage } from "@praxisbase/core";

export interface ContextCommandOptions {
  agent: AgentProfile;
  stage: ContextStage;
  query?: string;
  maxBytes?: string;
  withAgentMemory?: boolean;
  json?: boolean;
}

export async function contextCommand(root: string, subcommand: string, options: ContextCommandOptions): Promise<string> {
  if (subcommand !== "get") {
    throw new Error(`Unknown subcommand "context ${subcommand}". Use "context get".`);
  }

  const context = await buildContext({
    root,
    agent: options.agent,
    workspace: root,
    stage: options.stage,
    query: options.query ?? "",
    maxBytes: options.maxBytes ? parseInt(options.maxBytes, 10) : undefined,
    withAgentMemory: options.withAgentMemory,
    fetchImpl: fetch,
    env: process.env as Record<string, string | undefined>,
  });

  if (options.json) {
    return JSON.stringify({ ok: true, context }, null, 2);
  }
  return JSON.stringify(context, null, 2);
}
