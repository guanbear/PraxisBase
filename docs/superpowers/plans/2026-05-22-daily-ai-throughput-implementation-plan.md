# Daily AI Throughput Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stage-specific AI model selection, bounded higher concurrency, and persistent incremental distill cache for daily experience runs.

**Architecture:** Extend the existing AI provider config in place, derive effective stage configs at call sites, and add a small persistent cache module inside the daily pipeline. The daily report schema becomes the public observability surface for cache reuse.

**Tech Stack:** TypeScript, Node test runner, Zod protocol schemas, existing `writeJson`/`readJson` file store helpers, OpenAI-compatible JSON client.

---

### Task 1: Stage Model Config

**Files:**
- Modify: `packages/core/src/ai/config.ts`
- Modify: `packages/cli/src/commands/ai.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/core/ai-config.test.ts`
- Test: `tests/cli/ai-command.test.ts`

- [ ] Add failing core test that writes `model`, `distillModel`, and `curationModel`, then asserts `distill_model` and `curation_model` persist.
- [ ] Add failing CLI test for `ai init --distill-model GLM-4.7 --curation-model GLM-5.1`.
- [ ] Extend `AiProviderConfigSchema` with optional `distill_model` and `curation_model`.
- [ ] Extend `WriteAiProviderConfigInput`, `writeAiProviderConfig`, and CLI option plumbing.
- [ ] Run:

```bash
pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/ai-config.test.js dist-tests/tests/cli/ai-command.test.js
```

### Task 2: Effective Models In Runtime

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/core/src/wiki/curate.ts`
- Test: `tests/core/experience-daily.test.ts`
- Test: `tests/core/wiki-curator-ai.test.ts`

- [ ] Add failing daily test that configures `model: GLM-5.1`, `distillModel: GLM-4.7` and asserts provider request body uses `GLM-4.7`.
- [ ] Add failing curation test that configures `curationModel: GLM-5.1` and asserts provider request body uses it.
- [ ] In daily, create the AI client from `{ ...config, model: config.distill_model ?? config.model }`.
- [ ] In curation, create the AI client from `{ ...config, model: config.curation_model ?? config.model }`.
- [ ] Report the effective stage model.
- [ ] Run focused tests for daily and curator AI.

### Task 3: Distill Cache

**Files:**
- Modify: `packages/core/src/protocol/paths.ts`
- Modify: `packages/core/src/protocol/schemas.ts`
- Modify: `packages/core/src/experience/daily.ts`
- Test: `tests/core/experience-daily.test.ts`
- Test: `tests/core/daily-experience-protocol.test.ts`

- [ ] Add failing report schema test for `ai_distill.cache_hits`.
- [ ] Add failing daily test: first run writes a distill success; second run over the same source uses cache and does not call distill AI.
- [ ] Add `protocolPaths.cacheAiDistill`.
- [ ] Compute cache key from `ai-distill-v1`, authority mode, effective model, source id, source hash, and chunk hash.
- [ ] On cache success hit, rebuild an envelope and increment `distilled` plus `cache_hits`.
- [ ] On cache privacy hit, rebuild a human-required envelope and increment `human_required` plus `cache_hits`.
- [ ] On miss, call AI and write cache for success/privacy outcomes.
- [ ] Run focused daily/protocol tests.

### Task 4: Higher Bounded Concurrency

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Test: `tests/core/experience-daily.test.ts`

- [ ] Add failing concurrency test with 10+ chunks and `aiConcurrency: 12`.
- [ ] Raise daily concurrency clamp to 16.
- [ ] Verify observed max in-flight calls can exceed 8 and does not exceed the requested value.
- [ ] Run focused daily tests.

### Task 5: Verification And Local Run

**Files:**
- No source edits expected after this task.

- [ ] Run:

```bash
pnpm check
```

- [ ] Configure local staged model:

```bash
node packages/cli/dist/index.js ai init --provider openai-compatible --model GLM-5.1 --distill-model GLM-4.7 --curation-model GLM-5.1 --base-url https://open.bigmodel.cn/api/coding/paas/v4 --api-key-env ZAI_API_KEY --json
```

- [ ] Run daily once:

```bash
node packages/cli/dist/index.js daily run --mode personal --ai-concurrency 12 --ai-timeout-ms 45000 --max-curation-proposals 20 --build-site --json
```

- [ ] Run daily a second time with the same command and confirm `ai_distill.cache_hits` rises and repeated chunks avoid distill model calls.

- [ ] Commit and push code/docs only, excluding generated `kb/` unless the user explicitly asks to publish local generated knowledge.
