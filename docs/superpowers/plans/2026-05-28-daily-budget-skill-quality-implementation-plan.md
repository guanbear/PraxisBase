# Daily Budget And Skill Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make daily AI budgets understandable and make synthesized skill candidates reviewable before promotion.

**Architecture:** Keep the current daily pipeline and skill synthesis flow. Add explicit uncached-budget accounting to the daily report/progress model, then add deterministic markdown normalization and validation around skill proposer output before semantic review.

**Tech Stack:** TypeScript, Node test runner, existing PraxisBase core/CLI packages.

---

### Task 1: Document The Contract

**Files:**
- Create: `docs/superpowers/specs/2026-05-28-daily-budget-skill-quality-design.md`
- Modify: `docs/openspec/changes/ai-first-experience-distill/design.md`
- Modify: `docs/openspec/changes/agent-skill-synthesis-governance/design.md`
- Modify: `docs/bdd/ai-first-experience-distill.feature`
- Modify: `docs/bdd/agent-skill-synthesis-governance.feature`

- [x] **Step 1: Define AI budget as uncached provider calls**

Document that cached chunks do not consume `--max-ai-chunks`, and reports must expose uncached budget counters.

- [x] **Step 2: Define skill markdown quality gates**

Document required sections, repairable markdown defects, and edit-only behavior for malformed candidates.

### Task 2: Daily Budget Red-Green

**Files:**
- Modify: `tests/core/experience-daily.test.ts`
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/commands/daily.ts`

- [x] Add failing tests for uncached budget counters, cross-source cache behavior, and progress fields.
- [x] Implement counters and compatibility warnings.
- [x] Update CLI help, progress formatter, and daily skill candidate cap.

### Task 3: Skill Shape Red-Green

**Files:**
- Modify: `tests/core/skill-proposer.test.ts`
- Modify: `tests/core/skill-review-policy.test.ts`
- Modify: `packages/core/src/synthesis/skill-proposer.ts`
- Modify: `packages/core/src/synthesis/skill-review-policy.ts`

- [x] Add failing tests for malformed generated markdown and invalid shape policy.
- [x] Implement markdown normalizer and validator.
- [x] Gate invalid shapes as edit-required and never promotion eligible.

### Task 4: Verification

- [x] Run focused tests.
- [x] Run build/typecheck.
- [x] Run small real daily.
- [x] Inspect daily report, generated site, and skill candidates.
