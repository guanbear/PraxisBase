# Multi-Agent Experience Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first PraxisBase multi-agent experience layer so Codex, Claude Code, OpenCode, OpenClaw, Hermes, OpenHuman, and generic agents can share one CLI/file protocol for context retrieval, native memory backfill, capture, adapter installation, and proposal-based distillation.

**Architecture:** Extend the existing TypeScript pnpm monorepo without adding new runtime dependencies. Keep durable knowledge changes proposal-based: memory import/refresh, capture, watch, and distill write outbox, inbox, reports, runs, exceptions, and refresh plans; only review/promote can write stable `kb/` or `skills/` objects.

**Tech Stack:** Node.js 20+, TypeScript 5.x, pnpm workspaces, Zod, Commander, built-in Node filesystem APIs, existing PraxisBase file-store helpers, `node --test`.

---

## AI Handoff Brief

Read these in order:

1. `docs/superpowers/specs/2026-05-19-multi-agent-experience-layer-design.md`
2. `docs/openspec/changes/multi-agent-experience-layer/proposal.md`
3. `docs/openspec/changes/multi-agent-experience-layer/design.md`
4. `docs/bdd/multi-agent-experience-layer.feature`
5. this implementation plan

Current delivery target is M0-M6 below. Do not implement GUI, deep IDE plugins, MCP server, vector search, external DB, queue workers, semantic import, or bidirectional live memory sync. Do not store raw transcripts/logs/chats in Git. Do not let memory import, memory refresh, capture, watch, or distill directly mutate stable `kb/` or `skills/`.

## Existing Code To Reuse

- `packages/core/src/protocol/schemas.ts`: add capture, adapter, native memory, context, distill, and structured error schemas.
- `packages/core/src/protocol/paths.ts`: add outbox captures, memory reports, raw vault refs, adapters, context paths, and memory refresh paths.
- `packages/core/src/store/file-store.ts`: reuse read/write helpers for protocol writes.
- `packages/core/src/protocol/id.ts`: reuse id creation patterns and add idempotency helpers if needed.
- `packages/core/src/protocol/redact.ts`: reuse and extend redaction helpers for summaries.
- `packages/core/src/repair/context.ts`: keep OpenClaw repair context; add generic `context get` selection as a wrapper, not a rewrite.
- `packages/cli/src/index.ts`: register thin command wrappers.

Do not add YAML parsing. Adapter profiles are represented as TypeScript objects and JSON output in the first implementation. YAML in the design document is illustrative.

## Planned File Structure

Create:

```text
packages/core/src/experience/capture.ts
packages/core/src/experience/context.ts
packages/core/src/experience/distill.ts
packages/core/src/experience/errors.ts
packages/core/src/experience/install.ts
packages/core/src/experience/native-memory.ts
packages/core/src/experience/profiles.ts
packages/core/src/experience/raw-vault.ts
packages/cli/src/commands/capture.ts
packages/cli/src/commands/context.ts
packages/cli/src/commands/distill.ts
packages/cli/src/commands/install.ts
packages/cli/src/commands/memory.ts
packages/cli/src/commands/watch.ts
tests/core/experience-capture.test.ts
tests/core/experience-context.test.ts
tests/core/experience-distill.test.ts
tests/core/experience-install.test.ts
tests/core/experience-native-memory.test.ts
tests/cli/experience-commands.test.ts
tests/fixtures/experience/captures/codex-success.json
tests/fixtures/experience/raw/codex-session-redacted.txt
tests/fixtures/experience/native-memory/hermes-skill-summary.json
tests/fixtures/experience/native-memory/openhuman-preference.json
```

Modify:

```text
packages/core/src/index.ts
packages/core/src/protocol/paths.ts
packages/core/src/protocol/schemas.ts
packages/core/package.json
packages/cli/src/index.ts
packages/cli/package.json
packages/core/src/templates/seed.ts
README.md
README.zh-CN.md
docs/deployment.md
```

Responsibilities:

