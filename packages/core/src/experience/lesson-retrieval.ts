import { utf8ByteLength, utf8SafeSlice } from "./context-juice.js";
import type { ExperienceLesson } from "./lesson-model.js";

export interface RetrieveRuntimeLessonsOptions {
  query?: string;
  agent?: string;
  agents?: string[];
  systems?: string[];
  tags?: string[];
  portability?: ExperienceLesson["portability"][];
  scopes?: ExperienceLesson["scope"][];
  states?: string[];
  maxHits?: number;
}

export interface RuntimeLessonHit extends ExperienceLesson {
  score: number;
}

export function retrieveRuntimeLessons(
  lessons: ExperienceLesson[],
  options: RetrieveRuntimeLessonsOptions = {},
): RuntimeLessonHit[] {
  const queryTerms = terms(options.query ?? "");
  const maxHits = Math.max(0, Math.floor(options.maxHits ?? 5));
  if (maxHits === 0) return [];

  return lessons
    .filter((lesson) =>
      (lesson.privacy_tier === "safe" || lesson.privacy_tier === "personal_only") &&
      isRuntimeEligibleLessonState((lesson as { state?: unknown }).state) &&
      matchesRuntimeLessonFilters(lesson, options),
    )
    .map((lesson) => ({ ...lesson, score: runtimeLessonScore(lesson, queryTerms, options.agent) }))
    .filter((lesson) => lesson.score > 0)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence)
    .slice(0, maxHits);
}

function isRuntimeEligibleLessonState(state: unknown): boolean {
  return state === "active_personal" || state === "wiki_ready" || state === "skill_ready";
}

function matchesRuntimeLessonFilters(lesson: ExperienceLesson, options: RetrieveRuntimeLessonsOptions): boolean {
  const state = String((lesson as { state?: unknown }).state ?? "");
  const agents = options.agents ?? (options.agent ? [options.agent] : []);
  if (agents.length > 0 && !agents.some((agent) => lesson.applies_to_agents.includes(agent))) return false;

  if (options.systems?.length && !options.systems.some((system) => lesson.applies_to_systems.includes(system))) {
    return false;
  }

  if (options.tags?.length) {
    const tags = new Set([
      ...lesson.applies_to_systems,
      ...(((lesson as { tags?: unknown }).tags ?? []) as unknown[]).filter((tag): tag is string => typeof tag === "string"),
    ]);
    if (!options.tags.some((tag) => tags.has(tag))) return false;
  }

  if (options.portability?.length && !options.portability.includes(lesson.portability)) return false;
  if (options.scopes?.length && !options.scopes.includes(lesson.scope)) return false;
  if (options.states?.length && !options.states.includes(state)) return false;

  return true;
}

export function renderRuntimeLessonBlock(
  lessons: RuntimeLessonHit[],
  options: { maxBytes?: number } = {},
): string {
  if (lessons.length === 0) return "";
  const lines = [
    "## Relevant PB Experience (lower-authority personal lessons)",
    "Use these as lower-authority runtime guidance after stable wiki pages and promoted skills.",
    ...lessons.map((lesson) => {
      const systems = lesson.applies_to_systems.length > 0
        ? ` [${lesson.applies_to_systems.join(", ")}]`
        : "";
      return `- ${lesson.safe_claim}${systems}`;
    }),
  ];
  const text = lines.join("\n");
  const maxBytes = Math.max(0, Math.floor(options.maxBytes ?? 2 * 1024));
  if (utf8ByteLength(text) <= maxBytes) return text;
  const marker = "\n[... runtime lessons truncated by praxisbase ...]";
  return `${utf8SafeSlice(text, Math.max(0, maxBytes - utf8ByteLength(marker)))}${marker}`;
}

function runtimeLessonScore(lesson: ExperienceLesson, queryTerms: Set<string>, agent?: string): number {
  let score = lesson.confidence;
  if (agent && lesson.applies_to_agents.includes(agent)) score += 2;
  const haystack = terms([lesson.safe_claim, lesson.problem, lesson.trigger, lesson.action].join(" "));
  for (const term of queryTerms) {
    if (haystack.has(term)) score += 1;
  }
  for (const system of lesson.applies_to_systems) {
    if (queryTerms.has(system.toLowerCase())) score += 1.5;
  }
  const state = (lesson as { state?: unknown }).state;
  if (state === "active_personal") score += 2;
  if (state === "wiki_ready") score += 1;
  return score;
}

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3),
  );
}
