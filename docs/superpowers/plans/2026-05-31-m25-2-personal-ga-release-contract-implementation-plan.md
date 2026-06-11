# M25.2 Personal GA Release Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PraxisBase personal mode pass a frozen release gate where PB core works without optional sidecars.

**Architecture:** Extend existing M25.1 readiness, daily, privacy, output, HTML, and context surfaces. Do not add a new pipeline. Keep GBrain and AgentMemory as sidecars unless explicitly required.

**Tech Stack:** TypeScript, Node test runner, Zod schemas, existing PraxisBase CLI/core packages, generated static HTML.

---

## File Map

- Modify `packages/core/src/experience/personal-ga.ts`: readiness taxonomy, sidecar warning handling, usable PB output gate.
- Modify `packages/core/src/experience/daily.ts`: pass latest-run sidecar/source/privacy/output status into Personal GA.
- Modify privacy abstraction helpers if needed: preserve reusable personal lessons while blocking only true secrets.
- Modify `packages/core/src/wiki/render-site.ts`: show PB core readiness and sidecar warnings separately.
- Modify tests:
  - `tests/core/m25-1-personal-ga.test.ts`
  - `tests/core/m25-production-integration.test.ts`
  - `tests/core/wiki-render-site.test.ts`
  - context tests if PB context availability needs coverage.
- Update `docs/status/m25-real-smoke-2026-05-30.md` after real validation.

## Task 1: Readiness Contract

- [ ] Write failing tests proving AgentMemory/GBrain unavailable are warnings when PB core output exists.
- [ ] Write failing test proving degraded/no-AI still blocks GA.
- [ ] Implement hard blocker taxonomy in `personal-ga.ts`.
- [ ] Run `pnpm test -- tests/core/m25-1-personal-ga.test.ts`.
- [ ] Commit `feat: freeze personal ga readiness contract`.

## Task 2: Latest-Run Privacy Gate

- [ ] Write failing tests proving historical human-required backlog does not block latest GA.
- [ ] Write failing tests proving true token/key/password blockers still block.
- [ ] Tighten privacy abstraction only where tests show current host/path/account references are over-blocked.
- [ ] Run privacy and M25 focused tests.
- [ ] Commit `feat: scope personal ga privacy blockers to latest run`.

## Task 3: Usable PB Output

- [ ] Write failing tests proving GA fails when no stable wiki, active personal lesson, or promoted skill exists.
- [ ] Write tests proving wiki/context output satisfies the gate even when proposal limits queue extra lessons.
- [ ] Wire daily output/disposition counts into the GA report.
- [ ] Run M25 production tests.
- [ ] Commit `feat: require usable personal pb output`.

## Task 4: HTML And Context

- [ ] Write or update HTML tests so PB core readiness appears before optional sidecar warnings.
- [ ] Verify `context get` can return PB stable knowledge or active personal lessons with sidecars down.
- [ ] Update rendering and context status as needed.
- [ ] Run wiki render and context tests.
- [ ] Commit `feat: surface personal ga core readiness`.

## Task 5: Final Real Validation

- [ ] Run `node packages/cli/dist/index.js lesson golden --json`.
- [ ] Run production personal daily with GLM-4.7, bounded budget, cache, build-site, and progress.
- [ ] Inspect latest daily report for `personal_ga.production_ready`.
- [ ] Inspect generated HTML for learned knowledge and blockers.
- [ ] Inspect `context get` for PB authoritative context.
- [ ] Update status docs with exact reports and remaining blockers, if any.
- [ ] Commit `docs: record m25.2 personal ga validation`.

## Self-Review

- The plan covers sidecar downgrade, production AI, latest privacy, usable output, HTML/context, and real validation.
- No new backend or broad UI redesign is included.
- The plan preserves PB as synthesis/governance authority and keeps sidecars optional by default.
