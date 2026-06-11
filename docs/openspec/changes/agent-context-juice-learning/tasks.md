# Agent Context Juice And Personal Learning Tasks

## 1. Schemas And Paths

- [x] Add context juice, bundle, trust, skill injection, and personal facet schemas.
- [x] Add paths for context juice reports, agent bundle reports, personal profile, and personal facet state.
- [x] Add schema tests for valid records, rejected raw transcript fields, trust tiers, and user override states.

## 2. Context Juice Core

- [x] Implement UTF-8 safe source item budgeting with dropped-byte markers.
- [x] Implement token estimates and bundle budget helpers.
- [x] Implement idempotent trajectory microcompact with stable placeholders.
- [x] Preserve failures, fixes, verification, explicit lessons, source refs, source hashes, and recent tool results.
- [x] Add unit tests for multibyte truncation, idempotency, protected signals, and byte accounting.

## 3. Daily And Cache Identity Integration

- [x] Run context juice before expensive AI/review inputs and agent bundle generation.
- [x] Include context juice version and budget identity in source item cache keys.
- [x] Report original bytes, kept bytes, saved bytes, microcompact counts, warnings, and protected signal counts.
- [x] Add tests proving unchanged sources do not spend new uncached AI budget.

## 4. Optional Oversized Payload Pre-Summary

- [x] Add thresholded model-backed pre-summary with lower cap, upper cap, timeout, max calls, and failure breaker.
- [x] Reject non-shrinking, empty, malformed, privacy-unsafe, or provenance-free summaries.
- [x] Keep team stable-write use disabled unless explicit policy enables it.
- [x] Add mocked AI tests for pass-through, success, discard, and breaker behavior.

## 5. Trust Boundary

- [x] Implement trust tier classification and default-deny unknown sources.
- [x] Wrap sidecar/external content with escaped untrusted markers.
- [x] Keep candidates non-injectable by default.
- [x] Add tests for PB stable, GBrain sidecar, AgentMemory sidecar, remote personal agent, unknown source, and escaping.

## 6. Promoted Skill Injection

- [x] Add promoted skill matching by explicit mention, trigger, tag, related wiki, and catalog. Semantic rerank remains an optional future hook; M24 uses deterministic ranking only.
- [x] Render bounded `[PB-SKILL:<id>]` blocks under an 8 KiB default budget.
- [x] Emit match/skip decisions with reasons and byte counts.
- [x] Exclude candidates and external-installed skills by default.
- [x] Add tests for ordering, budget exhaustion, truncation, candidate exclusion, and reason reporting.

## 7. Agent Context Bundle Builder

- [x] Build bundles from personal facets, stable PB pages, promoted skills/catalog-derived items, retrieval neighbors, and sidecar hits.
- [x] Enforce total and per-section budgets.
- [x] Preserve citations before full bodies.
- [x] Rank stable PB above GBrain and AgentMemory sidecars.
- [x] Wrap untrusted content.
- [x] Add tests for ordering, truncation, citations, omitted-item summaries, and no candidate injection.

## 8. Personal Learning Cache

- [x] Add facet state with class, key, value, cue family, evidence refs, score, state, and user override.
- [x] Implement stability scoring, class budgets, pin, forget, and conflict resolution.
- [x] Add producers from explicit local instruction, distilled personal summaries, manual entries, and imported sidecar/profile records as personal candidates.
- [x] Render managed `.praxisbase/personal/profile.md` blocks.
- [x] Add tests for active/provisional/candidate/dropped, pinned, forgotten, budgets, and team exclusion.

## 9. CLI

- [x] Add `praxisbase context bundle`.
- [x] Add `praxisbase context juice`.
- [x] Add `praxisbase personal profile add|list|pin|forget|rebuild`.
- [x] Add `praxisbase skill inject-preview`.
- [x] Add CLI tests for JSON shape, privacy-safe output, profile overrides, and team-mode facet exclusion.

## 10. Site And Reports

- [x] Show context juice savings and warnings.
- [x] Show bundle budget and trust-tier counts.
- [x] Show skill injection matches and skip reasons.
- [x] Show personal facet counts without raw private evidence.
- [x] Add site tests proving raw sidecar bodies and private facet evidence are hidden by default.

## 11. Agent Access And MCP

- [x] Expose bundle metadata in generated agent access assets.
- [x] Keep MCP responses budgeted and citation-preserving.
- [x] Allow MCP to return promoted skill references without unreviewed candidate bodies.
- [x] Add tests for stable PB authority, wrappers, and promoted skill references.

## 12. Verification

- [x] Run `pnpm exec tsc -p tsconfig.tests.json`.
- [x] Run focused context juice, bundle, skill injection, personal learning, trust boundary, daily, site, agent-access, and MCP tests.
- [x] Run `pnpm build`.
- [x] Run bounded personal daily smoke with context juice, bundle preview, and profile rebuild.
- [x] Verify stable `kb/**` and `skills/**` are unchanged except through existing promotion flows.
