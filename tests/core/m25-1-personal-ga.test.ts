import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLessonDispositions,
  buildPersonalGaReport,
  summarizePersonalSourceCoverage,
} from "@praxisbase/core";

test("Personal GA report is not production ready when AI is disabled", () => {
  const report = buildPersonalGaReport({
    mode: "degraded_no_ai",
    sourceCoverage: [{ agent: "openclaw", source_kind: "memory_file", configured: true, available: true, items: 1 }],
    lessons: [],
    dispositions: [],
    goldenValidation: { matched: 0, required: 0, missed: [] },
    leakageScan: { passed: true, findings: [] },
    cache: { hits: 0, misses: 0, writes: 0 },
    html: { index: "dist/index.html", review: "dist/review.html" },
    agentConsumption: [],
  });

  assert.equal(report.production_ready, false);
  assert.ok(report.blocking_reasons.includes("ai_lesson_extraction_disabled"));
});

test("Personal GA report blocks missing configured sources and missing dispositions", () => {
  const report = buildPersonalGaReport({
    mode: "production_ai",
    sourceCoverage: [{ agent: "codex", source_kind: "session", configured: true, available: false, items: 0 }],
    lessons: [{ lesson_id: "lesson-1" }],
    dispositions: [],
    goldenValidation: { matched: 1, required: 1, missed: [] },
    leakageScan: { passed: true, findings: [] },
    cache: { hits: 2, misses: 0, writes: 0 },
    html: {},
    agentConsumption: [],
  });

  assert.equal(report.production_ready, false);
  assert.deepEqual(report.blocking_reasons, [
    "lesson_missing_disposition:lesson-1",
    "source_unavailable:codex:session",
  ]);
});

test("every lesson receives one disposition", () => {
  const lessons = [
    { lesson_id: "l1", state: "wiki_ready", privacy_tier: "safe", portability: "universal", applies_to_agents: ["codex"], applies_to_systems: [], source_refs: ["s"], source_hashes: ["h"] },
    { lesson_id: "l2", state: "active_personal", privacy_tier: "personal_only", portability: "environment", applies_to_agents: ["openclaw"], applies_to_systems: ["remote"], source_refs: ["s2"], source_hashes: ["h2"] },
    { lesson_id: "l3", state: "candidate", privacy_tier: "safe", portability: "project", applies_to_agents: ["codex"], applies_to_systems: ["repo"], source_refs: ["s3"], source_hashes: ["h3"] },
  ] as any[];

  const dispositions = buildLessonDispositions(lessons, {
    materializedWikiTargets: new Map([["l1", { target: "kb/procedures/example.md", action: "create" }]]),
    materializedSkillTargets: new Map(),
    queuedLessonIds: new Set(),
    delayedByBudgetIds: new Set(),
    privacyBlockedIds: new Set(),
  });

  assert.deepEqual(dispositions.map((item) => item.lesson_id).sort(), ["l1", "l2", "l3"]);
  assert.equal(dispositions[0]!.decision, "promoted_to_wiki");
  assert.equal(dispositions[0]!.target, "kb/procedures/example.md");
  assert.equal(dispositions[1]!.decision, "active_personal_context");
  assert.equal(dispositions[2]!.decision, "needs_human");
});

test("lesson disposition gives priority to blockers and explicit queues", () => {
  const lessons = [
    { lesson_id: "budget", state: "wiki_ready", privacy_tier: "safe", portability: "universal", applies_to_agents: [], applies_to_systems: [], source_refs: ["s1"], source_hashes: ["h1"] },
    { lesson_id: "privacy", state: "skill_ready", privacy_tier: "human_required", portability: "private_instance", applies_to_agents: [], applies_to_systems: [], source_refs: ["s2"], source_hashes: ["h2"] },
    { lesson_id: "queued", state: "wiki_ready", privacy_tier: "safe", portability: "universal", applies_to_agents: [], applies_to_systems: [], source_refs: ["s3"], source_hashes: ["h3"] },
  ] as any[];

  const dispositions = buildLessonDispositions(lessons, {
    materializedWikiTargets: new Map(),
    materializedSkillTargets: new Map(),
    queuedLessonIds: new Set(["queued"]),
    delayedByBudgetIds: new Set(["budget"]),
    privacyBlockedIds: new Set(["privacy"]),
  });

  assert.deepEqual(
    dispositions.map((item) => [item.lesson_id, item.decision, item.blocking_reason]),
    [
      ["budget", "delayed_by_budget", "ai_budget_exhausted"],
      ["privacy", "blocked_by_privacy", "privacy_abstraction_required"],
      ["queued", "queued_for_next_run", "proposal_or_processing_limit"],
    ],
  );
});

test("summarizes personal source coverage by agent and source kind", () => {
  const summary = summarizePersonalSourceCoverage(
    [
      { agent: "openclaw", source_kind: "memory_file", origin: "local", scope_hint: "personal", content_spans: [{ span_id: "m1" }] },
      { agent: "openclaw", source_kind: "sqlite_memory", origin: "local", scope_hint: "personal", content_spans: [] },
      { agent: "codex", source_kind: "session", origin: "local", scope_hint: "personal", content_spans: [{ span_id: "c1" }, { span_id: "c2" }] },
    ] as any[],
    [
      { agent: "openclaw", source_kind: "memory_file", configured: true },
      { agent: "openclaw", source_kind: "sqlite_memory", configured: true },
      { agent: "codex", source_kind: "session", configured: true },
      { agent: "opencode", source_kind: "session", configured: false },
      { agent: "claude-code", source_kind: "session", configured: true },
    ],
  );

  assert.deepEqual(summary.map((item) => `${item.agent}:${item.source_kind}:${item.available}:${item.items}`).sort(), [
    "claude-code:session:false:0",
    "codex:session:true:1",
    "openclaw:memory_file:true:1",
    "openclaw:sqlite_memory:true:1",
    "opencode:session:false:0",
  ]);
  assert.equal(summary.find((item) => item.agent === "claude-code")?.blocking, true);
  assert.equal(summary.find((item) => item.agent === "opencode")?.blocking, false);
  assert.equal(summary.find((item) => item.agent === "codex")?.content_spans, 2);
});
