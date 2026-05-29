import { computeHash } from "../protocol/id.js";
import type { ExperienceLesson } from "./lesson-model.js";

export type LessonState =
  | "candidate"
  | "active_personal"
  | "wiki_ready"
  | "skill_ready"
  | "human_required"
  | "forgotten"
  | "rejected";

export interface ClassifiedLesson extends ExperienceLesson {
  state: LessonState;
}

export interface ClassifyLessonStateOptions {
  mode?: "personal-local" | "team-git";
  sourceCount?: number;
  verified?: boolean;
  userState?: "active" | "forgotten" | "rejected";
}

const STATE_STRENGTH: Record<LessonState, number> = {
  wiki_ready: 7,
  skill_ready: 6,
  active_personal: 5,
  candidate: 4,
  human_required: 3,
  forgotten: 2,
  rejected: 1,
};

export function classifyLessonState(
  lesson: ExperienceLesson,
  options: ClassifyLessonStateOptions = {},
): LessonState {
  if (options.userState === "forgotten") return "forgotten";
  if (options.userState === "rejected") return "rejected";
  if (lesson.privacy_tier === "reject") return "rejected";
  if (lesson.privacy_tier === "human_required") return "human_required";

  const mode = options.mode ?? "personal-local";
  const sourceCount = options.sourceCount ?? lesson.source_refs?.length ?? 1;
  const privacyAllowsPromotion =
    lesson.privacy_tier === "safe" ||
    (mode === "team-git" && lesson.privacy_tier === "team_allowed");
  if (!privacyAllowsPromotion) return "candidate";

  const skillReady =
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
    if (!current || compareLessonStrength(lesson, current) < 0) {
      byKey.set(key, lesson);
    }
  }
  return [...byKey.values()];
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
      lesson.state === "candidate",
    )
    .sort((a, b) => {
      const stateCompare = runtimeRank(a.state) - runtimeRank(b.state);
      return stateCompare || b.confidence - a.confidence;
    })
    .slice(0, 20);
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
  if (state === "candidate") return 2;
  return 3;
}
