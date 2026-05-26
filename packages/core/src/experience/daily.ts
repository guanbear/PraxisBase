import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { computeHash, makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { redactSensitiveValues } from "../protocol/redact.js";
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
  type ContextReducerRule,
  type ContextReductionResult,
} from "../protocol/schemas.js";
import { readJson, writeJson } from "../store/file-store.js";
import { compileWiki } from "../wiki/compile.js";
import { curateWiki } from "../wiki/curate.js";
import { CuratedWikiProposalSchema, curatedWikiProposalToKnowledgeProposal } from "../wiki/curation-model.js";
import { buildWikiSite } from "../wiki/render-site.js";
import { recordWikiSourceSummaryContributions } from "../wiki/source-summary.js";
import { readReviewPolicy, decideAutoReview } from "../review/policy.js";
import { reviewProposal } from "../review/reviewer.js";
import { promoteApprovedProposal } from "../promote/promote.js";
import { SEMANTIC_PROMOTE_THRESHOLD } from "../wiki/semantic-review-policy.js";
import { ingestAgentMemory } from "./agent-memory.js";
import {
  resolveExperienceSource,
  writeExperienceEnvelope,
  type ResolveExperienceSourceOptions,
} from "./source-adapters.js";
import { listExperienceSources } from "./source-config.js";
import {
  chunkExperienceSource,
  chunkTextExperience,
  type ExperienceChunk,
} from "./chunking.js";
import {
  buildContextEconomyReport,
  loadProjectRules,
  buildEffectiveReducerRules,
  computeRuleSetHash,
  REDUCER_VERSION,
  contextReducerIdentitySalt,
  reduceContext,
} from "./context-reducer.js";
import { evaluatePreAiPrivacy } from "./privacy-policy.js";
import {
  createDefaultGitRunner,
  executeTeamGitAction,
  planTeamGitAction,
  type ExecutedTeamGitAction,
  type GitCommandRunner,
} from "./git-workflow.js";
import { synthesizeSkillCandidates } from "../synthesis/skill.js";
import type { SkillSynthesisReport } from "../synthesis/skill-model.js";

type DailyProgressStage = "source" | "ai_distill" | "wiki-compile" | "wiki-curate" | "skill-synthesis" | "review-promote" | "site-build";

export interface DailyProgressEvent {
  status: "running" | "completed" | "partial" | "failed";
  current_stage?: DailyProgressStage;
  current_source?: string;
  current_chunk?: {
    index: number;
    total: number;
    chunk_id: string;
    ai_chunks: number;
    max_ai_chunks?: number;
  };
  elapsed_ms: number;
  stage_elapsed_ms: number;
  sources: DailyExperienceReport["sources"];
  ai_distill: DailyAiDistill;
  warnings: string[];
}

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
  noContextEconomy?: boolean;
	  semanticReview?: boolean;
	  skillSynthesis?: boolean;
	  onProgress?: (event: DailyProgressEvent) => void | Promise<void>;
}

function statusFromCounts(input: { warnings: string[]; rejected: number; humanRequired: number; enveloped: number }): "completed" | "partial" | "failed" {
  if (input.enveloped === 0 && input.warnings.length > 0) return "failed";
  if (input.warnings.length > 0 || input.rejected > 0 || input.humanRequired > 0) return "partial";
  return "completed";
}

type DailyAiDistill = DailyExperienceReport["ai_distill"];
const DISTILL_CACHE_VERSION = "ai-distill-v1";

export type DailyNextActionStatus =
  | "needs_privacy_triage"
  | "needs_review"
  | "ready_to_export_agentmemory"
  | "no_stable_changes"
  | "ready";

export interface DailyNextActions {
  status: DailyNextActionStatus;
  counts: {
    sources: number;
    chunks: number;
    distilled: number;
    privacy_required: number;
    review_required: number;
    rejected: number;
    rejected_low_signal: number;
    rejected_quality: number;
    proposal_candidates: number;
    site_pages: number;
    changed_stable_knowledge: boolean;
  };
  agentmemory_export_recommended: boolean;
  messages: string[];
  commands: string[];
}

