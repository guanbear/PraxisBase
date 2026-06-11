export type ContextAuthority =
  | "stable_pb_page"
  | "promoted_skill"
  | "active_personal_lesson"
  | "gbrain_sidecar"
  | "agentmemory_sidecar"
  | "legacy_distilled"
  | "raw_audit";

const AUTHORITY_RANK: Record<ContextAuthority, number> = {
  stable_pb_page: 0,
  promoted_skill: 1,
  active_personal_lesson: 2,
  gbrain_sidecar: 3,
  agentmemory_sidecar: 4,
  legacy_distilled: 5,
  raw_audit: 6,
};

export function rankContextAuthority<T extends { authority: ContextAuthority }>(items: T[]): T[] {
  return [...items].sort((a, b) => AUTHORITY_RANK[a.authority] - AUTHORITY_RANK[b.authority]);
}

export function chooseWikiSemanticInput(input: {
  source_ref?: string;
  lesson_clusters?: Array<{ state: string; [key: string]: unknown }>;
  legacy_distilled?: unknown[];
  degraded?: boolean;
}): { kind: "lesson_cluster" | "legacy_distilled" | "none"; reason: string } {
  if (input.lesson_clusters?.some((cluster) => cluster.state === "wiki_ready")) {
    return { kind: "lesson_cluster", reason: "wiki_ready_lesson_cluster" };
  }
  if (input.degraded && input.legacy_distilled?.length) {
    return { kind: "legacy_distilled", reason: "explicit_degraded_mode" };
  }
  return { kind: "none", reason: "no_authoritative_semantic_input" };
}

export function canSkillSignalPromote(input: {
  skill_ready_lessons?: unknown[];
  stable_wiki_pages?: unknown[];
  legacy_distilled?: unknown[];
  sidecar_hits?: unknown[];
}): { ok: boolean; reason: string } {
  if (input.skill_ready_lessons?.length || input.stable_wiki_pages?.length) {
    return { ok: true, reason: "lesson-state authority present" };
  }
  return { ok: false, reason: "missing lesson-state authority" };
}
