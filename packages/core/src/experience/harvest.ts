import { readdir } from "node:fs/promises";
import { makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import {
  HarvestReportSchema,
  ProposalSchema,
  type HarvestReport,
  type Proposal,
  type Review,
} from "../protocol/schemas.js";
import { readJson, safePath, writeJson } from "../store/file-store.js";
import { buildContext } from "./context.js";
import { ingestAgentMemory } from "./agent-memory.js";
import { fetchOpenClawRemoteMemory } from "./openclaw-remote.js";
import { listRemoteSources, readRemoteSource } from "./remote-sources.js";
import { resolveRemoteSource, type RemoteCommandRunner } from "./remote-adapters.js";
import {
  createDefaultGitRunner,
  executeTeamGitAction,
  planTeamGitAction,
  type GitCommandRunner,
} from "./git-workflow.js";
import { reviewProposal } from "../review/reviewer.js";
import { shouldAutoMergeReview } from "../review/risk.js";
import { promoteApprovedProposal } from "../promote/promote.js";
import { compileWiki } from "../wiki/compile.js";
import { curateWiki } from "../wiki/curate.js";
import { wikiCandidateToKnowledgeProposal } from "../wiki/proposal-candidates.js";
import { buildWikiGraph } from "../wiki/resolver.js";
import { buildWikiSite, collectWikiPages } from "../wiki/render-site.js";

export interface RunHarvestInput {
  all?: boolean;
  codexSources?: string[];
  openclawSources?: string[];
  openclawExports?: string[];
  remoteNames?: string[];
  limit?: number;
  buildSite?: boolean;
  contextQuery?: string;
  team?: boolean;
  dryRun?: boolean;
  branch?: string;
  commit?: boolean;
  push?: boolean;
  pr?: boolean;
  currentBranchForTests?: string;
  autoReview?: boolean;
  autoPromote?: boolean;
  json?: boolean;
  now?: string;
  fetchImpl?: typeof fetch;
  openclawEnvForTests?: Record<string, string | undefined>;
  runRemoteCommandForTests?: RemoteCommandRunner;
  runGitCommandForTests?: GitCommandRunner;
}

interface ReviewPromoteResult {
  outputs: string[];
  warnings: string[];
  changedStableKnowledge: boolean;
}

function reportStatus(warnings: string[], unsafe: number): "completed" | "partial" | "failed" {
  return warnings.length > 0 || unsafe > 0 ? "partial" : "completed";
}

function harvestReportId(now: string): string {
  return makeId("harvest", now.replace(/[^a-z0-9]/gi, "-"));
}

async function readProposalFiles(root: string): Promise<Proposal[]> {
  let files: string[];
  try {
    files = await readdir(safePath(root, protocolPaths.inboxProposals));
  } catch {
    return [];
  }

  const proposals: Proposal[] = [];
  for (const file of files.sort()) {
    if (!file.endsWith(".json")) continue;
    const raw = await readJson<unknown>(root, `${protocolPaths.inboxProposals}/${file}`);
    const proposal = ProposalSchema.safeParse(raw);
    if (proposal.success) {
      proposals.push(proposal.data);
      continue;
    }
    const wikiProposal = wikiCandidateToKnowledgeProposal(raw);
    if (wikiProposal) {
      proposals.push(wikiProposal);
      continue;
    }
    proposals.push(ProposalSchema.parse(raw));
  }
  return proposals;
}

async function runReviewAndPromote(root: string, input: RunHarvestInput): Promise<ReviewPromoteResult> {
  const outputs: string[] = [];
  const warnings: string[] = [];
  let changedStableKnowledge = false;

  if (!input.autoReview) {
    return { outputs, warnings, changedStableKnowledge };
  }

  const proposals = await readProposalFiles(root);
  const reviews = new Map<string, Review>();
  for (const proposal of proposals) {
    const review = reviewProposal(proposal);
    const reviewPath = `${protocolPaths.inboxReviews}/${review.id}.json`;
    await writeJson(root, reviewPath, review);
    outputs.push(reviewPath);
    reviews.set(review.proposal_id, review);
  }

  if (!input.autoPromote) {
    return { outputs, warnings, changedStableKnowledge };
  }

  for (const proposal of proposals) {
    const review = reviews.get(proposal.id);
    if (!review || !shouldAutoMergeReview(review)) {
      continue;
    }
    try {
      await promoteApprovedProposal(root, { proposal, review });
      outputs.push(proposal.patch.path);
      changedStableKnowledge = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`promote_failed:${proposal.id}:${message}`);
    }
  }

  return { outputs, warnings, changedStableKnowledge };
}

