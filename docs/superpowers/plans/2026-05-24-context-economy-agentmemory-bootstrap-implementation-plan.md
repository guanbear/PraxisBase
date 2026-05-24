# Context Economy, AgentMemory Interop, And Personal Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic pre-AI source compression, first-class agentmemory source/sink/retrieval interop, and a simple personal init/connect/run workflow.

**Architecture:** Insert a context reducer between source resolution and chunking, add a focused agentmemory REST adapter that never becomes the wiki authority, and expose personal workflow commands that wrap existing source, daily, kb, site, and agent-tool primitives. Keep all state file-first under `.praxisbase/`, `kb/`, `skills/`, and `dist/`.

**Tech Stack:** TypeScript, Node.js, Zod protocol schemas, existing file-store helpers, existing OpenAI-compatible AI config, mocked REST tests, static HTML site renderer.

---

### Task 1: Context Reducer Protocol And Rules

**Files:**
- Create: `packages/core/src/experience/context-reducer.ts`
- Create: `packages/core/src/experience/context-reducer-rules.ts`
- Modify: `packages/core/src/protocol/paths.ts`
- Modify: `packages/core/src/protocol/schemas.ts`
- Test: `tests/core/context-reducer.test.ts`
- Test: `tests/core/daily-experience-protocol.test.ts`

- [ ] Add failing tests for rule matching by agent/parser/source ref.
- [ ] Add failing tests for `strip_ansi`, `drop_lines_matching`, `dedupe_adjacent_lines`, `collapse_whitespace`, `head_tail`, `preserve_sections_matching`, and `truncate`.
- [ ] Add failing protocol test for `context_economy` report fields.
- [ ] Implement `ContextReducerRuleSchema`, `ContextReductionReportSchema`, and report path `.praxisbase/reports/context-economy`.
- [ ] Implement deterministic reducer actions with UTF-8 safe slicing.
- [ ] Implement built-in rules for Codex session, OpenClaw log, agentmemory memory, command/test output, and generic fallback.
- [ ] Run focused tests:

```bash
pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/context-reducer.test.js dist-tests/tests/core/daily-experience-protocol.test.js
```

### Task 2: Insert Reducer Before Chunking And AI Distill

**Files:**
- Modify: `packages/core/src/experience/source-adapters.ts`
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/core/src/experience/chunking.ts`
- Test: `tests/core/experience-daily.test.ts`
- Test: `tests/core/source-adapters.test.ts`

- [ ] Add failing daily test proving reducer runs before chunking by asserting a noisy source produces fewer chunk bytes and the AI client receives reduced text.
- [ ] Add failing test proving source refs and source hashes are preserved after reduction.
- [ ] Add failing test for `--no-context-economy` or equivalent input flag that bypasses reduction.
- [ ] Add `contextEconomy?: boolean` to `RunDailyExperienceInput`, defaulting to true.
- [ ] Reduce raw item text immediately after source item normalization and before `chunkExperienceSource`.
- [ ] Accumulate report counters: items seen, items reduced, input bytes, output bytes, saved bytes, rule hits, warnings.
- [ ] Persist compact reducer debug reports without raw unredacted content.
- [ ] Run focused daily/source tests.

### Task 3: AgentMemory REST Client

**Files:**
- Create: `packages/core/src/experience/agentmemory-client.ts`
- Create: `packages/core/src/experience/agentmemory-adapter.ts`
- Modify: `packages/core/src/protocol/schemas.ts`
- Test: `tests/core/agentmemory-adapter.test.ts`

- [ ] Add mocked REST tests for `GET /agentmemory/health`, `GET /agentmemory/livez`, `POST /agentmemory/smart-search`, `GET /agentmemory/memories`, and `POST /agentmemory/remember`.
- [ ] Add failing test that bearer tokens are refused over plaintext non-loopback HTTP.
- [ ] Implement `AgentMemoryClient` with configurable URL, secret env name, timeout, and fetch injection.
- [ ] Implement source import modes `latest`, `smart-search`, and `sessions` with deterministic source refs.
- [ ] Map agentmemory records into `ExperienceEnvelope` candidates with provenance fields and personal scope by default.
- [ ] Keep all literal secrets out of source config and reports.
- [ ] Run focused adapter tests.

### Task 4: Source Command AgentMemory Support

**Files:**
- Modify: `packages/core/src/experience/source-config.ts`
- Modify: `packages/core/src/experience/source-adapters.ts`
- Modify: `packages/cli/src/commands/source.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/cli/source-command.test.ts`
- Test: `tests/core/source-adapters.test.ts`

- [ ] Add failing CLI test for `source add am --agent agentmemory --type agentmemory --scope personal --url http://localhost:3111 --parser agentmemory-memory --json`.
- [ ] Extend source schema enums with `agentmemory` agent/source type/parser values.
- [ ] Route `source_type: agentmemory` through the new adapter.
- [ ] Add source doctor checks for daemon health and smart-search reachability.
- [ ] Ensure team mode rejects personal-scope agentmemory source imports unless policy explicitly allows them.
- [ ] Run source CLI/core tests.

### Task 5: AgentMemory Sink Export

