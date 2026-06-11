# M23.1 Skill Governance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden M23 so skill promotion, daily/site review queues, source trajectory mapping, context ranking, and optional AgentMemory behavior match the governed product contract.

**Architecture:** Keep M23 modules as the base. Add policy checks at skill promotion time, daily/site projection fields for lifecycle and validation, explicit context ranking, adapter-level bounded trajectory mapping, and warning-only AgentMemory failure handling. PB remains source of truth; GBrain remains runtime MCP brain; AgentMemory remains optional sidecar/cache.

**Tech Stack:** TypeScript ESM, Zod schemas, `node:test`, existing `@praxisbase/core` file-store/protocol/wiki/synthesis/experience modules, existing CLI command patterns.

---

### Task 1: Validation-Gated Skill Promotion

**Files:**
- Modify: `packages/core/src/synthesis/skill-validation.ts`
- Modify: `packages/cli/src/commands/skill.ts`
- Modify: `packages/core/src/synthesis/skill-model.ts`
- Test: `tests/core/skill-validation.test.ts`
- Test: `tests/cli/skill-command.test.ts`

- [ ] Add a helper that finds validation reports for a candidate under `.praxisbase/reports/skill-validation`.
- [ ] Treat a validation report as matching only when candidate id, target path, source hashes, and `decision=pass` all match.
- [ ] Add a promotion-time guard that returns a structured error when validation is missing, stale, mismatched, or failing.
- [ ] Wire the guard into `praxisbase skill promote` behind an explicit policy/default for new stable skill promotion.
- [ ] Add tests for missing validation, failing validation, stale validation, mismatched target path, and passing validation.

### Task 2: Lifecycle Queue In Daily And Site

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/core/src/wiki/render-site.ts`
- Modify: `packages/core/src/wiki/lifecycle.ts`
- Test: `tests/core/experience-daily.test.ts`
- Test: `tests/core/wiki-render-site.test.ts`
- Test: `tests/core/wiki-lifecycle.test.ts`

- [ ] Add lifecycle report summary fields to daily report parsing and defaults.
- [ ] Derive next actions for lifecycle proposals before GBrain export when reviewable lifecycle work exists.
- [ ] Render lifecycle proposal counts and cards in the HTML review page.
- [ ] Keep lifecycle proposals as review queue artifacts; do not mutate stable `kb/**`.
- [ ] Add tests for promote, decay, archive, conflict, and no-op queue display.

### Task 3: Validation Queue In Daily And Site

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/core/src/wiki/render-site.ts`
- Modify: `packages/core/src/synthesis/skill-validation.ts`
- Test: `tests/core/experience-daily.test.ts`
- Test: `tests/core/wiki-render-site.test.ts`
- Test: `tests/core/skill-validation.test.ts`

- [ ] Summarize validation reports by `pass`, `fail`, and `needs_human`.
- [ ] Detect skill candidates that do not have a fresh passing validation report.
- [ ] Recommend `praxisbase skill validate --proposal <id> --json` before `praxisbase skill promote`.
- [ ] Render validation status on skill candidate cards.
- [ ] Add tests proving validation recommendations disappear after fresh passing validation.

### Task 4: Context Ranking Authority

**Files:**
- Modify: `packages/core/src/experience/context.ts`
- Modify: `packages/cli/src/commands/context.ts`
- Test: `tests/core/experience-context.test.ts`
- Test: `tests/cli/experience-commands.test.ts`

- [ ] Locate the context ranking function and add explicit source rank constants.
- [ ] Rank stable PB pages and promoted skills ahead of PB catalog, GBrain sidecar, and AgentMemory sidecar hits.
- [ ] Preserve sidecar hits as supporting entries when they are not duplicates.
- [ ] Add tests where the same topic appears in PB stable, GBrain sidecar, and AgentMemory sidecar results.
- [ ] Add tests proving sidecar hits do not count as promotion evidence.

### Task 5: Source Adapter Trajectory Mapping

**Files:**
- Modify: `packages/core/src/experience/source-adapters.ts`
- Modify: `packages/core/src/experience/source-config.ts`
- Modify: `packages/cli/src/commands/source.ts`
- Test: `tests/core/experience-source-adapters.test.ts`
- Test: `tests/cli/source-command.test.ts`
- Test: `tests/cli/experience-commands.test.ts`

- [ ] Map Codex structured session summaries into `trajectory_steps`, `tool_outcomes`, `read_skills`, and `verification_events` when present.
- [ ] Map Claude Code structured summaries into the same bounded fields when present.
- [ ] Map OpenCode structured summaries into the same bounded fields when present.
- [ ] Map OpenClaw staged/daily envelopes into bounded trajectory fields when present.
- [ ] Add tests proving raw transcript/log fields are rejected and not written to reports.

### Task 6: AgentMemory Warning-Only Behavior

**Files:**
- Modify: `packages/core/src/experience/agent-memory.ts`
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/core/src/experience/gbrain-export.ts`
- Test: `tests/core/agent-memory.test.ts`
- Test: `tests/core/agentmemory-export.test.ts`
- Test: `tests/core/experience-daily.test.ts`
- Test: `tests/core/gbrain-export.test.ts`

- [ ] Normalize AgentMemory not-configured, unhealthy, import failure, and export failure warnings.
- [ ] Ensure PB daily/report/site/GBrain flows continue when AgentMemory fails and their own prerequisites pass.
- [ ] Keep explicit AgentMemory-only commands returning failures when their requested target fails.
- [ ] Add tests proving team mode excludes personal AgentMemory sidecar hits from promotion evidence.
- [ ] Add tests proving AgentMemory warnings are visible in daily/site outputs.

### Task 7: Verification

- [ ] Run `pnpm build`.
- [ ] Run `pnpm exec tsc -p tsconfig.tests.json`.
- [ ] Run focused tests:
  `node --test dist-tests/tests/core/skill-validation.test.js dist-tests/tests/cli/skill-command.test.js dist-tests/tests/core/experience-daily.test.js dist-tests/tests/core/wiki-render-site.test.js dist-tests/tests/core/gbrain-export.test.js dist-tests/tests/core/agent-memory.test.js dist-tests/tests/core/agentmemory-export.test.js`
- [ ] Run `pnpm test`.
- [ ] Run `git diff --name-only | rg '^(kb|skills)/|agent-context-juice-learning|m24-agent' || true` and confirm no stable knowledge or M24 files were touched.
- [ ] Update `docs/openspec/changes/m23-skill-governance-hardening/tasks.md` checkboxes to match actual implementation scope.
