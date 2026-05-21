import { join } from "node:path";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { computeHash, makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { readAiProviderConfig } from "../ai/config.js";
import { createOpenAiCompatibleJsonClient, type AiJsonClient } from "../ai/client.js";
import { distillExperience, type DistilledExperience } from "../ai/distill.js";
import {
  DailyExperienceReportSchema,
  ExceptionRecordSchema,
  ExperienceEnvelopeSchema,
  type DailyExperienceReport,
  type ExperienceEnvelope,
  type ExperiencePrivacyVerdict,
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
import { chunkExperienceSource, chunkTextExperience, type ExperienceChunk } from "./chunking.js";
import { evaluatePreAiPrivacy } from "./privacy-policy.js";
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
  degraded?: boolean;
  noAi?: boolean;
  aiClient?: AiJsonClient;
}

function statusFromCounts(input: { warnings: string[]; rejected: number; humanRequired: number; enveloped: number }): "completed" | "partial" | "failed" {
  if (input.enveloped === 0 && input.warnings.length > 0) return "failed";
  if (input.warnings.length > 0 || input.rejected > 0 || input.humanRequired > 0) return "partial";
  return "completed";
}

type DailyAiDistill = DailyExperienceReport["ai_distill"];

function clippedSummary(text: string): string {
  const summary = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 5).join(" ");
  const value = summary || "agent experience";
  return value.length > 1200 ? `${value.slice(0, 1200)}...[truncated]` : value;
}

function makeEnvelopeFromChunk(
  chunk: ExperienceChunk,
  now: string,
  authorityMode: RunDailyExperienceInput["authorityMode"],
  privacy: { verdict: ExperiencePrivacyVerdict; reasons: string[] },
  experience?: DistilledExperience,
): ExperienceEnvelope {
  const summary = experience
    ? [
      experience.summary,
      ...experience.reusable_lessons.map((lesson) => `Lesson: ${lesson}`),
    ].join("\n")
    : clippedSummary(chunk.text);
  const sourceHash = experience?.source_hash ?? chunk.source_hash;
  const signature = experience?.suggested_tags.find((tag) => tag.length > 0);

  return ExperienceEnvelopeSchema.parse({
    id: makeId("experience", `${chunk.source_id}_${chunk.chunk_hash.slice(7, 23)}`),
    protocol_version: PROTOCOL_VERSION,
    type: "experience_envelope",
    source_id: chunk.source_id,
    agent: chunk.agent,
    channel: chunk.channel,
    source_ref: experience?.source_ref ?? chunk.source_ref,
    source_hash: sourceHash,
    scope_hint: experience?.scope_hint ?? chunk.scope_hint,
    signature,
    problem_signature: experience?.problem ?? signature,
    outcome: experience?.outcome,
    redacted_summary: clippedSummary(summary),
    created_at: chunk.created_at,
    fetched_at: now,
    privacy: {
      mode: authorityMode,
      verdict: privacy.verdict,
      reasons: privacy.reasons,
    },
    warnings: [],
  });
}