export function deriveDailyNextActions(report: DailyExperienceReport): DailyNextActions {
  const sourceHumanRequired = report.sources.reduce((sum, source) => sum + source.human_required, 0);
  const privacyRequired = Math.max(report.ai_distill.privacy_required, sourceHumanRequired);
  const reviewRequired = report.ai_distill.review_required + report.proposal_candidates;
  const rejected = report.sources.reduce((sum, source) => sum + source.rejected, 0);
  const counts = {
    sources: report.sources.length,
    chunks: report.ai_distill.chunks,
    distilled: report.ai_distill.distilled,
    privacy_required: privacyRequired,
    review_required: reviewRequired,
    rejected,
    rejected_low_signal: report.ai_distill.rejected_low_signal,
    rejected_quality: report.ai_distill.rejected_quality,
    proposal_candidates: report.proposal_candidates,
    site_pages: report.site_pages,
    changed_stable_knowledge: report.changed_stable_knowledge,
  };

  if (privacyRequired > 0) {
    return {
      status: "needs_privacy_triage",
      counts,
      agentmemory_export_recommended: false,
      messages: [`${privacyRequired} item(s) need privacy triage before they can become wiki evidence.`],
      commands: ["praxisbase privacy triage --mode personal --auto-release --json"],
    };
  }

  if (reviewRequired > 0) {
    return {
      status: "needs_review",
      counts,
      agentmemory_export_recommended: false,
      messages: [`${reviewRequired} wiki candidate(s) need review or another personal run with site auto-governance.`],
      commands: [
        "praxisbase personal run --open --json",
        "praxisbase review list --json",
      ],
    };
  }

  if (report.changed_stable_knowledge) {
    return {
      status: "ready_to_export_agentmemory",
      counts,
      agentmemory_export_recommended: report.authority_mode === "personal-local",
      messages: ["Stable wiki changed and is ready to share with local agents through AgentMemory."],
      commands: ["praxisbase agentmemory export --mode personal --write --json"],
    };
  }

  return {
    status: report.ai_distill.distilled > 0 || report.proposal_candidates > 0 ? "ready" : "no_stable_changes",
    counts,
    agentmemory_export_recommended: false,
    messages: ["No stable wiki changes were produced in this run."],
    commands: ["praxisbase personal run --open --json"],
  };
}

interface DailyReviewPromoteResult {
  reviewed: number;
  approved_by_policy: number;
  auto_promoted: number;
  needs_human: number;
  outputs: string[];
  warnings: string[];
}

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

function chunksFromEnvelopes(
  envelopes: ExperienceEnvelope[],
  contextReducer?: {
    projectRules?: ContextReducerRule[];
    recordResult?: (result: ContextReductionResult) => void;
  },
): ExperienceChunk[] {
  return envelopes.flatMap((envelope) => {
    const reduced = reduceEnvelopeSummary(envelope, contextReducer);
    return chunkTextExperience({
      source_id: envelope.source_id,
      agent: envelope.agent,
      channel: envelope.channel,
      source_ref: envelope.source_ref,
      source_hash: envelope.source_hash,
      scope_hint: envelope.scope_hint,
      text: reduced.text,
      created_at: envelope.created_at,
      reducerIdentitySalt: reduced.reducerIdentitySalt,
    });
  });
}

function reduceEnvelopeSummary(
  envelope: ExperienceEnvelope,
  contextReducer?: {
    projectRules?: ContextReducerRule[];
    recordResult?: (result: ContextReductionResult) => void;
  },
): { text: string; reducerIdentitySalt?: string } {
  if (!contextReducer) return { text: envelope.redacted_summary };
  const result = reduceContext({
    combined_text: envelope.redacted_summary,
    source_metadata: {
      agent: envelope.agent,
      source_id: envelope.source_id,
      channel: envelope.channel,
      scope_hint: envelope.scope_hint,
      adapter: "experience-envelope",
    },
    source_ref: envelope.source_ref,
    source_hash: envelope.source_hash,
  }, {
    projectRules: contextReducer.projectRules,
  });
  contextReducer.recordResult?.(result);
  return {
    text: result.text,
    reducerIdentitySalt: contextReducerIdentitySalt(result),
  };
}

