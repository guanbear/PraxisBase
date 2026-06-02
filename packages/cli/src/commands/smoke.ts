import { runRealWikiSmoke } from "@praxisbase/core/experience/agent-memory.js";

export interface SmokeCommandOptions {
  agent?: "codex" | "openclaw";
  source?: string;
  sources?: string[];
  limit?: number;
  query?: string;
  json?: boolean;
}

function sourceList(options: SmokeCommandOptions): string[] | undefined {
  if (options.sources && options.sources.length > 0) return options.sources;
  if (options.source) return [options.source];
  return undefined;
}

export async function smokeCommand(root: string, subcommand: string, options: SmokeCommandOptions): Promise<string> {
  if (subcommand !== "real-wiki") {
    throw new Error(`Unknown subcommand "smoke ${subcommand}". Use "smoke real-wiki".`);
  }
  if (!options.agent) {
    throw new Error("smoke real-wiki requires --agent.");
  }

  const report = await runRealWikiSmoke(root, {
    agent: options.agent,
    sources: sourceList(options),
    limit: options.limit,
    query: options.query,
    mode: "write",
  });

  if (options.json) {
    return JSON.stringify({ ok: true, report }, null, 2);
  }
  return `Real wiki smoke: ${report.imported} imported, ${report.proposal_candidates} proposals, ${report.site_pages} pages`;
}
