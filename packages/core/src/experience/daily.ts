import { join } from "node:path";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { computeHash, makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { readAiProviderConfig, type AiProviderConfig } from "../ai/config.js";
import { createOpenAiCompatibleJsonClient, type AiJsonClient } from "../ai/client.js";
import { distillExperience, DistilledExperienceSchema, type DistilledExperience } from "../ai/distill.js";
import {
  DailyExperienceReportSchema,
  ExceptionRecordSchema,
  ExperienceEnvelopeSchema,
  type DailyExperienceReport,
  type ExperienceEnvelope,
  type ExperiencePrivacyVerdict,
} from "../protocol/schemas.js";
import { readJson, writeJson } from "../store/file-store.js";
import { compileWiki } from "../wiki/compile.js";
import { curateWiki } from "../wiki/curate.js";
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
  maxAiChunks?: number;
  aiTimeoutMs?: number;
  aiConcurrency?: number;
  retryFailedDistillOnly?: boolean;
  maxCurationProposals?: number;
}

function statusFromCounts(input: { warnings: string[]; rejected: number; humanRequired: number; enveloped: number }): "completed" | "partial" | "failed" {
  if (input.enveloped === 0 && input.warnings.length > 0) return "failed";
  if (input.warnings.length > 0 || input.rejected > 0 || input.humanRequired > 0) return "partial";
  return "completed";
}

type DailyAiDistill = DailyExperienceReport["ai_distill"];
const DISTILL_CACHE_VERSION = "ai-distill-v1";

type DistillCacheEntry =
  | {
    type: "ai_distill_cache_entry";
    version: typeof DISTILL_CACHE_VERSION;
    status: "distilled";
    model: string;
    authority_mode: RunDailyExperienceInput["authorityMode"];
    source_id: string;
    source_hash: string;
    chunk_hash: string;
    experience: DistilledExperience;
    created_at: string;
  }
  | {
    type: "ai_distill_cache_entry";
    version: typeof DISTILL_CACHE_VERSION;
    status: "human_required" | "failed";
    model: string;
    authority_mode: RunDailyExperienceInput["authorityMode"];
    source_id: string;
    source_hash: string;
    chunk_hash: string;
    error: string;
    created_at: string;
  };

function withDistillModel(config: AiProviderConfig): AiProviderConfig {
  return { ...config, model: config.distill_model ?? config.model };
}

function distillCachePath(input: {
  authorityMode: RunDailyExperienceInput["authorityMode"];
  model: string;
  chunk: ExperienceChunk;
}): string {
  const hash = computeHash(JSON.stringify({
    version: DISTILL_CACHE_VERSION,
    authority_mode: input.authorityMode,
    model: input.model,
    source_id: input.chunk.source_id,
    source_hash: input.chunk.source_hash,
    chunk_hash: input.chunk.chunk_hash,
  })).replace(/^sha256:/, "");
  return `${protocolPaths.cacheAiDistill}/${hash}.json`;
}

async function readDistillCache(
  root: string,
  path: string,
): Promise<DistillCacheEntry | null> {
  let raw: unknown;
  try {
    raw = await readJson(root, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.type !== "ai_distill_cache_entry" || record.version !== DISTILL_CACHE_VERSION) return null;
  if (record.status === "distilled") {
    const experience = DistilledExperienceSchema.safeParse(record.experience);
    if (!experience.success) return null;
    return {
      type: "ai_distill_cache_entry",
      version: DISTILL_CACHE_VERSION,
      status: "distilled",
      model: String(record.model ?? ""),
      authority_mode: record.authority_mode as RunDailyExperienceInput["authorityMode"],
      source_id: String(record.source_id ?? ""),
      source_hash: String(record.source_hash ?? ""),
      chunk_hash: String(record.chunk_hash ?? ""),
      experience: experience.data,
      created_at: String(record.created_at ?? ""),
    };
  }
  if (record.status === "human_required" || record.status === "failed") {
    return {
      type: "ai_distill_cache_entry",
      version: DISTILL_CACHE_VERSION,
      status: record.status,
      model: String(record.model ?? ""),
      authority_mode: record.authority_mode as RunDailyExperienceInput["authorityMode"],
      source_id: String(record.source_id ?? ""),
      source_hash: String(record.source_hash ?? ""),
      chunk_hash: String(record.chunk_hash ?? ""),
      error: String(record.error ?? "cached AI distill failure"),
      created_at: String(record.created_at ?? ""),
    };
  }
  return null;
}

async function writeDistillCache(
  root: string,
  path: string,
  entry: DistillCacheEntry,
): Promise<void> {
  await writeJson(root, path, entry);
}

function clippedSummary(text: string): string {
  const summary = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 5).join(" ");
  const value = summary || "agent experience";
  return value.length > 1200 ? `${value.slice(0, 1200)}...[truncated]` : value;
}