- `experience/errors.ts`: shared structured error type and helpers.
- `experience/capture.ts`: create capture records from CLI inputs, validate raw refs, write outbox captures.
- `experience/raw-vault.ts`: reject Git-tracked raw content and produce source refs/hashes.
- `experience/profiles.ts`: built-in agent profile definitions for `codex`, `claude-code`, `opencode`, `openclaw`, `hermes`, `generic`.
- `experience/install.ts`: dry-run and write instruction snippets or watcher config for supported profiles.
- `experience/native-memory.ts`: read native memory source refs, create backfill captures/import reports, and generate refresh outputs without direct stable writes.
- `experience/context.ts`: stage-aware generic context output using existing indexes/bundles where possible.
- `experience/distill.ts`: deterministic first pass from captures to episodes/proposals/reports/exceptions.
- CLI command files stay thin and only format input/output.

## M0: Protocol Schemas And Paths

**Acceptance:** Zod schemas validate capture records, adapter profiles, native memory sources, memory refresh plans, context requests/responses, distill reports, and structured errors. `pnpm check` passes.

- [ ] **Step 1: Add failing protocol schema tests**

Create `tests/core/experience-capture.test.ts` with tests for:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  CaptureRecordSchema,
  AdapterProfileSchema,
  NativeMemorySourceSchema,
  MemoryRefreshPlanSchema,
  ContextRequestSchema,
  StructuredErrorSchema
} from "../../packages/core/src/protocol/schemas.js";

test("validates capture records with raw artifact refs", () => {
  const parsed = CaptureRecordSchema.parse({
    id: "capture_20260519_codex_001",
    protocol_version: "0.1",
    type: "capture_record",
    agent: "codex",
    workspace: "/repo",
    scope_hint: "project",
    result: "success",
    triggers: ["task_finish", "git_diff_changed"],
    signals: { has_git_diff: true, tests_passed: true, user_correction: false, used_praxisbase_context: true },
    artifacts: [{ kind: "transcript", source_ref: "raw-vault://codex/session-abc", source_hash: "sha256:abc", redacted_summary: "Implemented a repair." }],
    created_at: "2026-05-19T00:00:00Z"
  });
  assert.equal(parsed.scope_hint, "project");
});

test("rejects capture records without artifact refs", () => {
  assert.throws(() => CaptureRecordSchema.parse({
    id: "capture_bad",
    protocol_version: "0.1",
    type: "capture_record",
    agent: "codex",
    workspace: "/repo",
    scope_hint: "project",
    result: "success",
    triggers: ["task_finish"],
    signals: {},
    artifacts: [],
    created_at: "2026-05-19T00:00:00Z"
  }));
});

test("validates adapter profiles and context requests", () => {
  AdapterProfileSchema.parse({
    agent: "codex",
    instruction_files: ["AGENTS.md"],
    transcript_paths: ["~/.codex/archived_sessions"],
    workspace_markers: ["AGENTS.md", ".git"],
    capture: { default_triggers: ["task_finish", "tests_run"] },
    context: { default_stages: ["diagnosis", "repair", "verification"] },
    privacy: { redaction_profile: "developer-default" }
  });

  ContextRequestSchema.parse({
    agent: "codex",
    workspace: "/repo",
    stage: "diagnosis",
    query: "openclaw auth expired",
    max_bytes: 16384
  });
});

test("structured errors are machine-readable", () => {
  const error = StructuredErrorSchema.parse({
    ok: false,
    code: "RAW_ARTIFACT_REJECTED",
    message: "Raw transcript must not be committed to Git.",
    retryable: false,
    details: { path: "kb/session.md" }
  });
  assert.equal(error.retryable, false);
});