**Files:**
- Create: `packages/core/src/experience/agentmemory-export.ts`
- Create: `packages/cli/src/commands/agentmemory.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/core/agentmemory-export.test.ts`
- Test: `tests/cli/agentmemory-command.test.ts`

- [ ] Add failing test that stable `kb/` pages export as compact lesson cards with title, body, concepts, page path, and provenance hashes.
- [ ] Add failing test that review candidates, rejected proposals, and human-required material are not exported.
- [ ] Add failing CLI test for `agentmemory doctor --json`.
- [ ] Add failing CLI test for `agentmemory export --mode personal --dry-run --json`.
- [ ] Implement `agentmemory doctor`, `agentmemory import`, and `agentmemory export`.
- [ ] Default team export to blocked unless explicit config enables it.
- [ ] Run focused export/CLI tests.

### Task 6: Retrieval Sidecar

**Files:**
- Modify: `packages/core/src/experience/context.ts`
- Modify: `packages/core/src/wiki/retrieval.ts`
- Modify: `packages/cli/src/commands/context.ts`
- Test: `tests/core/context-retrieval.test.ts`
- Test: `tests/cli/context-command.test.ts`

- [ ] Add failing retrieval test where a stable wiki page and agentmemory hit both match; stable wiki ranks first.
- [ ] Add failing CLI test for `context get --with-agentmemory --json`.
- [ ] Add `withAgentMemory?: boolean` option to context retrieval.
- [ ] Query agentmemory smart-search only when requested and daemon health passes.
- [ ] Mark sidecar hits with lower authority than stable `kb/` and generated skills.
- [ ] Report sidecar unavailability as a warning, not a hard failure for normal context get.
- [ ] Run focused context tests.

### Task 7: Personal Bootstrap Commands

**Files:**
- Create: `packages/core/src/experience/personal-bootstrap.ts`
- Create: `packages/cli/src/commands/personal.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/core/personal-bootstrap.test.ts`
- Test: `tests/cli/personal-command.test.ts`

- [ ] Add failing test for `personal init` creating personal defaults without writing secret values.
- [ ] Add failing tests for auto-detecting Codex, Codex app, codex-cliproxyapi, local OpenClaw, and agentmemory daemon candidates.
- [ ] Add failing CLI test for `personal connect codex --json`.
- [ ] Add failing CLI test for `personal run --dry-run --json` showing planned source doctor, daily, kb audit, agent-tools, and site steps.
- [ ] Implement `personal init`, `personal connect`, `personal doctor`, `personal run`, and `personal schedule --print`.
- [ ] Wrap existing `source`, `daily`, `kb`, `agent-tools`, and site build functions rather than duplicating their internals.
- [ ] Run focused personal tests.

### Task 8: Site And Agent-Facing First-Run Guidance

**Files:**
- Modify: `packages/core/src/wiki/site-model.ts`
- Modify: `packages/core/src/wiki/render-site.ts`
- Modify: `packages/core/src/wiki/site-html.ts`
- Modify: `packages/core/src/agent-access/skill.ts`
- Test: `tests/e2e/wiki-static-site.spec.ts`
- Test: `tests/core/agent-skill.test.ts`

- [ ] Add failing site test that latest wiki pages, review-required count, context economy savings, and agentmemory health are visible in the generated site model.
- [ ] Add failing skill test that generated agent guidance includes first-run, daily run, stable context, and optional agentmemory sidecar instructions.
- [ ] Extend site model with `contextEconomy` and `agentMemory` summary fields.
- [ ] Render the summaries without creating a separate product area; keep wiki as the main human view.
- [ ] Extend generated Skill text with personal bootstrap workflow and privacy guidance.
- [ ] Run site and skill tests.

### Task 9: End-To-End Personal Smoke

**Files:**
- Test: `tests/cli/personal-context-economy-agentmemory-smoke.test.ts`

- [ ] Add e2e fixture with local Codex/OpenClaw source files plus mocked agentmemory REST.
- [ ] Run `personal init`, `personal connect`, and `personal run --dry-run`.
- [ ] Run a write-mode smoke in a temp workspace and assert reports, `kb audit`, generated site, and agent skill exist.
- [ ] Assert context economy saved bytes, agentmemory import occurred, and stable wiki context outranks sidecar results.
- [ ] Run:

```bash
pnpm check
```

### Task 10: Real Local Verification

**Files:**
- No source edits expected.

- [ ] Run current repository checks:

```bash
pnpm check
```

- [ ] Run personal bootstrap locally without committing generated `kb/`:

```bash
node packages/cli/dist/index.js personal init --json
node packages/cli/dist/index.js personal connect codex --json
node packages/cli/dist/index.js personal connect openclaw --json
node packages/cli/dist/index.js personal connect agentmemory --json
node packages/cli/dist/index.js personal run --build-site --json
```

- [ ] Run agentmemory sidecar verification if the daemon is available:

```bash
node packages/cli/dist/index.js agentmemory doctor --json
node packages/cli/dist/index.js context get "OpenClaw" --with-agentmemory --json
```

- [ ] Confirm generated `kb/` remains untracked unless explicitly requested by the user.
- [ ] Commit and push code and docs.
