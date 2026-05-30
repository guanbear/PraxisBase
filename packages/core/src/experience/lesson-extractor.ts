import type { AiJsonClient } from "../ai/client.js";
import { computeHash } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { readJson, writeJson } from "../store/file-store.js";
import {
  ExperienceLessonSchema,
  type EvidenceSpan,
  type ExperienceLesson,
} from "./lesson-model.js";

export interface ExtractLessonsWithAiOptions {
  client: AiJsonClient;
  now: string;
  scope?: "personal" | "project" | "team" | "global" | "org";
  agent?: string;
  cache?: {
    root: string;
    identity: string;
    plannerIdentity?: string;
    parserIdentity?: string;
    reducerIdentity?: string;
    stats?: LessonExtractCacheStats;
  };
}

export interface LessonExtractCacheStats {
  hits: number;
  misses: number;
  writes: number;
  corrupt: number;
}

interface AiLessonDraft {
  claim?: unknown;
  safe_claim?: unknown;
  problem?: unknown;
  trigger?: unknown;
  action?: unknown;
  verification?: unknown;
  negative_case?: unknown;
  applies_to_agents?: unknown;
  applies_to_systems?: unknown;
  portability?: unknown;
  privacy_tier?: unknown;
  scope?: unknown;
  confidence?: unknown;
  cue_family?: unknown;
  evidence_span_ids?: unknown;
  redaction_notes?: unknown;
}

const PORTABILITY_VALUES = new Set([
  "universal",
  "agent_family",
  "project",
  "environment",
  "private_instance",
]);

const PRIVACY_VALUES = new Set([
  "safe",
  "personal_only",
  "team_allowed",
  "human_required",
  "reject",
]);

const CUE_VALUES = new Set([
  "explicit_user",
  "native_memory",
  "repeated_failure",
  "verified_fix",
  "tool_sequence",
  "reflection",
  "llm_inferred",
]);

const EXTRACTOR_PROMPT_VERSION = "m25-lesson-extractor-v1";

export async function extractLessonsWithAi(
  spans: EvidenceSpan[],
  options: ExtractLessonsWithAiOptions,
): Promise<ExperienceLesson[]> {
  if (spans.length === 0) return [];

  const cachePath = options.cache ? lessonExtractCachePath(spans, options) : undefined;
  if (cachePath && options.cache) {
    const cached = await readCachedLessons(options.cache.root, cachePath);
    if (cached.status === "hit") {
      options.cache.stats && (options.cache.stats.hits += 1);
      return cached.lessons;
    }
    options.cache.stats && (options.cache.stats.misses += 1);
    if (cached.status === "corrupt") options.cache.stats && (options.cache.stats.corrupt += 1);
  }

  const first = await callExtractor(options.client, spans, buildSystemPrompt(), buildUserPrompt(spans));
  if (!first.ok) return [];

  const parsed = parseLessonDrafts(first.json, spans, options);
  if (parsed.valid.length > 0 && parsed.invalid === 0) {
    if (cachePath && options.cache) {
      await writeCachedLessons(options.cache.root, cachePath, parsed.valid);
      options.cache.stats && (options.cache.stats.writes += 1);
    }
    return parsed.valid;
  }
  if (parsed.invalid === 0) {
    if (cachePath && options.cache) {
      await writeCachedLessons(options.cache.root, cachePath, parsed.valid);
      options.cache.stats && (options.cache.stats.writes += 1);
    }
    return parsed.valid;
  }

  const retry = await callExtractor(
    options.client,
    spans,
    buildRepairPrompt(spans),
    JSON.stringify(first.json),
  );
  if (!retry.ok) {
    if (options.cache) {
      await writeLessonExtractorQuarantine(options.cache.root, spans, options, [
        { phase: "initial", invalid: parsed.invalid, json: first.json },
        { phase: "repair", invalid: 1, error: retry.error },
      ]);
    }
    return parsed.valid;
  }

  const repaired = parseLessonDrafts(retry.json, spans, options);
  const lessons = [...parsed.valid, ...repaired.valid];
  if (repaired.invalid > 0 && options.cache) {
    await writeLessonExtractorQuarantine(options.cache.root, spans, options, [
      { phase: "initial", invalid: parsed.invalid, json: first.json },
      { phase: "repair", invalid: repaired.invalid, json: retry.json },
    ]);
  }
  if (cachePath && options.cache) {
    await writeCachedLessons(options.cache.root, cachePath, lessons);
    options.cache.stats && (options.cache.stats.writes += 1);
  }
  return lessons;
}