function privacyExceptionPathForEnvelope(envelope: ExperienceEnvelope): string {
  const suffix = computeHash(`${envelope.id}:${envelope.privacy.verdict}:${envelope.privacy.reasons.join(",")}`).slice(7, 23);
  const id = makeId("exception", `daily-experience_${suffix}`);
  return `${protocolPaths.exceptionsHumanRequired}/${id}.json`;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function autoReleasedEvidenceSummary(text: string): string {
  return redactSensitiveValues(text, 1200)
    .replace(/\b(?:token|cookie|secret|password|credential)s?\b/gi, "sensitive value");
}

async function autoReleasedPrivacyEnvelope(root: string, envelope: ExperienceEnvelope): Promise<ExperienceEnvelope | undefined> {
  if (envelope.privacy.verdict !== "human_required") return undefined;
  let existing: unknown;
  try {
    existing = await readJson(root, privacyExceptionPathForEnvelope(envelope));
  } catch {
    return undefined;
  }
  const parsed = ExceptionRecordSchema.safeParse(existing);
  if (!parsed.success) return undefined;
  const triage = recordValue(recordValue(parsed.data.details).triage);
  if (stringValue(triage.decision) !== "auto_released") return undefined;
  if (stringValue(triage.classification) !== "safe_personal_experience") return undefined;
  const confidence = typeof triage.confidence === "number" ? triage.confidence : Number.parseFloat(String(triage.confidence ?? ""));
  if (!Number.isFinite(confidence) || confidence < 0.75) return undefined;

  return ExperienceEnvelopeSchema.parse({
    ...envelope,
    redacted_summary: autoReleasedEvidenceSummary(envelope.redacted_summary),
    privacy: {
      ...envelope.privacy,
      verdict: "allow",
      reasons: ["privacy_triage_auto_released", ...envelope.privacy.reasons],
    },
    warnings: Array.from(new Set([...(envelope.warnings ?? []), "privacy_triage_auto_released"])).sort(),
  });
}

async function writePrivacyException(
  root: string,
  envelope: ExperienceEnvelope,
  now: string,
): Promise<string> {
  const path = privacyExceptionPathForEnvelope(envelope);
  const id = path.split("/").pop()?.replace(/\.json$/, "") ?? makeId("exception", "daily-experience");
  let existingTriage: Record<string, unknown> | undefined;
  try {
    const existing = ExceptionRecordSchema.safeParse(await readJson(root, path));
    const triage = existing.success ? recordValue(recordValue(existing.data.details).triage) : {};
    existingTriage = Object.keys(triage).length > 0 ? triage : undefined;
  } catch {
    existingTriage = undefined;
  }
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
      redacted_summary: redactSensitiveValues(envelope.redacted_summary, 1200),
      privacy: envelope.privacy,
      ...(existingTriage ? { triage: existingTriage } : {}),
    },
    created_at: now,
  });
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
    current_stage?: DailyProgressStage;
    current_source?: string;
    current_chunk?: {
      index: number;
      total: number;
      chunk_id: string;
      ai_chunks: number;
      max_ai_chunks?: number;
    };
    elapsed_ms?: number;
    stage_elapsed_ms?: number;
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
    elapsed_ms: input.elapsed_ms ?? 0,
    stage_elapsed_ms: input.stage_elapsed_ms ?? 0,
    sources: input.sources,
    ai_distill: input.ai_distill,
    warnings: Array.from(new Set(input.warnings)).sort(),
    updated_at: new Date().toISOString(),
  });
}