function chunksFromEnvelopes(envelopes: ExperienceEnvelope[]): ExperienceChunk[] {
  return envelopes.flatMap((envelope) => chunkTextExperience({
    source_id: envelope.source_id,
    agent: envelope.agent,
    channel: envelope.channel,
    source_ref: envelope.source_ref,
    source_hash: envelope.source_hash,
    scope_hint: envelope.scope_hint,
    text: envelope.redacted_summary,
    created_at: envelope.created_at,
  }));
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
  const aiMode: DailyAiDistill["mode"] = input.noAi ? "disabled" : input.degraded ? "degraded" : "production";
  const aiConfig = await readAiProviderConfig(root);
  const aiDistill: DailyAiDistill = {
    configured: Boolean(aiConfig),
    mode: aiMode,
    production_ready: aiMode === "production",
    provider: aiConfig?.provider,
    model: aiConfig?.model,
    chunks: 0,
    distilled: 0,
    failed: 0,
    human_required: 0,
    warnings: [],
  };
  const aiClient = input.aiClient ?? (aiConfig
    ? createOpenAiCompatibleJsonClient({ config: aiConfig, env: input.env, fetchImpl: input.fetchImpl })
    : undefined);

  if (aiMode === "production") {
    if (!aiConfig) {
      throw new Error(`AI_DISTILL_NOT_CONFIGURED: AI provider config is missing at ${protocolPaths.aiConfig}. Run praxisbase ai init or use --degraded.`);
    }
    if (!input.aiClient && !((input.env ?? process.env)[aiConfig.api_key_env])) {
      throw new Error(`AI_DISTILL_NOT_CONFIGURED: ${aiConfig.api_key_env} is not set. Run praxisbase ai doctor or use --degraded.`);
    }
  } else {
    const warning = aiMode === "disabled"
      ? "ai_distill_disabled"
      : "ai_distill_degraded_not_production_ready";
    warnings.push(warning);
    aiDistill.warnings.push(warning);
  }

  for (const source of sources) {
    const resolveOptions: ResolveExperienceSourceOptions = {
      authorityMode: input.authorityMode,
      limit: input.limit,
      now,
      fetchImpl: input.fetchImpl,
      runCommand: input.runCommand,
      env: input.env,
    };
    let scanned = 0;
    let fetched = 0;
    let enveloped = 0;
    let rejected = 0;
    let humanRequired = 0;
    let sourceWarnings: string[] = [];
    let allowed: ExperienceEnvelope[] = [];
    let blocked: ExperienceEnvelope[] = [];
    const writtenEnvelopePaths: string[] = [];
    let imported = 0;

    if (aiMode === "production") {
      let chunks: ExperienceChunk[] = [];
      if (source.source_type === "local" || source.source_type === "file") {
        try {
          chunks = await chunkExperienceSource(root, source, { limit: input.limit, now });
        } catch (error) {
          sourceWarnings.push(`source_chunk_failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        const resolved = await resolveExperienceSource(root, source, resolveOptions);
        const preblocked = resolved.envelopes.filter((envelope) => envelope.privacy.verdict !== "allow");
        blocked.push(...preblocked);
        rejected += preblocked.filter((envelope) => envelope.privacy.verdict === "reject").length;
        humanRequired += preblocked.filter((envelope) => envelope.privacy.verdict === "human_required").length;
        chunks = chunksFromEnvelopes(resolved.envelopes.filter((envelope) => envelope.privacy.verdict === "allow"));
        sourceWarnings = sourceWarnings.concat(resolved.warnings);
      }

      scanned = chunks.length + blocked.length;
      fetched = chunks.length + blocked.length;
      for (const chunk of chunks) {
        aiDistill.chunks++;
        const prePrivacy = evaluatePreAiPrivacy({
          mode: input.authorityMode,
          scopeHint: chunk.scope_hint,
          channel: chunk.channel,
          text: chunk.text,
        });

        if (prePrivacy.verdict !== "allow_for_ai") {
          const verdict: ExperiencePrivacyVerdict = prePrivacy.verdict === "reject" ? "reject" : "human_required";
          const envelope = makeEnvelopeFromChunk(chunk, now, input.authorityMode, {
            verdict,
            reasons: prePrivacy.reasons,
          });
          blocked.push(envelope);
          if (verdict === "reject") rejected++;
          else humanRequired++;
          aiDistill.human_required++;
          continue;
        }

        const distilled = await distillExperience({
          ...chunk,
          prior_context: [],
        }, {
          client: aiClient as AiJsonClient,
          maxOutputBytes: aiConfig?.max_output_bytes,
          authorityMode: input.authorityMode,
        });

        if (distilled.ok) {
          allowed.push(makeEnvelopeFromChunk(chunk, now, input.authorityMode, {
            verdict: "allow",
            reasons: ["ai_distilled"],
          }, distilled.experience));
          aiDistill.distilled++;
        } else {
          const warning = `ai_distill_${distilled.category}: ${distilled.error}`;
          sourceWarnings.push(warning);
          aiDistill.warnings.push(warning);
          if (distilled.category === "privacy_error") {
            const envelope = makeEnvelopeFromChunk(chunk, now, input.authorityMode, {
              verdict: "human_required",
              reasons: [distilled.error],
            });
            blocked.push(envelope);
            humanRequired++;
            aiDistill.human_required++;
          } else {
            aiDistill.failed++;
          }
        }
      }
      enveloped = allowed.length + blocked.length;
    } else {
      const resolved = await resolveExperienceSource(root, source, resolveOptions);
      allowed = resolved.envelopes.filter((envelope) => envelope.privacy.verdict === "allow");
      blocked = resolved.envelopes.filter((envelope) => envelope.privacy.verdict !== "allow");
      scanned = resolved.scanned;
      fetched = resolved.fetched;
      enveloped = resolved.enveloped;
      rejected = resolved.rejected;
      humanRequired = resolved.humanRequired;
      sourceWarnings = resolved.warnings;
    }

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
        warnings: sourceWarnings,
        rejected,
        humanRequired,
        enveloped,
      }),
      scanned,
      fetched,
      enveloped,
      imported,
      rejected,
      human_required: humanRequired,
      warnings: sourceWarnings,
    });
    warnings.push(...sourceWarnings);
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
  const aiReportPath = `${protocolPaths.reportsAiDistill}/${makeId("ai-distill", now.replace(/[^a-z0-9]/gi, "-"))}.json`;
  if (mode === "write") outputs.push(aiReportPath);
  const reportPath = `${protocolPaths.reportsDaily}/${reportId}.json`;
  const runPath = `${protocolPaths.runsDaily}/${makeId("run", `daily-experience_${now.replace(/[^a-z0-9]/gi, "-")}`)}.json`;
  const reportOutputs = mode === "write" ? Array.from(new Set([...outputs, reportPath, runPath])).sort() : outputs.sort();
  const finalAiDistill: DailyAiDistill = {
    ...aiDistill,
    production_ready: aiMode === "production" && aiDistill.failed === 0 && aiDistill.human_required === 0,
    warnings: Array.from(new Set(aiDistill.warnings)).sort(),
  };

  const report = DailyExperienceReportSchema.parse({
    id: reportId,
    protocol_version: PROTOCOL_VERSION,
    type: "daily_experience_report",
    authority_mode: input.authorityMode,
    mode,
    ai_distill: finalAiDistill,
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
    await writeJson(root, aiReportPath, {
      id: makeId("ai-distill", now.replace(/[^a-z0-9]/gi, "-")),
      protocol_version: PROTOCOL_VERSION,
      type: "ai_distill_report",
      ...report.ai_distill,
      created_at: now,
    });
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
