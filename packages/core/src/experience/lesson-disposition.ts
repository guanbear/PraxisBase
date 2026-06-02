export type LessonDispositionDecision =
  | "promoted_to_wiki"
  | "merged_into_existing_page"
  | "promoted_to_skill"
  | "active_personal_context"
  | "needs_human"
  | "rejected_low_signal"
  | "delayed_by_budget"
  | "blocked_by_privacy"
  | "queued_for_next_run";

export interface LessonDispositionLesson {
  lesson_id: string;
  state?: string;
  privacy_tier?: string;
  portability?: string;
  applies_to_agents?: string[];
  applies_to_systems?: string[];
  source_refs?: string[];
  source_hashes?: string[];
}

export interface MaterializedLessonTarget {
  target: string;
  action?: "create" | "update" | "merge" | "promote";
}

export interface BuildLessonDispositionsOptions {
  materializedWikiTargets: Map<string, string | MaterializedLessonTarget>;
  materializedSkillTargets: Map<string, string | MaterializedLessonTarget>;
  queuedLessonIds: Set<string>;
  delayedByBudgetIds: Set<string>;
  privacyBlockedIds: Set<string>;
  rejectedLowSignalIds?: Set<string>;
}

export interface LessonDisposition {
  lesson_id: string;
  state: string;
  decision: LessonDispositionDecision;
  target?: string;
  reason: string;
  blocking_reason?: string;
  source_refs: string[];
  source_hashes: string[];
  privacy_tier: string;
  portability: string;
  applies_to_agents: string[];
  applies_to_systems: string[];
}

function targetValue(target: string | MaterializedLessonTarget | undefined): string | undefined {
  return typeof target === "string" ? target : target?.target;
}

function wikiDecision(target: string | MaterializedLessonTarget): LessonDispositionDecision {
  return typeof target !== "string" && target.action === "merge"
    ? "merged_into_existing_page"
    : "promoted_to_wiki";
}

export function buildLessonDispositions(
  lessons: LessonDispositionLesson[],
  options: BuildLessonDispositionsOptions,
): LessonDisposition[] {
  const seen = new Set<string>();
  const dispositions: LessonDisposition[] = [];

  for (const lesson of lessons) {
    if (seen.has(lesson.lesson_id)) continue;
    seen.add(lesson.lesson_id);

    const state = lesson.state ?? "candidate";
    let decision: LessonDispositionDecision;
    let target: string | undefined;
    let reason = "lesson_requires_human_review";
    let blockingReason: string | undefined;

    if (options.delayedByBudgetIds.has(lesson.lesson_id)) {
      decision = "delayed_by_budget";
      reason = "uncached_ai_work_delayed_by_budget";
      blockingReason = "ai_budget_exhausted";
    } else if (options.privacyBlockedIds.has(lesson.lesson_id) || lesson.privacy_tier === "human_required" || lesson.privacy_tier === "reject") {
      decision = "blocked_by_privacy";
      reason = "privacy_abstraction_or_review_required";
      blockingReason = "privacy_abstraction_required";
    } else if (options.rejectedLowSignalIds?.has(lesson.lesson_id) || state === "rejected") {
      decision = "rejected_low_signal";
      reason = "lesson_rejected_or_low_signal";
    } else if (options.queuedLessonIds.has(lesson.lesson_id)) {
      decision = "queued_for_next_run";
      reason = "lesson_ready_but_processing_limit_reached";
      blockingReason = "proposal_or_processing_limit";
    } else if (options.materializedWikiTargets.has(lesson.lesson_id)) {
      const materialized = options.materializedWikiTargets.get(lesson.lesson_id)!;
      decision = wikiDecision(materialized);
      target = targetValue(materialized);
      reason = decision === "merged_into_existing_page"
        ? "lesson_merged_into_existing_wiki_page"
        : "lesson_materialized_as_wiki_output";
    } else if (options.materializedSkillTargets.has(lesson.lesson_id)) {
      const materialized = options.materializedSkillTargets.get(lesson.lesson_id)!;
      decision = "promoted_to_skill";
      target = targetValue(materialized);
      reason = "lesson_materialized_as_skill_output";
    } else if (state === "active_personal") {
      decision = "active_personal_context";
      reason = "lesson_available_for_personal_runtime_context";
    } else {
      decision = "needs_human";
    }

    dispositions.push({
      lesson_id: lesson.lesson_id,
      state,
      decision,
      target,
      reason,
      blocking_reason: blockingReason,
      source_refs: lesson.source_refs ?? [],
      source_hashes: lesson.source_hashes ?? [],
      privacy_tier: lesson.privacy_tier ?? "human_required",
      portability: lesson.portability ?? "project",
      applies_to_agents: lesson.applies_to_agents ?? [],
      applies_to_systems: lesson.applies_to_systems ?? [],
    });
  }

  return dispositions;
}
