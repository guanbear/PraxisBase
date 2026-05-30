# M25.1 Personal GA Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PraxisBase personal mode prove a complete daily loop from local/remote OpenClaw and Codex raw evidence to safe wiki/skill/runtime knowledge that humans can review and agents can use.

**Architecture:** Extend the existing M25 lesson pipeline with a Personal GA report, source normalization, Codex session pre-summary, production AI mode semantics, complete lesson disposition, wiki completeness, privacy triage reuse, HTML experience visibility, and authority-labeled agent consumption. Keep PB as the synthesis/governance layer; keep GBrain and AgentMemory as retrieval/source/sink backends only.

**Tech Stack:** TypeScript, Node test runner, Zod schemas, existing `packages/core/src/experience`, `packages/core/src/wiki`, CLI, HTML site renderer, and report/cache paths under `.praxisbase`.

---

## File Map

Expected created files:

- `packages/core/src/experience/personal-ga.ts`: Personal GA report construction, readiness decisions, blocking reasons, and report schema helpers.
- `packages/core/src/experience/lesson-disposition.ts`: disposition routing for lesson states, wiki/skill/runtime targets, budget skips, privacy blocks, and queued lessons.
- `packages/core/src/experience/session-presummary.ts`: Codex-style session event filtering, cache identity, and evidence-backed pre-summary output.
- `tests/core/m25-1-personal-ga.test.ts`: Personal GA report, disposition completeness, and production readiness tests.
- `tests/core/session-presummary.test.ts`: Codex/codex-cliproxyapi pre-summary and cache tests.

Expected modified files:

- `packages/core/src/protocol/paths.ts`: add report/cache paths if missing.
- `packages/core/src/schemas.ts` or existing schema modules: export `PersonalGaReport` and `LessonDisposition` schemas.
- `packages/core/src/experience/source-inventory.ts`: add/normalize source metadata required by M25.1.
- `packages/core/src/experience/daily.ts`: wire Personal GA report, AI mode semantics, session pre-summary, and disposition.
- `packages/core/src/experience/lesson-pipeline.ts`: consume pre-summary spans and emit disposition inputs.
- `packages/core/src/wiki/curate.ts`: expose queued/delayed dispositions when proposal limits hide wiki-ready lessons.
- `packages/core/src/wiki/render-site.ts` or existing site renderer: render experience view.
- `packages/core/src/context/*`: add authority labels if missing in agent context outputs.
- `packages/cli/src/index.ts` or command modules: expose Personal GA report through daily/personal JSON.
- `tests/core/wiki-render-site.test.ts`: HTML experience view tests.
- `tests/core/wiki-lesson-compiler.test.ts` or `tests/core/m25-production-integration.test.ts`: wiki completeness tests.
- `tests/core/context-reducer.test.ts` or context CLI tests: authority-label tests.

Do not commit `.praxisbase/`, `dist/`, `dist-tests/`, `node_modules/`, or generated runtime files.

## Task 1: Personal GA Report And Disposition Schemas

**Files:**
- Create: `packages/core/src/experience/personal-ga.ts`
- Create: `packages/core/src/experience/lesson-disposition.ts`
- Modify: `packages/core/src/index.ts`
- Modify: schema export file used by existing experience schemas
- Test: `tests/core/m25-1-personal-ga.test.ts`

- [ ] **Step 1: Write failing schema/report tests**

Add tests that assert:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildPersonalGaReport } from "@praxisbase/core/experience/personal-ga.js";
import { buildLessonDispositions } from "@praxisbase/core/experience/lesson-disposition.js";

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

