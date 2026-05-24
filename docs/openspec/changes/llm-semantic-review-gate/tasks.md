# Tasks

- [ ] Add semantic review schema, prompt builder, and AI runner.
- [ ] Add deterministic semantic arbitration policy.
- [ ] Wire semantic review into wiki curation before candidate write.
- [ ] Add semantic review counts to curation and daily reports.
- [ ] Require passing semantic review for personal auto-promotion of new wiki pages.
- [ ] Add review model and semantic review CLI options.
- [ ] Use effective review model selection `review_model ?? curation_model ?? model`.
- [ ] Keep reviewer inputs compatible with context economy by reviewing distilled summaries and provenance excerpts, not raw noisy transcripts.
- [ ] Treat agentmemory sidecar hits as non-authoritative unless ingested into PraxisBase provenance.
- [ ] Render semantic review decisions and reasons in the site/review UI.
- [ ] Add mocked tests for promote, merge, reject, revise, needs_human, malformed JSON, timeout, and unavailable reviewer.
- [ ] Add real bad-example regression tests for task-runner fragments, one-off smoke reports, and merge-worthy replay fragments.
- [ ] Run `pnpm check` and a real personal wiki smoke.
