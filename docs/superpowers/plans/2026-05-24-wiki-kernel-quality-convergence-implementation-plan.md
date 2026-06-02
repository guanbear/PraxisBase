# Wiki Kernel Quality Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Tighten PraxisBase so raw evidence compiles into fewer reusable wiki pages and stable wiki guidance is the default agent context.

**Architecture:** Add semantic quality gates at curation and promotion time, improve curation title fallback, clean stale generated review candidates, and make context retrieval authority-tiered. Keep stable writes behind existing review/promote policy and keep runtime `kb/` output out of the source commit.

**Tech Stack:** TypeScript, Node test runner, Zod schemas, existing PraxisBase core/CLI packages.

---

## File Structure

- Modify `packages/core/src/wiki/promotion-quality.ts`: add semantic title/body quality checks used by review and daily auto-promote.
- Modify `packages/core/src/wiki/curate.ts`: avoid raw process-title fallback, reject untitleable clusters, and clear stale generated wiki proposals when a current curation run writes candidates.
- Modify `packages/core/src/wiki/retrieval.ts`: add authority tier scoring and hide old stable `kb/` pages that fail promote-time quality.
- Modify `packages/core/src/experience/context.ts`: default-exclude raw-vault refs from agent guidance and skip low-quality stable `kb/` artifacts.
- Modify `packages/core/src/protocol/schemas.ts` only if report taxonomy needs schema extension.
- Modify `packages/core/src/experience/daily.ts` and `packages/core/src/wiki/curate.ts` if categorized counts are not already available.
- Test `tests/core/wiki-promotion-quality.test.ts`.
- Test `tests/core/wiki-curation.test.ts`.
- Test `tests/core/wiki-retrieval.test.ts`.
- Test `tests/core/experience-context.test.ts`.
- Test `tests/core/experience-daily.test.ts`.
- Test `tests/cli/wiki-fidelity-contract-e2e.test.ts` if an end-to-end assertion needs strengthening.

## Task 1: Semantic Promotion Gate

**Files:**
- Modify: `packages/core/src/wiki/promotion-quality.ts`
- Test: `tests/core/wiki-promotion-quality.test.ts`

- [x] **Step 1: Write failing tests**

Add tests that build curated proposals with:

```ts
title: "Successfully fixed and re-approved in a subsequent commit (c52742b)"
```

and bodies where `## When to Use` says:

```md
Use this when Successfully fixed and re-approved in a subsequent commit appears in agent work.
```

Expected:

```ts
assert.ok(result.hard_blocks.includes("non_reusable_topic"));
assert.ok(result.hard_blocks.includes("generic_applicability"));
assert.ok(result.hard_blocks.includes("non_specific_action"));
```

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm build >/tmp/praxisbase-build-m14-red.log 2>&1 && tsc -p tsconfig.tests.json >/tmp/praxisbase-tsc-m14-red.log 2>&1 && node --test dist-tests/tests/core/wiki-promotion-quality.test.js
```

Expected: fail because the new hard block reasons do not exist or are not emitted.

- [x] **Step 3: Implement minimal semantic checks**

Add helper checks:

```ts
function isReusableTopicTitle(title: string): boolean;
function hasConcreteApplicability(body: string, title: string): boolean;
function hasSpecificAction(body: string, title: string): boolean;
```

Wire failures into promotion quality hard blocks.

- [x] **Step 4: Verify GREEN**

Run the same command. Expected: all `wiki-promotion-quality` tests pass.

- [x] **Step 5: Add promote-time guard coverage**

Assert old generated candidates with generic headings, raw evidence applicability, or run-specific titles are refused by `promotionTimeGuard`.

## Task 2: Topic And Title Convergence

**Files:**
- Modify: `packages/core/src/wiki/curate.ts`
- Test: `tests/core/wiki-curation.test.ts`

- [x] **Step 1: Write failing curation tests**

Create evidence with a process-status title and useful but narrow reusable lesson. Expected behavior:

```ts
assert.notEqual(proposal.title, "Successfully fixed and re-approved in a subsequent commit (c52742b)");
assert.doesNotMatch(proposal.target_path, /successfully-fixed-and-re-approved/);
```

For an untitleable weak cluster, expected behavior:

```ts
assert.equal(report.input_counts.rejected, 1);
assert.equal(writtenProposalCount, 0);
```

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm build >/tmp/praxisbase-build-m14-curation-red.log 2>&1 && tsc -p tsconfig.tests.json >/tmp/praxisbase-tsc-m14-curation-red.log 2>&1 && node --test dist-tests/tests/core/wiki-curation.test.js
```

Expected: fail because raw evidence title is still used.

- [x] **Step 3: Implement title selection**

Add deterministic title selection that rejects process-status titles and derives a title from problem/action/entities when possible.

