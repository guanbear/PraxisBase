# Daily AI Throughput Design

## Goal

Make production daily experience runs fast enough for full local use without weakening the wiki kernel:

```text
raw evidence -> privacy precheck -> cached AI distill -> experience envelopes -> wiki compile -> AI curation -> review/promote -> HTML
```

The speed path must preserve provenance, privacy gates, structured output, and curation quality. It must not turn the pipeline into a best-effort transcript summarizer.

## Stage Models

PraxisBase keeps one provider config but may select different models per pipeline stage:

```json
{
  "provider": "openai-compatible",
  "model": "GLM-5.1",
  "distill_model": "GLM-4.7",
  "curation_model": "GLM-5.1"
}
```

Rules:

- `model` remains the default and backward-compatible fallback.
- `distill_model ?? model` is used for noisy chunk extraction.
- `curation_model ?? model` is used for wiki proposal synthesis.
- `ai doctor` still validates the single provider and secret env; it reports the configured default model and keeps secrets out of output.
- CLI init supports `--distill-model` and `--curation-model` so the user does not hand-edit JSON.

The recommended local profile is GLM-4.7 for distill and GLM-5.1 for curation. Distill is high-volume and schema-constrained; curation is lower-volume and has more quality risk.

## Incremental Distill Cache

Daily runs persist distill decisions under `.praxisbase/cache/ai-distill`. A cache entry is keyed by:

- prompt/schema version, currently `ai-distill-v1`;
- authority mode (`personal-local` or `team-git`);
- distill model;
- source id;
- source hash;
- chunk hash.

The cache stores the full safe result needed to recreate the downstream envelope:

- success: the validated `DistilledExperience`;
- human-required privacy result from AI postcheck;
- AI failure diagnostic for observability.

Only success and privacy blocks are replayed into the pipeline. Transient AI failures stay visible but are not treated as successful work. Reusing a cached success must still rebuild envelopes for the current run timestamp and current source report, but it must not call the model again.

`praxisbase daily run --retry-failed-distill-only` is the explicit failed-tail recovery mode. It replays cached successes and cached human-required privacy outcomes, sends only cached `failed` distill entries back to the model, and skips uncached chunks. Skipped uncached chunks are reported as `retry_failed_distill_skipped_uncached:N` so operators can distinguish a tail retry from a new full run.

The distill normalizer repairs known GLM structured-output drift before schema validation, including the observed case where `risks` and `suggested_tags` are merged into a malformed object key. Repairs must remain conservative: they can convert recognizable field drift into the existing schema, but they must not invent missing evidence or bypass privacy checks.

## Concurrency

`--ai-concurrency` remains explicit and bounded. The upper clamp moves from 8 to 16 so high-concurrency providers can be used without opening unbounded requests.

The OpenAI-compatible client treats HTTP 429 and transient 5xx responses as retryable. It uses `Retry-After` when the provider returns it, otherwise a short exponential backoff. This is not a replacement for sane concurrency: if a provider rate-limits at 12, the operator should rerun at 6-8 and let the cache skip completed chunks.

Recommended commands:

```bash
praxisbase ai init \
  --provider openai-compatible \
  --model GLM-5.1 \
  --distill-model GLM-4.7 \
  --curation-model GLM-5.1 \
  --base-url https://open.bigmodel.cn/api/coding/paas/v4 \
  --api-key-env ZAI_API_KEY \
  --json

praxisbase daily run \
  --mode personal \
  --ai-concurrency 8 \
  --ai-timeout-ms 45000 \
  --max-curation-proposals 20 \
  --build-site \
  --json

praxisbase daily run \
  --mode personal \
  --retry-failed-distill-only \
  --ai-concurrency 8 \
  --ai-timeout-ms 60000 \
  --max-curation-proposals 20 \
  --build-site \
  --json
```

## Reporting

Daily reports and live progress include:

- `ai_distill.model`: the effective distill model;
- `ai_distill.cache_hits`: number of chunks replayed from persistent cache;
- existing `chunks`, `distilled`, `failed`, and `human_required` counts.

`chunks` remains the amount of accepted distill work, including cache hits. This makes budget reports stable while `cache_hits` reveals how much model work was skipped.

## Non-Goals

- Do not batch multiple chunks into one model call in this change. That is a later optimization because it changes prompt and failure isolation semantics.
- Do not bypass privacy precheck for cached chunks.
- Do not auto-promote wiki proposals. This change only accelerates candidate generation.
- Do not commit generated local `kb/` or `.praxisbase` run artifacts as part of the feature implementation.

## Acceptance

- A config with staged models round-trips through core and CLI.
- Daily distill sends provider calls with the effective distill model.
- Wiki curation sends provider calls with the effective curation model.
- A second daily run over the same chunk reuses the distill cache without calling the distill model.
- A failed-tail retry run calls the distill model only for chunks with cached failed distill entries.
- GLM merged `risks`/`suggested_tags` output is repaired into valid schema fields.
- Requested concurrency above 8 can run concurrently and remains capped at 16.
- Reports expose cache hits.
