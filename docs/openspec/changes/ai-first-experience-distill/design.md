# AI-First Experience Distill Design

## Overview

The AI-first pipeline adds a distillation layer between source resolution and wiki proposal generation.

```text
source configs
  -> source adapters
  -> bounded source chunks
  -> privacy precheck
  -> AI distill
  -> schema validation
  -> privacy postcheck
  -> experience envelopes
  -> memory ingest
  -> wiki/skill proposals
  -> review/promote
  -> site/context
```

Deterministic code owns source identity, hashes, citations, redaction checks, privacy verdicts, proposal boundaries, graph resolution, site rendering, and context retrieval. AI owns semantic extraction from noisy agent material.

## AI Is Required For Production

Daily production mode requires a configured AI provider.

Default behavior:

```bash
praxisbase daily run --mode personal --build-site --json
```

If no provider is configured, the command exits with a clear diagnostic:

```json
{
  "ok": false,
  "code": "AI_DISTILL_NOT_CONFIGURED",
  "message": "AI distill is required for production daily runs. Run praxisbase ai init or pass --degraded for bootstrap-only output."
}
```

Explicit degraded behavior:

```bash
praxisbase daily run --mode personal --degraded --build-site --json
praxisbase daily run --mode personal --no-ai --build-site --json
```

`--degraded` and `--no-ai` are equivalent for the daily command. They permit collection, deterministic summaries, reports, and site skeleton generation, but the daily report must include:

- `ai_distill.configured = false`;
- `ai_distill.mode = "degraded"`;
- `ai_distill.production_ready = false`;
- warnings that generated summaries are low-confidence.

## Provider Configuration

Add a local provider config under `.praxisbase/ai/config.json`.

The config stores non-secret provider metadata:

```json
{
  "protocol_version": "0.1",
  "type": "ai_provider_config",
  "provider": "openai-compatible",
  "model": "configured-by-user",
  "base_url_env": "PRAXISBASE_LLM_BASE_URL",
  "api_key_env": "PRAXISBASE_LLM_API_KEY",
  "default_temperature": 0,
  "max_input_bytes": 24576,
  "max_output_bytes": 8192,
  "ai_timeout_ms": 90000
}
```

Secrets are never written to config. They are read from environment variables or the user's local secret manager by the runtime command.

Commands:

```bash
praxisbase ai init --provider openai-compatible --model <model> --json
praxisbase ai init --provider openai-compatible --model <model> --ai-timeout-ms 30000 --json
praxisbase ai doctor --json
praxisbase ai distill --source <path> --agent codex --json
```

`ai doctor` validates:

- config exists;
- required environment variables are present;
- base URL is valid when used;
- a short schema-constrained model call succeeds unless `--offline` is passed.

Doctor must not print secret values.

`ai_timeout_ms` bounds each provider call. A timeout is an item-level AI failure with a clear diagnostic, not an unbounded process hang.

## Distill Contract

AI distill consumes bounded chunks. It never receives an unbounded transcript.

Daily runs may also bound total AI work with:

```bash
praxisbase daily run --mode personal --max-ai-chunks 20 --ai-timeout-ms 30000 --build-site --json
```

`--max-ai-chunks` caps production AI distill across all configured sources for that run. When the cap is reached, the daily report records `max_ai_chunks_reached:<n>` in `ai_distill.warnings`. This is an operational budget, not a quality gate; later runs can raise the cap or narrow sources.

`--ai-timeout-ms` overrides the provider config for one daily run. It is useful for smoke tests and scheduled jobs where stale provider calls must fail quickly.

Input object:

```ts
interface DistillInput {
  source_id: string;
  agent: "codex" | "openclaw" | "claude-code" | "opencode" | "openhuman" | "generic";
  channel: string;
  source_ref: string;
  source_hash: string;
  scope_hint: "personal" | "project" | "team" | "org";
  chunk_id: string;
  chunk_hash: string;
  text: string;
  prior_context?: string[];
}
```

Output object:

```ts
interface DistilledExperience {
  source_ref: string;
  source_hash: string;
  chunk_hashes: string[];
  agent: string;
  scope_hint: "personal" | "project" | "team" | "org";
  summary: string;
  problem?: string;
  context?: string;
  actions: string[];
  failed_attempts: string[];
  outcome: "success" | "failed" | "partial" | "unknown";
  verification: string[];
  reusable_lessons: string[];
  risks: string[];
  suggested_tags: string[];
  suggested_wiki_kind: "known_fix" | "procedure" | "decision" | "pitfall" | "preference" | "incident" | "note";
  skill_candidate: {
    should_create: boolean;
    title?: string;
    trigger?: string;
    procedure?: string[];
  };
  confidence: number;
}
```