async function discoverAllInputs(root: string, input: RunHarvestInput): Promise<{
  codexSources: string[];
  openclawSources: string[];
  remoteNames: string[];
}> {
  const codexSources = [...(input.codexSources ?? [])];
  const openclawSources = [...(input.openclawSources ?? [])];
  const remoteNames = [...(input.remoteNames ?? [])];

  if (!input.all) {
    return { codexSources, openclawSources, remoteNames };
  }

  for (const remote of await listRemoteSources(root)) {
    if (!remoteNames.includes(remote.name)) {
      remoteNames.push(remote.name);
    }
  }

  let adapterFiles: string[] = [];
  try {
    adapterFiles = await readdir(safePath(root, protocolPaths.adapters));
  } catch {
  }
  for (const file of adapterFiles.sort()) {
    if (!file.endsWith(".json")) continue;
    const adapter = await readJson<{
      agent?: string;
      profile?: { transcript_paths?: string[]; raw_artifact_paths?: string[] };
    }>(root, `${protocolPaths.adapters}/${file}`);
    const paths = [...(adapter.profile?.transcript_paths ?? []), ...(adapter.profile?.raw_artifact_paths ?? [])]
      .filter((path) => !path.includes("://"));
    if (adapter.agent === "codex") {
      for (const path of paths) if (!codexSources.includes(path)) codexSources.push(path);
    }
    if (adapter.agent === "openclaw") {
      for (const path of paths) if (!openclawSources.includes(path)) openclawSources.push(path);
    }
  }

  return { codexSources, openclawSources, remoteNames };
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
  const discovered = await discoverAllInputs(root, input);
  const gitRunner = input.runGitCommandForTests ?? createDefaultGitRunner(root);
  const currentBranch = input.currentBranchForTests ?? (
    input.team && input.commit
      ? (await gitRunner("git", ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "unknown")).trim()
      : undefined
  );
  const gitPlan = await planTeamGitAction(root, {
    team: input.team,
    branch: input.branch,
    commit: input.commit,
    push: input.push,
    pr: input.pr,
    currentBranch,
    message: input.branch ? `chore: harvest ${input.branch.replace(/^harvest\//, "")}` : undefined,
  });

  await ingestLocalSources(root, "codex", discovered.codexSources, runInput, sources, outputs);
  await ingestLocalSources(root, "openclaw", discovered.openclawSources, runInput, sources, outputs);

  for (const source of input.openclawExports ?? []) {
    await ingestOpenClawExport(root, source, "file", [source], runInput, sources, outputs);
  }

  const remoteRunner = input.runRemoteCommandForTests ?? createDefaultGitRunner(root);
  for (const remoteName of discovered.remoteNames) {
    const config = await readRemoteSource(root, remoteName);
    const resolved = await resolveRemoteSource(root, config, {
      fetchImpl: input.fetchImpl,
      runCommand: remoteRunner,
    });
    if (resolved.kind === "openclaw-api") {
      const fetchReport = await fetchOpenClawRemoteMemory(root, {
        provider: "openclaw-api",
        remote: resolved.remote,
        limit: input.limit,
        env: input.openclawEnvForTests,
        fetchImpl: input.fetchImpl,
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

  const compileReport = await compileWiki(root, { mode: input.dryRun ? "dry-run" : "review", now });
  const curationReport = await curateWiki(root, {
    mode: input.dryRun ? "dry-run" : "review",
    now,
    degraded: true,
  });
  const pages = await collectWikiPages(root);
  const graph = buildWikiGraph(pages);
  const site = input.buildSite ? await buildWikiSite(root) : {
    pages: 0,
    outputs: [] as string[],
    health: { quality_findings: 0 },
  };
  const context = input.contextQuery ? await buildContext({
    root,
    workspace: root,
    agent: "codex",
    stage: "repair",
    query: input.contextQuery,
  }) : { items: [] };
  const reviewPromote = await runReviewAndPromote(root, input);

  outputs.push(
    `${protocolPaths.reportsWikiCompile}/${compileReport.id}.json`,
    `.praxisbase/reports/wiki-curation/${curationReport.id}.json`,
    ...site.outputs,
    ...reviewPromote.outputs,
  );

  let report = HarvestReportSchema.parse({
    id: harvestReportId(now),
    protocol_version: PROTOCOL_VERSION,
    type: "harvest_report",
    authority_mode: gitPlan.authorityMode,
    mode: input.dryRun ? "dry-run" : "write",
    sources,
    proposal_candidates: curationReport.output_counts.curated_proposals,
    graph_nodes: graph.nodes.length,
    graph_broken_links: graph.broken_links.length,
    quality_findings: site.health.quality_findings,
    site_pages: site.pages,
    context_items: context.items.length,
    outputs,
    git: gitPlan.authorityMode === "team-git" ? {
      branch: gitPlan.branch,
      committed: false,
      pushed: false,
    } : undefined,
    warnings: [...sources.flatMap((source) => source.warnings), ...gitPlan.warnings, ...reviewPromote.warnings],
    changed_stable_knowledge: reviewPromote.changedStableKnowledge,
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

  if (gitPlan.shouldCommit || gitPlan.shouldPush) {
    const git = await executeTeamGitAction(root, gitPlan, gitRunner);
    report = HarvestReportSchema.parse({ ...report, git });
    await writeJson(root, `${protocolPaths.reportsHarvest}/${report.id}.json`, report);
  }

  return report;
}
