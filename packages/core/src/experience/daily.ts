import { join } from "node:path";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { computeHash, makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import {
  DailyExperienceReportSchema,
  ExceptionRecordSchema,
  type DailyExperienceReport,
  type ExperienceEnvelope,
} from "../protocol/schemas.js";
import { writeJson } from "../store/file-store.js";
import { compileWiki } from "../wiki/compile.js";
import { buildWikiSite } from "../wiki/render-site.js";
import { ingestAgentMemory } from "./agent-memory.js";
import {
  resolveExperienceSource,
  writeExperienceEnvelope,
  type ResolveExperienceSourceOptions,
} from "./source-adapters.js";
import { listExperienceSources } from "./source-config.js";
import {
  createDefaultGitRunner,
  executeTeamGitAction,
  planTeamGitAction,
  type ExecutedTeamGitAction,
  type GitCommandRunner,
} from "./git-workflow.js";

export interface RunDailyExperienceInput {
  authorityMode: "personal-local" | "team-git";
  mode?: "dry-run" | "write";
  limit?: number;
  buildSite?: boolean;
  branch?: string;
  commit?: boolean;
  push?: boolean;
  pr?: boolean;
  now?: string;
  fetchImpl?: typeof fetch;
  runCommand?: GitCommandRunner;
  env?: Record<string, string | undefined>;
}

function statusFromCounts(input: { warnings: string[]; rejected: number; humanRequired: number; enveloped: number }): "completed" | "partial" | "failed" {
  if (input.enveloped === 0 && input.warnings.length > 0) return "failed";
  if (input.warnings.length > 0 || input.rejected > 0 || input.humanRequired > 0) return "partial";
  return "completed";
}

async function writePrivacyException(
  root: string,
  envelope: ExperienceEnvelope,
  now: string,
): Promise<string> {
  const suffix = computeHash(`${envelope.id}:${envelope.privacy.verdict}:${envelope.privacy.reasons.join(",")}`).slice(7, 23);
  const id = makeId("exception", `daily-experience_${suffix}`);
  const exception = ExceptionRecordSchema.parse({
    id,
    protocol_version: PROTOCOL_VERSION,
    type: "exception_record",
    category: "human_required",
    source_id: envelope.id,
    reason: `Experience privacy verdict ${envelope.privacy.verdict}: ${envelope.privacy.reasons.join(", ")}`,
    details: {
      source_id: envelope.source_id,
      agent: envelope.agent,
      channel: envelope.channel,
      scope_hint: envelope.scope_hint,
      source_ref: envelope.source_ref,
      source_hash: envelope.source_hash,
      privacy: envelope.privacy,
    },
    created_at: now,
  });
  const path = `${protocolPaths.exceptionsHumanRequired}/${id}.json`;
  await writeJson(root, path, exception);
  return path;
}

export async function runDailyExperience(root: string, input: RunDailyExperienceInput): Promise<DailyExperienceReport> {
  const mode = input.mode ?? "write";
  const now = input.now ?? new Date().toISOString();
  const sources = await listExperienceSources(root);
  const outputs: string[] = [];
  const warnings: string[] = [];
  const sourceReports: DailyExperienceReport["sources"] = [];

  for (const source of sources) {
    const resolveOptions: ResolveExperienceSourceOptions = {
      authorityMode: input.authorityMode,
      limit: input.limit,
      now,
      fetchImpl: input.fetchImpl,
      runCommand: input.runCommand,
      env: input.env,
    };
    const resolved = await resolveExperienceSource(root, source, resolveOptions);
    const allowed = resolved.envelopes.filter((envelope) => envelope.privacy.verdict === "allow");
    const blocked = resolved.envelopes.filter((envelope) => envelope.privacy.verdict !== "allow");
    const writtenEnvelopePaths: string[] = [];
    let imported = 0;

    if (mode === "write") {
      for (const envelope of allowed) {
        const path = await writeExperienceEnvelope(root, envelope);
        writtenEnvelopePaths.push(path);
        outputs.push(path);
      }
      for (const envelope of blocked) {
        outputs.push(await writePrivacyException(root, envelope, now));
      }
      if (writtenEnvelopePaths.length > 0) {
        const ingestReport = await ingestAgentMemory(root, {
          agent: source.agent,
          sources: writtenEnvelopePaths.map((path) => join(root, path)),
          mode: "write",
          limit: input.limit,
          now,
        });
        imported = ingestReport.imported;
        outputs.push(...ingestReport.outputs);
        warnings.push(...ingestReport.warnings);
      }
    }

    sourceReports.push({
      name: source.name,
      agent: source.agent,
      channel: source.channel,
      source_type: source.source_type,
      status: statusFromCounts({
        warnings: resolved.warnings,
        rejected: resolved.rejected,
        humanRequired: resolved.humanRequired,
        enveloped: resolved.enveloped,
      }),
      scanned: resolved.scanned,
      fetched: resolved.fetched,
      enveloped: resolved.enveloped,
      imported,
      rejected: resolved.rejected,
      human_required: resolved.humanRequired,
      warnings: resolved.warnings,
    });
    warnings.push(...resolved.warnings);
  }

  const compileReport = await compileWiki(root, { mode: mode === "write" ? "review" : "dry-run", now });
  outputs.push(`${protocolPaths.reportsWikiCompile}/${compileReport.id}.json`);

  let sitePages = 0;
  let qualityFindings = 0;
  if (input.buildSite && mode === "write") {
    const site = await buildWikiSite(root);
    sitePages = site.pages;
    qualityFindings = site.health.quality_findings;
    outputs.push(...site.outputs);
  }

  let git: ExecutedTeamGitAction | undefined;
  const reportId = makeId("daily-experience", now.replace(/[^a-z0-9]/gi, "-"));
  const reportPath = `${protocolPaths.reportsDaily}/${reportId}.json`;
  const runPath = `${protocolPaths.runsDaily}/${makeId("run", `daily-experience_${now.replace(/[^a-z0-9]/gi, "-")}`)}.json`;
  const reportOutputs = mode === "write" ? Array.from(new Set([...outputs, reportPath, runPath])).sort() : outputs.sort();

  const report = DailyExperienceReportSchema.parse({
    id: reportId,
    protocol_version: PROTOCOL_VERSION,
    type: "daily_experience_report",
    authority_mode: input.authorityMode,
    mode,
    sources: sourceReports,
    proposal_candidates: compileReport.candidate_ids.length,
    quality_findings: qualityFindings,
    site_pages: sitePages,
    changed_stable_knowledge: false,
    outputs: reportOutputs,
    warnings: Array.from(new Set(warnings)).sort(),
    created_at: now,
  });

  if (mode === "write") {
    await writeJson(root, reportPath, report);
    await writeJson(root, runPath, {
      id: makeId("run", `daily-experience_${now.replace(/[^a-z0-9]/gi, "-")}`),
      protocol_version: PROTOCOL_VERSION,
      command: "daily-experience",
      status: report.sources.some((source) => source.status !== "completed") ? "partial" : "completed",
      started_at: now,
      finished_at: now,
      counts: {
        sources: report.sources.length,
        enveloped: report.sources.reduce((sum, source) => sum + source.enveloped, 0),
        imported: report.sources.reduce((sum, source) => sum + source.imported, 0),
        rejected: report.sources.reduce((sum, source) => sum + source.rejected, 0),
        human_required: report.sources.reduce((sum, source) => sum + source.human_required, 0),
      },
      errors: [],
    });

    if (input.authorityMode === "team-git" && (input.commit || input.push || input.pr)) {
      const plan = await planTeamGitAction(root, {
        team: true,
        branch: input.branch,
        commit: input.commit,
        push: input.push,
        pr: input.pr,
        message: "chore: daily praxisbase experience harvest",
      });
      git = await executeTeamGitAction(root, plan, input.runCommand ?? createDefaultGitRunner(root));
    }
  }

  if (!git) return report;
  return DailyExperienceReportSchema.parse({ ...report, git });
}
