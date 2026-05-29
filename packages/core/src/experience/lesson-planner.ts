import type { EvidenceSpan, SourceInventoryItem } from "./lesson-model.js";

export const LESSON_PLANNER_IDENTITY = "m25-lesson-planner-v1";

const SOURCE_KIND_PRIORITY: Record<string, number> = {
  memory_file: 100,
  tools_file: 90,
  skill: 80,
  report: 70,
  session: 50,
  generic_file: 30,
  sqlite_memory: 100,
  sidecar_import: 10,
};

const AUTHORITY_HINT_BONUS: Record<string, number> = {
  agent_native_memory: 50,
  user_authored: 40,
  generated_report: 10,
  session_transcript: 0,
  external_sidecar: -10,
};

const EXPLICIT_TERMS = [
  "remember",
  "next time",
  "must",
  "avoid",
  "fail",
  "verified",
  "ack",
  "dispatch",
  "truncat",
  "collate",
  "cache",
  "do not",
  "always",
  "never",
  "fix",
  "confirm",
  "check",
  "verify",
  "ensure",
  "required",
  "important",
  "critical",
  "lesson",
  "pitfall",
  "preference",
];

export interface PlanLessonSpansOptions {
  maxSpans?: number;
}

export function scoreEvidenceSpan(
  item: SourceInventoryItem,
  span: EvidenceSpan,
): number {
  let score = 0;

  score += SOURCE_KIND_PRIORITY[item.source_kind] ?? 20;

  score += AUTHORITY_HINT_BONUS[item.authority_hint] ?? 0;

  const lowerExcerpt = span.excerpt.toLowerCase();
  for (const term of EXPLICIT_TERMS) {
    if (lowerExcerpt.includes(term)) {
      score += 5;
    }
  }

  const lowerHeadings = span.heading_path.join(" ").toLowerCase();
  if (
    lowerHeadings.includes("memory") ||
    lowerHeadings.includes("lesson") ||
    lowerHeadings.includes("pitfall") ||
    lowerHeadings.includes("preference") ||
    lowerHeadings.includes("ux") ||
    lowerHeadings.includes("running") ||
    lowerHeadings.includes("routing") ||
    lowerHeadings.includes("deploy") ||
    lowerHeadings.includes("infra")
  ) {
    score += 10;
  }

  return score;
}

export function planLessonSpans(
  items: SourceInventoryItem[],
  options?: PlanLessonSpansOptions,
): EvidenceSpan[] {
  const maxSpans = options?.maxSpans ?? 50;
  const repetitionCounts = new Map<string, number>();
  for (const item of items) {
    for (const span of item.content_spans) {
      const key = repetitionKey(span.excerpt);
      repetitionCounts.set(key, (repetitionCounts.get(key) ?? 0) + 1);
    }
  }

  interface ScoredSpan {
    item: SourceInventoryItem;
    span: EvidenceSpan;
    score: number;
    isMemoryKind: boolean;
  }

  const scored: ScoredSpan[] = [];

  for (const item of items) {
    for (const span of item.content_spans) {
      const repeated = repetitionCounts.get(repetitionKey(span.excerpt)) ?? 1;
      const score = scoreEvidenceSpan(item, span) + Math.min(30, (repeated - 1) * 20);
      scored.push({
        item,
        span,
        score,
        isMemoryKind:
          item.source_kind === "memory_file" ||
          item.source_kind === "tools_file" ||
          item.source_kind === "sqlite_memory" ||
          item.authority_hint === "agent_native_memory" ||
          item.authority_hint === "user_authored",
      });
    }
  }

  scored.sort((a, b) => {
    if (a.isMemoryKind !== b.isMemoryKind && Math.abs(a.score - b.score) <= 10) {
      return a.isMemoryKind ? -1 : 1;
    }
    return b.score - a.score;
  });

  const memorySpans = scored.filter((span) => span.isMemoryKind);
  const selected = new Map<string, ScoredSpan>();
  const memoryReserve = Math.min(memorySpans.length, Math.ceil(maxSpans * 0.4), maxSpans);
  for (const span of memorySpans.slice(0, memoryReserve)) {
    selected.set(span.span.span_id, span);
  }

  for (const span of scored) {
    if (selected.size >= maxSpans) break;
    selected.set(span.span.span_id, span);
  }

  return Array.from(selected.values())
    .sort((a, b) => scored.indexOf(a) - scored.indexOf(b))
    .slice(0, maxSpans)
    .map((s) => s.span);
}

function repetitionKey(excerpt: string): string {
  return excerpt
    .toLowerCase()
    .replace(/[0-9a-f]{8,}/g, "")
    .replace(/\b\d+\b/g, "")
    .replace(/[^a-z\u4e00-\u9fff]+/g, " ")
    .trim();
}
