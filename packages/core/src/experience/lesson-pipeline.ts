import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import type { AiJsonClient } from "../ai/client.js";
import { buildWikiEvidenceFromLessons } from "../wiki/lesson-compiler.js";
import { abstractLessonPrivacy, redactEvidenceSpansForAi } from "./lesson-privacy.js";
import {
  classifyLessonState,
  dedupeLessons,
  loadLessonStateCache,
  lessonStableKey,
  saveLessonStateCache,
  upsertLessonToCache,
  type ClassifiedLesson,
} from "./lesson-cache.js";
import { extractDeterministicLessons } from "./lesson-deterministic.js";
import { extractLessonsWithAi } from "./lesson-extractor.js";
import { planLessonSpans } from "./lesson-planner.js";
import { buildSourceInventory } from "./source-inventory.js";

export interface RunLessonPipelineInput {
  sourcePath: string;
  agent: "codex" | "openclaw" | "claude-code" | "opencode" | "hermes" | "openhuman" | "generic";
  scope: "personal" | "project" | "team" | "global" | "org";
  origin?: "local" | "trusted_personal_remote" | "team_git" | "external";
  authorityMode?: "personal-local" | "team-git";
  now?: string;
  maxSpans?: number;
  aiClient?: AiJsonClient;
  aiCacheIdentity?: string;
  cacheRoot?: string;
}

export interface LessonPipelineReport {
  source_items: number;
  selected_spans: number;
  deterministic_lessons: number;
  ai_lessons: number;
  lessons: ClassifiedLesson[];
  cache_upserted: number;
  counts_by_state: Record<string, number>;
  privacy: {
    abstracted: number;
    human_required: number;
    rejected: number;
  };
  wiki_evidence: number;
}

export async function runLessonPipeline(root: string, input: RunLessonPipelineInput): Promise<LessonPipelineReport> {
  const now = input.now ?? new Date().toISOString();
  const inventory = await buildSourceInventory(root, {
    agent: input.agent,
    path: input.sourcePath,
    scope: input.scope,
    origin: input.origin ?? "local",
  });
  const spans = planLessonSpans(inventory, { maxSpans: input.maxSpans ?? 50 });
  const deterministicLessons = extractDeterministicLessons(spans, {
    now,
    scope: input.scope,
    agent: input.agent,
  });
  const aiSpans = input.authorityMode === "team-git" || input.scope === "team"
    ? redactEvidenceSpansForAi(spans).spans
    : spans;
  const aiLessons = input.aiClient
    ? await extractLessonsWithAi(aiSpans, {
      client: input.aiClient,
      now,
      scope: input.scope,
      agent: input.agent,
      ...(input.aiCacheIdentity ? {
        cache: {
          root,
          identity: input.aiCacheIdentity,
        },
      } : {}),
    })
    : [];
  const mode = input.authorityMode ?? (input.scope === "team" || input.origin === "team_git" ? "team-git" : "personal-local");
  let abstracted = 0;
  const privacyAdjusted = [...deterministicLessons, ...aiLessons].map((lesson) => {
    const result = abstractLessonPrivacy(lesson, { mode });
    if (result.changed) abstracted++;
    return result.lesson;
  });
  const classified = dedupeLessons(privacyAdjusted).map((lesson) => ({
    ...lesson,
    state: classifyLessonState(lesson, {
      mode,
      sourceCount: lesson.source_refs.length,
      verified: Boolean(lesson.verification),
    }),
  }));
  const cacheRoot = input.cacheRoot ?? root;
  let cacheRecords = await loadLessonStateCache(cacheRoot);
  const upsertedKeys = new Set<string>();
  for (const lesson of classified) {
    const stableKey = lessonStableKey(lesson);
    cacheRecords = upsertLessonToCache(cacheRecords, lesson, now, {
      mode,
      sourceCount: lesson.source_refs.length,
      agentCount: lesson.applies_to_agents.length,
      verified: Boolean(lesson.verification),
    });
    upsertedKeys.add(stableKey);
  }
  if (classified.length > 0) {
    await saveLessonStateCache(cacheRoot, cacheRecords);
  }
  const lessons = cacheRecords
    .filter((record) => upsertedKeys.has(record.stable_key))
    .map((record) => ({
      ...record.lesson,
      state: record.state,
    }));
  const counts_by_state = lessons.reduce<Record<string, number>>((counts, lesson) => {
    counts[lesson.state] = (counts[lesson.state] ?? 0) + 1;
    return counts;
  }, {});
  return {
    source_items: inventory.length,
    selected_spans: spans.length,
    deterministic_lessons: deterministicLessons.length,
    ai_lessons: aiLessons.length,
    lessons,
    cache_upserted: upsertedKeys.size,
    counts_by_state,
    privacy: {
      abstracted,
      human_required: lessons.filter((lesson) => lesson.privacy_tier === "human_required").length,
      rejected: lessons.filter((lesson) => lesson.privacy_tier === "reject").length,
    },
    wiki_evidence: buildWikiEvidenceFromLessons(lessons).length,
  };
}