- [x] **Step 4: Verify GREEN**

Run the same command. Expected: all `wiki-curation` tests pass.

- [x] **Step 5: Remove stale generated review candidates**

When current review-mode curation writes proposal candidates, delete older `wiki_curated_proposal` and `wiki_proposal_candidate` files that are not part of the current generated set.

## Task 3: Authority-Tiered Context

**Files:**
- Modify: `packages/core/src/experience/context.ts`
- Modify: `packages/core/src/wiki/retrieval.ts`
- Test: `tests/core/experience-context.test.ts`
- Test: `tests/core/wiki-retrieval.test.ts`

- [x] **Step 1: Write failing context tests**

Set up a stable page and a matching raw-vault ref. Expected:

```ts
assert.equal(context.items[0].path.startsWith("kb/"), true);
assert.equal(context.items.some((item) => item.path.startsWith(".praxisbase/raw-vault/refs/")), false);
```

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm build >/tmp/praxisbase-build-m14-context-red.log 2>&1 && tsc -p tsconfig.tests.json >/tmp/praxisbase-tsc-m14-context-red.log 2>&1 && node --test dist-tests/tests/core/experience-context.test.js dist-tests/tests/core/wiki-retrieval.test.js
```

Expected: fail because raw-vault refs are still included by default or authority does not affect ranking.

- [x] **Step 3: Implement authority tiers**

Default `CONTEXT_ROOTS` should exclude raw vault refs. Retrieval candidates should carry `authority` or score by path-derived authority so stable pages outrank evidence.

- [x] **Step 4: Verify GREEN**

Run the same command. Expected: context and retrieval tests pass.

- [x] **Step 5: Filter old low-quality stable pages at read time**

Default context retrieval should skip local `kb/` markdown that fails the same promote-time semantic gate, including run-specific historical pages.

## Task 4: Human-Required Taxonomy

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/core/src/wiki/curate.ts`
- Modify: `packages/core/src/wiki/render-site.ts` if dashboard count needs adjustment.
- Test: `tests/core/experience-daily.test.ts`
- Test: `tests/core/wiki-render-site.test.ts`

- [x] **Step 1: Write failing taxonomy tests**

Assert daily reports include:

```ts
assert.equal(report.ai_distill.privacy_required, 1);
assert.equal(report.ai_distill.review_required, 0);
assert.equal(report.ai_distill.rejected_low_signal >= 0, true);
assert.equal(report.ai_distill.rejected_quality >= 0, true);
```

Assert rendered HTML does not use rejected counts as the human-required headline.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm build >/tmp/praxisbase-build-m14-taxonomy-red.log 2>&1 && tsc -p tsconfig.tests.json >/tmp/praxisbase-tsc-m14-taxonomy-red.log 2>&1 && node --test dist-tests/tests/core/experience-daily.test.js dist-tests/tests/core/wiki-render-site.test.js
```

Expected: fail because categorized counts are absent or not rendered correctly.

- [x] **Step 3: Implement categorized counts**

Populate taxonomy fields without changing privacy behavior. Preserve existing `human_required` for backward compatibility, but add categorized fields and use them in dashboard headline logic.

- [x] **Step 4: Verify GREEN**

Run the same command. Expected: daily and render-site tests pass.

## Task 5: Golden And Real Smoke Verification

**Files:**
- Modify: `tests/cli/wiki-fidelity-contract-e2e.test.ts`

- [x] **Step 1: Strengthen golden e2e**

Assert promoted stable markdown does not contain raw process-status titles, raw-vault refs are not standalone context items, and source summaries still record page contribution.

- [x] **Step 2: Run focused verification**

Run:

```bash
pnpm build >/tmp/praxisbase-build-m14-focused.log 2>&1 && tsc -p tsconfig.tests.json >/tmp/praxisbase-tsc-m14-focused.log 2>&1 && node --test dist-tests/tests/core/wiki-promotion-quality.test.js dist-tests/tests/core/wiki-curation.test.js dist-tests/tests/core/experience-context.test.js dist-tests/tests/core/wiki-retrieval.test.js dist-tests/tests/core/experience-daily.test.js dist-tests/tests/cli/wiki-fidelity-contract-e2e.test.js
```

Expected: all focused tests pass.

- [x] **Step 3: Run full verification**

Run:

```bash
pnpm check
```

Expected: all tests pass.

- [x] **Step 4: Run real personal daily smoke**

Run:

```bash
node packages/cli/dist/index.js daily run --mode personal --build-site --ai-concurrency 12 --ai-timeout-ms 90000 --max-curation-proposals 80 --json > /tmp/praxisbase-daily-real-personal-m14.json
```

Expected: command exits 0, source summaries have nonzero `contributed_to_pages`, context query returns stable pages first, and bad process-status title is not newly auto-promoted.
