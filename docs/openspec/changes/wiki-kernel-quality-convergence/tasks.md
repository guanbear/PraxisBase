# Wiki Kernel Quality Convergence Tasks

## M14.x Documentation And Contracts

- [x] Write design document describing the quality convergence contract.
- [x] Add OpenSpec proposal, design, and tasks.
- [x] Add BDD scenarios for bad-title rejection, authority-tiered context, and review taxonomy.
- [x] Add implementation plan with TDD checkpoints.

## M14.x.1 Semantic Promotion Gate

- [x] Add failing tests for process-status titles and generic `When to Use`/`What To Do` bodies.
- [x] Implement reusable topic, applicability, action specificity, and coherence checks.
- [x] Ensure semantic failures block auto-promotion and appear in review risk notes.
- [x] Enforce the semantic gate at promote time so stale generated proposals cannot bypass curation assessment.

## M14.x.2 Topic And Title Convergence

- [x] Add failing curation tests for current bad smoke examples.
- [x] Stop using raw process evidence titles as stable title fallback.
- [x] Prefer topic planner titles or deterministic problem/action/entity titles.
- [x] Reject clusters that cannot produce a reusable topic.

## M14.x.3 Authority-Tiered Agent Context

- [x] Add failing `context get` tests proving raw-vault refs are excluded by default.
- [x] Add retrieval ranking tests proving stable wiki outranks raw evidence.
- [x] Implement authority tiers in context candidate collection and ranking.
- [x] Exclude stable `kb/` pages that fail promote-time wiki quality from default agent context.

## M14.x.4 Human-Required Taxonomy

- [x] Add daily/curation report tests for categorized counts.
- [x] Populate `privacy_required`, `review_required`, `rejected_low_signal`, and `rejected_quality`.
- [x] Keep static site headline behavior aligned with the curated review queue rather than raw input counts.

## M14.x.5 Verification

- [x] Run focused tests for wiki curation, promotion quality, context retrieval, and daily loop.
- [x] Run `pnpm check`.
- [x] Re-run real personal daily smoke.
- [x] Inspect generated `kb/` and `context get` output for quality regressions.
- [x] Confirm stale generated wiki proposal files no longer accumulate across current curation runs.
