import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { computeHash } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { ExperienceLessonSchema, type ExperienceLesson } from "./lesson-model.js";

export type LessonState =
  | "candidate"
  | "provisional"
  | "active_personal"
  | "wiki_ready"
  | "skill_ready"
  | "human_required"
  | "forgotten"
  | "rejected";

export interface ClassifiedLesson extends ExperienceLesson {
  state: LessonState;
}

export type LessonUserOverride = "pin" | "forget" | "dismiss" | "reject";

export interface ClassifyLessonStateOptions {
  mode?: "personal-local" | "team-git";
  sourceCount?: number;
  verified?: boolean;
  userState?: "active" | "pin" | "forgotten" | "dismissed" | "rejected";
}

export interface LessonStateHistoryEntry {
  state: LessonState;
  at: string;
}

export interface LessonCacheRecord {
  stable_key: string;
  state: LessonState;
  lesson: ExperienceLesson;
  evidence_refs: string[];
  source_hashes: string[];
  score: number;
  first_seen_at: string;
  last_seen_at: string;
  observation_count: number;
  source_count: number;
  agent_count: number;
  user_override?: LessonUserOverride;
  state_history: LessonStateHistoryEntry[];
}

export interface UpsertLessonCacheOptions {
  mode?: "personal-local" | "team-git";
  sourceCount?: number;
  agentCount?: number;
  verified?: boolean;
}

const STATE_STRENGTH: Record<LessonState, number> = {
  wiki_ready: 7,
  skill_ready: 6,
  active_personal: 5,
  provisional: 4.5,
  candidate: 4,
  human_required: 3,
  forgotten: 2,
  rejected: 1,
};

const CUE_SCORE: Record<ExperienceLesson["cue_family"], number> = {
  explicit_user: 18,
  native_memory: 16,
  verified_fix: 15,
  repeated_failure: 12,
  tool_sequence: 9,
  reflection: 8,
  llm_inferred: 6,
};

const CACHE_FILE = "cache.json";

export function classifyLessonState(
  lesson: ExperienceLesson,
  options: ClassifyLessonStateOptions = {},
): LessonState {
  const existingState = (lesson as { state?: unknown }).state;
  if (existingState === "human_required" || existingState === "forgotten" || existingState === "rejected") {
    return existingState;
  }
  if (options.userState === "forgotten") return "forgotten";
  if (options.userState === "dismissed") return "forgotten";
  if (options.userState === "rejected") return "rejected";
  if (lesson.privacy_tier === "reject") return "rejected";
  if (lesson.privacy_tier === "human_required") return "human_required";

  const mode = options.mode ?? "personal-local";
  const sourceCount = options.sourceCount ?? lesson.source_refs?.length ?? 1;
  const privacyAllowsPromotion =
    lesson.privacy_tier === "safe" ||
    (mode === "team-git" && lesson.privacy_tier === "team_allowed") ||
    (mode === "personal-local" && lesson.privacy_tier === "personal_only");
  if (!privacyAllowsPromotion) return "candidate";

  const skillReady =
    lesson.privacy_tier !== "personal_only" &&
    lesson.confidence >= 0.9 &&
    Boolean(lesson.verification) &&
    Boolean(lesson.negative_case) &&
    lesson.applies_to_agents.length >= 1;
  if (skillReady) return "skill_ready";

  const wikiReady =
    lesson.confidence >= 0.9 &&
    lesson.portability !== "private_instance" &&
    sourceCount >= 1;
  if (wikiReady) return "wiki_ready";

  if (
    mode === "personal-local" &&
    lesson.confidence >= 0.85 &&
    lesson.privacy_tier === "safe" &&
    options.verified === true &&
    sourceCount >= 1
  ) {
    return "active_personal";
  }

  if ((options.userState === "pin" || options.userState === "active") && lesson.privacy_tier === "safe") {
    return "active_personal";
  }

  return "candidate";
}

export function lessonStableKey(
  lesson: Pick<
    ExperienceLesson,
    "problem" | "trigger" | "action" | "applies_to_systems" | "portability"
  >,
): string {
  const semanticCore = [
    lesson.problem,
    lesson.trigger,
    lesson.action,
  ].join("\n");
  const normalized = semanticCore.toLowerCase().trim().replace(/\s+/g, " ");
  const systems = [...lesson.applies_to_systems].sort().join(",");
  return computeHash(`${normalized}|${systems}|${lesson.portability}`);
}

