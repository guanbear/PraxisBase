# M23 Collective Skill Knowledge Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first implementation of M23 so trajectory evidence can drive governed lifecycle reports, catalog entries, skill validation evidence, and GBrain skill publishing without bypassing PB review.

**Architecture:** Add small, focused core modules behind existing PB seams: protocol schemas for trajectory/lifecycle/validation, lifecycle analysis from stable wiki pages, catalog generation from stable pages and promoted skills, skill validation evidence under `.praxisbase/`, and GBrain export payload support for catalog plus promoted skills. Keep GBrain as runtime MCP brain and AgentMemory as optional sidecar; stable writes still go through review/promote.

**Tech Stack:** TypeScript ESM, Zod schemas, `node:test`, existing `@praxisbase/core` file-store/protocol/wiki/synthesis modules, existing CLI command patterns.

---

### Task 1: Protocol Schemas And Paths

**Files:**
- Modify: `packages/core/src/protocol/schemas.ts`
- Modify: `packages/core/src/protocol/paths.ts`
- Test: `tests/core/protocol-schemas.test.ts`

- [x] Add lifecycle, trajectory, catalog, and skill validation schemas with typed exports.
- [x] Extend `ExperienceEnvelopeSchema` with optional bounded trajectory metadata:
  `trajectory_steps`, `tool_outcomes`, `read_skills`, `modified_skills`, `injected_context`, `verification_events`, `skill_effectiveness_hints`.
- [x] Extend maturity to include `stale` and `archived` without breaking existing defaults.
- [x] Add `.praxisbase/reports/lifecycle`, `.praxisbase/reports/skill-validation`, and `.praxisbase/catalog` paths.
- [x] Add schema tests proving valid trajectory metadata parses and raw transcript fields are rejected.

### Task 2: Knowledge Lifecycle

**Files:**
- Create: `packages/core/src/wiki/lifecycle.ts`
- Test: `tests/core/wiki-lifecycle.test.ts`

- [x] Implement lifecycle observations and analysis from `collectWikiPages(root)`.
- [x] Produce proposals for promote, decay, archive, conflict, and no-op without mutating stable files.
- [x] Use deterministic ids and provenance hashes.
- [x] Add tests for draft promotion, verified/proven decay, archived exclusion, conflict, and no-op.

### Task 3: Knowledge Catalog

**Files:**
- Create: `packages/core/src/wiki/catalog.ts`
- Modify: `packages/core/src/wiki/render-site.ts`
- Test: `tests/core/wiki-catalog.test.ts`
- Test: `tests/core/wiki-render-site.test.ts`

- [x] Generate an agent-facing catalog from stable wiki pages and promoted skills.
- [x] Group entries by scope, layer, type, maturity, related skills, source refs, and hashes.
- [x] Do not include raw evidence bodies.
- [ ] Add catalog output to site model/render path without increasing review queue counts.

### Task 4: Skill Attribution And Proposer Actions

**Files:**
- Modify: `packages/core/src/synthesis/skill-model.ts`
- Modify: `packages/core/src/synthesis/skill-signals.ts`
- Modify: `packages/core/src/synthesis/skill-proposer.ts`
- Modify: `packages/core/src/synthesis/skill.ts`
- Test: `tests/core/skill-proposer.test.ts`
- Test: `tests/core/skill-signals.test.ts`
- Test: `tests/core/skill-synthesis.test.ts`

- [x] Add `skill_optimize_description` and `skip` as first-class proposer decisions.
- [x] Add cause classification: `skill_problem`, `agent_problem`, `environment_problem`, `weak_signal`.
- [x] Preserve update-before-create precedence and reject raw one-off evidence.
- [x] Convert `skip` decisions into report counts/warnings, not inbox candidates.
- [ ] Add tests for targeted update, description optimization, support-file update, create, skip, and cause classification.

### Task 5: Skill Validation Evidence

**Files:**
- Create: `packages/core/src/synthesis/skill-validation.ts`
- Modify: `packages/cli/src/commands/skill.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/core/skill-validation.test.ts`
- Test: `tests/cli/skill-command.test.ts`

- [x] Implement static validation for skill candidate shape, required sections, safe paths, support-file references, provenance, and source hashes.
- [x] Implement evidence simulation using representative summaries from the candidate.
- [x] Add replay hook as disabled unless an explicit safe harness is configured.
- [x] Add `praxisbase skill validate --proposal <id> --json`.
- [x] Ensure validation writes evidence under `.praxisbase/reports/skill-validation` and never promotes.

### Task 6: GBrain Export Of Catalog And Skills

**Files:**
- Modify: `packages/core/src/experience/gbrain-export.ts`
- Test: `tests/core/gbrain-export.test.ts`

- [x] Export stable wiki pages, promoted skills, and catalog entries.
- [x] Compact skill payloads into trigger, procedure, verification, pitfalls, and provenance sections.
- [x] Preserve provenance hash idempotency.
- [x] Keep team export blocked unless `allowTeamExport` is true and skip personal/project scopes.
- [x] Add tests proving inbox candidates, raw evidence, human-required material, and rejected material are not exported.

### Task 7: Daily And Site Reporting

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/core/src/wiki/site-model.ts`
- Modify: `packages/core/src/wiki/render-site.ts`
- Test: `tests/core/experience-daily.test.ts`
- Test: `tests/core/wiki-render-site.test.ts`

- [ ] Add lifecycle, catalog, validation, and GBrain skill export counts to daily/site outputs.
- [ ] Add next commands for privacy triage, lifecycle review, skill validation, skill promotion, GBrain export, and optional AgentMemory export.
- [ ] Keep AgentMemory absence warning-only.

### Task 8: Verification

- [x] Run `pnpm exec tsc -p tsconfig.tests.json`.
- [x] Run focused tests:
  `pnpm test -- --test-name-pattern "lifecycle|catalog|skill|gbrain|daily|protocol"`.
- [x] Run `pnpm build`.
- [x] Confirm `kb/**` and `skills/**` stable files changed only through tests/fixtures or promotion code paths.
- [x] Confirm M23 docs task statuses match implemented scope.
