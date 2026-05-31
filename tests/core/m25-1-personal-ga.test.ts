import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLessonDispositions,
  buildPersonalGaReport,
  summarizePersonalSourceCoverage,
} from "@praxisbase/core";

function productionGaInput(overrides: Partial<Parameters<typeof buildPersonalGaReport>[0]> = {}): Parameters<typeof buildPersonalGaReport>[0] {
  return {
    mode: "production_ai",
    sourceCoverage: [{ agent: "openclaw", source_kind: "memory_file", configured: true, available: true, items: 3 }],
    lessons: [{ lesson_id: "lesson-1" }],
    dispositions: [
      {
        lesson_id: "lesson-1",
        state: "active_personal",
        decision: "active_personal_context",
        reason: "lesson_available_for_personal_runtime_context",
        source_refs: [],
        source_hashes: [],
        privacy_tier: "personal_only",
        portability: "agent_family",
        applies_to_agents: ["openclaw", "codex"],
        applies_to_systems: ["openclaw"],
      } as any,
    ],
    goldenValidation: { matched: 1, required: 1, missed: [] },
    leakageScan: { passed: true, findings: [] },
    cache: { hits: 1, misses: 0, writes: 0 },
    html: { index: "dist/index.html", review: "dist/review.html" },
    agentConsumption: [{ surface: "pb_context", available: true, authority: ["stable_pb_page", "active_personal_lesson"] }],
    ...overrides,
  };
}

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

test("Personal GA report treats sidecar source failures as warnings when PB core output is usable", () => {
  const report = buildPersonalGaReport(productionGaInput({
    sourceCoverage: [
      { agent: "openclaw", source_kind: "memory_file", configured: true, available: true, items: 3 },
      { agent: "agentmemory", source_kind: "sidecar_import", configured: true, available: false, items: 0, blocking: true },
      { agent: "gbrain", source_kind: "sidecar_import", configured: true, available: false, items: 0, blocking: true },
    ],
  }));

  assert.equal(report.production_ready, true);
  assert.deepEqual(report.blocking_reasons, []);
  assert.deepEqual(report.warnings, [
    "optional_sidecar_unavailable:agentmemory:sidecar_import",
    "optional_sidecar_unavailable:gbrain:sidecar_import",
  ]);
});

test("Personal GA report requires at least one PB-authoritative knowledge output", () => {
  const report = buildPersonalGaReport(productionGaInput({
    lessons: [{ lesson_id: "lesson-1" }],
    dispositions: [
      {
        lesson_id: "lesson-1",
        state: "wiki_ready",
        decision: "queued_for_next_run",
        reason: "lesson_ready_but_processing_limit_reached",
        blocking_reason: "proposal_or_processing_limit",
        source_refs: [],
        source_hashes: [],
        privacy_tier: "safe",
        portability: "universal",
        applies_to_agents: ["codex"],
        applies_to_systems: [],
      } as any,
    ],
    agentConsumption: [{ surface: "pb_context", available: false, authority: ["stable_pb_page", "active_personal_lesson"] }],
  }));

  assert.equal(report.production_ready, false);
  assert.ok(report.blocking_reasons.includes("no_personal_knowledge_output"));
  assert.ok(report.blocking_reasons.includes("agent_context_unavailable"));
});

test("Personal GA report does not let proposal queue limits block when a usable PB output exists", () => {
  const report = buildPersonalGaReport(productionGaInput({
    lessons: [{ lesson_id: "lesson-1" }, { lesson_id: "lesson-2" }],
    dispositions: [
      {
        lesson_id: "lesson-1",
        state: "active_personal",
        decision: "active_personal_context",
        reason: "lesson_available_for_personal_runtime_context",
        source_refs: [],
        source_hashes: [],
        privacy_tier: "personal_only",
        portability: "agent_family",
        applies_to_agents: ["openclaw"],
        applies_to_systems: ["openclaw"],
      } as any,
      {
        lesson_id: "lesson-2",
        state: "wiki_ready",
        decision: "queued_for_next_run",
        reason: "lesson_ready_but_processing_limit_reached",
        blocking_reason: "proposal_or_processing_limit",
        source_refs: [],
        source_hashes: [],
        privacy_tier: "safe",
        portability: "universal",
        applies_to_agents: ["codex"],
        applies_to_systems: [],
      } as any,
    ],
  }));

  assert.equal(report.production_ready, true);
  assert.equal(report.blocking_reasons.includes("proposal_or_processing_limit"), false);
});

test("Personal GA report warns on current-run privacy review without blocking usable personal output", () => {
  const report = buildPersonalGaReport(productionGaInput({
    lessons: [{ lesson_id: "usable" }, { lesson_id: "private-tail" }],
    dispositions: [
      {
        lesson_id: "usable",
        state: "active_personal",
        decision: "active_personal_context",
        reason: "lesson_available_for_personal_runtime_context",
        source_refs: [],
        source_hashes: [],
        privacy_tier: "personal_only",
        portability: "agent_family",
        applies_to_agents: ["openclaw"],
        applies_to_systems: ["openclaw"],
      } as any,
      {
        lesson_id: "private-tail",
        state: "human_required",
        decision: "blocked_by_privacy",
        reason: "privacy_abstraction_or_review_required",
        blocking_reason: "privacy_abstraction_required",
        source_refs: [],
        source_hashes: [],
        privacy_tier: "human_required",
        portability: "private_instance",
        applies_to_agents: ["openclaw"],
        applies_to_systems: ["remote"],
      } as any,
    ],
  }));

  assert.equal(report.production_ready, true);
  assert.equal(report.blocking_reasons.includes("privacy_hard_blocker"), false);
  assert.ok(report.warnings.includes("privacy_review_required:private-tail"));
});