test("validates native memory source and refresh plan schemas", () => {
  NativeMemorySourceSchema.parse({
    agent: "hermes",
    kind: "skill_summary",
    source_ref: "raw-vault://hermes/skill-auth-repair",
    source_hash: "sha256:hermes1",
    redacted_summary: "Hermes synthesized an auth repair skill.",
    scope_hint: "personal",
    created_at: "2026-05-19T00:00:00Z"
  });

  MemoryRefreshPlanSchema.parse({
    agent: "codex",
    target: "instruction-snippet",
    writes_native_memory: false,
    outputs: [{ kind: "install_snippet", target_path: "AGENTS.md", source_refs: ["kb/known-fixes/openclaw-auth-expired.md"] }]
  });
});
```

- [ ] **Step 2: Run schema tests and confirm failure**

Run:

```bash
pnpm test -- tests/core/experience-capture.test.ts
```

Expected: FAIL because schemas are not exported yet.

- [ ] **Step 3: Add schemas and paths**

Modify `packages/core/src/protocol/schemas.ts`:

- add `ScopeSchema` value `org` while keeping compatibility with existing `global` by accepting both during parsing and normalizing in business logic,
- add `LayerSchema`,
- add `CaptureRecordSchema`,
- add `AdapterProfileSchema`,
- add `NativeMemorySourceSchema`,
- add `MemoryImportReportSchema`,
- add `MemoryRefreshPlanSchema`,
- add `ContextStageSchema`,
- add `ContextRequestSchema`,
- add `StructuredErrorSchema`,
- add exported inferred types.

Modify `packages/core/src/protocol/paths.ts` with:

```ts
outboxCaptures: ".praxisbase/outbox/captures",
reportsDistill: ".praxisbase/reports/distill",
reportsContext: ".praxisbase/reports/context",
runsCapture: ".praxisbase/runs/capture",
runsDistill: ".praxisbase/runs/distill",
adapters: ".praxisbase/adapters",
reportsMemory: ".praxisbase/reports/memory",
runsMemoryImport: ".praxisbase/runs/memory-import",
memoryRefresh: ".praxisbase/memory-refresh",
rawVaultRefs: ".praxisbase/raw-vault/refs"
```

- [ ] **Step 4: Export schemas**

Modify `packages/core/src/index.ts` to export the new schema/types from `protocol/schemas.ts`.

Modify `packages/core/package.json` exports only if a new subpath is created; prefer keeping schemas under existing `./protocol/schemas.js`.

- [ ] **Step 5: Run verification**

Run:

```bash
pnpm check
```

Expected: PASS.

## M1: Capture And Raw Vault

**Acceptance:** `praxisbase capture finish --agent codex --result success --json` writes a capture record to `.praxisbase/outbox/captures/` and rejects attempts to store raw transcript content under Git-tracked stable paths.

- [ ] **Step 1: Add failing core capture tests**

Create `tests/core/experience-capture.test.ts` or extend the M0 file with:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { finishCapture } from "../../packages/core/src/experience/capture.js";

test("finishCapture writes a capture record to outbox", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-capture-"));
  const result = await finishCapture(root, {
    agent: "codex",
    workspace: root,
    result: "success",
    triggers: ["task_finish", "tests_run"],
    artifact: {
      kind: "transcript",
      sourceRef: "raw-vault://codex/session-1",
      sourceHash: "sha256:session1",
      redactedSummary: "Fixed a failing test."
    }
  });

  assert.match(result.path, /\.praxisbase\/outbox\/captures\/capture_/);
  const saved = JSON.parse(await readFile(join(root, result.path), "utf8"));
  assert.equal(saved.type, "capture_record");
  assert.equal(saved.agent, "codex");
});

test("finishCapture rejects raw artifact paths under kb", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-capture-"));
  await assert.rejects(() => finishCapture(root, {
    agent: "codex",
    workspace: root,
    result: "success",
    triggers: ["task_finish"],
    artifact: {
      kind: "transcript",
      sourceRef: "kb/raw-transcript.md",
      sourceHash: "sha256:bad",
      redactedSummary: "Raw transcript."
    }
  }), /RAW_ARTIFACT_REJECTED/);
});
```

- [ ] **Step 2: Implement capture core**

Create `packages/core/src/experience/errors.ts`, `raw-vault.ts`, and `capture.ts`.

Required behavior:

- generate deterministic id prefix `capture_`,
- write only JSON capture records,
- use idempotency key when supplied,
- reject `sourceRef` values under `kb/`, `skills/`, or `dist/`,
- allow `raw-vault://`, `log://`, `artifact://`, `file-ref://`, `ci-artifact://`.

- [ ] **Step 3: Add CLI command**

Create `packages/cli/src/commands/capture.ts` with `captureFinishCommand`.

Register in `packages/cli/src/index.ts`:

```text
praxisbase capture finish --agent <agent> --result <success|failed|partial|unknown> --source-ref <ref> --source-hash <hash> --summary <text> --json
```

- [ ] **Step 4: Add CLI tests**

Create `tests/cli/experience-commands.test.ts` to execute the built CLI against a temp dir and assert capture output path plus JSON validity.

- [ ] **Step 5: Run verification**

Run:

```bash
pnpm check
```

Expected: PASS.

## M2: Adapter Profiles And Install