export interface GoldenValidationResult {
  fixture: string;
  matches: number;
  expected_targets: string[];
  matched_targets: string[];
  missing_targets: string[];
  privateLeakCount: number;
  lessons_with_span_provenance: number;
  lesson_claims: string[];
}

const GOLDEN_PRIVATE_PATTERNS = [
  /root@/i,
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/,
  /\/Users\/[^\s]+/,
  /api[_-]?key\s*[:=]/i,
  /\bU[A-Z0-9]{8,}\b/,
];

export async function runM25GoldenValidation(now = "2026-05-29T00:00:00.000Z"): Promise<GoldenValidationResult[]> {
  const fixtures = [
    {
      fixture: "openclaw-local",
      agent: "openclaw" as const,
      expectedTargets: [
        "ack_before_slow_work",
        "fail_closed_honesty",
        "hide_internal_tool_failures",
        "memory_truncation",
        "rate_limit_model_failover",
      ],
      text: [
        "# MEMORY",
        "## Runtime",
        "- Need tools/network/dispatch or slow tasks: send a short ACK first.",
        "- Fail-closed delegate guard must not pretend success.",
        "- Internal tool failure should not be exposed to users.",
        "## Memory",
        "- MEMORY.md above 12000 chars can be truncated during injection.",
        "## Operations",
        "- Model rate limit should use fallback model failover.",
      ].join("\n"),
    },
    {
      fixture: "openclaw-remote",
      agent: "openclaw" as const,
      expectedTargets: [
        "target_machine_confirmation",
        "self_test_after_changes",
        "cache_busting",
        "case_insensitive_db_collation",
        "rate_limit_model_failover",
        "slack_raw_user_id",
      ],
      text: [
        "# MEMORY",
        "## Delivery",
        "- Confirm target machine before restart.",
        "- Self-test after changes before asking the user to verify.",
        "- Frontend cache bust with timestamp query when stale assets appear.",
        "- Database queries should use COLLATE NOCASE for case-insensitive lookup.",
        "- Use failover when rate-limit happens.",
        "- Do not expose raw Slack user id U1234567890 in team notes.",
      ].join("\n"),
    },
  ];

  const results: GoldenValidationResult[] = [];
  for (const fixture of fixtures) {
    const root = await mkdtemp(join(tmpdir(), "pb-m25-golden-"));
    const sourceDir = join(root, fixture.fixture);
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, "MEMORY.md"), fixture.text, "utf8");
    const report = await runLessonPipeline(root, {
      sourcePath: sourceDir,
      agent: fixture.agent,
      scope: "personal",
      authorityMode: "team-git",
      now,
      maxSpans: 20,
    });
    const rendered = report.lessons.map((lesson) => lesson.safe_claim).join("\n");
    const matchedTargets = fixture.expectedTargets.filter((target) =>
      report.lessons.some((lesson) => lesson.lesson_id.includes(target)),
    );
    results.push({
      fixture: fixture.fixture,
      matches: matchedTargets.length,
      expected_targets: fixture.expectedTargets,
      matched_targets: matchedTargets,
      missing_targets: fixture.expectedTargets.filter((target) => !matchedTargets.includes(target)),
      privateLeakCount: GOLDEN_PRIVATE_PATTERNS.filter((pattern) => pattern.test(rendered)).length,
      lessons_with_span_provenance: report.lessons.filter((lesson) =>
        lesson.evidence_spans.length > 0 &&
        lesson.evidence_spans.every((span) => span.source_ref && span.source_hash && span.span_id),
      ).length,
      lesson_claims: report.lessons.map((lesson) => lesson.safe_claim),
    });
  }
  return results;
}