function lessonExtractCachePath(spans: EvidenceSpan[], options: ExtractLessonsWithAiOptions): string {
  const spanIdentity = spans.map((span) => ({
    source_item_id: span.source_item_id,
    source_ref: span.source_ref,
    span_id: span.span_id,
    source_hash: span.source_hash,
    excerpt_hash: span.excerpt_hash,
  }));
  const key = computeHash(JSON.stringify({
    extractor: EXTRACTOR_PROMPT_VERSION,
    identity: options.cache?.identity,
    plannerIdentity: options.cache?.plannerIdentity ?? "unspecified-planner",
    parserIdentity: options.cache?.parserIdentity ?? "unspecified-parser",
    reducerIdentity: options.cache?.reducerIdentity ?? "none",
    agent: options.agent ?? "generic",
    scope: options.scope ?? "personal",
    spans: spanIdentity,
  })).replace(/^sha256:/, "");
  return `${protocolPaths.cacheLessonExtract}/${key}.json`;
}

async function readCachedLessons(
  root: string,
  cachePath: string,
): Promise<
  | { status: "hit"; lessons: ExperienceLesson[] }
  | { status: "miss" }
  | { status: "corrupt" }
> {
  try {
    const raw = await readJson<{ lessons?: unknown[] }>(root, cachePath);
    if (!Array.isArray(raw.lessons)) return { status: "corrupt" };
    const lessons: ExperienceLesson[] = [];
    for (const candidate of raw.lessons) {
      const parsed = ExperienceLessonSchema.safeParse(candidate);
      if (!parsed.success) return { status: "corrupt" };
      lessons.push(parsed.data);
    }
    return { status: "hit", lessons };
  } catch {
    return { status: "miss" };
  }
}

async function writeCachedLessons(root: string, cachePath: string, lessons: ExperienceLesson[]): Promise<void> {
  await writeJson(root, cachePath, {
    type: "lesson_extract_cache",
    extractor: EXTRACTOR_PROMPT_VERSION,
    lessons,
  });
}

async function writeLessonExtractorQuarantine(
  root: string,
  spans: EvidenceSpan[],
  options: ExtractLessonsWithAiOptions,
  attempts: Array<{ phase: "initial" | "repair"; invalid: number; json?: unknown; error?: string }>,
): Promise<void> {
  const id = computeHash(JSON.stringify({
    extractor: EXTRACTOR_PROMPT_VERSION,
    identity: options.cache?.identity ?? "uncached",
    agent: options.agent ?? "generic",
    scope: options.scope ?? "personal",
    spans: spans.map((span) => ({
      source_ref: span.source_ref,
      source_hash: span.source_hash,
      span_id: span.span_id,
      excerpt_hash: span.excerpt_hash,
    })),
    attempts,
  })).replace(/^sha256:/, "");
  await writeJson(root, `${protocolPaths.reportsLessonQuarantine}/${id}.json`, {
    type: "lesson_extractor_quarantine",
    extractor: EXTRACTOR_PROMPT_VERSION,
    model_identity: options.cache?.identity ?? "uncached",
    agent: options.agent ?? "generic",
    scope: options.scope ?? "personal",
    span_ids: spans.map((span) => span.span_id),
    source_refs: unique(spans.map((span) => span.source_ref)),
    source_hashes: unique(spans.map((span) => span.source_hash)),
    attempts,
    created_at: options.now,
  });
}

async function callExtractor(
  client: AiJsonClient,
  spans: EvidenceSpan[],
  system: string,
  user: string,
): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  if (spans.length === 0) return { ok: true, json: { lessons: [] } };
  return client.generateJson({
    system,
    user,
    schemaName: "ExperienceLessons",
    maxOutputBytes: 65_536,
  });
}

function buildSystemPrompt(): string {
  return [
    "You are an agent experience distiller.",
    "Extract reusable lessons, not summaries.",
    "Return JSON as {\"lessons\":[...]} only.",
    "Each lesson must include evidence_span_ids referencing the provided spans.",
    "Prefer fewer high-value lessons over padding weak or generic evidence.",
  ].join("\n");
}

function buildUserPrompt(spans: EvidenceSpan[]): string {
  const compact = spans.map((span) => ({
    span_id: span.span_id,
    excerpt: span.excerpt,
    heading_path: span.heading_path,
    span_kind: span.span_kind,
    source_ref: span.source_ref,
  }));
  return JSON.stringify({ spans: compact });
}

function buildRepairPrompt(spans: EvidenceSpan[]): string {
  const spanIds = spans.map((span) => span.span_id);
  return [
    "Your previous output failed validation.",
    "Return valid JSON matching exactly: { lessons: [{ claim, safe_claim, problem, trigger, action, verification, negative_case, applies_to_agents, applies_to_systems, portability, privacy_tier, scope, confidence, cue_family, evidence_span_ids, redaction_notes }] }.",
    `evidence_span_ids must reference: ${JSON.stringify(spanIds)}.`,
    "portability must be one of: universal, agent_family, project, environment, private_instance.",
    "privacy_tier must be one of: safe, personal_only, team_allowed, human_required, reject.",
  ].join("\n");
}