export function dedupeLessons<T extends ExperienceLesson>(lessons: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const lesson of lessons) {
    const key = lessonStableKey(lesson);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, lesson);
    } else if (compareLessonStrength(lesson, current) < 0) {
      byKey.set(key, mergeLessonProvenance(lesson, current));
    } else {
      byKey.set(key, mergeLessonProvenance(current, lesson));
    }
  }
  return dedupeSemanticLessons([...byKey.values()]);
}

export function rankLessonsForWiki<T extends ClassifiedLesson>(lessons: T[]): T[] {
  return lessons
    .filter((lesson) => lesson.state === "wiki_ready" || lesson.state === "skill_ready")
    .sort((a, b) => {
      const stateCompare = wikiRank(a.state) - wikiRank(b.state);
      return stateCompare || b.confidence - a.confidence;
    });
}

export function rankLessonsForRuntime<T extends ClassifiedLesson>(lessons: T[]): T[] {
  return lessons
    .filter((lesson) =>
      lesson.state === "active_personal" ||
      lesson.state === "wiki_ready" ||
      lesson.state === "provisional" ||
      lesson.state === "candidate",
    )
    .sort((a, b) => {
      const stateCompare = runtimeRank(a.state) - runtimeRank(b.state);
      return stateCompare || b.confidence - a.confidence;
    })
    .slice(0, 20);
}

