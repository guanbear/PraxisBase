# Proposal: Daily AI Throughput

## Problem

Full personal daily runs can spend most of their time in AI distill. The current provider config uses one model for every AI stage, the daily concurrency cap is conservative for high-throughput providers, and repeated chunks are re-distilled on later runs.

This makes the system feel unreliable even when the kernel is correct.

## Change

Add:

- stage-specific AI model selection for distill and curation;
- persistent incremental distill cache;
- `ai_distill.cache_hits` reporting;
- a higher but still bounded daily distill concurrency cap.

## Impact

Users can run GLM-4.7 with higher concurrency for high-volume distill and keep GLM-5.1 for lower-volume curation. Re-running daily over already-seen chunks reuses prior validated distill output instead of spending model calls again.
