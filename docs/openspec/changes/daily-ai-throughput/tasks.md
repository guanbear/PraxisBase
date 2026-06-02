# Tasks

- [ ] Extend AI config schema and CLI init with `distill_model` and `curation_model`.
- [ ] Use `distill_model ?? model` for daily AI distill provider clients.
- [ ] Use `curation_model ?? model` for wiki curation provider clients.
- [ ] Add `.praxisbase/cache/ai-distill` protocol path and persistent cache read/write in daily distill.
- [ ] Add `ai_distill.cache_hits` to daily report/progress schema.
- [ ] Raise daily distill concurrency clamp to 16.
- [ ] Retry HTTP 429 and transient 5xx responses in the OpenAI-compatible client.
- [ ] Add tests for staged config, staged provider request models, cache reuse, report schema, and high concurrency.
- [ ] Add `--retry-failed-distill-only` so failed-tail recovery reuses cached successes and retries only cached failed distill chunks.
- [ ] Repair known GLM merged `risks`/`suggested_tags` structured-output drift before schema validation.
- [ ] Run `pnpm check`.
- [ ] Configure local GLM-4.7 distill / GLM-5.1 curation and run daily twice to verify cache reuse.
- [ ] Run a failed-tail retry with GLM-4.7 and verify failed count falls without rerunning cached success chunks.
