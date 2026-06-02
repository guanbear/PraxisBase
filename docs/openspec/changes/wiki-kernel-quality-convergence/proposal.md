# Wiki Kernel Quality Convergence Proposal

## Why

PraxisBase now has a working personal daily pipeline, but real smoke output shows the wiki kernel is still too permissive. Weak process titles can become stable wiki pages, raw-vault summaries can appear in `context get`, and human-required counts mix true decisions with dropped or low-signal material.

This weakens the original LLM Wiki goal: raw material should be evidence, not guidance.

## What Changes

- Add an authority-tiered context contract so stable `kb/` and `skills/` outrank and default-exclude raw evidence.
- Add semantic promotion guards for reusable topic, applicability, action specificity, and coherence.
- Tighten topic/title fallback so raw process-status evidence titles cannot become stable wiki titles.
- Split daily/curation human-required metrics into privacy-required, review-required, rejected-low-signal, and rejected-quality categories.
- Add golden tests based on current bad real-smoke examples.

## Impact

- Personal mode may promote fewer pages, but promoted pages should be more useful.
- Team mode remains conservative and unchanged for stable writes.
- Existing stable `kb/` is not deleted by this change.
- Runtime `kb/` output remains local unless explicitly committed by the user.

## Out of Scope

- New hosted services or vector databases.
- Full visual redesign of the static HTML site.
- New MCP write tools.