test("Personal GA report blocks current-run rejected private material", () => {
  const report = buildPersonalGaReport(productionGaInput({
    lessons: [{ lesson_id: "usable" }, { lesson_id: "secret" }],
    dispositions: [
      {
        lesson_id: "usable",
        state: "active_personal",
        decision: "active_personal_context",
        reason: "lesson_available_for_personal_runtime_context",
        source_refs: [],
        source_hashes: [],
        privacy_tier: "personal_only",
        portability: "agent_family",
        applies_to_agents: ["openclaw"],
        applies_to_systems: ["openclaw"],
      } as any,
      {
        lesson_id: "secret",
        state: "rejected",
        decision: "blocked_by_privacy",
        reason: "privacy_abstraction_or_review_required",
        blocking_reason: "privacy_abstraction_required",
        source_refs: [],
        source_hashes: [],
        privacy_tier: "reject",
        portability: "private_instance",
        applies_to_agents: ["openclaw"],
        applies_to_systems: ["remote"],
      } as any,
    ],
  }));

  assert.equal(report.production_ready, false);
  assert.ok(report.blocking_reasons.includes("privacy_hard_blocker"));
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
    "agent_context_unavailable",
    "lesson_missing_disposition:lesson-1",
    "no_personal_knowledge_output",
    "required_source_unavailable:codex:session",
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

test("eight wiki-ready lessons with proposal limit three produce three materialized and five queued dispositions", () => {
  const lessons = Array.from({ length: 8 }, (_, i) => ({
    lesson_id: `wiki-${i + 1}`,
    state: "wiki_ready",
    privacy_tier: "safe",
    portability: "universal",
    applies_to_agents: ["codex"],
    applies_to_systems: [],
    source_refs: [`s${i + 1}`],
    source_hashes: [`h${i + 1}`],
  }));

  const materializedWikiTargets = new Map<string, { target: string; action: "create" | "update" | "merge" | "promote" }>([
    ["wiki-1", { target: "kb/procedures/lesson-1.md", action: "create" }],
    ["wiki-2", { target: "kb/procedures/lesson-2.md", action: "create" }],
    ["wiki-3", { target: "kb/procedures/lesson-3.md", action: "create" }],
  ]);
  const queuedLessonIds = new Set(["wiki-4", "wiki-5", "wiki-6", "wiki-7", "wiki-8"]);

  const dispositions = buildLessonDispositions(lessons, {
    materializedWikiTargets,
    materializedSkillTargets: new Map(),
    queuedLessonIds,
    delayedByBudgetIds: new Set(),
    privacyBlockedIds: new Set(),
  });

  assert.equal(dispositions.length, 8, "all eight lessons must receive a disposition");

  const materialized = dispositions.filter((d) => d.decision === "promoted_to_wiki" || d.decision === "merged_into_existing_page");
  const queued = dispositions.filter((d) => d.decision === "queued_for_next_run");

  assert.equal(materialized.length, 3, "three lessons must be materialized as wiki proposals");
  assert.equal(queued.length, 5, "five lessons must be queued for next run");

  for (const d of queued) {
    assert.equal(d.blocking_reason, "proposal_or_processing_limit");
    assert.equal(d.reason, "lesson_ready_but_processing_limit_reached");
  }

  const lessonIds = dispositions.map((d) => d.lesson_id).sort();
  assert.deepEqual(lessonIds, lessons.map((l) => l.lesson_id).sort(), "every lesson appears exactly once");
});

test("eight wiki-ready lessons with three materialized and two budget-delayed produce correct mixed dispositions", () => {
  const lessons = Array.from({ length: 8 }, (_, i) => ({
    lesson_id: `wiki-${i + 1}`,
    state: "wiki_ready",
    privacy_tier: "safe",
    portability: "universal",
    applies_to_agents: ["codex"],
    applies_to_systems: [],
    source_refs: [`s${i + 1}`],
    source_hashes: [`h${i + 1}`],
  }));

  const materializedWikiTargets = new Map<string, { target: string; action: "create" | "update" | "merge" | "promote" }>([
    ["wiki-1", { target: "kb/procedures/lesson-1.md", action: "create" }],
    ["wiki-2", { target: "kb/procedures/lesson-2.md", action: "create" }],
    ["wiki-3", { target: "kb/procedures/lesson-3.md", action: "create" }],
  ]);
  const delayedByBudgetIds = new Set(["wiki-6", "wiki-7"]);
  const queuedLessonIds = new Set(["wiki-4", "wiki-5", "wiki-8"]);

  const dispositions = buildLessonDispositions(lessons, {
    materializedWikiTargets,
    materializedSkillTargets: new Map(),
    queuedLessonIds,
    delayedByBudgetIds,
    privacyBlockedIds: new Set(),
  });

  assert.equal(dispositions.length, 8);

  const byDecision = new Map<string, number>();
  for (const d of dispositions) byDecision.set(d.decision, (byDecision.get(d.decision) ?? 0) + 1);

  assert.equal(byDecision.get("promoted_to_wiki"), 3);
  assert.equal(byDecision.get("delayed_by_budget"), 2);
  assert.equal(byDecision.get("queued_for_next_run"), 3);

  const lessonIds = dispositions.map((d) => d.lesson_id).sort();
  assert.deepEqual(lessonIds, lessons.map((l) => l.lesson_id).sort(), "every lesson appears exactly once");
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