function parseLessonDrafts(
  json: unknown,
  spans: EvidenceSpan[],
  options: ExtractLessonsWithAiOptions,
): { valid: ExperienceLesson[]; invalid: number } {
  const lessons = (json as { lessons?: unknown }).lessons;
  if (!Array.isArray(lessons)) return { valid: [], invalid: 1 };

  const spansById = new Map(spans.map((span) => [span.span_id, span]));
  const valid: ExperienceLesson[] = [];
  let invalid = 0;

  for (const draft of lessons) {
    const built = buildLessonFromDraft(draft as AiLessonDraft, spansById, options);
    if (!built) {
      invalid += 1;
      continue;
    }
    valid.push(built);
  }

  return { valid, invalid };
}

function buildLessonFromDraft(
  draft: AiLessonDraft,
  spansById: Map<string, EvidenceSpan>,
  options: ExtractLessonsWithAiOptions,
): ExperienceLesson | undefined {
  const evidenceSpanIds = Array.isArray(draft.evidence_span_ids)
    ? draft.evidence_span_ids.filter((id): id is string => typeof id === "string")
    : [];
  const evidenceSpans = evidenceSpanIds
    .map((id) => spansById.get(id))
    .filter((span): span is EvidenceSpan => Boolean(span));
  if (evidenceSpans.length === 0) return undefined;

  const claim = asNonEmptyString(draft.claim) ?? "Reusable agent lesson.";
  if (isWeakOneOffLessonDraft(claim, draft, evidenceSpans)) return undefined;
  const lesson = {
    lesson_id: `ai_${computeHash(claim).slice("sha256:".length, "sha256:".length + 16)}`,
    claim,
    safe_claim: asNonEmptyString(draft.safe_claim) ?? claim,
    problem: asNonEmptyString(draft.problem) ?? "The evidence describes a reusable agent failure mode.",
    trigger: asNonEmptyString(draft.trigger) ?? "When the same condition appears again.",
    action: asNonEmptyString(draft.action) ?? "Apply the reusable lesson from the evidence.",
    verification: asOptionalString(draft.verification),
    negative_case: asOptionalString(draft.negative_case),
    applies_to_agents: asStringArray(draft.applies_to_agents, options.agent ? [options.agent] : []),
    applies_to_systems: asStringArray(draft.applies_to_systems, []),
    portability: PORTABILITY_VALUES.has(String(draft.portability)) ? draft.portability : "agent_family",
    privacy_tier: PRIVACY_VALUES.has(String(draft.privacy_tier)) ? draft.privacy_tier : "human_required",
    scope: options.scope ?? "personal",
    confidence: typeof draft.confidence === "number" ? draft.confidence : 0.5,
    cue_family: CUE_VALUES.has(String(draft.cue_family)) ? draft.cue_family : "llm_inferred",
    source_refs: unique(evidenceSpans.map((span) => span.source_ref)),
    source_hashes: unique(evidenceSpans.map((span) => span.source_hash)),
    evidence_spans: evidenceSpans,
    redaction_notes: asStringArray(draft.redaction_notes, []),
    created_at: options.now,
  };

  try {
    return ExperienceLessonSchema.parse(lesson);
  } catch {
    return undefined;
  }
}

function isWeakOneOffLessonDraft(
  claim: string,
  draft: AiLessonDraft,
  evidenceSpans: EvidenceSpan[],
): boolean {
  const fields = [
    claim,
    asOptionalString(draft.safe_claim),
    asOptionalString(draft.problem),
    asOptionalString(draft.trigger),
    asOptionalString(draft.action),
    asOptionalString(draft.verification),
  ].filter((field): field is string => typeof field === "string");
  const combined = fields.join("\n").toLowerCase();
  const evidence = evidenceSpans.map((span) => span.excerpt.toLowerCase()).join("\n");

  const oneOffRun =
    /\b(run|ran|smoke|test)\s+[a-z0-9_.:-]*\s*(passed|success|successful|successfully|succeeded|completed|green)\b/.test(combined) ||
    /\b(passed|success|successful|successfully|succeeded|completed|green)\b.*\b(run|ran|smoke|test)\b/.test(combined) ||
    /\brun\s+\d{6,}[-_a-z0-9]*\b/.test(combined) ||
    /\b(run|ran|smoke)\s+[a-z0-9_.:-]*\s*(passed|success|successful|successfully|succeeded|completed|green)\b/.test(evidence);
  if (!oneOffRun) return false;

  const reusableSignals = [
    "next time",
    "always",
    "never",
    "avoid",
    "do not",
    "must",
    "procedure",
    "reusable",
    "lesson",
    "root cause",
    "failover",
    "confirm",
    "verify before",
    "self-test after",
  ];
  const hasReusableSignal = reusableSignals.some((signal) =>
    combined.includes(signal) || evidence.includes(signal),
  );
  if (hasReusableSignal) return false;

  const allEvidenceLooksWeak = evidenceSpans.every((span) =>
    /^(ok|done|pass|passed|success|completed|green)\.?$/i.test(span.excerpt.trim()) ||
    /\b(smoke|run|ran|test)\b.{0,32}\b(passed|success|successful|successfully|succeeded|completed|green)\b/i.test(span.excerpt),
  );
  return allEvidenceLooksWeak;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length > 0 ? strings : fallback;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