**Acceptance:** `praxisbase install codex --dry-run --json` returns planned instruction snippets and watcher config without writing files. Non-dry-run writes only documented install targets.

- [ ] **Step 1: Add failing adapter tests**

Create `tests/core/experience-install.test.ts` with:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { getAdapterProfile, planInstall } from "../../packages/core/src/experience/install.js";

test("returns built-in codex profile", () => {
  const profile = getAdapterProfile("codex");
  assert.equal(profile.agent, "codex");
  assert.ok(profile.instruction_files.includes("AGENTS.md"));
});

test("install dry-run lists writes without mutating", async () => {
  const plan = await planInstall("/repo", "codex", { dryRun: true });
  assert.equal(plan.dry_run, true);
  assert.ok(plan.writes.some((write) => write.path.endsWith("AGENTS.md")));
  assert.ok(plan.commands.some((command) => command.includes("praxisbase context get")));
});
```

- [ ] **Step 2: Implement profiles**

Create `packages/core/src/experience/profiles.ts` with built-in profiles:

- `codex`: `AGENTS.md`, `~/.codex/archived_sessions`, stages diagnosis/repair/verification.
- `claude-code`: `CLAUDE.md`, known session/log path templates as refs only.
- `opencode`: instruction file/profile path, watcher-first.
- `openclaw`: sandbox logs, repair stages.
- `hermes`: skill synthesis and curator bridge.
- `openhuman`: persona/preference memory sources, personal scope by default.
- `generic`: JSON outbox only.

Use TypeScript objects, not YAML parsing.

- [ ] **Step 3: Implement install planner**

Create `packages/core/src/experience/install.ts`.

Rules:

- `dryRun` returns planned writes and commands.
- non-dry-run writes only instruction snippets and `.praxisbase/adapters/<agent>.json`.
- existing files are appended inside marker comments only when safe.
- no install command may overwrite an entire instruction file.

- [ ] **Step 4: Add CLI command**

Create `packages/cli/src/commands/install.ts` and register:

```text
praxisbase install <codex|claude-code|opencode|openclaw|hermes|openhuman|generic> --dry-run --json
```

- [ ] **Step 5: Run verification**

Run:

```bash
pnpm check
```

Expected: PASS.

## M3: Native Memory Bridge

**Acceptance:** `praxisbase memory import --agent hermes --source <file> --json` writes a memory import report plus capture/proposal candidates, defaults personal sources to `scope=personal`, and never copies raw native memory into Git stable knowledge.

- [ ] **Step 1: Add failing native memory tests**

Create `tests/core/experience-native-memory.test.ts`:

```ts
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { importNativeMemory, planMemoryRefresh } from "../../packages/core/src/experience/native-memory.js";

test("imports Hermes skill summaries as proposal candidates only", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-memory-"));
  const source = join(root, "hermes-skill-summary.json");
  await writeFile(source, JSON.stringify({
    agent: "hermes",
    kind: "skill_summary",
    source_ref: "raw-vault://hermes/skill-auth-repair",
    source_hash: "sha256:hermes1",
    redacted_summary: "Hermes synthesized an auth repair skill after repeated successes."
  }));

  const report = await importNativeMemory(root, { agent: "hermes", source, json: true });
  assert.equal(report.changed_stable_knowledge, false);
  assert.equal(report.imported_sources, 1);
  const proposals = await readdir(join(root, ".praxisbase/inbox/proposals"));
  assert.ok(proposals.length >= 1);
});

test("imports OpenHuman preferences as personal by default", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-memory-"));
  const source = join(root, "openhuman-preference.json");
  await writeFile(source, JSON.stringify({
    agent: "openhuman",
    kind: "preference",
    source_ref: "raw-vault://openhuman/preference-language",
    source_hash: "sha256:openhuman1",
    redacted_summary: "User prefers Chinese explanations."
  }));

  const report = await importNativeMemory(root, { agent: "openhuman", source, json: true });
  assert.equal(report.default_scope, "personal");
  assert.equal(report.changed_stable_knowledge, false);
});

