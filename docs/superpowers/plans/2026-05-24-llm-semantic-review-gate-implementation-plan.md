# LLM Semantic Review Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an LLM semantic reviewer between wiki synthesis and review/promote so PraxisBase can reject, revise, or merge semantically weak wiki candidates before they become stable knowledge.

**Architecture:** Keep deterministic hard gates first, add a bounded LLM reviewer for semantic judgment, then apply deterministic arbitration. The reviewer judges candidates; policy decides the final action. Reports and site UI expose semantic review outcomes.

**Tech Stack:** TypeScript, Zod schemas, existing OpenAI-compatible JSON client, Node test runner, existing wiki curation and daily experience pipeline.

---

## File Map

- Create `packages/core/src/wiki/semantic-review.ts`: schema, prompt builder, AI call wrapper, JSON repair/normalization.
- Create `packages/core/src/wiki/semantic-review-policy.ts`: deterministic arbitration from quality assessment + semantic review + scope/policy.
- Modify `packages/core/src/wiki/curation-model.ts`: semantic review schemas and curation report counts.
- Modify `packages/core/src/wiki/curate.ts`: run semantic review after synthesis/hard gates and before writing review candidates.
- Modify `packages/core/src/ai/config.ts`: optional `review_model`.
- Modify `packages/cli/src/commands/wiki.ts`: semantic review CLI options.
- Modify `packages/cli/src/commands/daily.ts`: pass semantic review options through daily.
- Modify `packages/core/src/experience/daily.ts`: require semantic review for production auto-promotion of new wiki pages.
- Modify `packages/core/src/wiki/render-site.ts`: show semantic review counts/reasons.
- Add tests under `tests/core/wiki-semantic-review.test.ts`, `tests/core/wiki-semantic-review-policy.test.ts`, `tests/core/wiki-curation-semantic-review.test.ts`, `tests/core/experience-daily.test.ts`, and site tests.

---

### Task 1: Semantic Review Schema And Prompt

**Files:**
- Create: `packages/core/src/wiki/semantic-review.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Test: `tests/core/wiki-semantic-review.test.ts`

- [ ] **Step 1: Write failing schema tests**

Test valid decisions `promote`, `revise`, `merge`, `reject`, and `needs_human`. Test score bounds, nullable merge target, and malformed reviewer output normalization.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-semantic-review.test.js
```

Expected: module not found or schema missing.

- [ ] **Step 3: Implement schema and prompt builder**

Implement `SemanticWikiReviewSchema`, `buildSemanticWikiReviewPrompt()`, `normalizeSemanticWikiReview()`, and exported types. The prompt must forbid rewriting and require strict JSON.

- [ ] **Step 4: Verify**

Run the same focused test. Expected: PASS.

---

### Task 2: Semantic Review AI Runner

**Files:**
- Modify: `packages/core/src/wiki/semantic-review.ts`
- Test: `tests/core/wiki-semantic-review.test.ts`

- [ ] **Step 1: Write failing AI runner tests**

Use mocked `AiJsonClient` responses for promote, merge, reject, malformed JSON repaired once, and client timeout/error.

- [ ] **Step 2: Run tests to verify failure**

Expected: missing runner behavior.

- [ ] **Step 3: Implement `reviewWikiCandidateSemantically()`**

The function accepts candidate context, reviewer config, and optional injected AI client. It returns a semantic review or unavailable result. It must not throw on model failure unless production config requires hard failure at the caller boundary.

- [ ] **Step 4: Verify**

Focused test passes.

---

### Task 3: Deterministic Arbitration

**Files:**
- Create: `packages/core/src/wiki/semantic-review-policy.ts`
- Test: `tests/core/wiki-semantic-review-policy.test.ts`

- [ ] **Step 1: Write failing arbitration tests**

Cover:

- deterministic hard block wins over reviewer promote;
- reviewer reject rejects;
- reviewer merge without valid target becomes human-required;
- reviewer revise allows one retry only;
- personal promote requires score >= 0.82 and positive booleans;
- team scope remains human-required;
- single-source run-report create cannot promote.

- [ ] **Step 2: Run tests to verify failure**

Expected: module missing.

- [ ] **Step 3: Implement arbitration**

Implement `decideSemanticWikiAction()` returning:

