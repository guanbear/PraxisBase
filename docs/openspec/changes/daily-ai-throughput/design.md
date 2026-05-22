# Daily AI Throughput Design

## Pipeline

Daily production remains:

```text
source chunks -> privacy precheck -> AI distill/cache -> envelopes -> memory ingest -> wiki compile -> AI curation -> review proposals -> HTML
```

The cache sits after privacy precheck and before AI distill. Privacy precheck still runs every time because authority mode and team/personal policy are run-time decisions.

## Effective Model Selection

AI config adds optional `distill_model` and `curation_model`.

Effective models:

- distill: `distill_model ?? model`;
- curation: `curation_model ?? model`;
- all other AI calls: `model` unless that caller later defines a stage.

The OpenAI-compatible client remains unchanged; callers pass a stage-adjusted config.

## Cache Protocol

Cache directory: `.praxisbase/cache/ai-distill`.

Cache version: `ai-distill-v1`.

Cache key material:

```text
ai-distill-v1
authority_mode
effective_distill_model
source_id
source_hash
chunk_hash
```

Cache entry:

```json
{
  "type": "ai_distill_cache_entry",
  "version": "ai-distill-v1",
  "status": "distilled",
  "model": "GLM-4.7",
  "authority_mode": "personal-local",
  "source_id": "...",
  "source_hash": "sha256:...",
  "chunk_hash": "sha256:...",
  "experience": { "...": "validated DistilledExperience" },
  "created_at": "..."
}
```

`status` may be `distilled`, `human_required`, or `failed`. Only `distilled` and `human_required` are replayed as cache hits. Failed entries are observability records; future runs may retry them.

## Reporting

Daily report and progress add:

```json
"ai_distill": {
  "model": "GLM-4.7",
  "chunks": 563,
  "distilled": 520,
  "human_required": 40,
  "failed": 3,
  "cache_hits": 480
}
```

`chunks` counts accepted distill work, including cache hits. `cache_hits` is the number of those chunks that did not call the model.

## Concurrency

`--ai-concurrency` is clamped to `1..16`. The user may choose 12 for GLM-4.7. The default remains conservative.

The provider client retries HTTP 429, 500, 502, 503, and 504. It honors `Retry-After` when present and otherwise uses a short exponential backoff. Repeated rate limits still surface as AI failures so the daily report remains honest.

## Risks

- A prompt/schema change could make old cached output stale. The cache version must change when the distill prompt or output semantics change materially.
- A model change should not reuse old distill results. The effective distill model is part of the cache key.
- Team mode must not reuse personal-mode decisions. Authority mode is part of the cache key and privacy precheck still runs before lookup.