test("memory refresh produces a plan without overwriting native memory", async () => {
  const plan = await planMemoryRefresh({
    agent: "codex",
    target: "instruction-snippet",
    contextRefs: ["kb/known-fixes/openclaw-auth-expired.md"]
  });
  assert.equal(plan.writes_native_memory, false);
  assert.ok(plan.outputs.some((output) => output.kind === "install_snippet" || output.kind === "context_bundle"));
});
```

- [ ] **Step 2: Implement native memory core**

Create `packages/core/src/experience/native-memory.ts`.

Rules:

- support agents `codex`, `claude-code`, `opencode`, `hermes`, `openhuman`, `openclaw`, `generic`,
- read JSON source descriptors in the first implementation,
- require `source_ref`, `source_hash`, and `redacted_summary`,
- write `.praxisbase/runs/memory-import/<run-id>.json`,
- write `.praxisbase/reports/memory/<run-id>.json`,
- create capture/proposal candidates only,
- default `openhuman` and personal agent sources to `scope=personal`,
- default `hermes` skill summaries to proposal candidates, not stable skills,
- reject direct source refs under `kb/`, `skills/`, or `dist/`,
- set `changed_stable_knowledge: false`.

- [ ] **Step 3: Add CLI command**

Create `packages/cli/src/commands/memory.ts` and register:

```text
praxisbase memory import --agent <agent> --source <file> --json
praxisbase memory refresh --agent <agent> --target <context|instruction-snippet|patch-proposal> --json
```

First implementation may accept one JSON source file per import. Directory scanning can be a later batch.

- [ ] **Step 4: Add CLI tests**

Extend `tests/cli/experience-commands.test.ts` with a temp repo flow that runs `memory import` for Hermes and OpenHuman fixtures and asserts stable `kb/` and `skills/` are unchanged.

- [ ] **Step 5: Run verification**

Run:

```bash
pnpm check
```

Expected: PASS.

## M4: Context Get

**Acceptance:** `praxisbase context get --agent codex --stage diagnosis --json` returns bounded context with citations and does not read the whole repository into output.

- [ ] **Step 1: Add failing context tests**

Create `tests/core/experience-context.test.ts` with:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildContext } from "../../packages/core/src/experience/context.js";

test("diagnosis context respects max bytes and keeps citations", async () => {
  const output = await buildContext({
    root: process.cwd(),
    agent: "codex",
    workspace: process.cwd(),
    stage: "diagnosis",
    query: "openclaw auth expired",
    maxBytes: 4096
  });
  assert.ok(Buffer.byteLength(JSON.stringify(output)) <= 4096);
  assert.equal(output.stage, "diagnosis");
  assert.ok(Array.isArray(output.citations));
});
```

- [ ] **Step 2: Implement context core**

Create `packages/core/src/experience/context.ts`.

Rules:

- stages: `diagnosis`, `repair`, `verification`, `proposal`,
- default budgets: 16 KB, 24 KB, 12 KB, 16 KB,
- prefer existing repair bundles and indexes,
- when output exceeds budget, drop full object bodies before citations,
- never fail task startup solely because context is unavailable; return a warning field.

- [ ] **Step 3: Add CLI command**

Create `packages/cli/src/commands/context.ts` and register:

```text
praxisbase context get --agent <agent> --stage <stage> --query <text> --max-bytes <n> --json
```

- [ ] **Step 4: Run verification**

Run:

```bash
pnpm check
```

Expected: PASS.

## M5: Distill Proposal Skeleton

**Acceptance:** `praxisbase distill run --json` reads captures and emits proposals/reports/exceptions without modifying `kb/` or `skills/`.

- [ ] **Step 1: Add failing distill tests**

Create `tests/core/experience-distill.test.ts`:

```ts
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { finishCapture } from "../../packages/core/src/experience/capture.js";
import { runDistill } from "../../packages/core/src/experience/distill.js";

test("distill converts successful captures into proposal drafts only", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-distill-"));
  await finishCapture(root, {
    agent: "codex",
    workspace: root,
    result: "success",
    triggers: ["task_finish", "tests_run"],
    artifact: {
      kind: "transcript",
      sourceRef: "raw-vault://codex/session-1",
      sourceHash: "sha256:session1",
      redactedSummary: "User corrected a project convention and tests passed."
    }
  });

  const report = await runDistill(root, { json: true });
  assert.equal(report.changed_stable_knowledge, false);
  const proposals = await readdir(join(root, ".praxisbase/inbox/proposals"));
  assert.ok(proposals.length >= 1);
});
```

- [ ] **Step 2: Implement distill core**

Create `packages/core/src/experience/distill.ts`.

Rules:

