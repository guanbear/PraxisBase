# M24 Agent Context Juice And Personal Learning Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Implement task-by-task with tests first. Do not edit stable `kb/**` or `skills/**` except through existing promotion code paths.

**Goal:** Add the runtime layer that makes stable PB knowledge cheap, bounded, trust-aware, and useful to agents, while adding a personal learning cache for local runtime preferences.

**Architecture:** Keep M23 governance as the authority path. Add focused modules for context juice, trust wrapping, agent bundle building, promoted skill injection, and personal learning facets. Wire them into CLI, reports, and site output without changing stable promotion rules.

**Tech Stack:** TypeScript ESM, Zod schemas, `node:test`, existing `@praxisbase/core` protocol/wiki/experience/synthesis/agent-access modules, existing CLI command patterns.

---

## Task 1: Protocol Schemas And Paths

**Files:**

- Modify: `packages/core/src/protocol/schemas.ts`
- Modify: `packages/core/src/protocol/paths.ts`
- Test: `tests/core/protocol-schemas.test.ts`

- [x] Add schemas for `ContextJuiceReport`, `ContextJuiceBudgetResult`, `TrajectoryMicrocompactResult`, `AgentContextBundle`, `SkillInjectionDecision`, `TrustBoundaryItem`, `PersonalLearningFacet`, and `PersonalLearningReport`.
- [x] Add paths for `.praxisbase/reports/context-juice`, `.praxisbase/reports/agent-bundles`, `.praxisbase/personal/profile.md`, and `.praxisbase/personal/facets.jsonl`.
- [x] Add schema tests for valid reports, rejected raw transcript fields, trust tier enum values, and personal facet override states.

## Task 2: Context Juice Core

**Files:**

- Create: `packages/core/src/experience/context-juice.ts`
- Test: `tests/core/context-juice.test.ts`

- [x] Implement UTF-8 safe `applySourceItemBudget(text, budget, metadata)` with explicit dropped-byte marker and byte accounting.
- [x] Implement token estimate helper using the existing PB convention and output reserve support for bundle packing.
- [x] Implement trajectory microcompact that preserves ordered envelopes and clears old low-signal bodies with a stable placeholder.
- [x] Preserve all failures, fixes, verification events, explicit lessons, source refs, source hashes, and newest `N` tool results.
- [x] Make microcompact idempotent.
- [x] Add tests for multibyte truncation, zero budget behavior, marker contents, idempotency, recent-result preservation, and protected signal preservation.

## Task 3: Daily And Reducer Integration

**Files:**

- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/core/src/experience/context-reducer.ts`
- Modify: `packages/core/src/experience/source-item-ledger.ts`
- Test: `tests/core/experience-daily.test.ts`
- Test: `tests/core/context-reducer.test.ts`

- [x] Run context juice before expensive AI/review inputs and before bundle generation, but after source item identity is known.
- [x] Include context juice version, budget id, microcompact placeholder version, and reduction hash in cache identity so changed budget behavior cannot silently reuse stale AI output.
- [x] Add report counters: items seen, items budgeted, items microcompacted, original bytes, kept bytes, saved bytes, warnings, and protected signal counts.
- [x] Ensure `--no-context-economy` or equivalent debug path can bypass context juice for comparison.
- [x] Add tests proving unchanged already-processed items do not spend new uncached AI budget.

## Task 4: Optional Oversized Payload Pre-Summary

**Files:**

- Create: `packages/core/src/experience/payload-presummary.ts`
- Modify: `packages/core/src/experience/daily.ts`
- Test: `tests/core/payload-presummary.test.ts`

- [x] Add an optional model-backed pre-summary interface with lower threshold, upper threshold, max calls, timeout, and three-failure breaker.
- [x] Use existing AI provider configuration; do not introduce a second model config path.
- [x] Reject empty, malformed, non-shrinking, provenance-free, or privacy-unsafe summaries.
- [x] Record model id, prompt id, original bytes, summary bytes, source refs, source hashes, and warnings.
- [x] Keep it disabled for team stable-write paths unless explicit policy enables it.
- [x] Add mocked provider tests for below-threshold pass-through, above-max pass-through, success, non-shrinking discard, failure breaker, and disabled team policy.

## Task 5: Trust Boundary

**Files:**

- Create: `packages/core/src/agent-access/trust-boundary.ts`
- Test: `tests/core/trust-boundary.test.ts`

- [x] Implement trust tiers: `pb_stable`, `pb_personal_facet`, `pb_candidate`, `gbrain_sidecar`, `agentmemory_sidecar`, `remote_personal_agent`, `external_untrusted`.
- [x] Default unknown sources to `external_untrusted`.
- [x] Implement wrapper rendering with escaped content and bounded source hints.
- [x] Mark review candidates as non-injectable by default.
- [x] Add tests for GBrain/AgentMemory sidecars, trusted PB stable pages, personal remote OpenClaw, unknown source default-deny, wrapper escaping, and source hint length caps.

## Task 6: Promoted Skill Injection

**Files:**

- Create: `packages/core/src/agent-access/skill-injection.ts`
- Modify: `packages/core/src/synthesis/skill-inventory.ts`
- Test: `tests/core/skill-injection.test.ts`

- [x] Match promoted PB skills by explicit `@skill`, skill id, trigger/When-To-Use, tags, related wiki pages, catalog match, and deterministic ranking; semantic rerank remains optional future work.
- [x] Render bounded `[PB-SKILL:<id>]` blocks with truncation marker and citations.
- [x] Enforce default `8 KiB` skill injection budget.
- [x] Emit per-skill decisions: matched, skipped, reason, injected bytes, truncated, scope, authority, promotion/audit id.
- [x] Exclude candidate, rejected, human-required, external-installed, and unreviewed skills from default injection.
- [x] Add tests for explicit order, deterministic auto order, budget exhaustion, UTF-8 body truncation, candidate exclusion, and reason reporting.

## Task 7: Agent Context Bundle Builder

**Files:**

- Create: `packages/core/src/agent-access/context-bundle.ts`
- Modify: `packages/core/src/experience/context.ts`
- Modify: `packages/core/src/wiki/retrieval.ts`
- Test: `tests/core/context-bundle.test.ts`
- Test: `tests/core/experience-context.test.ts`

- [x] Build ordered bundles from personal facets, stable PB pages, promoted skills, catalog entries, graph neighbors, GBrain sidecar hits, and AgentMemory sidecar hits.
- [x] Enforce default budgets: total `24 KiB`, skills `8 KiB`, personal facets `2 KiB`, sidecars `4 KiB`, catalog `4 KiB`.
- [x] Preserve citations/provenance before full bodies.
- [x] Rank stable PB above GBrain and AgentMemory sidecars.
- [x] Wrap untrusted sidecar and remote content.
- [x] Add omitted-item summaries and warnings.
- [x] Add tests for authority ordering, budget truncation, citation preservation, untrusted wrapping, sidecar opt-in, and no raw candidate injection.

## Task 8: Personal Learning Cache

**Files:**

- Create: `packages/core/src/experience/personal-learning.ts`
- Modify: `packages/core/src/experience/profiles.ts`
- Test: `tests/core/personal-learning.test.ts`

- [x] Implement personal facet records with class, key, value, cue family, evidence refs, evidence count, first/last seen, stability, state, and user override.
- [x] Implement stability scoring with cue weights, class half-lives, explicit multiplier, pinned override, forgotten override, and class budgets.
- [x] Add producers from explicit local instructions, distilled personal summaries, manual CLI entries, and imported OpenHuman/AgentMemory records as personal candidates only.
- [x] Render managed `.praxisbase/personal/profile.md` blocks while preserving user-authored content outside markers.
- [x] Add tests for score thresholds, class budgets, pin, forget, conflict resolution, profile rendering, and no team export by default.

## Task 9: CLI Commands

**Files:**

- Modify: `packages/cli/src/commands/context.ts`
- Modify: `packages/cli/src/commands/personal.ts`
- Modify: `packages/cli/src/commands/skill.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/cli/context-command.test.ts`
- Test: `tests/cli/personal-command.test.ts`
- Test: `tests/cli/skill-command.test.ts`

- [x] Add `praxisbase context bundle --query <q> --mode personal|team --json`.
- [x] Add `praxisbase context juice --source <id> --json`.
- [x] Add `praxisbase personal profile add|list|pin|forget|rebuild --json`.
- [x] Add `praxisbase skill inject-preview --query <q> --json`.
- [x] Ensure commands explain next actions and do not print raw private evidence by default.
- [x] Add CLI tests for JSON shape, profile override commands, injection preview, and team-mode personal facet exclusion.

## Task 10: Site And Report Surfacing

**Files:**

- Modify: `packages/core/src/wiki/site-model.ts`
- Modify: `packages/core/src/wiki/render-site.ts`
- Modify: `packages/core/src/wiki/site-html.ts`
- Test: `tests/core/wiki-render-site.test.ts`

- [x] Show context juice savings and warnings.
- [x] Show agent bundle budget usage and trust-tier counts.
- [x] Show promoted skill injection matches and skip reasons.
- [x] Show personal facet active/provisional counts without raw evidence bodies.
- [x] Show next commands for profile review, pin, forget, rebuild, bundle preview, and skill injection preview.
- [x] Add site tests proving no raw private evidence or sidecar bodies render by default.

## Task 11: Agent Access And MCP Compatibility

**Files:**

- Modify: `packages/core/src/agent-access/manifest.ts`
- Modify: `packages/core/src/agent-access/mcp.ts`
- Modify: `packages/core/src/agent-access/skill.ts`
- Modify: `tests/core/agent-access.test.ts`
- Modify: `tests/core/mcp-handlers.test.ts`

- [x] Expose bundle metadata and trust-tier guidance in generated agent access assets.
- [x] Keep MCP responses budgeted and citation-preserving.
- [x] Ensure MCP can return promoted skill references without returning unreviewed candidate bodies.
- [x] Add tests for bundle budget, trust wrappers, promoted skill references, and stable PB authority.

## Task 12: Verification

- [x] Run `pnpm exec tsc -p tsconfig.tests.json`.
- [x] Run focused tests:
  `pnpm test -- --test-name-pattern "context juice|context bundle|skill injection|personal learning|trust boundary|agent access|mcp|daily|site"`.
- [x] Run `pnpm build`.
- [x] Run a bounded personal daily smoke with context juice, bundle preview, and profile rebuild.
- [x] Verify stable `kb/**` and `skills/**` changed only through existing promotion paths.
- [x] Verify unchanged sources do not spend new uncached AI calls.
- [x] Verify M24 report shows byte savings, trust tiers, injected/skipped skill decisions, and personal facet counts.
