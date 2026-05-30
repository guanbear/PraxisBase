import { makeId } from "../protocol/id.js";
import type { ExperienceLesson } from "../experience/lesson-model.js";
import { lessonStableKey } from "../experience/lesson-cache.js";
import {
  WikiEvidenceItemSchema,
  type WikiEvidenceItem,
} from "./curation-model.js";

type WikiEvidenceLesson = ExperienceLesson & { state?: string };

function isWikiEvidenceReady(lesson: WikiEvidenceLesson): boolean {
  return lesson.state === "wiki_ready" || lesson.state === "skill_ready";
}

export function buildWikiEvidenceFromLessons(lessons: WikiEvidenceLesson[]): WikiEvidenceItem[] {
  return lessons
    .filter((lesson) =>
      isWikiEvidenceReady(lesson) &&
      (lesson.privacy_tier === "safe" || lesson.privacy_tier === "team_allowed"),
    )
    .map((lesson) => WikiEvidenceItemSchema.parse({
      id: makeId("wiki-evidence-lesson", `${lesson.lesson_id}:${lessonStableKey(lesson)}`),
      kind: "distilled_experience",
      source_ref: lesson.source_refs[0],
      source_hash: lesson.source_hashes[0],
      agent: lesson.applies_to_agents.includes("openclaw")
        ? "openclaw"
        : lesson.applies_to_agents.includes("codex")
          ? "codex"
          : lesson.applies_to_agents.includes("claude-code")
            ? "claude-code"
            : lesson.applies_to_agents.includes("opencode")
              ? "opencode"
              : "generic",
      scope: lesson.scope,
      title: lesson.safe_claim,
      summary: `${lesson.problem} ${lesson.action}`.trim(),
      problem: lesson.problem,
      context: lesson.trigger,
      actions: [lesson.action],
      failed_attempts: lesson.negative_case ? [lesson.negative_case] : [],
      outcome: "success",
      verification: lesson.verification ? [lesson.verification] : [],
      reusable_lessons: [
        lesson.safe_claim,
        ...(lesson.negative_case ? [lesson.negative_case] : []),
      ],
      portability: lesson.portability,
      applies_to_agents: lesson.applies_to_agents,
      applies_to_systems: lesson.applies_to_systems,
      evidence_spans: lesson.evidence_spans.map((span) => ({
        source_ref: span.source_ref,
        source_hash: span.source_hash,
        span_id: span.span_id,
        line_start: span.line_start,
        line_end: span.line_end,
        heading_path: span.heading_path,
        excerpt: span.excerpt,
      })),
      signatures: [
        ...lesson.applies_to_systems.map((system) => `system:${system}`),
        `portability:${lesson.portability}`,
        `lesson:${lessonStableKey(lesson)}`,
      ],
      suggested_wiki_kind: lesson.negative_case ? "pitfall" : "procedure",
      privacy_verdict: lesson.privacy_tier,
      created_at: lesson.created_at,
    }));
}
