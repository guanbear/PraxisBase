# Wiki Compiler Core Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-evidence-one-page behavior with a compiler core that extracts observations, clusters them into canonical topics, plans create/update/merge actions against existing wiki pages, and blocks low-quality promotion.

**Architecture:** Keep the existing harvest, AI distill, proposal, review, promote, graph, and site surfaces. Add the missing compiler middle: observations -> canonical topics -> page plans -> synthesis -> quality gate. Stable writes still go through review/promote.

**Tech Stack:** TypeScript, zod schemas, Node fs APIs, existing PraxisBase CLI/core modules, Vitest test suite.

---

## File Map

- Modify `packages/core/src/wiki/curation-model.ts`: add `WikiObservation`, `WikiTopic`, `WikiPagePlan`, and quality assessment schemas.
- Modify `packages/core/src/wiki/curate.ts`: replace source-centric clustering with observation/topic/page-plan flow and apply quality gates before writing proposals.
- Create `packages/core/src/wiki/topic-planner.ts`: deterministic topic keying, existing wiki lookup, duplicate-source detection, page action planning.
- Create `packages/core/src/wiki/promotion-quality.ts`: deterministic quality assessment used by curation and review policy.
- Modify `packages/core/src/wiki/curator-prompt.ts`: pass existing page, related pages, and required links into AI synthesis prompt.
- Modify `packages/core/src/review/policy.ts`: block auto-promote when quality assessment requires human review.
- Modify `packages/core/src/promote/promote.ts`: final safety check for duplicate/raw/template/wiki-shape failures.
- Modify `packages/core/src/wiki/render-site.ts`: expose quality gate counts, duplicate groups, and blocked/human-required reasons.
- Add/modify tests under `tests/core/` and `tests/cli/`.

## Task 1: Observation And Topic Schemas

**Files:**
- Modify `packages/core/src/wiki/curation-model.ts`
- Test `tests/core/wiki-curation-model.test.ts`

- [ ] Add failing schema tests for `WikiObservation`, `WikiTopic`, `WikiPagePlan`, and `WikiPromotionQualityAssessment`.

Run:

```bash
pnpm test -- tests/core/wiki-curation-model.test.ts
```

Expected before implementation: schema exports are missing.

- [ ] Add zod schemas and exported TypeScript types.

Required names:

- `WikiObservationSchema`
- `WikiTopicSchema`
- `WikiPagePlanSchema`
- `WikiPromotionQualityAssessmentSchema`
- `type WikiObservation`
- `type WikiTopic`
- `type WikiPagePlan`
- `type WikiPromotionQualityAssessment`

- [ ] Re-run the test.

Expected after implementation: schema tests pass.

## Task 2: Observation Extraction

**Files:**
- Modify `packages/core/src/wiki/curate.ts`
- Test `tests/core/wiki-curation.test.ts`

- [ ] Add failing tests showing that operational noise produces zero observations:

Cases:

- Codex base instructions/session boot JSON;
- OpenClaw `openclaw:unknown`;
- official docs with no user/agent experience;
- provider config or sandbox/approval policy text.

- [ ] Add failing tests showing that useful evidence produces observations:

Cases:

- OpenClaw auth expired recovery;
- ACK timing repair;
- stdin closed after delegation;
- Codex durable user preference;
- verified fix with command/test evidence.

- [ ] Implement `buildWikiObservationsFromEvidence()` inside `curate.ts` or a small helper. It must preserve source refs/hashes and scope.

- [ ] Re-run:

```bash
pnpm test -- tests/core/wiki-curation.test.ts
```

Expected: observation extraction tests pass.

## Task 3: Canonical Topic Planner

**Files:**
- Create `packages/core/src/wiki/topic-planner.ts`
- Modify `packages/core/src/index.ts`
- Test `tests/core/wiki-topic-planner.test.ts`

- [ ] Add failing tests:

1. Six ACK timing observations with the same normalized problem/action create one `WikiTopic`.
2. Six stdin-closed observations create one `WikiTopic`.
3. Different source hashes for the same topic merge into one topic with unioned source refs.
4. Same source hash cannot appear in two create plans.
5. Existing stable page with matching title/source/entity produces an `update` plan, not `create`.
6. Personal observations do not merge into team/org topics.

- [ ] Implement deterministic helpers:

- `topicKeyForObservation(observation)`
- `buildWikiTopics(observations)`
- `loadExistingWikiPages(root)`
- `planWikiPages(root, topics)`
- `findDuplicateSourceHashGroups(plans, existingPages)`

- [ ] Re-run:

```bash
pnpm test -- tests/core/wiki-topic-planner.test.ts
```

Expected: all planner tests pass.

## Task 4: AI Synthesis Uses Existing Page Context

**Files:**
- Modify `packages/core/src/wiki/curator-prompt.ts`
- Modify `packages/core/src/wiki/curate.ts`
- Test `tests/core/wiki-curator-ai.test.ts`

- [ ] Add failing tests with a fake AI client that asserts the prompt contains:

