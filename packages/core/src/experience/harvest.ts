import { makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { HarvestReportSchema, type HarvestReport } from "../protocol/schemas.js";
import { safePath, writeJson } from "../store/file-store.js";
import { buildContext } from "./context.js";
import { ingestAgentMemory } from "./agent-memory.js";
import { fetchOpenClawRemoteMemory } from "./openclaw-remote.js";
import { readRemoteSource } from "./remote-sources.js";
import { resolveRemoteSource, type RemoteCommandRunner } from "./remote-adapters.js";
import { compileWiki } from "../wiki/compile.js";
import { buildWikiGraph } from "../wiki/resolver.js";
import { buildWikiSite, collectWikiPages } from "../wiki/render-site.js";

export interface RunHarvestInput {
  codexSources?: string[];
  openclawSources?: string[];
  openclawExports?: string[];
  remoteNames?: string[];
  limit?: number;
  buildSite?: boolean;
  contextQuery?: string;
  team?: boolean;
  dryRun?: boolean;
  autoReview?: boolean;
  autoPromote?: boolean;
  json?: boolean;
  now?: string;
  fetchImpl?: typeof fetch;
  runRemoteCommandForTests?: RemoteCommandRunner;
}

function reportStatus(warnings: string[], unsafe: number): "completed" | "partial" | "failed" {
  return warnings.length > 0 || unsafe > 0 ? "partial" : "completed";
}

function harvestReportId(now: string): string {
  return makeId("harvest", now.replace(/[^a-z0-9]/gi, "-"));
}

async function ingestLocalSources(
  root: string,
  agent: "codex" | "openclaw",
  sourcesToIngest: string[],
  input: RunHarvestInput,
  sources: HarvestReport["sources"],
  outputs: string[]
): Promise<void> {
  for (const source of sourcesToIngest) {
    const ingestReport = await ingestAgentMemory(root, {
      agent,
      sources: [source],
      limit: input.limit,
      mode: input.dryRun ? "dry-run" : "write",
      now: input.now,
    });
    outputs.push(...ingestReport.outputs);
    sources.push({
      name: source,
      agent,
      source_type: "local",
      status: reportStatus(ingestReport.warnings, ingestReport.unsafe),
      scanned: ingestReport.scanned,
      fetched: 0,
      imported: ingestReport.imported,
      duplicates: ingestReport.duplicates,
      skipped: ingestReport.skipped,
      unsafe: ingestReport.unsafe,
      warnings: ingestReport.warnings,
    });
  }
}

async function ingestOpenClawExport(
  root: string,
  name: string,
  sourceType: HarvestReport["sources"][number]["source_type"],
  exportSources: string[],
  input: RunHarvestInput,
  sources: HarvestReport["sources"],
  outputs: string[]
): Promise<void> {
  const fetchReport = await fetchOpenClawRemoteMemory(root, {
    provider: "exported-json",
    sources: exportSources.map((source) => source.startsWith(".") ? safePath(root, source) : source),
    limit: input.limit,
    now: input.now,
  });
  const ingestReport = await ingestAgentMemory(root, {
    agent: "openclaw",
    sources: [safePath(root, protocolPaths.stagingOpenClaw)],
    limit: input.limit,
    mode: input.dryRun ? "dry-run" : "write",
    now: input.now,
  });
  outputs.push(...fetchReport.outputs, ...ingestReport.outputs);
  sources.push({
    name,
    agent: "openclaw",
    source_type: sourceType,
    status: reportStatus([...fetchReport.warnings, ...ingestReport.warnings], fetchReport.unsafe + ingestReport.unsafe),
    scanned: ingestReport.scanned,
    fetched: fetchReport.fetched,
    imported: ingestReport.imported,
    duplicates: fetchReport.duplicates + ingestReport.duplicates,
    skipped: fetchReport.skipped + ingestReport.skipped,
    unsafe: fetchReport.unsafe + ingestReport.unsafe,
    warnings: [...fetchReport.warnings, ...ingestReport.warnings],
  });
}

export async function runHarvest(root: string, input: RunHarvestInput): Promise<HarvestReport> {
  if (input.autoPromote && !input.autoReview) {
    throw new Error("HARVEST_AUTO_REVIEW_REQUIRED: --auto-promote requires --auto-review.");
  }

  const now = input.now ?? new Date().toISOString();
  const runInput = { ...input, now };
  const sources: HarvestReport["sources"] = [];
  const outputs: string[] = [];

  await ingestLocalSources(root, "codex", input.codexSources ?? [], runInput, sources, outputs);
  await ingestLocalSources(root, "openclaw", input.openclawSources ?? [], runInput, sources, outputs);

  for (const source of input.openclawExports ?? []) {
    await ingestOpenClawExport(root, source, "file", [source], runInput, sources, outputs);
  }

  for (const remoteName of input.remoteNames ?? []) {
    const config = await readRemoteSource(root, remoteName);
    const resolved = await resolveRemoteSource(root, config, {
      fetchImpl: input.fetchImpl,
      runCommand: input.runRemoteCommandForTests,
    });
    if (resolved.kind === "openclaw-api") {
      const fetchReport = await fetchOpenClawRemoteMemory(root, {
        provider: "openclaw-api",
        remote: resolved.remote,
        limit: input.limit,
        now,
      });
      const ingestReport = await ingestAgentMemory(root, {
        agent: "openclaw",
        sources: [safePath(root, protocolPaths.stagingOpenClaw)],
        limit: input.limit,
        mode: input.dryRun ? "dry-run" : "write",
        now,
      });
      outputs.push(...fetchReport.outputs, ...ingestReport.outputs);
      sources.push({
        name: config.name,
        agent: "openclaw",
        source_type: config.source_type,
        status: reportStatus([...fetchReport.warnings, ...ingestReport.warnings], fetchReport.unsafe + ingestReport.unsafe),
        scanned: ingestReport.scanned,
        fetched: fetchReport.fetched,
        imported: ingestReport.imported,
        duplicates: fetchReport.duplicates + ingestReport.duplicates,
        skipped: fetchReport.skipped + ingestReport.skipped,
        unsafe: fetchReport.unsafe + ingestReport.unsafe,
        warnings: [...fetchReport.warnings, ...ingestReport.warnings],
      });
    } else {
      await ingestOpenClawExport(root, config.name, config.source_type, resolved.sources, runInput, sources, outputs);
    }
  }

  const compileReport = await compileWiki(root, { mode: "review", now });
  const pages = await collectWikiPages(root);
  const graph = buildWikiGraph(pages);
  const site = input.buildSite ? await buildWikiSite(root) : { pages: 0, outputs: [] as string[] };
  const context = input.contextQuery ? await buildContext({
    root,
    workspace: root,
    agent: "codex",
    stage: "repair",
    query: input.contextQuery,
  }) : { items: [] };

  outputs.push(`${protocolPaths.reportsWikiCompile}/${compileReport.id}.json`, ...site.outputs);

  const report = HarvestReportSchema.parse({
    id: harvestReportId(now),
    protocol_version: PROTOCOL_VERSION,
    type: "harvest_report",
    authority_mode: input.team ? "team-git" : "personal-local",
    mode: input.dryRun ? "dry-run" : "write",
    sources,
    proposal_candidates: compileReport.candidate_ids.length,
    graph_nodes: graph.nodes.length,
    graph_broken_links: graph.broken_links.length,
    site_pages: site.pages,
    context_items: context.items.length,
    outputs,
    warnings: sources.flatMap((source) => source.warnings),
    changed_stable_knowledge: false,
    created_at: now,
  });

  await writeJson(root, `${protocolPaths.reportsHarvest}/${report.id}.json`, report);
  await writeJson(root, `${protocolPaths.runsHarvest}/${report.id}.json`, {
    id: report.id,
    protocol_version: PROTOCOL_VERSION,
    command: "harvest",
    status: report.warnings.length > 0 ? "partial" : "completed",
    started_at: now,
    finished_at: now,
    counts: {
      sources: sources.length,
      imported: sources.reduce((sum, source) => sum + source.imported, 0),
      unsafe: sources.reduce((sum, source) => sum + source.unsafe, 0),
    },
    errors: [],
  });

  return report;
}