test("every lesson receives one disposition", () => {
  const lessons = [
    { lesson_id: "l1", state: "wiki_ready", privacy_tier: "safe", portability: "universal", applies_to_agents: ["codex"], applies_to_systems: [], source_refs: ["s"], source_hashes: ["h"] },
    { lesson_id: "l2", state: "active_personal", privacy_tier: "personal_only", portability: "environment", applies_to_agents: ["openclaw"], applies_to_systems: ["remote"], source_refs: ["s2"], source_hashes: ["h2"] },
  ] as any[];

  const dispositions = buildLessonDispositions(lessons, {
    materializedWikiTargets: new Map([["l1", "kb/procedures/example.md"]]),
    materializedSkillTargets: new Map(),
    queuedLessonIds: new Set(),
    delayedByBudgetIds: new Set(),
    privacyBlockedIds: new Set(),
  });

  assert.deepEqual(dispositions.map((item) => item.lesson_id).sort(), ["l1", "l2"]);
  assert.equal(dispositions[0]!.decision, "promoted_to_wiki");
  assert.equal(dispositions[1]!.decision, "active_personal_context");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm test -- tests/core/m25-1-personal-ga.test.ts
```

Expected: fail because modules do not exist.

- [ ] **Step 3: Implement minimal schemas and builders**

Create `personal-ga.ts` with:

```ts
export type PersonalGaMode = "production_ai" | "degraded_no_ai" | "budget_exhausted";

export interface PersonalGaReportInput {
  mode: PersonalGaMode;
  sourceCoverage: Array<{ agent: string; source_kind: string; configured: boolean; available: boolean; items: number }>;
  lessons: Array<{ lesson_id: string }>;
  dispositions: Array<{ lesson_id: string }>;
  goldenValidation: { matched: number; required: number; missed: string[] };
  leakageScan: { passed: boolean; findings: string[] };
  cache: { hits: number; misses: number; writes: number };
  html: { index?: string; review?: string };
  agentConsumption: Array<{ surface: string; available: boolean; authority: string[] }>;
}

export function buildPersonalGaReport(input: PersonalGaReportInput) {
  const blocking = new Set<string>();
  if (input.mode === "degraded_no_ai") blocking.add("ai_lesson_extraction_disabled");
  if (!input.leakageScan.passed) blocking.add("privacy_leakage_detected");
  for (const source of input.sourceCoverage) {
    if (source.configured && !source.available) blocking.add(`source_unavailable:${source.agent}:${source.source_kind}`);
  }
  const lessonIds = new Set(input.lessons.map((lesson) => lesson.lesson_id));
  const disposedIds = new Set(input.dispositions.map((disposition) => disposition.lesson_id));
  for (const id of lessonIds) {
    if (!disposedIds.has(id)) blocking.add(`lesson_missing_disposition:${id}`);
  }

  return {
    type: "personal_ga_report" as const,
    mode: input.mode,
    source_coverage: input.sourceCoverage,
    lesson_count: input.lessons.length,
    disposition_count: input.dispositions.length,
    golden_validation: input.goldenValidation,
    leakage_scan: input.leakageScan,
    cache: input.cache,
    html: input.html,
    agent_consumption: input.agentConsumption,
    production_ready: blocking.size === 0 && input.mode !== "degraded_no_ai",
    blocking_reasons: [...blocking].sort(),
  };
}
```

Create `lesson-disposition.ts` with the disposition type and routing function.

- [ ] **Step 4: Export modules and run tests**

Run:

```bash
pnpm test -- tests/core/m25-1-personal-ga.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/experience/personal-ga.ts packages/core/src/experience/lesson-disposition.ts packages/core/src/index.ts tests/core/m25-1-personal-ga.test.ts
git commit -m "feat: add personal ga report contracts"
```

## Task 2: Source Normalization Coverage

**Files:**
- Modify: `packages/core/src/experience/source-inventory.ts`
- Modify: `packages/core/src/experience/daily.ts`
- Test: `tests/core/m25-1-personal-ga.test.ts`

- [ ] **Step 1: Add failing test for source coverage**

Add a test that builds a source coverage summary from fake source inventory records and asserts OpenClaw/Codex metadata is grouped by agent/source kind.

Expected assertions:

```ts
assert.deepEqual(summary.map((item) => `${item.agent}:${item.source_kind}:${item.available}`).sort(), [
  "codex:session:true",
  "openclaw:memory_file:true",
  "openclaw:sqlite_memory:true",
]);
```

- [ ] **Step 2: Run failing test**

```bash
pnpm test -- tests/core/m25-1-personal-ga.test.ts
```

- [ ] **Step 3: Implement normalizer**

Add a helper such as `summarizePersonalSourceCoverage(items, configuredSources)` that derives:

- `agent`
- `source_kind`
- `origin`
- `trust`
- `privacy_scope`
- `configured`
- `available`
- `items`

Use existing source inventory fields first. Only infer missing values from source config/path as fallback.

- [ ] **Step 4: Wire daily report**

In `runDailyExperience`, add source coverage to the Personal GA input after source inventory or source report collection.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm test -- tests/core/m25-1-personal-ga.test.ts
git add packages/core/src/experience/source-inventory.ts packages/core/src/experience/daily.ts tests/core/m25-1-personal-ga.test.ts
git commit -m "feat: report personal source coverage"
```

## Task 3: Codex Session Pre-Summary

**Files:**
- Create: `packages/core/src/experience/session-presummary.ts`
- Modify: `packages/core/src/experience/lesson-planner.ts`
- Modify: `packages/core/src/experience/daily.ts`
- Test: `tests/core/session-presummary.test.ts`

- [ ] **Step 1: Write failing pre-summary tests**

Create fixtures with:

- a system prompt span;
- a user correction;
- a failing command result;
- a patch/fix message;
- a passing verification command;
- long successful output.

Assert that pre-summary retains the useful events and drops noise.

- [ ] **Step 2: Add cache test**

Use a fake cache directory and fake summarizer function. Assert the second call uses cache and does not call the summarizer.

- [ ] **Step 3: Run failing tests**

```bash
pnpm test -- tests/core/session-presummary.test.ts
```

- [ ] **Step 4: Implement deterministic event selector**

Implement `selectSessionExperienceEvents(spans)` with explicit include/exclude regexes and source-span preservation.

Include cues:

- user correction and preference;
- error/failure/timeout;
- fix/patch/change;
- test/pass/verification;
- repeat/again/regression;
- decision/rationale.

Exclude cues:

- system/developer prompt;
- tool schema;
- long output with no failure cue;
- startup metadata.

- [ ] **Step 5: Implement cache identity**

Implement `sessionPreSummaryCacheKey(input)` from source hash, parser identity, reducer identity, prompt version, model id, privacy profile, and agent.

- [ ] **Step 6: Wire planner**

For `source_kind=session`, pass selected pre-summary spans to the lesson planner before ordinary raw session spans.

- [ ] **Step 7: Run tests and commit**

```bash
pnpm test -- tests/core/session-presummary.test.ts tests/core/lesson-planner.test.ts
git add packages/core/src/experience/session-presummary.ts packages/core/src/experience/lesson-planner.ts packages/core/src/experience/daily.ts tests/core/session-presummary.test.ts
git commit -m "feat: add codex session pre-summary"
```

## Task 4: Production AI Mode And Budget Semantics

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/core/src/experience/lesson-pipeline.ts`
- Test: `tests/core/m25-production-integration.test.ts`
- Test: `tests/core/m25-1-personal-ga.test.ts`

- [ ] **Step 1: Add tests for modes**

Test cases:

- `--no-ai` or degraded input yields `degraded_no_ai` and `production_ready=false`.
- configured AI with uncached budget yields `production_ai`.
- finite budget with skipped uncached spans yields `budget_exhausted` and delayed dispositions.

- [ ] **Step 2: Run failing tests**

```bash
pnpm test -- tests/core/m25-production-integration.test.ts tests/core/m25-1-personal-ga.test.ts
```

- [ ] **Step 3: Implement mode calculation**

Add a small pure helper:

```ts
export function decidePersonalGaMode(input: {
  degraded: boolean;
  noAi: boolean;
  aiConfigured: boolean;
  skippedByBudget: number;
  uncachedAiCallsAllowed: boolean;
}): "production_ai" | "degraded_no_ai" | "budget_exhausted" {
  if (input.degraded || input.noAi || !input.aiConfigured) return "degraded_no_ai";
  if (input.skippedByBudget > 0 && !input.uncachedAiCallsAllowed) return "budget_exhausted";
  return "production_ai";
}
```

- [ ] **Step 4: Wire skipped work into dispositions**

When lesson AI is skipped by budget, pass skipped lesson/span ids into `buildLessonDispositions` as `delayedByBudgetIds`.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm test -- tests/core/m25-production-integration.test.ts tests/core/m25-1-personal-ga.test.ts
git add packages/core/src/experience/daily.ts packages/core/src/experience/lesson-pipeline.ts tests/core/m25-production-integration.test.ts tests/core/m25-1-personal-ga.test.ts
git commit -m "feat: enforce personal ga ai mode"
```

## Task 5: Wiki Completeness And Proposal Limits

**Files:**
- Modify: `packages/core/src/wiki/curate.ts`
- Modify: `packages/core/src/experience/lesson-disposition.ts`
- Test: `tests/core/m25-production-integration.test.ts`
- Test: `tests/core/wiki-lesson-compiler.test.ts`

- [ ] **Step 1: Add failing limit test**

Create eight wiki-ready lessons, set curation limit to three, and assert:

- three materialized proposal/update/merge targets;
- five queued/delayed dispositions;
- no lesson id missing from disposition.

- [ ] **Step 2: Run failing tests**

```bash
pnpm test -- tests/core/m25-production-integration.test.ts tests/core/wiki-lesson-compiler.test.ts
```

- [ ] **Step 3: Return materialized and skipped lesson ids from curation**

Extend curation report with:

- `materialized_lesson_ids`
- `queued_lesson_ids`
- `proposal_limit`
- `limit_reason`

- [ ] **Step 4: Feed curation result into disposition**

Map materialized ids to `promoted_to_wiki` or `merged_into_existing_page`. Map limit-skipped ids to `queued_for_next_run`.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm test -- tests/core/m25-production-integration.test.ts tests/core/wiki-lesson-compiler.test.ts
git add packages/core/src/wiki/curate.ts packages/core/src/experience/lesson-disposition.ts tests/core/m25-production-integration.test.ts tests/core/wiki-lesson-compiler.test.ts
git commit -m "feat: account for wiki-ready lesson disposition"
```

## Task 6: Privacy Abstraction And Triage Reuse

**Files:**
- Modify: `packages/core/src/experience/privacy.ts` or current privacy module
- Modify: `packages/core/src/experience/lesson-disposition.ts`
- Test: `tests/core/privacy-triage.test.ts` or existing privacy tests
- Test: `tests/core/m25-production-integration.test.ts`

- [ ] **Step 1: Add privacy signature tests**

Assert that two raw remote records with the same private host class but different timestamps share one privacy signature.

- [ ] **Step 2: Add leakage tests**

Assert stable wiki, skill proposal, generated HTML input, GBrain export payload, and AgentMemory export payload reject raw host/path/account/token/user-id examples.

- [ ] **Step 3: Run failing tests**

```bash
pnpm test -- tests/core/m25-production-integration.test.ts tests/core/privacy-triage.test.ts
```

- [ ] **Step 4: Implement or tighten abstraction**

Map:

- host/IP/SSH alias -> `configured private route`;
- local user paths -> `local agent config path`;
- raw Slack ids -> `platform user id`;
- account/login strings -> `configured service account`;
- private machine names -> `personal remote machine`;
- secrets/tokens/keys -> human-required or reject.

- [ ] **Step 5: Reuse triage by signature**

Persist and load privacy signatures through existing exception/review records. Do not create duplicate daily human-required records when the signature and risk class match.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm test -- tests/core/m25-production-integration.test.ts tests/core/privacy-triage.test.ts
git add packages/core/src/experience tests/core/m25-production-integration.test.ts tests/core/privacy-triage.test.ts
git commit -m "feat: reuse personal privacy triage signatures"
```

## Task 7: HTML Experience View

**Files:**
- Modify: existing site renderer under `packages/core/src/wiki` or `packages/core/src/site`
- Test: `tests/core/wiki-render-site.test.ts`

- [ ] **Step 1: Add failing render test**

Build a fake latest daily report with:

- source coverage;
- golden validation;
- disposition counts;
- queued lessons;
- privacy blocker groups;
- agent consumption status.

Assert rendered HTML contains labels for those sections and does not contain raw private examples.

- [ ] **Step 2: Run failing test**

```bash
pnpm test -- tests/core/wiki-render-site.test.ts
```

- [ ] **Step 3: Render the experience view**

Add a compact dashboard section:

- "Experience Sources"
- "Lesson Disposition"
- "Golden Validation"
- "Privacy Review"
- "Agent Use"

Use existing CSS/components. Avoid raw excerpts by default.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test -- tests/core/wiki-render-site.test.ts
git add packages/core/src/wiki tests/core/wiki-render-site.test.ts
git commit -m "feat: render personal experience status"
```

## Task 8: Agent Consumption Authority Labels

**Files:**
- Modify: context bundle/retrieval modules under `packages/core/src/context*` and `packages/core/src/experience`
- Modify: GBrain/AgentMemory export report builders if needed
- Test: `tests/core/context-reducer.test.ts`
- Test: `tests/core/gbrain-backend-interop.test.ts` or existing GBrain tests
- Test: `tests/core/agentmemory-adapter.test.ts`

- [ ] **Step 1: Add authority-label tests**

Assert context output order:

```text
stable_pb_page
promoted_skill
active_personal_lesson
gbrain_sidecar
agentmemory_sidecar
raw_audit
```

Assert sidecar hits do not set promotion evidence flags.

- [ ] **Step 2: Run failing tests**

```bash
pnpm test -- tests/core/context-reducer.test.ts tests/core/gbrain-backend-interop.test.ts tests/core/agentmemory-adapter.test.ts
```

- [ ] **Step 3: Implement labels and rank**

Add `authority` or reuse existing authority metadata. Ensure ranking is deterministic and included in JSON reports.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm test -- tests/core/context-reducer.test.ts tests/core/gbrain-backend-interop.test.ts tests/core/agentmemory-adapter.test.ts
git add packages/core/src tests/core/context-reducer.test.ts tests/core/gbrain-backend-interop.test.ts tests/core/agentmemory-adapter.test.ts
git commit -m "feat: label agent knowledge authority"
```

## Task 9: CLI Wiring And Golden Validation

**Files:**
- Modify: `packages/cli/src/index.ts` or command modules
- Modify: `packages/core/src/experience/daily.ts`
- Modify: golden validation modules under `packages/core/src/experience`
- Test: `tests/core/daily-cli.test.ts` or existing daily CLI tests
- Test: `tests/core/lesson-cli.test.ts`

- [ ] **Step 1: Add CLI tests**

Assert personal daily JSON includes:

- `personal_ga.production_ready`
- `personal_ga.blocking_reasons`
- `personal_ga.disposition_counts`
- `personal_ga.source_coverage`

Assert golden validation includes Codex target coverage.

- [ ] **Step 2: Run failing tests**

```bash
pnpm test -- tests/core/daily-cli.test.ts tests/core/lesson-cli.test.ts
```

- [ ] **Step 3: Wire JSON output**

Add Personal GA report path and summary into daily JSON output and generated reports.

- [ ] **Step 4: Extend golden fixtures**

Add a compact Codex/codex-cliproxyapi fixture with user correction, fix, and verification. Assert at least one reusable lesson with trigger/action/verification/negative case/evidence spans.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm test -- tests/core/daily-cli.test.ts tests/core/lesson-cli.test.ts tests/core/m25-1-personal-ga.test.ts
git add packages/cli/src packages/core/src/experience tests/core
git commit -m "feat: expose personal ga validation"
```

## Task 10: End-To-End Verification And Status

**Files:**
- Create: `docs/status/m25-1-personal-ga-smoke-2026-05-30.md`
- Modify: source/docs only if verification exposes documentation gaps

- [ ] **Step 1: Run focused test suite**

```bash
pnpm test -- tests/core/m25-1-personal-ga.test.ts tests/core/session-presummary.test.ts tests/core/m25-production-integration.test.ts tests/core/wiki-render-site.test.ts tests/core/context-reducer.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run full test command**

```bash
pnpm test
```

Expected: all pass or document unrelated pre-existing failures with changed-code risk assessment.

- [ ] **Step 3: Run bounded degraded smoke**

```bash
node packages/cli/dist/index.js daily run --mode personal --degraded --no-ai --build-site --progress --json
```

Expected:

- no LLM token spend;
- deterministic lessons reported;
- `personal_ga.production_ready=false`;
- blocker includes disabled AI;
- no private leakage in generated site/proposals.

- [ ] **Step 4: Run bounded AI smoke**

```bash
node packages/cli/dist/index.js daily run --mode personal --max-ai-chunks 3 --ai-concurrency 2 --ai-timeout-ms 45000 --build-site --progress --json
```

Expected:

- bounded uncached AI use;
- cache hits/misses reported;
- no hidden LLM calls beyond budget;
- Personal GA report either production-ready or lists exact blockers.

- [ ] **Step 5: Leak check generated outputs**

```bash
rg -n "Candidate:|session-corpus|Slack DM from|Conversation info|message_id|root@|macmini-ssh|/Users/guanbear|token|secret" .praxisbase/inbox/proposals dist/index.html dist/review.html
```

Expected: no unsafe hits. If there are benign hits, document each one.

- [ ] **Step 6: Write smoke status**

Record:

- commands;
- report ids;
- source coverage;
- lesson/disposition counts;
- golden validation;
- privacy queue;
- cache stats;
- HTML quality;
- agent consumption status;
- remaining blockers.

- [ ] **Step 7: Final commit**

```bash
git add docs/status/m25-1-personal-ga-smoke-2026-05-30.md
git commit -m "docs: record m25.1 personal ga smoke"
```

## Self-Review Checklist

- [ ] Every BDD scenario maps to at least one task.
- [ ] Every new production object has a test before implementation.
- [ ] No task asks workers to edit runtime/generated files.
- [ ] GBrain and AgentMemory remain backends, not promotion authorities.
- [ ] Personal mode can auto-use abstracted personal lessons; team mode remains stricter.
- [ ] Codex sessions are handled through pre-summary, not naive raw span sampling.
- [ ] Wiki-ready lessons cannot disappear silently behind proposal limits.
- [ ] Real smoke is required before claiming personal GA readiness.