async function runDailyReviewPromote(root: string, input: { enabled: boolean; now: string }): Promise<DailyReviewPromoteResult> {
  const result: DailyReviewPromoteResult = {
    reviewed: 0,
    approved_by_policy: 0,
    auto_promoted: 0,
    needs_human: 0,
    outputs: [],
    warnings: [],
  };
  if (!input.enabled) return result;

  const policy = await readReviewPolicy(root);
  const proposalDir = join(root, protocolPaths.inboxProposals);
  const files = await readdir(proposalDir).catch(() => [] as string[]);

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    try {
      const raw = JSON.parse(await readFile(join(proposalDir, file), "utf8"));
      if (raw.type !== "wiki_curated_proposal") continue;

      const curated = CuratedWikiProposalSchema.parse(raw);
      const decision = decideAutoReview(curated, policy);
      const proposal = curatedWikiProposalToKnowledgeProposal(curated);
      const review = reviewProposal(proposal);
      const reviewPath = `.praxisbase/inbox/reviews/${review.id}.json`;
      await writeJson(root, reviewPath, review);
      result.outputs.push(reviewPath);
      result.reviewed++;

      if (decision.human_required) {
        result.needs_human++;
        const exception = ExceptionRecordSchema.parse({
          id: `exc_${randomUUID().slice(0, 8)}`,
          protocol_version: PROTOCOL_VERSION,
          type: "exception_record",
          category: "human_required",
          source_id: review.id,
          reason: decision.reason,
          details: {
            proposal_id: curated.id,
            auto_promote: decision.auto_promote,
            human_reasons: decision.required_human_reasons,
          },
          created_at: input.now,
        });
        const exceptionPath = `${protocolPaths.exceptionsHumanRequired}/${exception.id}.json`;
        await writeJson(root, exceptionPath, exception);
        result.outputs.push(exceptionPath);
        continue;
      }

      result.approved_by_policy++;
      if (decision.auto_promote) {
        const riskNotes: string[] = curated.review_hint?.risk_notes ?? [];
        const semanticDecision = riskNotes.find((note) => note.startsWith("semantic_review:"))?.split(":")[1];
        const semanticScoreNote = riskNotes.find((note) => note.startsWith("semantic_score:"));
        const semanticScore = semanticScoreNote ? Number.parseFloat(semanticScoreNote.split(":")[1]) : NaN;
        const semanticPassing = semanticDecision === "promote" && Number.isFinite(semanticScore) && semanticScore >= SEMANTIC_PROMOTE_THRESHOLD;

        if (!semanticPassing) {
          result.needs_human++;
          const exception = ExceptionRecordSchema.parse({
            id: `exc_${randomUUID().slice(0, 8)}`,
            protocol_version: PROTOCOL_VERSION,
            type: "exception_record",
            category: "human_required",
            source_id: review.id,
            reason: "semantic_review_required_for_auto_promotion",
            details: {
              proposal_id: curated.id,
              auto_promote: true,
              human_reasons: ["semantic_review_required_for_auto_promotion"],
              risk_notes: riskNotes,
            },
            created_at: input.now,
          });
          const exceptionPath = `${protocolPaths.exceptionsHumanRequired}/${exception.id}.json`;
          await writeJson(root, exceptionPath, exception);
          result.outputs.push(exceptionPath);
          continue;
        }

        await promoteApprovedProposal(root, { proposal, review });
        await recordWikiSourceSummaryContributions(root, curated);
        await unlink(join(proposalDir, file)).catch(() => undefined);
        result.auto_promoted++;
        result.outputs.push(proposal.patch.path);
      }
    } catch (error) {
      result.warnings.push(`daily_auto_review_failed:${file}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const runRecordPath = `${protocolPaths.runsReview}/run_review_policy_${randomUUID().slice(0, 8)}.json`;
  await writeJson(root, runRecordPath, {
    id: runRecordPath.split("/").pop()?.replace(/\.json$/, "") ?? `run_review_policy_${randomUUID().slice(0, 8)}`,
    protocol_version: PROTOCOL_VERSION,
    command: "review",
    status: result.warnings.length > 0 && result.reviewed === 0 ? "failed" : result.warnings.length > 0 ? "partial" : "completed",
    started_at: input.now,
    finished_at: input.now,
    counts: {
      reviewed: result.reviewed,
      approved_by_policy: result.approved_by_policy,
      auto_promoted: result.auto_promoted,
      needs_human: result.needs_human,
    },
    errors: result.warnings,
  });
  result.outputs.push(runRecordPath);

  return result;
}

export async function runDailyExperience(root: string, input: RunDailyExperienceInput): Promise<DailyExperienceReport> {
  const mode = input.mode ?? "write";
  const now = input.now ?? new Date().toISOString();
  const sources = await listExperienceSources(root);
  const outputs: string[] = [];
  const warnings: string[] = [];
  const sourceReports: DailyExperienceReport["sources"] = [];
  const progressPath = liveDailyProgressPath(now);
  const runStartedAtMs = Date.now();
  const stageStartedAtMs = new Map<DailyProgressStage, number>();
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
    privacy_required: 0,
    review_required: 0,
    rejected_low_signal: 0,
    rejected_quality: 0,
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

  const contextEconomyEnabled = !input.noContextEconomy;
  const projectRulesResult = contextEconomyEnabled ? await loadProjectRules(root) : { rules: [], warnings: [] };
  const reductionResults: ContextReductionResult[] = [];
  const effectiveReducerRules = contextEconomyEnabled
    ? buildEffectiveReducerRules({ projectRules: projectRulesResult.rules })
    : { rules: [], warnings: [] };
  const contextEconomyWarnings = Array.from(new Set([
    ...projectRulesResult.warnings,
    ...effectiveReducerRules.warnings,
  ])).sort();
  if (contextEconomyWarnings.length > 0) warnings.push(...contextEconomyWarnings);
  const reducerRuleSetHash = contextEconomyEnabled
    ? computeRuleSetHash(effectiveReducerRules.rules)
    : "disabled";
  const contextReducerForSource = contextEconomyEnabled
    ? {
      projectRules: projectRulesResult.rules,
      recordResult: (result: ContextReductionResult) => {
        reductionResults.push(result);
      },
    }
    : undefined;
  const distilledExperiences: DistilledExperience[] = [];

  const publishProgress = async (progress: Omit<DailyProgressEvent, "elapsed_ms" | "stage_elapsed_ms">): Promise<void> => {
    const observedAtMs = Date.now();
    let stageElapsedMs = 0;
    if (progress.current_stage) {
      if (!stageStartedAtMs.has(progress.current_stage)) {
        stageStartedAtMs.set(progress.current_stage, observedAtMs);
      }
      stageElapsedMs = observedAtMs - (stageStartedAtMs.get(progress.current_stage) ?? observedAtMs);
    }
    const event: DailyProgressEvent = {
      ...progress,
      elapsed_ms: observedAtMs - runStartedAtMs,
      stage_elapsed_ms: stageElapsedMs,
    };
    await input.onProgress?.(event);
    if (mode === "write") {
      await writeDailyProgress(root, progressPath, {
        now,
        ...event,
      });
    }
  };

  if (mode === "write") {
    outputs.push(progressPath);
    await publishProgress({
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

  const sourceRunner = input.runCommand ?? createDefaultGitRunner(root);
  for (const source of sources) {
    if (mode === "write") {
      await publishProgress({
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
      runCommand: sourceRunner,
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
            contextReducer: contextReducerForSource,
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
        chunks = chunksFromEnvelopes(
          resolved.envelopes.filter((envelope) => envelope.privacy.verdict === "allow"),
          contextReducerForSource,
        );
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
          aiDistill.privacy_required++;
          continue;
        }

        const cachePath = distillCachePath({
          authorityMode: input.authorityMode,
          model: distillAiConfig?.model ?? aiConfig?.model ?? "injected-ai-client",
          chunk,
        });
        const cached = await readDistillCache(root, cachePath);
        if (cached?.status === "distilled") {
          distilledExperiences.push(cached.experience);
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
          aiDistill.privacy_required++;
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
            await publishProgress({
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
            distilledExperiences.push(distilled.experience);
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
              aiDistill.privacy_required++;
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
              aiDistill.rejected_quality++;
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
            await publishProgress({
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

    if (mode === "write" && blocked.length > 0) {
      const stillBlocked: ExperienceEnvelope[] = [];
      for (const envelope of blocked) {
        const released = await autoReleasedPrivacyEnvelope(root, envelope);
        if (released) {
          allowed.push(released);
          if (envelope.privacy.verdict === "human_required") {
            humanRequired = Math.max(0, humanRequired - 1);
            aiDistill.human_required = Math.max(0, aiDistill.human_required - 1);
            aiDistill.privacy_required = Math.max(0, aiDistill.privacy_required - 1);
          }
          continue;
        }
        stillBlocked.push(envelope);
      }
      blocked = stillBlocked;
      enveloped = allowed.length + blocked.length;
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
      if (
        writtenEnvelopePaths.length > 0 &&
        (source.agent === "codex" || source.agent === "openclaw" || source.agent === "claude-code")
      ) {
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
      await publishProgress({
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

  let contextEconomyRef: string | undefined;
  const contextEconomyReport = contextEconomyEnabled && (reductionResults.length > 0 || contextEconomyWarnings.length > 0)
    ? buildContextEconomyReport(reductionResults, now, contextEconomyWarnings)
    : undefined;
  if (contextEconomyReport && mode === "write") {
    contextEconomyRef = `${protocolPaths.reportsContextEconomy}/${contextEconomyReport.id}.json`;
    await writeJson(root, contextEconomyRef, contextEconomyReport);
    outputs.push(contextEconomyRef);
  }

  const wikiMode = mode === "write" ? "review" as const : "dry-run" as const;
  if (mode === "write") {
    await publishProgress({
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
    await publishProgress({
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
    concurrency: aiConcurrency,
    aiClient: input.aiClient,
    semanticReview: input.semanticReview ? { enabled: true, client: input.aiClient } : undefined,
    env: input.env,
    fetchImpl: input.fetchImpl,
    aiTimeoutMs: input.aiTimeoutMs,
    onProgress: mode === "write"
      ? async (progress) => {
        await publishProgress({
          status: "running",
          current_stage: "wiki-curate",
          current_source: "wiki-curate",
          current_chunk: {
            index: progress.completed,
            total: progress.total,
            chunk_id: progress.topic_key,
            ai_chunks: progress.proposals + progress.conflicts,
          },
          sources: sourceReports,
          ai_distill: aiDistill,
          warnings,
        });
      }
      : undefined,
  });
	  outputs.push(`.praxisbase/reports/wiki-curation/${curationReport.id}.json`);

	  let skillSynthesisReport: SkillSynthesisReport | undefined;
	  if (input.skillSynthesis) {
	    if (mode === "write") {
	      await publishProgress({
	        status: "running",
	        current_stage: "skill-synthesis",
	        current_source: "skill-synthesis",
	        sources: sourceReports,
	        ai_distill: aiDistill,
	        warnings,
	      });
	    }
	    const skillSynthesis = await synthesizeSkillCandidates(root, {
	      mode: wikiMode,
	      authorityMode: input.authorityMode,
	      experiences: distilledExperiences,
	      aiClient,
	      now,
	    });
	    skillSynthesisReport = skillSynthesis.report;
	    outputs.push(...skillSynthesisReport.outputs);
	  }

  let reviewPromote: DailyReviewPromoteResult = {
    reviewed: 0,
    approved_by_policy: 0,
    auto_promoted: 0,
    needs_human: 0,
    outputs: [],
    warnings: [],
  };
  if (mode === "write" && input.buildSite) {
    await publishProgress({
      status: "running",
      current_stage: "review-promote",
      current_source: "review-promote",
      sources: sourceReports,
      ai_distill: aiDistill,
      warnings,
    });
    reviewPromote = await runDailyReviewPromote(root, {
      enabled: input.authorityMode === "personal-local",
      now,
    });
    outputs.push(...reviewPromote.outputs);
    warnings.push(...reviewPromote.warnings);
  }

  let git: ExecutedTeamGitAction | undefined;
  const reportId = makeId("daily-experience", runSuffix(now));
  const aiReportPath = `${protocolPaths.reportsAiDistill}/${makeId("ai-distill", runSuffix(now))}.json`;
  const reportPath = `${protocolPaths.reportsDaily}/${reportId}.json`;
  const runPath = `${protocolPaths.runsDaily}/${makeId("run", `daily-experience_${runSuffix(now)}`)}.json`;
  const finalAiDistill: DailyAiDistill = {
    ...aiDistill,
    production_ready: aiMode === "production" && aiDistill.failed === 0 && aiDistill.human_required === 0,
    warnings: Array.from(new Set(aiDistill.warnings)).sort(),
  };

  const contextEconomySummary = contextEconomyEnabled ? {
    enabled: true,
    reducer_version: REDUCER_VERSION,
    rule_set_hash: reducerRuleSetHash,
    items_seen: contextEconomyReport?.items_seen ?? reductionResults.length,
    items_reduced: contextEconomyReport?.items_reduced ?? reductionResults.filter((r) => r.applied).length,
    items_passed_through: contextEconomyReport?.items_passed_through ?? reductionResults.filter((r) => !r.applied).length,
    input_bytes: contextEconomyReport?.input_bytes ?? 0,
    output_bytes: contextEconomyReport?.output_bytes ?? 0,
    saved_bytes: contextEconomyReport?.saved_bytes ?? 0,
    report_ref: contextEconomyRef,
    warnings: contextEconomyReport?.warnings ?? contextEconomyWarnings,
  } : { enabled: false, reducer_version: REDUCER_VERSION, rule_set_hash: "disabled", items_seen: 0, items_reduced: 0, items_passed_through: 0, input_bytes: 0, output_bytes: 0, saved_bytes: 0, warnings: [] as string[] };

  const makeReport = (sitePages: number, qualityFindings: number, outputPaths: string[]): DailyExperienceReport => {
    const reportOutputs = mode === "write"
      ? Array.from(new Set([...outputPaths, aiReportPath, reportPath, runPath])).sort()
      : [...outputPaths].sort();
    return DailyExperienceReportSchema.parse({
      id: reportId,
      protocol_version: PROTOCOL_VERSION,
      type: "daily_experience_report",
      authority_mode: input.authorityMode,
      mode,
      ai_distill: finalAiDistill,
      context_economy: contextEconomySummary,
      sources: sourceReports,
      proposal_candidates: curationReport.output_counts.curated_proposals,
      quality_findings: qualityFindings,
      site_pages: sitePages,
      changed_stable_knowledge: reviewPromote.auto_promoted > 0,
	      semantic_review: curationReport.semantic_review ?? {
        enabled: false,
        reviewed: 0,
        promote: 0,
        merge: 0,
        revise: 0,
        reject: 0,
        needs_human: 0,
	        unavailable: 0,
	      },
	      skill_synthesis: skillSynthesisReport ? {
	        enabled: true,
	        signals: skillSynthesisReport.signals,
	        rejected_signals: skillSynthesisReport.rejected_signals,
	        clusters: skillSynthesisReport.clusters,
	        candidates: skillSynthesisReport.candidates,
	        reviewed: skillSynthesisReport.reviewed,
	        approved: skillSynthesisReport.approved,
	        rejected: skillSynthesisReport.rejected,
	        needs_human: skillSynthesisReport.needs_human,
	        promoted: skillSynthesisReport.promoted,
	      } : {
	        enabled: false,
	        signals: 0,
	        rejected_signals: 0,
	        clusters: 0,
	        candidates: 0,
	        reviewed: 0,
	        approved: 0,
	        rejected: 0,
	        needs_human: 0,
	        promoted: 0,
	      },
	      outputs: reportOutputs,
      warnings: Array.from(new Set(warnings)).sort(),
      created_at: now,
    });
  };

  let sitePages = 0;
  let qualityFindings = 0;
  if (input.buildSite && mode === "write") {
    await writeJson(root, reportPath, makeReport(0, 0, outputs));
    await publishProgress({
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

  const report = makeReport(sitePages, qualityFindings, outputs);

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
    await publishProgress({
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