- read `.praxisbase/outbox/captures/*.json`,
- create proposals only when signal thresholds match,
- suggest `scope=personal` by default,
- suggest `project` when workspace marker exists and artifact is project-bound,
- never suggest `team` or `org` without explicit marker/reviewer input,
- write `.praxisbase/reports/distill/<run-id>.json`,
- write exceptions for privacy/security uncertainty,
- set `changed_stable_knowledge: false` in report.

- [ ] **Step 3: Add CLI command**

Create `packages/cli/src/commands/distill.ts` and register:

```text
praxisbase distill run --json
```

- [ ] **Step 4: Add watch stub**

Create `packages/cli/src/commands/watch.ts` and register:

```text
praxisbase watch --agent <agent> --workspace <path> --once --json
```

First implementation may support `--once` only. It should scan configured transcript/raw paths, write a capture if a new source hash is found, and return a structured warning when no watchable path exists.

- [ ] **Step 5: Run verification**

Run:

```bash
pnpm check
```

Expected: PASS.

## M6: Docs, Seed, And Smoke Flow

**Acceptance:** README, deployment docs, templates, OpenSpec tasks, and BDD all match the implemented commands.

- [ ] **Step 1: Update seed paths**

Modify `packages/core/src/templates/seed.ts` so `praxisbase init` creates:

```text
.praxisbase/outbox/captures/
.praxisbase/reports/distill/
.praxisbase/reports/context/
.praxisbase/reports/memory/
.praxisbase/runs/capture/
.praxisbase/runs/distill/
.praxisbase/runs/memory-import/
.praxisbase/adapters/
.praxisbase/memory-refresh/
.praxisbase/raw-vault/refs/
```

- [ ] **Step 2: Update docs**

Update:

- `README.md`
- `README.zh-CN.md`
- `docs/deployment.md`
- `docs/openspec/changes/multi-agent-experience-layer/tasks.md`

Ensure the docs list the exact command names implemented above.

- [ ] **Step 3: Run full smoke flow**

Run:

```bash
tmpdir=$(mktemp -d)
pnpm build
cd "$tmpdir"
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js init --profile all
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js install codex --dry-run --json
printf '{"agent":"hermes","kind":"skill_summary","source_ref":"raw-vault://hermes/skill-auth-repair","source_hash":"sha256:hermes1","redacted_summary":"Hermes synthesized an auth repair skill."}' > hermes-memory.json
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js memory import --agent hermes --source hermes-memory.json --json
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js capture finish --agent codex --result success --source-ref raw-vault://codex/session-1 --source-hash sha256:session1 --summary "Fixed a project issue and tests passed." --json
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js distill run --json
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js context get --agent codex --stage diagnosis --query "openclaw auth expired" --json
```

Expected:

- all commands exit 0,
- memory import report appears under `.praxisbase/reports/memory/`,
- capture appears under `.praxisbase/outbox/captures/`,
- distill report appears under `.praxisbase/reports/distill/`,
- context response contains `stage`, `warnings`, and `citations`,
- no files are written under `kb/` or `skills/` by memory import, capture, memory refresh, or distill.

- [ ] **Step 4: Run repository verification**

Run:

```bash
pnpm check
git diff --check
```

Expected: PASS.

## Required Commit Shape

Use the Lore Commit Protocol from `AGENTS.md`. Suggested commit intent:

```text
Make native agent experience proposal-based

PraxisBase needs to ingest personal and team agent experience without turning native memory or capture into hidden stable knowledge mutation. This adds the CLI/file protocol for context, native memory import/refresh, capture, adapter profiles, and distill reports while keeping review/promotion as the only stable write path.

Constraint: No new runtime dependencies for adapter profiles
Constraint: Raw transcripts and logs must not enter Git
Constraint: Agent-native memories are source/cache, not trusted stable authority
Rejected: Deep per-agent plugins in MVP | profile plus CLI is enough to validate the protocol
Rejected: Bidirectional live native-memory sync | too easy to spread unreviewed or private memory
Rejected: Direct distill-to-kb writes | bypasses review and audit
Confidence: medium
Scope-risk: moderate
Directive: Keep memory import/refresh/capture/watch/distill proposal-based; do not let them mutate kb/ or skills/
Tested: pnpm check; multi-agent experience smoke flow including memory import
Not-tested: Long-running filesystem watcher under continuous transcript churn
```
