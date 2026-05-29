# Tasks

## 1. Promotion Policy Gate

- [x] Add policy option requiring passing skill validation before stable skill promotion.
- [x] Check validation report candidate id, target path, source hashes, decision, and freshness at promote time.
- [x] Reject promotion with a machine-readable error when validation evidence is missing, stale, mismatched, or failing.
- [x] Add tests for personal audit plus validation and validation freshness failure paths.

## 2. Lifecycle Daily And Site Queue

- [x] Add lifecycle report counts to daily report summaries.
- [x] Add lifecycle next actions for non-no-op lifecycle proposals.
- [x] Render lifecycle proposal counts in HTML review pages without changing stable `kb/**`.
- [x] Add tests proving catalog summaries do not inflate lifecycle or review queue counts.

## 3. Skill Validation Daily And Site Queue

- [x] Add validation report counts to daily report summaries.
- [x] Add skill validation next actions before skill promotion when candidates lack passing validation.
- [x] Render validation status on skill candidate cards.
- [x] Add tests for pass, fail, needs_human, missing report, stale report, and skill candidate display.

## 4. Stable Context Ranking

- [x] Define explicit context source ranks: PB stable, PB catalog, GBrain sidecar, AgentMemory sidecar, raw/debug.
- [x] Update context retrieval ordering to prefer stable PB matches over duplicate sidecar hits.
- [x] Keep sidecar hits visible as supporting context when useful.
- [x] Add tests proving stable PB context outranks GBrain and AgentMemory sidecar hits.

## 5. Trajectory Adapter Mapping

- [x] Map Codex session summaries into bounded trajectory fields when available.
- [x] Map Claude Code session summaries into bounded trajectory fields when available.
- [x] Map OpenCode session summaries into bounded trajectory fields when available.
- [x] Map OpenClaw staged/daily envelopes into bounded trajectory fields when available.
- [x] Add tests proving raw transcripts/logs remain rejected.

## 6. AgentMemory Warning-Only Interop

- [x] Add tests proving AgentMemory absence does not block daily, review, promotion, site build, or GBrain export.
- [x] Add tests proving AgentMemory health/import/export failures are warnings for PB/GBrain flows.
- [x] Ensure team mode excludes personal AgentMemory sidecar hits from promotion evidence.
- [x] Keep explicit AgentMemory-only commands allowed to fail when their requested target fails.

## 7. Verification

- [x] Run `pnpm build`.
- [x] Run `pnpm exec tsc -p tsconfig.tests.json`.
- [x] Run focused tests for promotion policy, daily next actions, site rendering, and lifecycle.
- [x] Run `pnpm test`.
- [x] Verify no stable `kb/**` or `skills/**` files changed outside review/promote fixtures.
- [x] Verify no M24 docs or implementation files were touched.