- topic title and page kind;
- all observation summaries;
- existing page content when action is `update` or `merge`;
- related page titles/paths;
- required wikilinks;
- instruction to update/merge rather than create when a page already exists.

- [ ] Update prompt builder and `synthesizeCuratedWikiProposal()` call shape.

- [ ] Re-run:

```bash
pnpm test -- tests/core/wiki-curator-ai.test.ts
```

Expected: prompt context tests pass.

## Task 5: Promotion Quality Gate

**Files:**
- Create `packages/core/src/wiki/promotion-quality.ts`
- Modify `packages/core/src/wiki/curate.ts`
- Modify `packages/core/src/review/policy.ts`
- Modify `packages/core/src/promote/promote.ts`
- Test `tests/core/wiki-promotion-quality.test.ts`
- Test `tests/core/review-policy.test.ts`

- [ ] Add failing quality tests:

Hard blocks:

- raw JSON body;
- raw transcript/body log;
- template fallback sentence such as `Re-run the failing workflow and confirm the original symptom is gone`;
- duplicate source hash across multiple create proposals;
- official docs/reference-only content;
- missing provenance;
- create action where planner found an existing page.

Human-required:

- weak single source;
- missing links when related pages exist;
- unresolved conflicts;
- team/org/global scope.

Allowed:

- high-signal personal single-source known fix with provenance, no duplicate, good body, and no related pages.

- [ ] Implement `assessWikiPromotionQuality()` with hard block and human-required reason arrays.

- [ ] Wire the assessment into curation so failing hard-block proposals are not written and human-required reasons are carried in `review_hint.risk_notes`.

- [ ] Wire review policy so `quality_hard_block` and `quality_human_required` prevent auto-promote.

- [ ] Add a final promote-time guard that rejects raw/template/wiki-shape failures even if an old proposal bypasses review policy.

- [ ] Re-run:

```bash
pnpm test -- tests/core/wiki-promotion-quality.test.ts tests/core/review-policy.test.ts
```

Expected: quality and policy tests pass.

## Task 6: Reports And Site Explainability

**Files:**
- Modify `packages/core/src/wiki/curation-model.ts`
- Modify `packages/core/src/wiki/curate.ts`
- Modify `packages/core/src/wiki/render-site.ts`
- Test `tests/core/wiki-render-site.test.ts`
- Test `tests/cli/wiki-curate-command.test.ts`

- [ ] Add failing tests that curation reports include:

- observations count;
- topics count;
- create/update/merge/supersede plan counts;
- duplicate source hash groups;
- hard-block count;
- human-required count;
- written proposal count.

- [ ] Add failing site test that the HTML surface shows quality status without presenting raw evidence count as the main human-required count.

- [ ] Implement report fields and HTML rendering.

- [ ] Re-run:

```bash
pnpm test -- tests/core/wiki-render-site.test.ts tests/cli/wiki-curate-command.test.ts
```

Expected: reports and site tests pass.

## Task 7: End-To-End Regression For Real Failure Pattern

**Files:**
- Test `tests/cli/wiki-compiler-core-redesign-e2e.test.ts`

- [ ] Add fixture evidence matching the real run failure:

- six ACK timing entries sharing the same topic;
- six stdin-closed entries sharing the same topic;
- one Codex base-instruction noise entry;
- one official docs reference-only entry;
- one useful Codex preference entry.

- [ ] Run `wiki curate --review --json` with a fake AI client.

- [ ] Assert:

- ACK timing produces one proposal;
- stdin-closed produces one proposal;
- noise entries produce no proposals;
- useful preference can produce one proposal;
- proposals include provenance and related/link metadata;
- no duplicate source hash create plans are written.

- [ ] Re-run:

```bash
pnpm test -- tests/cli/wiki-compiler-core-redesign-e2e.test.ts
```

Expected: regression test passes.

## Task 8: Verification

- [ ] Run focused tests:

```bash
pnpm test -- tests/core/wiki-curation.test.ts tests/core/wiki-curator-ai.test.ts tests/core/wiki-topic-planner.test.ts tests/core/wiki-promotion-quality.test.ts tests/core/review-policy.test.ts tests/core/wiki-render-site.test.ts tests/cli/wiki-curate-command.test.ts tests/cli/wiki-compiler-core-redesign-e2e.test.ts
```

- [ ] Run package build:

```bash
pnpm --filter @praxisbase/core build
pnpm --filter @praxisbase/cli build
```

- [ ] Run a local smoke with generated artifacts kept uncommitted:

```bash
node packages/cli/dist/index.js wiki curate --dry-run --json
node packages/cli/dist/index.js wiki build-site --json
```

- [ ] Inspect `git status --short` and do not commit generated `kb/`, `.praxisbase/`, or `dist/` artifacts.

## Commit Boundary

Use one implementation commit after Codex review:

```bash
git add packages/core/src packages/cli/src tests docs
git commit -m "feat: redesign wiki compiler core"
```

Do not commit generated local wiki output unless the user explicitly requests it.