export async function loadLessonStateCache(root: string): Promise<LessonCacheRecord[]> {
  const absolutePath = join(root, protocolPaths.cacheLessonState, CACHE_FILE);
  let raw = "";
  try {
    raw = await readFile(absolutePath, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return [];
    console.warn(`lesson_state_cache_read_failed:${error instanceof Error ? error.message : String(error)}`);
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const records = extractCacheRecords(parsed);
    if (!records) {
      console.warn("lesson_state_cache_invalid");
      return [];
    }
    return records.filter((record) => !isRawCandidateCorpusLesson(record.lesson));
  } catch (error) {
    console.warn(`lesson_state_cache_corrupt:${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

export async function saveLessonStateCache(root: string, records: LessonCacheRecord[]): Promise<void> {
  const absolutePath = join(root, protocolPaths.cacheLessonState, CACHE_FILE);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify({
    type: "lesson_state_cache",
    version: 1,
    records,
  }, null, 2)}\n`, "utf8");
}

export class LessonStateCacheStore {
  constructor(private readonly root: string) {}

  async load(): Promise<LessonCacheRecord[]> {
    return loadLessonStateCache(this.root);
  }

  async save(records: LessonCacheRecord[]): Promise<void> {
    await saveLessonStateCache(this.root, records);
  }

  async upsert(
    lesson: ExperienceLesson,
    now: string,
    options: UpsertLessonCacheOptions = {},
  ): Promise<LessonCacheRecord[]> {
    const records = await this.load();
    const next = upsertLessonToCache(records, lesson, now, options);
    await this.save(next);
    return next;
  }
}

export function upsertLessonToCache(
  records: LessonCacheRecord[],
  lesson: ExperienceLesson,
  now: string,
  options: UpsertLessonCacheOptions = {},
): LessonCacheRecord[] {
  records = records.filter((record) => !isRawCandidateCorpusLesson(record.lesson));
  const stableKey = lessonStableKey(lesson);
  const existingIndex = records.findIndex((record) => record.stable_key === stableKey);
  if (existingIndex === -1) {
    const sourceCount = options.sourceCount ?? lesson.source_refs.length;
    const agentCount = options.agentCount ?? countAgents(lesson);
    const state = classifyLessonState(lesson, {
      mode: options.mode,
      sourceCount,
      verified: options.verified ?? Boolean(lesson.verification),
    });
    const record: LessonCacheRecord = {
      stable_key: stableKey,
      state,
      lesson: normalizeLessonArrays(lesson),
      evidence_refs: uniqueStrings(lesson.source_refs),
      source_hashes: uniqueStrings(lesson.source_hashes),
      score: scoreLesson(lesson, {
        sourceCount,
        agentCount,
        verified: options.verified,
        observationCount: 1,
        state,
      }),
      first_seen_at: now,
      last_seen_at: now,
      observation_count: 1,
      source_count: sourceCount,
      agent_count: agentCount,
      state_history: [{ state, at: now }],
    };
    return [...records, record];
  }

  const current = records[existingIndex]!;
  const evidenceRefs = uniqueStrings([...current.evidence_refs, ...lesson.source_refs]);
  const sourceHashes = uniqueStrings([...current.source_hashes, ...lesson.source_hashes]);
  const appliesToAgents = uniqueStrings([...current.lesson.applies_to_agents, ...lesson.applies_to_agents]);
  const appliesToSystems = uniqueStrings([...current.lesson.applies_to_systems, ...lesson.applies_to_systems]);
  const sourceCount = Math.max(current.source_count, options.sourceCount ?? evidenceRefs.length);
  const agentCount = Math.max(current.agent_count, options.agentCount ?? appliesToAgents.length);
  const mergedLesson = normalizeLessonArrays({
    ...strongerLesson(current.lesson, lesson),
    applies_to_agents: appliesToAgents,
    applies_to_systems: appliesToSystems,
    source_refs: evidenceRefs,
    source_hashes: sourceHashes,
  });
  const state = classifyWithOverride(mergedLesson, current.user_override, {
    mode: options.mode,
    sourceCount,
    verified: options.verified ?? Boolean(mergedLesson.verification),
  });
  const nextRecord: LessonCacheRecord = {
    ...current,
    state,
    lesson: mergedLesson,
    evidence_refs: evidenceRefs,
    source_hashes: sourceHashes,
    score: scoreLesson(mergedLesson, {
      sourceCount,
      agentCount,
      verified: options.verified,
      observationCount: current.observation_count + 1,
      state,
      duplicate: true,
    }),
    last_seen_at: now,
    observation_count: current.observation_count + 1,
    source_count: sourceCount,
    agent_count: agentCount,
    state_history: appendStateHistory(current.state_history, current.state, state, now),
  };

  return records.map((record, index) => index === existingIndex ? nextRecord : record);
}

export function updateLessonUserOverride(
  records: LessonCacheRecord[],
  stableKey: string,
  override: LessonUserOverride,
  now: string,
): LessonCacheRecord[] {
  return records.map((record) => {
    if (record.stable_key !== stableKey) return record;
    const state = classifyWithOverride(record.lesson, override, {
      sourceCount: record.source_count,
      agentCount: record.agent_count,
      verified: Boolean(record.lesson.verification),
    });
    return {
      ...record,
      state,
      user_override: override,
      score: scoreLesson(record.lesson, {
        sourceCount: record.source_count,
        agentCount: record.agent_count,
        verified: Boolean(record.lesson.verification),
        observationCount: record.observation_count,
        state,
      }),
      state_history: appendStateHistory(record.state_history, record.state, state, now),
    };
  });
}

function compareLessonStrength(a: ExperienceLesson, b: ExperienceLesson): number {
  const aState = lessonStateForComparison(a);
  const bState = lessonStateForComparison(b);
  const stateCompare = STATE_STRENGTH[bState] - STATE_STRENGTH[aState];
  if (stateCompare !== 0) return stateCompare;
  const confidenceCompare = b.confidence - a.confidence;
  if (confidenceCompare !== 0) return confidenceCompare;
  return (b.source_refs?.length ?? 0) - (a.source_refs?.length ?? 0);
}

function dedupeSemanticLessons<T extends ExperienceLesson>(lessons: T[]): T[] {
  const byTopic = new Map<string, T[]>();
  for (const lesson of lessons) {
    const topicKey = lessonSemanticTopicKey(lesson);
    byTopic.set(topicKey, [...(byTopic.get(topicKey) ?? []), lesson]);
  }

  const deduped: T[] = [];
  for (const group of byTopic.values()) {
    if (group.length === 1) {
      deduped.push(group[0]!);
      continue;
    }

    if (hasLessonContradiction(group)) {
      deduped.push(...group.map((lesson) => withLessonState(lesson, "human_required")));
      continue;
    }

    const clusters: T[][] = [];
    for (const lesson of group) {
      const existing = clusters.find((cluster) => cluster.some((candidate) => areActionCompatible(candidate, lesson)));
      if (existing) {
        existing.push(lesson);
      } else {
        clusters.push([lesson]);
      }
    }
    for (const cluster of clusters) {
      const merged = cluster.reduce((current, lesson) => {
        if (compareLessonStrength(lesson, current) < 0) {
          return mergeLessonProvenance(lesson, current);
        }
        return mergeLessonProvenance(current, lesson);
      });
      deduped.push(merged);
    }
  }
  return deduped;
}

function lessonSemanticTopicKey(lesson: ExperienceLesson): string {
  const systems = [...lesson.applies_to_systems].map(normalizeText).sort().join(",");
  const agents = [...lesson.applies_to_agents].map(normalizeText).sort().join(",");
  const topic = [
    normalizeText(lesson.problem),
    normalizeText(lesson.trigger),
    systems,
    agents,
    lesson.portability,
  ].join("|");
  return computeHash(topic);
}

function hasLessonContradiction(lessons: ExperienceLesson[]): boolean {
  for (let leftIndex = 0; leftIndex < lessons.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < lessons.length; rightIndex++) {
      if (lessonsContradict(lessons[leftIndex]!, lessons[rightIndex]!)) return true;
    }
  }
  return false;
}

function lessonsContradict(left: ExperienceLesson, right: ExperienceLesson): boolean {
  const leftAction = normalizeActionText(left.action);
  const rightAction = normalizeActionText(right.action);
  const leftPolarity = actionPolarity(leftAction);
  const rightPolarity = actionPolarity(rightAction);
  if (
    leftPolarity !== rightPolarity &&
    tokenOverlap(removeNegationTerms(leftAction), removeNegationTerms(rightAction)) >= 0.6
  ) {
    return true;
  }

  return negativeCaseConflicts(left.negative_case, right.action) ||
    negativeCaseConflicts(right.negative_case, left.action);
}

function negativeCaseConflicts(negativeCase: string | undefined, action: string): boolean {
  if (!negativeCase) return false;
  const negative = normalizeActionText(negativeCase);
  const normalizedAction = normalizeActionText(action);
  if (!containsNegation(negative)) return false;
  return tokenOverlap(removeNegationTerms(negative), removeNegationTerms(normalizedAction)) >= 0.6;
}

function areActionCompatible(left: ExperienceLesson, right: ExperienceLesson): boolean {
  const leftAction = normalizeActionText(left.action);
  const rightAction = normalizeActionText(right.action);
  if (actionPolarity(leftAction) !== actionPolarity(rightAction)) return false;
  return tokenOverlap(removeNegationTerms(leftAction), removeNegationTerms(rightAction)) >= 0.5;
}

function mergeLessonProvenance<T extends ExperienceLesson>(base: T, incoming: ExperienceLesson): T {
  return {
    ...base,
    applies_to_agents: uniqueStrings([...base.applies_to_agents, ...incoming.applies_to_agents]),
    applies_to_systems: uniqueStrings([...base.applies_to_systems, ...incoming.applies_to_systems]),
    source_refs: uniqueStrings([...base.source_refs, ...incoming.source_refs]),
    source_hashes: uniqueStrings([...base.source_hashes, ...incoming.source_hashes]),
    evidence_spans: mergeEvidenceSpans(base.evidence_spans, incoming.evidence_spans),
    redaction_notes: uniqueStrings([...base.redaction_notes, ...incoming.redaction_notes]),
  };
}

function mergeEvidenceSpans(
  base: ExperienceLesson["evidence_spans"],
  incoming: ExperienceLesson["evidence_spans"],
): ExperienceLesson["evidence_spans"] {
  const byId = new Map<string, ExperienceLesson["evidence_spans"][number]>();
  for (const span of [...base, ...incoming]) {
    byId.set(span.span_id ?? `${span.source_ref}:${span.source_hash}`, span);
  }
  return [...byId.values()];
}

function withLessonState<T extends ExperienceLesson>(lesson: T, state: LessonState): T {
  return {
    ...lesson,
    state,
  } as T;
}

function lessonStateForComparison(lesson: ExperienceLesson): LessonState {
  const maybeState = (lesson as { state?: unknown }).state;
  if (isLessonState(maybeState)) return maybeState;
  return classifyLessonState(lesson);
}

function isLessonState(value: unknown): value is LessonState {
  return typeof value === "string" && value in STATE_STRENGTH;
}

function wikiRank(state: LessonState): number {
  if (state === "skill_ready") return 0;
  if (state === "wiki_ready") return 1;
  return 2;
}

function runtimeRank(state: LessonState): number {
  if (state === "active_personal") return 0;
  if (state === "wiki_ready") return 1;
  if (state === "provisional") return 2;
  if (state === "candidate") return 2;
  return 3;
}

function classifyWithOverride(
  lesson: ExperienceLesson,
  override: LessonUserOverride | undefined,
  options: UpsertLessonCacheOptions = {},
): LessonState {
  if (override === "forget" || override === "dismiss") return "forgotten";
  if (override === "reject") return "rejected";
  if (override === "pin") {
    return classifyLessonState(lesson, {
      mode: options.mode,
      sourceCount: options.sourceCount,
      verified: options.verified,
      userState: "pin",
    });
  }
  return classifyLessonState(lesson, {
    mode: options.mode,
    sourceCount: options.sourceCount,
    verified: options.verified,
  });
}

function scoreLesson(
  lesson: ExperienceLesson,
  input: {
    sourceCount: number;
    agentCount: number;
    observationCount: number;
    state: LessonState;
    verified?: boolean;
    duplicate?: boolean;
  },
): number {
  const privacyPenalty =
    lesson.privacy_tier === "reject" ? -100 :
    lesson.privacy_tier === "human_required" ? -40 :
    lesson.privacy_tier === "personal_only" ? -8 :
    0;
  const verificationBonus = (input.verified ?? Boolean(lesson.verification)) ? 10 : 0;
  const negativeCaseBonus = lesson.negative_case ? 4 : 0;
  const duplicateBonus = input.duplicate ? 3 : 0;
  const stateBonus = STATE_STRENGTH[input.state] * 4;
  return Math.round(
    lesson.confidence * 100 +
    CUE_SCORE[lesson.cue_family] +
    Math.min(input.sourceCount, 5) * 5 +
    Math.min(input.agentCount, 5) * 3 +
    Math.min(input.observationCount, 10) * 2 +
    verificationBonus +
    negativeCaseBonus +
    duplicateBonus +
    stateBonus +
    privacyPenalty,
  );
}

function strongerLesson(current: ExperienceLesson, incoming: ExperienceLesson): ExperienceLesson {
  const currentState = classifyLessonState(current);
  const incomingState = classifyLessonState(incoming);
  const stateCompare = STATE_STRENGTH[incomingState] - STATE_STRENGTH[currentState];
  if (stateCompare > 0) return incoming;
  if (stateCompare < 0) return current;
  if (incoming.confidence > current.confidence) return incoming;
  return current;
}

function normalizeLessonArrays(lesson: ExperienceLesson): ExperienceLesson {
  return {
    ...lesson,
    source_refs: uniqueStrings(lesson.source_refs),
    source_hashes: uniqueStrings(lesson.source_hashes),
  };
}

function isRawCandidateCorpusLesson(lesson: ExperienceLesson): boolean {
  const texts = [
    lesson.claim,
    lesson.safe_claim,
    ...lesson.evidence_spans.map((span) => span.excerpt ?? ""),
  ];
  return texts.some(isRawCandidateCorpusNoise);
}

function isRawCandidateCorpusNoise(text: string): boolean {
  if (!/\bCandidate:/i.test(text)) return false;
  const lower = text.toLowerCase();
  const repeatedCandidateCount = text.match(/\bCandidate:/gi)?.length ?? 0;
  const noisySignals = [
    /confidence:\s*0(?:\.0+)?\b/i.test(text),
    lower.includes("memory/.dreams/session-corpus"),
    lower.includes("conversation info (untrusted metadata)"),
    lower.includes("status: staged"),
    repeatedCandidateCount >= 2,
  ].filter(Boolean).length;
  return noisySignals >= 2;
}

function appendStateHistory(
  history: LessonStateHistoryEntry[],
  previous: LessonState,
  next: LessonState,
  at: string,
): LessonStateHistoryEntry[] {
  if (previous === next) return history;
  return [...history, { state: next, at }];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeActionText(value: string): string {
  return normalizeText(value)
    .replace(/-/g, " ")
    .replace(/\b(self test|self tests|verification|verify|verified|focused test|focused tests|tests)\b/g, "test")
    .replace(/\s+/g, " ")
    .trim();
}

function actionPolarity(normalizedAction: string): "affirm" | "negate" {
  return containsNegation(normalizedAction) ? "negate" : "affirm";
}

function containsNegation(normalizedText: string): boolean {
  return /\b(do not|don't|dont|never|avoid|skip|disable|forbid|forbidden|must not|should not|no)\b/i.test(normalizedText);
}

function removeNegationTerms(normalizedText: string): string {
  return normalizedText
    .replace(/\b(do not|don't|dont|never|avoid|skip|disable|forbid|forbidden|must not|should not|no)\b/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = meaningfulTokens(left);
  const rightTokens = meaningfulTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared++;
  }
  return shared / Math.min(leftTokens.size, rightTokens.size);
}

function meaningfulTokens(text: string): Set<string> {
  return new Set(
    text
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !STOP_WORDS.has(token)),
  );
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "when",
  "after",
  "before",
  "during",
  "into",
  "from",
  "that",
  "this",
  "then",
  "than",
  "relevant",
]);

function countAgents(lesson: ExperienceLesson): number {
  return Math.max(1, new Set(lesson.applies_to_agents).size);
}

function extractCacheRecords(value: unknown): LessonCacheRecord[] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const maybeRecords = (value as { records?: unknown }).records;
  if (!Array.isArray(maybeRecords)) return undefined;
  const records: LessonCacheRecord[] = [];
  for (const candidate of maybeRecords) {
    const record = parseCacheRecord(candidate);
    if (!record) return undefined;
    records.push(record);
  }
  return records;
}

function parseCacheRecord(value: unknown): LessonCacheRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as {
    stable_key?: unknown;
    state?: unknown;
    lesson?: unknown;
    evidence_refs?: unknown;
    source_hashes?: unknown;
    score?: unknown;
    first_seen_at?: unknown;
    last_seen_at?: unknown;
    observation_count?: unknown;
    source_count?: unknown;
    agent_count?: unknown;
    user_override?: unknown;
    state_history?: unknown;
  };
  const lesson = ExperienceLessonSchema.safeParse(record.lesson);
  if (!lesson.success) return undefined;
  if (
    typeof record.stable_key !== "string" ||
    !isLessonState(record.state) ||
    !Array.isArray(record.evidence_refs) ||
    !record.evidence_refs.every((item) => typeof item === "string") ||
    !Array.isArray(record.source_hashes) ||
    !record.source_hashes.every((item) => typeof item === "string") ||
    typeof record.score !== "number" ||
    typeof record.first_seen_at !== "string" ||
    typeof record.last_seen_at !== "string" ||
    typeof record.observation_count !== "number" ||
    typeof record.source_count !== "number" ||
    typeof record.agent_count !== "number" ||
    !isLessonUserOverrideOrUndefined(record.user_override) ||
    !Array.isArray(record.state_history)
  ) {
    return undefined;
  }
  const stateHistory: LessonStateHistoryEntry[] = [];
  for (const entry of record.state_history) {
    if (!entry || typeof entry !== "object") return undefined;
    const typed = entry as { state?: unknown; at?: unknown };
    if (!isLessonState(typed.state) || typeof typed.at !== "string") return undefined;
    stateHistory.push({ state: typed.state, at: typed.at });
  }
  return {
    stable_key: record.stable_key,
    state: record.state,
    lesson: lesson.data,
    evidence_refs: record.evidence_refs,
    source_hashes: record.source_hashes,
    score: record.score,
    first_seen_at: record.first_seen_at,
    last_seen_at: record.last_seen_at,
    observation_count: record.observation_count,
    source_count: record.source_count,
    agent_count: record.agent_count,
    ...(record.user_override ? { user_override: record.user_override } : {}),
    state_history: stateHistory,
  };
}

function isLessonUserOverrideOrUndefined(value: unknown): value is LessonUserOverride | undefined {
  return value === undefined || value === "pin" || value === "forget" || value === "dismiss" || value === "reject";
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