function distilledSummary(experience: DistilledExperience): string {
  const lines: string[] = [
    `Suggested Wiki Kind: ${experience.suggested_wiki_kind}`,
    `Confidence: ${experience.confidence}`,
    `Summary: ${experience.summary}`,
  ];

  const sections: Array<[string, string[]]> = [
    ["Problem", experience.problem ? [experience.problem] : []],
    ["Context", experience.context ? [experience.context] : []],
    ["Actions", experience.actions],
    ["Failed Attempts", experience.failed_attempts],
    ["Verification", experience.verification],
    ["Reusable Lessons", experience.reusable_lessons],
    ["Risks", experience.risks],
  ];

  for (const [title, values] of sections) {
    if (values.length === 0) continue;
    lines.push("", `## ${title}`, ...values.map((value) => `- ${value}`));
  }

  if (experience.skill_candidate.should_create) {
    lines.push("", "## Skill Candidate");
    if (experience.skill_candidate.title) lines.push(`Title: ${experience.skill_candidate.title}`);
    if (experience.skill_candidate.trigger) lines.push(`Trigger: ${experience.skill_candidate.trigger}`);
    for (const step of experience.skill_candidate.procedure ?? []) {
      lines.push(`- ${step}`);
    }
  }

  lines.push("", "## Sources", `- ${experience.source_ref}`, `- ${experience.source_hash}`);
  return lines.join("\n");
}