The schema is strict. Invalid AI JSON is rejected and written to a distill report as a failed item, not retried indefinitely.

## Privacy Model

### Precheck

Before AI sees text, deterministic privacy checks classify each chunk:

- `allow_for_ai`: may be sent to configured AI provider;
- `local_only`: may be sent only when provider policy allows local/private processing;
- `human_required`: cannot be sent to AI or downstream;
- `reject`: cannot be used.

Examples that become `human_required` or `reject`:

- private keys;
- API keys;
- cookies;
- auth headers;
- access tokens;
- raw credential dumps.

### Postcheck

Every AI output is scanned again. If the summary contains private material, it is discarded and routed to human-required.

### Personal Mode

Personal mode is local-owner-first:

- raw material may stay on the user's machine in ignored `.praxisbase/` paths;
- safe AI summaries may enter personal raw-vault refs and context;
- personal summaries do not auto-promote to team/org;
- human-required should be reserved for genuinely unsafe or ambiguous cases, not every full transcript.

### Team Mode

Team mode is team-repository-first:

- personal scope is rejected;
- private chat/direct message hints are rejected;
- uncertain scope becomes human-required;
- AI cannot overrule deterministic team privacy gates.

## Chunking

Chunking is source-aware.

Codex session chunks:

- prefer assistant final summaries, tool results, changed files, test commands, and explicit outcomes;
- ignore hidden auth/config files;
- keep source path and hash in metadata.

OpenClaw memory chunks:

- read sqlite rows and export items as structured chunks;
- preserve OpenClaw source ref;
- infer problem signature when deterministic signatures exist.

Claude Code repair log chunks:

- extract issue, files touched, commands run, test outcome, and final message;
- never keep full raw logs as proposal body.

Each chunk must fit provider input limits and be independently hashable.

## Wiki And Skill Proposal Generation

AI-distilled experience can generate proposal candidates:

- `known_fix` when problem/action/outcome/verification are present;
- `procedure` when steps are reusable;
- `pitfall` when failed attempts or repeated failure are central;
- `decision` when tradeoff and chosen approach are explicit;
- `preference` only for personal scope unless explicitly team-scoped;
- `skill` when the same trigger/procedure appears repeatedly with successful outcomes.

AI proposals remain proposals. Stable writes require review/promote.

## First-Run Agent Bootstrap

Add an agent-readable bootstrap skill generated by:

```bash
praxisbase bootstrap personal --agent codex --install-skill --json
```

The generated skill tells an agent how to:

1. run `praxisbase ai doctor`;
2. initialize AI config if missing;
3. discover local Codex/OpenClaw/OpenClaw sqlite paths;
4. add sources without adding whole secret-bearing home directories;
5. run a degraded smoke only when AI is missing;
6. run production daily when AI is ready;
7. open or report the generated HTML site;
8. retrieve context with `praxisbase context get`;
9. explain human-required exceptions without printing private content.

## Reports

Daily reports gain:

```ts
ai_distill: {
  configured: boolean;
  mode: "production" | "degraded";
  production_ready: boolean;
  provider?: string;
  model?: string;
  chunks: number;
  distilled: number;
  failed: number;
  human_required: number;
  warnings: string[];
}
```

Distill reports are written under:

```text
.praxisbase/reports/ai-distill/
```

They store source refs, hashes, counts, schema errors, and redacted summaries only.

`daily run` also writes live progress snapshots under:

```text
.praxisbase/runs/live/
```

The live progress file records the run id, current status, processed source count, AI chunk counts, distilled count, failed count, human-required count, warnings, and the latest source id. Operators can inspect this file while a long run is still executing.

After source distill finishes, daily progress sets `current_source` to `wiki-curate` while the wiki proposal synthesis stage is running. The same `--ai-timeout-ms` override applies to this curation AI call path.

## Error Handling

- Missing config in production daily: fail with `AI_DISTILL_NOT_CONFIGURED`.
- Missing secret env var: fail with `AI_DISTILL_CREDENTIAL_MISSING`.
- Provider timeout: fail current distill item and continue only when `--best-effort` is explicit.
- Invalid AI JSON: record schema error and skip item.
- Privacy postcheck failure: write human-required exception.
- Team privacy rejection: reject before AI proposal generation.

## Testing Strategy

Unit tests use mocked AI clients. No normal test may call a live model.

Required test surfaces:

- provider config read/write and doctor diagnostics;
- production daily fails without AI;
- degraded daily works and reports non-production status;
- schema validation rejects malformed AI output;
- personal mode summarizes safe transcript chunks without human-required explosion;
- team mode rejects personal/private material before AI proposal generation;
- wiki proposal candidates use distilled fields;
- generated bootstrap skill contains first-run commands and privacy warnings.