```ts
{
  action: "write_candidate" | "retry_synthesis" | "reject" | "needs_human" | "rewrite_as_merge";
  reason: string;
  reviewNotes: string[];
}
```

- [ ] **Step 4: Verify**

Focused arbitration test passes.

---

### Task 4: Curation Integration

**Files:**
- Modify: `packages/core/src/wiki/curation-model.ts`
- Modify: `packages/core/src/wiki/curate.ts`
- Test: `tests/core/wiki-curation-semantic-review.test.ts`

- [ ] **Step 1: Write failing curation tests**

Use mocked semantic reviewer results:

- Slack stability proposal gets written.
- Task runner presence proposal is rejected.
- Post-deploy smoke proposal becomes merge/reject and is not written as create.
- Reviewer unavailable causes `needs_human` rather than auto-promote.

- [ ] **Step 2: Run tests to verify failure**

Expected: no semantic review support.

- [ ] **Step 3: Add report fields**

Add `semantic_review` counts to `WikiCurationReportSchema`, preserving backward compatibility with defaults.

- [ ] **Step 4: Wire review before candidate write**

Run deterministic assessment first. If no hard block, call semantic review. Apply arbitration. Write only allowed candidates. Count rejected/merge/revise/human-required outcomes.

- [ ] **Step 5: Verify**

Run focused curation tests.

---

### Task 5: Daily Auto-Promotion Policy

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/cli/src/commands/daily.ts`
- Test: `tests/core/experience-daily.test.ts`
- Test: `tests/cli/daily-command.test.ts`

- [ ] **Step 1: Write failing daily tests**

Assert production personal auto-promotion requires successful semantic review for newly created wiki pages. Assert team mode remains human-required even when semantic review approves.

- [ ] **Step 2: Implement pass-through options**

Add daily options for semantic review enablement, timeout, and concurrency.

- [ ] **Step 3: Apply auto-promotion guard**

When a curated proposal lacks a passing semantic review note, `decideAutoReview` must not auto-promote it.

- [ ] **Step 4: Verify**

Run daily focused tests.

---

### Task 6: CLI And Config

**Files:**
- Modify: `packages/core/src/ai/config.ts`
- Modify: `packages/cli/src/commands/ai.ts`
- Modify: `packages/cli/src/commands/wiki.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/core/ai-config.test.ts`
- Test: `tests/cli/ai-command.test.ts`
- Test: `tests/cli/wiki-curate-command.test.ts`

- [ ] **Step 1: Write failing CLI/config tests**

Assert `review_model` can be configured. Assert `wiki curate` accepts semantic review options and passes them through.

- [ ] **Step 2: Implement config and CLI parsing**

Add `--review-model`, `--semantic-review`, `--no-semantic-review`, `--semantic-review-timeout-ms`, and `--semantic-review-concurrency`.

- [ ] **Step 3: Verify**

Run focused tests.

---

### Task 7: Site And Reports

**Files:**
- Modify: `packages/core/src/wiki/render-site.ts`
- Test: `tests/core/wiki-site.test.ts` or existing render-site tests

- [ ] **Step 1: Write failing site test**

Assert dashboard shows semantic review counts and review cards show decision, score, reason, merge target, and fatal issues.

- [ ] **Step 2: Implement rendering**

Use existing dashboard/review card patterns. Do not create a new page unless existing review/issues surfaces cannot hold the data.

- [ ] **Step 3: Verify**

Run focused site tests.

---

### Task 8: Real Smoke And Regression

**Files:**
- No production code unless failures expose gaps.

- [ ] **Step 1: Full verification**

Run:

```bash
pnpm check
```

- [ ] **Step 2: Real personal dry-run/review smoke**

Run with GLM-4.7:

```bash
node packages/cli/dist/index.js wiki curate --review --json --concurrency 8
node packages/cli/dist/index.js kb audit --json
node packages/cli/dist/index.js wiki build-site --json
```

- [ ] **Step 3: Inspect semantic outcomes**

Confirm the current bad patterns are blocked:

- task runner presence checks reject/revise;
- post-deploy smoke failure does not create a standalone page;
- missing replay data merges into Slack replay stability;
- useful multi-source pages remain eligible.

- [ ] **Step 4: Commit**

Commit code and docs after full verification.