function makeEnvelopeFromChunk(
  chunk: ExperienceChunk,
  now: string,
  authorityMode: RunDailyExperienceInput["authorityMode"],
  privacy: { verdict: ExperiencePrivacyVerdict; reasons: string[] },
  experience?: DistilledExperience,
): ExperienceEnvelope {
  const summary = experience ? distilledSummary(experience) : clippedSummary(chunk.text);
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
    redacted_summary: summary,
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

function runSuffix(now: string): string {
  return now.replace(/[^a-z0-9]/gi, "-");
}

function liveDailyProgressPath(now: string): string {
  return `${protocolPaths.runsLive}/${makeId("run", `daily-experience_${runSuffix(now)}`)}.json`;
}

async function writeDailyProgress(
  root: string,
  path: string,
  input: {
    now: string;
    status: "running" | "completed" | "partial" | "failed";
    current_stage?: "source" | "ai_distill" | "wiki-compile" | "wiki-curate" | "site-build";
    current_source?: string;
    current_chunk?: {
      index: number;
      total: number;
      chunk_id: string;
      ai_chunks: number;
      max_ai_chunks?: number;
    };
    sources: DailyExperienceReport["sources"];
    ai_distill: DailyAiDistill;
    warnings: string[];
  },
): Promise<void> {
  await writeJson(root, path, {
    id: path.split("/").pop()?.replace(/\.json$/, "") ?? "daily-progress",
    protocol_version: PROTOCOL_VERSION,
    type: "daily_experience_progress",
    status: input.status,
    current_stage: input.current_stage,
    current_source: input.current_source,
    current_chunk: input.current_chunk,
    sources: input.sources,
    ai_distill: input.ai_distill,
    warnings: Array.from(new Set(input.warnings)).sort(),
    updated_at: new Date().toISOString(),
  });
}

export async function runDailyExperience(root: string, input: RunDailyExperienceInput): Promise<DailyExperienceReport> {
  const mode = input.mode ?? "write";
  const now = input.now ?? new Date().toISOString();
  const sources = await listExperienceSources(root);
  const outputs: string[] = [];
  const warnings: string[] = [];
  const sourceReports: DailyExperienceReport["sources"] = [];
  const progressPath = liveDailyProgressPath(now);
  const aiMode: DailyAiDistill["mode"] = input.noAi ? "disabled" : input.degraded ? "degraded" : "production";
  const aiConfig = await readAiProviderConfig(root);
  const aiDistill: DailyAiDistill = {
    configured: Boolean(aiConfig),
    mode: aiMode,
    production_ready: aiMode === "production",
    provider: aiConfig?.provider,
    model: aiConfig ? withDistillModel(aiConfig).model : undefined,
    chunks: 0,
    distilled: 0,
    failed: 0,
    human_required: 0,
    cache_hits: 0,
    warnings: [],
  };
  const runtimeAiConfig = aiConfig && typeof input.aiTimeoutMs === "number" && Number.isFinite(input.aiTimeoutMs) && input.aiTimeoutMs > 0
    ? { ...aiConfig, ai_timeout_ms: input.aiTimeoutMs }
    : aiConfig;
  const distillAiConfig = runtimeAiConfig ? withDistillModel(runtimeAiConfig) : undefined;
  const aiClient = input.aiClient ?? (distillAiConfig
    ? createOpenAiCompatibleJsonClient({ config: distillAiConfig, env: input.env, fetchImpl: input.fetchImpl })
    : undefined);
  const maxAiChunks = typeof input.maxAiChunks === "number" && Number.isFinite(input.maxAiChunks) && input.maxAiChunks >= 0
    ? input.maxAiChunks
    : Number.POSITIVE_INFINITY;
  const aiConcurrency = typeof input.aiConcurrency === "number" && Number.isFinite(input.aiConcurrency)
    ? Math.max(1, Math.min(16, Math.floor(input.aiConcurrency)))
    : 2;
  let uncachedAiChunks = 0;
  let retryFailedDistillSkippedUncached = 0;
  let maxAiChunksWarned = false;
  const recordMaxAiChunksWarning = () => {
    if (!Number.isFinite(maxAiChunks) || maxAiChunksWarned) return;
    const warning = `max_ai_chunks_reached:${maxAiChunks}`;
    warnings.push(warning);
    aiDistill.warnings.push(warning);
    maxAiChunksWarned = true;
  };

  if (mode === "write") {
    outputs.push(progressPath);
    await writeDailyProgress(root, progressPath, {
      now,
      status: "running",
      sources: sourceReports,
      ai_distill: aiDistill,
      warnings,
    });
  }

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
    if (mode === "write") {
      await writeDailyProgress(root, progressPath, {
        now,
        status: "running",
        current_stage: "source",
        current_source: source.name,
        sources: sourceReports,
        ai_distill: aiDistill,
        warnings,
      });
    }

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
          const remainingAiBudget = Number.isFinite(maxAiChunks)
            ? Math.max(0, maxAiChunks - aiDistill.chunks)
            : undefined;
          chunks = await chunkExperienceSource(root, source, {
            limit: input.limit ?? remainingAiBudget,
            now,
          });
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
      const distillTasks: ExperienceChunk[] = [];
      for (const chunk of chunks) {
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

        const cachePath = distillCachePath({
          authorityMode: input.authorityMode,
          model: distillAiConfig?.model ?? aiConfig?.model ?? "injected-ai-client",
          chunk,
        });
        const cached = await readDistillCache(root, cachePath);
        if (cached?.status === "distilled") {
          allowed.push(makeEnvelopeFromChunk(chunk, now, input.authorityMode, {
            verdict: "allow",
            reasons: ["ai_distilled", "ai_distill_cache_hit"],
          }, cached.experience));
          aiDistill.chunks++;
          aiDistill.distilled++;
          aiDistill.cache_hits++;
          continue;
        }
        if (cached?.status === "human_required") {
          const envelope = makeEnvelopeFromChunk(chunk, now, input.authorityMode, {
            verdict: "human_required",
            reasons: [cached.error, "ai_distill_cache_hit"],
          });
          blocked.push(envelope);
          humanRequired++;
          aiDistill.chunks++;
          aiDistill.human_required++;
          aiDistill.cache_hits++;
          continue;
        }
        if (input.retryFailedDistillOnly && cached?.status !== "failed") {
          retryFailedDistillSkippedUncached++;
          continue;
        }

        if (uncachedAiChunks >= maxAiChunks) {
          recordMaxAiChunksWarning();
          break;
        }

        uncachedAiChunks++;
        aiDistill.chunks++;
        distillTasks.push(chunk);
      }

      let nextTaskIndex = 0;
      const runDistillWorker = async (): Promise<void> => {
        while (nextTaskIndex < distillTasks.length) {
          const taskIndex = nextTaskIndex;
          nextTaskIndex++;
          const chunk = distillTasks[taskIndex];
          if (mode === "write") {
            await writeDailyProgress(root, progressPath, {
              now,
              status: "running",
              current_stage: "ai_distill",
              current_source: source.name,
              current_chunk: {
                index: taskIndex + 1,
                total: distillTasks.length,
                chunk_id: chunk.chunk_id,
                ai_chunks: aiDistill.chunks,
                max_ai_chunks: Number.isFinite(maxAiChunks) ? maxAiChunks : undefined,
              },
              sources: sourceReports,
              ai_distill: aiDistill,
              warnings,
            });
          }

          const distilled = await distillExperience({
            ...chunk,
            prior_context: [],
          }, {
            client: aiClient as AiJsonClient,
            maxOutputBytes: aiConfig?.max_output_bytes,
            authorityMode: input.authorityMode,
          });
          const cachePath = distillCachePath({
            authorityMode: input.authorityMode,
            model: distillAiConfig?.model ?? aiConfig?.model ?? "injected-ai-client",
            chunk,
          });

          if (distilled.ok) {
            allowed.push(makeEnvelopeFromChunk(chunk, now, input.authorityMode, {
              verdict: "allow",
              reasons: ["ai_distilled"],
            }, distilled.experience));
            aiDistill.distilled++;
            if (mode === "write") {
              await writeDistillCache(root, cachePath, {
                type: "ai_distill_cache_entry",
                version: DISTILL_CACHE_VERSION,
                status: "distilled",
                model: distillAiConfig?.model ?? aiConfig?.model ?? "injected-ai-client",
                authority_mode: input.authorityMode,
                source_id: chunk.source_id,
                source_hash: chunk.source_hash,
                chunk_hash: chunk.chunk_hash,
                experience: distilled.experience,
                created_at: now,
              });
            }
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
              if (mode === "write") {
                await writeDistillCache(root, cachePath, {
                  type: "ai_distill_cache_entry",
                  version: DISTILL_CACHE_VERSION,
                  status: "human_required",
                  model: distillAiConfig?.model ?? aiConfig?.model ?? "injected-ai-client",
                  authority_mode: input.authorityMode,
                  source_id: chunk.source_id,
                  source_hash: chunk.source_hash,
                  chunk_hash: chunk.chunk_hash,
                  error: distilled.error,
                  created_at: now,
                });
              }
            } else {
              aiDistill.failed++;
              if (mode === "write") {
                await writeDistillCache(root, cachePath, {
                  type: "ai_distill_cache_entry",
                  version: DISTILL_CACHE_VERSION,
                  status: "failed",
                  model: distillAiConfig?.model ?? aiConfig?.model ?? "injected-ai-client",
                  authority_mode: input.authorityMode,
                  source_id: chunk.source_id,
                  source_hash: chunk.source_hash,
                  chunk_hash: chunk.chunk_hash,
                  error: distilled.error,
                  created_at: now,
                });
              }
            }
          }

          if (mode === "write") {
            await writeDailyProgress(root, progressPath, {
              now,
              status: "running",
              current_stage: "ai_distill",
              current_source: source.name,
              current_chunk: {
                index: taskIndex + 1,
                total: distillTasks.length,
                chunk_id: chunk.chunk_id,
                ai_chunks: aiDistill.chunks,
                max_ai_chunks: Number.isFinite(maxAiChunks) ? maxAiChunks : undefined,
              },
              sources: sourceReports,
              ai_distill: aiDistill,
              warnings,
            });
          }
        }
      }

      if (distillTasks.length > 0) {
        await Promise.all(Array.from(
          { length: Math.min(aiConcurrency, distillTasks.length) },
          () => runDistillWorker(),
        ));
        if (uncachedAiChunks >= maxAiChunks) recordMaxAiChunksWarning();
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
    if (mode === "write") {
      await writeDailyProgress(root, progressPath, {
        now,
        status: "running",
        current_source: source.name,
        sources: sourceReports,
        ai_distill: aiDistill,
        warnings,
      });
    }
  }

  if (input.retryFailedDistillOnly && retryFailedDistillSkippedUncached > 0) {
    const warning = `retry_failed_distill_skipped_uncached:${retryFailedDistillSkippedUncached}`;
    warnings.push(warning);
    aiDistill.warnings.push(warning);
  }

  const wikiMode = mode === "write" ? "review" as const : "dry-run" as const;
  if (mode === "write") {
    await writeDailyProgress(root, progressPath, {
      now,
      status: "running",
      current_stage: "wiki-compile",
      sources: sourceReports,
      ai_distill: aiDistill,
      warnings,
    });
  }
  const compileReport = await compileWiki(root, { mode: wikiMode, now });
  outputs.push(`${protocolPaths.reportsWikiCompile}/${compileReport.id}.json`);
  if (mode === "write") {
    await writeDailyProgress(root, progressPath, {
      now,
      status: "running",
      current_stage: "wiki-curate",
      current_source: "wiki-curate",
      sources: sourceReports,
      ai_distill: aiDistill,
      warnings,
    });
  }
  const curationReport = await curateWiki(root, {
    mode: wikiMode,
    now,
    degraded: Boolean(input.degraded || input.noAi),
    limit: input.maxCurationProposals ?? input.limit,
    aiClient: input.aiClient,
    env: input.env,
    fetchImpl: input.fetchImpl,
    aiTimeoutMs: input.aiTimeoutMs,
  });
  outputs.push(`.praxisbase/reports/wiki-curation/${curationReport.id}.json`);

  let sitePages = 0;
  let qualityFindings = 0;
  if (input.buildSite && mode === "write") {
    await writeDailyProgress(root, progressPath, {
      now,
      status: "running",
      current_stage: "site-build",
      sources: sourceReports,
      ai_distill: aiDistill,
      warnings,
    });
    const site = await buildWikiSite(root);
    sitePages = site.pages;
    qualityFindings = site.health.quality_findings;
    outputs.push(...site.outputs);
  }

  let git: ExecutedTeamGitAction | undefined;
  const reportId = makeId("daily-experience", runSuffix(now));
  const aiReportPath = `${protocolPaths.reportsAiDistill}/${makeId("ai-distill", runSuffix(now))}.json`;
  if (mode === "write") outputs.push(aiReportPath);
  const reportPath = `${protocolPaths.reportsDaily}/${reportId}.json`;
  const runPath = `${protocolPaths.runsDaily}/${makeId("run", `daily-experience_${runSuffix(now)}`)}.json`;
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
    proposal_candidates: curationReport.output_counts.curated_proposals,
    quality_findings: qualityFindings,
    site_pages: sitePages,
    changed_stable_knowledge: false,
    outputs: reportOutputs,
    warnings: Array.from(new Set(warnings)).sort(),
    created_at: now,
  });

  if (mode === "write") {
    await writeJson(root, aiReportPath, {
      id: makeId("ai-distill", runSuffix(now)),
      protocol_version: PROTOCOL_VERSION,
      type: "ai_distill_report",
      ...report.ai_distill,
      created_at: now,
    });
    await writeJson(root, reportPath, report);
    await writeJson(root, runPath, {
      id: makeId("run", `daily-experience_${runSuffix(now)}`),
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
    await writeDailyProgress(root, progressPath, {
      now,
      status: report.sources.some((source) => source.status !== "completed") ? "partial" : "completed",
      sources: report.sources,
      ai_distill: report.ai_distill,
      warnings: report.warnings,
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
