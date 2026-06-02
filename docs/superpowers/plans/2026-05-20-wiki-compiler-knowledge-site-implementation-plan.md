# Wiki Compiler Knowledge Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, proposal-safe wiki compiler core and polished static knowledge site for PraxisBase M7-M11.

**Architecture:** Add a focused `packages/core/src/wiki/` module that normalizes stable knowledge and reviewed evidence into compiler objects, derives candidates, graph, retrieval index, health reports, and static site artifacts. `wiki compile` writes proposal candidates, reports, state, and exceptions only; stable `kb/`, `skills/`, and `dist/` writes remain owned by review/promote and build-site/build flows.

**Tech Stack:** TypeScript ESM, Node built-ins, `gray-matter`, existing protocol schemas/paths, existing file-store helpers, Node test runner, Commander CLI.

---

## Document Traceability

- Design: `docs/superpowers/specs/2026-05-20-wiki-compiler-knowledge-site-design.md`
- Implementation: `docs/superpowers/plans/2026-05-20-wiki-compiler-knowledge-site-implementation-plan.md`
- Traceability matrix: `docs/superpowers/plans/2026-05-20-wiki-compiler-knowledge-site-traceability.md`
- OpenSpec: `docs/openspec/changes/wiki-compiler-knowledge-site/`
- BDD: `docs/bdd/wiki-compiler-knowledge-site.feature`

These documents describe the same M7-M11 scope. If one document changes a command name, output path, module boundary, test mapping, or acceptance rule, update the others before implementation starts.

## File Structure

- Create `packages/core/src/wiki/model.ts`
  - Internal wiki types, lifecycle/confidence helpers, deterministic slug/hash/title helpers.
- Create `packages/core/src/wiki/collect.ts`
  - Allowlisted file collection from `kb/`, `skills/`, captures, episodes, memory reports, proposals, reviews, and raw-vault refs.
- Create `packages/core/src/wiki/state.ts`
  - Read/write `.praxisbase/wiki/state.json`, detect changed sources, update only emitted candidate/page ids.
- Create `packages/core/src/wiki/compile.ts`
  - Candidate generation, privacy/provenance guards, deterministic patch content, dry-run/review reports.
- Create `packages/core/src/wiki/resolver.ts`
  - Wikilink/title resolution, backlinks, broken links, duplicate slug/title/id, orphan detection, graph JSON model.
- Create `packages/core/src/wiki/retrieval.ts`
  - English + CJK tokenization, exact/stage/scope/maturity/graph ranking, budget enforcement for context.
- Create `packages/core/src/wiki/render-site.ts`
  - Static HTML knowledge site, page siblings, search index, graph exports, `llms-full.txt`, `ai-readme.md`, sitemap, robots, CSS, JS.
- Create `packages/core/src/wiki/lint.ts`
  - Wiki health/lint findings and exception writers for unsafe candidates and graph/site issues.
- Modify `packages/core/src/protocol/paths.ts`
  - Add wiki state/report/lint path constants.
- Modify `packages/core/src/protocol/schemas.ts`
  - Add `"wiki-compile"` and `"wiki-lint"` run command literals if run records are emitted.
- Modify `packages/core/src/build/build.ts`
  - Keep existing bundle/index behavior, then call wiki graph/site build and include new outputs in `BuildResult.indexes`.
- Modify `packages/core/src/build/html.ts`
  - Keep compatibility renderer, export small escaping helpers if useful for `render-site.ts`.
- Modify `packages/core/src/experience/context.ts`
  - Delegate ranking to `wiki/retrieval.ts` while preserving `ContextResponse` shape.
- Modify `packages/core/src/index.ts`
  - Export wiki entry points used by CLI/tests.
- Modify `packages/core/package.json`
  - Export wiki modules that tests and CLI import directly.
- Create `packages/cli/src/commands/wiki.ts`
  - CLI command wrapper for `compile`, `graph`, and `build-site`.
- Modify `packages/cli/src/index.ts`
  - Wire `praxisbase wiki compile|graph|build-site`.
- Modify `packages/cli/package.json`
  - Export `./commands/wiki.js`.
- Create `tests/core/wiki-collect.test.ts`
- Create `tests/core/wiki-compile.test.ts`
- Create `tests/core/wiki-resolver.test.ts`
- Create `tests/core/wiki-retrieval.test.ts`
- Create `tests/core/wiki-render-site.test.ts`
- Create `tests/core/wiki-lint.test.ts`
- Create `tests/cli/wiki-commands.test.ts`
- Modify `tests/core/build.test.ts`
  - Assert current outputs remain and site exports are present.
- Modify `tests/core/experience-context.test.ts`
  - Assert exact signature, CJK, graph expansion, and citation-preserving budget behavior.

## Parallel Ownership

- Codex main owns integration, command contracts, cross-module reviews, final `pnpm check`, and commits.
- Worker A owns `packages/core/src/wiki/model.ts`, `collect.ts`, `state.ts`, and `tests/core/wiki-collect.test.ts`.
- Worker B owns `packages/core/src/wiki/compile.ts`, `lint.ts`, `tests/core/wiki-compile.test.ts`, and `tests/core/wiki-lint.test.ts`.
- Worker C owns `packages/core/src/wiki/resolver.ts`, `retrieval.ts`, `tests/core/wiki-resolver.test.ts`, `tests/core/wiki-retrieval.test.ts`, and context integration.
- Worker D owns `packages/core/src/wiki/render-site.ts`, build integration, CLI wiring, `tests/core/wiki-render-site.test.ts`, `tests/cli/wiki-commands.test.ts`, and build test updates.
- Every worker must treat other files as shared state, must not revert another worker's edits, and must report changed paths plus test commands run.

## M7: Wiki Object Model And Collector

### Task 1: Model Helpers And State Schema

**Files:**
- Create: `packages/core/src/wiki/model.ts`
- Create: `packages/core/src/wiki/state.ts`
- Modify: `packages/core/src/protocol/paths.ts`
- Test: `tests/core/wiki-collect.test.ts`

- [ ] **Step 1: Write failing tests for slug/hash/state behavior**

Add these cases to `tests/core/wiki-collect.test.ts`:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeWikiSourceHash,
  makeWikiSlug,
} from "@praxisbase/core/wiki/model.js";
import {
  readWikiState,
  writeWikiState,
} from "@praxisbase/core/wiki/state.js";

describe("wiki model", () => {
  it("creates deterministic slugs and source hashes", () => {
    assert.equal(makeWikiSlug("OpenClaw Auth Expired!"), "openclaw-auth-expired");
    assert.equal(makeWikiSlug("中文 认证 失败"), "wiki");
    assert.equal(
      computeWikiSourceHash("hello").startsWith("sha256:"),
      true
    );
    assert.equal(computeWikiSourceHash("hello"), computeWikiSourceHash("hello"));
  });

  it("reads a missing wiki state as empty and writes compiler state", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-state-"));
    const state = await readWikiState(root);
    assert.equal(state.protocol_version, "0.1");
    assert.deepEqual(state.sources, {});

    await writeWikiState(root, {
      protocol_version: "0.1",
      sources: {
        "source-a": {
          source_hash: "sha256:a",
          last_compiled_at: "2026-05-20T00:00:00.000Z",
          candidate_ids: ["candidate-a"],
          page_ids: ["page-a"],
        },
      },
    });

    const saved = JSON.parse(await readFile(join(root, ".praxisbase/wiki/state.json"), "utf8"));
    assert.equal(saved.sources["source-a"].source_hash, "sha256:a");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-collect.test.js
```

Expected: TypeScript fails because `@praxisbase/core/wiki/model.js` is not exported.

- [ ] **Step 3: Add model and state implementation**

Create `packages/core/src/wiki/model.ts` with these exported names:

```ts
export type WikiSourceKind =
  | "stable_kb"
  | "skill"
  | "episode"
  | "capture"
  | "native_memory"
  | "proposal"
  | "review"
  | "external_ref";

export interface WikiSource {
  id: string;
  kind: WikiSourceKind;
  path?: string;
  source_ref?: string;
  source_hash: string;
  title: string;
  summary: string;
  body?: string;
  scope: "personal" | "project" | "team" | "global" | "org";
  layer?: "preference" | "convention" | "technical" | "domain" | "project";
  knowledge_type?: string;
  maturity?: string;
  created_at?: string;
  updated_at?: string;
}

export interface WikiStateSource {
  source_hash: string;
  last_compiled_at: string;
  candidate_ids: string[];
  page_ids: string[];
}

export interface WikiState {
  protocol_version: "0.1";
  sources: Record<string, WikiStateSource>;
}
```

Also export `computeWikiSourceHash(input: string): string`, `makeWikiSlug(title: string): string`, and constants for maturity/scope ordering.

Create `packages/core/src/wiki/state.ts` with `readWikiState`, `writeWikiState`, `getChangedWikiSources`, and `markWikiSourcesCompiled`. Import `protocolPaths.wikiState`, `readJson`, and `writeJson`.

Modify `packages/core/src/protocol/paths.ts`:

```ts
wikiRoot: ".praxisbase/wiki",
wikiState: ".praxisbase/wiki/state.json",
reportsWikiCompile: ".praxisbase/reports/wiki-compile",
reportsWikiLint: ".praxisbase/reports/wiki-lint",
```

- [ ] **Step 4: Export wiki modules**

Modify `packages/core/package.json` exports:

```json
"./wiki/model.js": {
  "types": "./src/wiki/model.ts",
  "default": "./dist/wiki/model.js"
},
"./wiki/state.js": {
  "types": "./src/wiki/state.ts",
  "default": "./dist/wiki/state.js"
}
```

Modify `packages/core/src/index.ts` to export:

```ts
export * from "./wiki/model.js";
export * from "./wiki/state.js";
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-collect.test.js
```

Expected: PASS for the two model/state cases.

### Task 2: Collector From Stable Knowledge, Skills, And Evidence

**Files:**
- Create: `packages/core/src/wiki/collect.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/index.ts`
- Test: `tests/core/wiki-collect.test.ts`

- [ ] **Step 1: Add failing collector tests**

Extend `tests/core/wiki-collect.test.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { collectWikiSources } from "@praxisbase/core/wiki/collect.js";
import { PROTOCOL_VERSION } from "@praxisbase/core";

describe("collectWikiSources", () => {
  it("collects stable kb markdown and skills with deterministic source ids", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-collect-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await mkdir(join(root, "skills/openclaw/auth-repair"), { recursive: true });
    await writeFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), `---
id: openclaw-auth-expired
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: published
maturity: verified
signatures: ["openclaw:auth-expired"]
skills: ["skills/openclaw/auth-repair/SKILL.md"]
sources: [{ uri: "raw-vault://codex/session-1", hash: "sha256:s1" }]
confidence: 0.8
reference_count: 2
last_referenced_at: null
supersedes: []
superseded_by: null
updated_at: "2026-05-20T00:00:00.000Z"
---
# OpenClaw Auth Expired

Refresh auth when the CLI reports expired credentials.
`);
    await writeFile(join(root, "skills/openclaw/auth-repair/SKILL.md"), `---
id: openclaw-auth-repair
scope: team
knowledge_type: skill
maturity: verified
---
# Auth Repair

Refresh OpenClaw auth safely.
`);

    const sources = await collectWikiSources(root);
    assert.deepEqual(sources.map((source) => source.id), [
      "stable_kb:kb/known-fixes/openclaw-auth-expired.md",
      "skill:skills/openclaw/auth-repair/SKILL.md",
    ]);
    assert.equal(sources[0].title, "OpenClaw Auth Expired");
    assert.equal(sources[0].scope, "team");
    assert.equal(sources[0].knowledge_type, "known_fix");
    assert.ok(sources[0].body?.includes("Refresh auth"));
    assert.equal(sources[1].kind, "skill");
  });

  it("uses only redacted summaries for captures and keeps personal scope personal", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-capture-"));
    await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
    await writeFile(join(root, ".praxisbase/outbox/captures/capture_1.json"), JSON.stringify({
      id: "capture_1",
      protocol_version: PROTOCOL_VERSION,
      type: "capture_record",
      agent: "codex",
      workspace: root,
      scope_hint: "personal",
      result: "success",
      triggers: ["task_finish"],
      signals: [],
      artifacts: [{
        kind: "transcript",
        source_ref: "raw-vault://codex/session-1",
        source_hash: "sha256:session1",
        redacted_summary: "Fixed auth by refreshing the session.",
      }],
      created_at: "2026-05-20T00:00:00.000Z",
    }));

    const sources = await collectWikiSources(root);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].kind, "capture");
    assert.equal(sources[0].scope, "personal");
    assert.equal(sources[0].body, undefined);
    assert.equal(sources[0].summary, "Fixed auth by refreshing the session.");
  });
});
```

- [ ] **Step 2: Run the collector tests to verify failure**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-collect.test.js
```

Expected: TypeScript fails because `collectWikiSources` is missing or tests fail because sources are not collected.

- [ ] **Step 3: Implement `collectWikiSources(root)`**

Create `packages/core/src/wiki/collect.ts`:

```ts
export interface CollectWikiSourcesOptions {
  includePersonal?: boolean;
}

export async function collectWikiSources(
  root: string,
  options: CollectWikiSourcesOptions = {}
): Promise<WikiSource[]> {
  // list allowlisted paths, parse markdown with gray-matter, parse JSON with schemas,
  // never read raw transcript bodies, sort by id before returning.
}
```

Implementation rules:

- Recursively list only:
  - `kb/**/*.md`
  - `skills/**/SKILL.md`
  - `.praxisbase/inbox/episodes/*.json`
  - `.praxisbase/outbox/captures/*.json`
  - `.praxisbase/reports/memory/*.json`
  - `.praxisbase/inbox/proposals/*.json`
  - `.praxisbase/inbox/reviews/*.json`
  - `.praxisbase/raw-vault/refs/*.json`
- Use `safePath(root, relativePath)` before every read.
- Use `gray-matter` for Markdown.
- Stable Markdown `source_hash` is `computeWikiSourceHash(fullFileText)` unless frontmatter exposes a stronger source hash array; keep the compiler hash deterministic.
- Markdown title comes from the first `# ` heading, then frontmatter `id`, then filename.
- `capture` sources concatenate artifact `redacted_summary` into summary, keep `body` undefined, and use artifact hashes for a deterministic source hash.
- `native_memory` sources come from `MemoryImportReport` and native memory source files when present; use only redacted summaries.
- Sort sources by `id`.
- Default `includePersonal` is `true` for collection; compile/retrieval applies sharing rules.

- [ ] **Step 4: Export collector**

Add package export:

```json
"./wiki/collect.js": {
  "types": "./src/wiki/collect.ts",
  "default": "./dist/wiki/collect.js"
}
```

Add root export:

```ts
export * from "./wiki/collect.js";
```

- [ ] **Step 5: Run collector tests**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-collect.test.js
```

Expected: PASS for model/state/collector cases.

- [ ] **Step 6: Commit M7**

Run:

```bash
git add packages/core/src/wiki/model.ts packages/core/src/wiki/state.ts packages/core/src/wiki/collect.ts packages/core/src/protocol/paths.ts packages/core/src/index.ts packages/core/package.json tests/core/wiki-collect.test.ts
git commit -m "feat: add wiki source collector"
```

## M8: Compile Candidates

### Task 3: Candidate Compile Pipeline

**Files:**
- Create: `packages/core/src/wiki/compile.ts`
- Create: `packages/core/src/wiki/lint.ts`
- Modify: `packages/core/src/protocol/schemas.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/index.ts`
- Test: `tests/core/wiki-compile.test.ts`
- Test: `tests/core/wiki-lint.test.ts`

- [ ] **Step 1: Write failing compile tests**

Create `tests/core/wiki-compile.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileWiki } from "@praxisbase/core/wiki/compile.js";
import { PROTOCOL_VERSION } from "@praxisbase/core";

describe("compileWiki", () => {
  it("dry-run writes a compile report and does not write proposals or stable knowledge", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-compile-"));
    await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
    await writeFile(join(root, ".praxisbase/outbox/captures/capture_1.json"), JSON.stringify({
      id: "capture_1",
      protocol_version: PROTOCOL_VERSION,
      type: "capture_record",
      agent: "codex",
      workspace: root,
      scope_hint: "project",
      result: "success",
      triggers: ["task_finish"],
      signals: [],
      artifacts: [{
        kind: "transcript",
        source_ref: "raw-vault://codex/session-1",
        source_hash: "sha256:session1",
        redacted_summary: "Fixed OpenClaw auth expired by refreshing login.",
      }],
      created_at: "2026-05-20T00:00:00.000Z",
    }));

    const report = await compileWiki(root, { mode: "dry-run" });
    assert.equal(report.changed_stable_knowledge, false);
    assert.equal(report.sources_read, 1);
    assert.equal(report.candidate_ids.length, 1);
    await assert.rejects(() => stat(join(root, ".praxisbase/inbox/proposals")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
  });

  it("review mode writes deterministic proposal candidates and skips unchanged sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-compile-"));
    await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
    await writeFile(join(root, ".praxisbase/outbox/captures/capture_1.json"), JSON.stringify({
      id: "capture_1",
      protocol_version: PROTOCOL_VERSION,
      type: "capture_record",
      agent: "codex",
      workspace: root,
      scope_hint: "project",
      result: "success",
      triggers: ["task_finish"],
      signals: [],
      artifacts: [{
        kind: "transcript",
        source_ref: "raw-vault://codex/session-1",
        source_hash: "sha256:session1",
        redacted_summary: "Fixed OpenClaw auth expired by refreshing login.",
      }],
      created_at: "2026-05-20T00:00:00.000Z",
    }));

    const first = await compileWiki(root, { mode: "review" });
    const second = await compileWiki(root, { mode: "review" });
    assert.equal(first.candidate_ids.length, 1);
    assert.equal(second.candidate_ids.length, 0);

    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposalFiles.length, 1);
    const proposal = JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", proposalFiles[0]), "utf8"));
    assert.equal(proposal.type, "wiki_proposal_candidate");
    assert.equal(proposal.changed_stable_knowledge, false);
    assert.match(proposal.patch.path, /^kb\/notes\/wiki-/);
    assert.ok(proposal.patch.content.includes("Fixed OpenClaw auth expired"));
  });

  it("writes human-required exceptions for privacy uncertainty", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-compile-"));
    await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
    await writeFile(join(root, ".praxisbase/outbox/captures/capture_1.json"), JSON.stringify({
      id: "capture_1",
      protocol_version: PROTOCOL_VERSION,
      type: "capture_record",
      agent: "codex",
      workspace: root,
      scope_hint: "project",
      result: "success",
      triggers: ["task_finish"],
      signals: [],
      artifacts: [{
        kind: "transcript",
        source_ref: "raw-vault://codex/session-secret",
        source_hash: "sha256:secret",
        redacted_summary: "Token appeared in the logs.",
      }],
      created_at: "2026-05-20T00:00:00.000Z",
    }));

    const report = await compileWiki(root, { mode: "review" });
    assert.equal(report.exceptions, 1);
    const files = await readdir(join(root, ".praxisbase/exceptions/human-required"));
    assert.equal(files.length, 1);
  });
});
```

- [ ] **Step 2: Write failing lint guard tests**

Create `tests/core/wiki-lint.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  containsPrivateMaterial,
  isAllowedWikiPatchPath,
  validateBodyShrink,
} from "@praxisbase/core/wiki/lint.js";

describe("wiki lint guards", () => {
  it("rejects unsafe patch paths and raw/private candidate text", () => {
    assert.equal(isAllowedWikiPatchPath("kb/notes/wiki-auth.md"), true);
    assert.equal(isAllowedWikiPatchPath("skills/openclaw/auth/SKILL.md"), true);
    assert.equal(isAllowedWikiPatchPath("../outside.md"), false);
    assert.equal(isAllowedWikiPatchPath(".praxisbase/raw-vault/session.json"), false);
    assert.equal(containsPrivateMaterial("user token abc was present"), true);
    assert.equal(containsPrivateMaterial("normal redacted summary"), false);
  });

  it("enforces merge body shrink threshold", () => {
    assert.equal(validateBodyShrink("a ".repeat(100), "b ".repeat(80), "patch").ok, true);
    assert.equal(validateBodyShrink("a ".repeat(100), "b ".repeat(20), "patch").ok, false);
    assert.equal(validateBodyShrink("a ".repeat(100), "archived", "archive").ok, true);
  });
});
```

- [ ] **Step 3: Run compile/lint tests to verify failure**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-compile.test.js dist-tests/tests/core/wiki-lint.test.js
```

Expected: TypeScript fails because compile/lint modules do not exist.

- [ ] **Step 4: Implement lint guards**

Create `packages/core/src/wiki/lint.ts` with:

```ts
export function isAllowedWikiPatchPath(relativePath: string): boolean;
export function containsPrivateMaterial(text: string): boolean;
export function validateBodyShrink(
  oldBody: string,
  newBody: string,
  action: "create" | "patch" | "archive" | "link"
): { ok: true } | { ok: false; reason: "body_shrink_violation"; ratio: number };
```

Rules:

- `isAllowedWikiPatchPath` returns true only for normalized `kb/**/*.md` and `skills/**/SKILL.md`.
- `containsPrivateMaterial` catches `token`, `cookie`, `secret`, `password`, `credential`, `BEGIN PRIVATE KEY`, `AKIA`, and calls `appearsToBeRawLog` from `protocol/redact.ts` when available.
- `validateBodyShrink` requires `newBody.length >= oldBody.length * 0.7` for `patch`; `archive` bypasses this threshold.

- [ ] **Step 5: Implement compile pipeline**

Create `packages/core/src/wiki/compile.ts` with:

```ts
export interface CompileWikiOptions {
  mode: "dry-run" | "review";
  now?: string;
}

export interface WikiCompileReport {
  id: string;
  protocol_version: "0.1";
  type: "wiki_compile_report";
  mode: "dry-run" | "review";
  sources_read: number;
  changed_sources: number;
  candidate_ids: string[];
  exceptions: number;
  skipped_sources: number;
  changed_stable_knowledge: false;
  created_at: string;
}

export async function compileWiki(root: string, options: CompileWikiOptions): Promise<WikiCompileReport>;
```

Implementation behavior:

- `collectWikiSources(root)` gets all sources.
- `readWikiState(root)` drives hash diff.
- Only changed sources with `kind` in `capture`, `native_memory`, `episode`, or `stable_kb` generate first-version candidates.
- Personal sources are skipped for shared page proposals unless the target scope stays `personal`.
- Private/raw material writes `.praxisbase/exceptions/human-required/<id>.json` and does not write a proposal.
- Candidate ids are `makeId("wiki-proposal", source.id + ":" + source.source_hash)`.
- Patch paths are deterministic:
  - captures/native memory/episodes: `kb/notes/wiki-${makeWikiSlug(source.title)}.md`
  - stable known fixes: patch same stable path only when path passes `isAllowedWikiPatchPath`
- Patch content uses frontmatter with `protocol_version`, `type: note`, `knowledge_type: note`, `scope`, `status: draft`, `maturity: draft`, `sources`, `confidence`, `updated_at`, then a Markdown body with source summary and citations.
- Review mode writes `.praxisbase/inbox/proposals/<candidateId>.json`.
- Dry-run mode returns candidate ids but writes no proposal files.
- Both modes write `.praxisbase/reports/wiki-compile/<reportId>.json`.
- State is updated only for review mode sources that emitted proposals without exceptions.
- Report has `changed_stable_knowledge: false`.

Modify `packages/core/src/protocol/schemas.ts` if run records are added:

```ts
export const RunCommandSchema = z.enum(["review", "promote", "build", "lint", "wiki-compile", "wiki-lint"]);
```

- [ ] **Step 6: Export compile and lint modules**

Add package exports for `./wiki/compile.js` and `./wiki/lint.js`, then root exports:

```ts
export * from "./wiki/compile.js";
export * from "./wiki/lint.js";
```

- [ ] **Step 7: Run compile/lint tests**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-compile.test.js dist-tests/tests/core/wiki-lint.test.js
```

Expected: PASS.

### Task 4: CLI Wiki Compile

**Files:**
- Create: `packages/cli/src/commands/wiki.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/package.json`
- Test: `tests/cli/wiki-commands.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Create `tests/cli/wiki-commands.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { wikiCommand } from "@praxisbase/cli/commands/wiki.js";
import { PROTOCOL_VERSION } from "@praxisbase/core";

describe("wiki CLI commands", () => {
  it("wiki compile --dry-run --json writes only a report", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-wiki-"));
    await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
    await writeFile(join(root, ".praxisbase/outbox/captures/capture_1.json"), JSON.stringify({
      id: "capture_1",
      protocol_version: PROTOCOL_VERSION,
      type: "capture_record",
      agent: "codex",
      workspace: root,
      scope_hint: "project",
      result: "success",
      triggers: ["task_finish"],
      signals: [],
      artifacts: [{
        kind: "transcript",
        source_ref: "raw-vault://codex/session-1",
        source_hash: "sha256:session1",
        redacted_summary: "Fixed OpenClaw auth expired by refreshing login.",
      }],
      created_at: "2026-05-20T00:00:00.000Z",
    }));

    const output = await wikiCommand(root, "compile", { dryRun: true, json: true });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.mode, "dry-run");
    await assert.rejects(() => stat(join(root, ".praxisbase/inbox/proposals")), { code: "ENOENT" });
  });

  it("wiki compile --review --json writes proposal candidates", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-wiki-"));
    await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
    await writeFile(join(root, ".praxisbase/outbox/captures/capture_1.json"), JSON.stringify({
      id: "capture_1",
      protocol_version: PROTOCOL_VERSION,
      type: "capture_record",
      agent: "codex",
      workspace: root,
      scope_hint: "project",
      result: "success",
      triggers: ["task_finish"],
      signals: [],
      artifacts: [{
        kind: "transcript",
        source_ref: "raw-vault://codex/session-1",
        source_hash: "sha256:session1",
        redacted_summary: "Fixed OpenClaw auth expired by refreshing login.",
      }],
      created_at: "2026-05-20T00:00:00.000Z",
    }));

    const output = await wikiCommand(root, "compile", { review: true, json: true });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.mode, "review");
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposalFiles.length, 1);
  });
});
```

- [ ] **Step 2: Run CLI tests to verify failure**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/wiki-commands.test.js
```

Expected: TypeScript fails because `@praxisbase/cli/commands/wiki.js` is not exported.

- [ ] **Step 3: Implement CLI wrapper**

Create `packages/cli/src/commands/wiki.ts`:

```ts
import { compileWiki } from "@praxisbase/core/wiki/compile.js";

export interface WikiCommandOptions {
  dryRun?: boolean;
  review?: boolean;
  json?: boolean;
}

export async function wikiCommand(root: string, subcommand: string, options: WikiCommandOptions): Promise<string> {
  if (subcommand === "compile") {
    const mode = options.dryRun ? "dry-run" : "review";
    const report = await compileWiki(root, { mode });
    return options.json
      ? JSON.stringify({ ok: true, report }, null, 2)
      : `Wiki compile report: ${report.id}`;
  }
  throw new Error(`Unknown subcommand "wiki ${subcommand}". Use "wiki compile", "wiki graph", or "wiki build-site".`);
}
```

- [ ] **Step 4: Wire Commander command**

Modify `packages/cli/src/index.ts`:

```ts
import { wikiCommand } from "./commands/wiki.js";

program
  .command("wiki")
  .argument("<sub>", "subcommand (compile|graph|build-site)")
  .option("--dry-run")
  .option("--review")
  .option("--json")
  .action(async (sub: string, options: { dryRun?: boolean; review?: boolean; json?: boolean }) => {
    console.log(await wikiCommand(process.cwd(), sub, options));
  });
```

Add CLI package export:

```json
"./commands/wiki.js": {
  "types": "./src/commands/wiki.ts",
  "default": "./dist/commands/wiki.js"
}
```

- [ ] **Step 5: Run CLI wiki tests**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/wiki-commands.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit M8**

Run:

```bash
git add packages/core/src/wiki/compile.ts packages/core/src/wiki/lint.ts packages/core/src/protocol/schemas.ts packages/core/src/index.ts packages/core/package.json packages/cli/src/commands/wiki.ts packages/cli/src/index.ts packages/cli/package.json tests/core/wiki-compile.test.ts tests/core/wiki-lint.test.ts tests/cli/wiki-commands.test.ts
git commit -m "feat: add wiki compile candidates"
```

## M9: Graph And Retrieval

### Task 5: Deterministic Resolver And Graph

**Files:**
- Create: `packages/core/src/wiki/resolver.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/index.ts`
- Test: `tests/core/wiki-resolver.test.ts`

- [ ] **Step 1: Write failing resolver tests**

Create `tests/core/wiki-resolver.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWikiGraph, resolveWikiLinks } from "@praxisbase/core/wiki/resolver.js";

describe("wiki resolver", () => {
  const pages = [
    {
      id: "page-auth",
      slug: "openclaw-auth-expired",
      title: "OpenClaw Auth Expired",
      page_kind: "known_fix",
      scope: "team",
      maturity: "verified",
      lifecycle: "reviewed",
      source_ids: ["source-auth"],
      claims: [],
      outbound_links: ["auth-repair-skill"],
      body_markdown: "See [[auth-repair-skill|Auth Repair]]. `[[ignored]]`\n\n```txt\n[[ignored-fence]]\n```",
    },
    {
      id: "page-skill",
      slug: "auth-repair-skill",
      title: "Auth Repair Skill",
      page_kind: "skill",
      scope: "team",
      maturity: "verified",
      lifecycle: "reviewed",
      source_ids: ["source-skill"],
      claims: [],
      outbound_links: [],
      body_markdown: "Refresh auth.",
    },
  ] as const;

  it("resolves wikilinks while ignoring code spans and fences", () => {
    const result = resolveWikiLinks(pages as any);
    assert.deepEqual(result.links.map((link) => `${link.from}->${link.to}`), ["page-auth->page-skill"]);
    assert.deepEqual(result.broken_links, []);
  });

  it("builds backlinks and duplicate/orphan health findings", () => {
    const graph = buildWikiGraph(pages as any);
    assert.equal(graph.nodes.length, 2);
    assert.deepEqual(graph.backlinks["page-skill"], ["page-auth"]);
    assert.deepEqual(graph.duplicates, []);
    assert.deepEqual(graph.orphans, []);
  });
});
```

- [ ] **Step 2: Run resolver tests to verify failure**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-resolver.test.js
```

Expected: TypeScript fails because resolver module is missing.

- [ ] **Step 3: Implement resolver**

Create `packages/core/src/wiki/resolver.ts` with:

```ts
export interface WikiGraphNode {
  id: string;
  slug: string;
  title: string;
  kind: string;
  scope: string;
  maturity: string;
  source_ids: string[];
}

export interface WikiGraphLink {
  from: string;
  to: string;
  type: "wikilink" | "source_overlap" | "related";
  weight: number;
}

export interface WikiGraph {
  protocol_version: "0.1";
  nodes: WikiGraphNode[];
  links: WikiGraphLink[];
  backlinks: Record<string, string[]>;
  broken_links: Array<{ from: string; target: string }>;
  orphans: string[];
  duplicates: Array<{ field: "id" | "slug" | "title"; value: string; page_ids: string[] }>;
}

export function resolveWikiLinks(pages: WikiPage[]): Pick<WikiGraph, "links" | "broken_links">;
export function buildWikiGraph(pages: WikiPage[]): WikiGraph;
```

Implementation rules:

- Build title/slug indexes from `pages`.
- Parse `[[slug]]` and `[[slug|label]]`.
- Strip fenced code blocks and inline code before matching.
- Broken links include unresolved wikilinks.
- Duplicate detection checks id, slug, and lowercased title.
- Orphans are active pages with no backlinks and at least one other page exists; pages with outbound links are not orphaned in the first version.
- Add deterministic source-overlap links when two pages share source ids.

- [ ] **Step 4: Export resolver**

Add package export and root export for `./wiki/resolver.js`.

- [ ] **Step 5: Run resolver tests**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-resolver.test.js
```

Expected: PASS.

### Task 6: Retrieval Ranking And Context Integration

**Files:**
- Create: `packages/core/src/wiki/retrieval.ts`
- Modify: `packages/core/src/experience/context.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/index.ts`
- Test: `tests/core/wiki-retrieval.test.ts`
- Test: `tests/core/experience-context.test.ts`

- [ ] **Step 1: Write failing retrieval tests**

Create `tests/core/wiki-retrieval.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rankWikiContextItems, tokenizeForWikiSearch } from "@praxisbase/core/wiki/retrieval.js";

describe("wiki retrieval", () => {
  const items = [
    {
      id: "known-auth",
      path: "kb/known-fixes/openclaw-auth-expired.md",
      kind: "known_fix",
      title: "OpenClaw Auth Expired",
      summary: "Signature openclaw:auth-expired refresh login.",
      body: "Use auth repair skill.",
      maturity: "proven",
      scope: "team",
      source_ids: ["source-a"],
      outbound_links: ["skill-auth"],
    },
    {
      id: "skill-auth",
      path: "skills/openclaw/auth-repair/SKILL.md",
      kind: "skill",
      title: "Auth Repair",
      summary: "Refresh OpenClaw credentials.",
      body: "Run safe login refresh.",
      maturity: "verified",
      scope: "team",
      source_ids: ["source-b"],
      outbound_links: [],
    },
    {
      id: "cn-auth",
      path: "kb/notes/wiki-cn-auth.md",
      kind: "note",
      title: "认证失败",
      summary: "OpenClaw 认证失败 需要刷新登录。",
      body: "",
      maturity: "draft",
      scope: "project",
      source_ids: ["source-c"],
      outbound_links: [],
    },
  ];

  it("tokenizes English terms and CJK bigrams", () => {
    assert.ok(tokenizeForWikiSearch("openclaw auth").includes("openclaw"));
    assert.ok(tokenizeForWikiSearch("认证失败").includes("认证"));
    assert.ok(tokenizeForWikiSearch("认证失败").includes("失败"));
  });

  it("ranks exact signatures first and expands graph-related items", () => {
    const ranked = rankWikiContextItems(items, {
      query: "openclaw:auth-expired",
      stage: "repair",
      maxItems: 3,
    });
    assert.equal(ranked[0].id, "known-auth");
    assert.equal(ranked[1].id, "skill-auth");
  });

  it("matches Chinese query text", () => {
    const ranked = rankWikiContextItems(items, {
      query: "认证失败",
      stage: "diagnosis",
      maxItems: 2,
    });
    assert.equal(ranked[0].id, "cn-auth");
  });
});
```

Extend `tests/core/experience-context.test.ts` with:

```ts
it("uses wiki retrieval for CJK and graph-related context while preserving citations", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-context-wiki-"));
  await mkdir(join(root, "kb/known-fixes"), { recursive: true });
  await mkdir(join(root, "skills/openclaw/auth-repair"), { recursive: true });
  await writeFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), `---
id: openclaw-auth-expired
type: known_fix
scope: team
maturity: proven
signatures: ["openclaw:auth-expired"]
---
# 认证失败

OpenClaw 认证失败 needs auth repair. [[auth-repair]]
`);
  await writeFile(join(root, "skills/openclaw/auth-repair/SKILL.md"), `---
id: auth-repair
scope: team
maturity: verified
---
# Auth Repair

Refresh credentials safely.
`);

  const output = await buildContext({
    root,
    agent: "codex",
    workspace: root,
    stage: "repair",
    query: "认证失败",
    maxBytes: 4000,
  });

  assert.equal(output.items[0].path, "kb/known-fixes/openclaw-auth-expired.md");
  assert.ok(output.items.some((item) => item.path === "skills/openclaw/auth-repair/SKILL.md"));
  assert.ok(output.citations.some((citation) => citation.path === "kb/known-fixes/openclaw-auth-expired.md"));
});
```

- [ ] **Step 2: Run retrieval/context tests to verify failure**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-retrieval.test.js dist-tests/tests/core/experience-context.test.js
```

Expected: TypeScript fails because retrieval module is missing or context still uses shallow search.

- [ ] **Step 3: Implement retrieval module**

Create `packages/core/src/wiki/retrieval.ts` with:

```ts
export interface WikiContextCandidate {
  id: string;
  path: string;
  kind: string;
  title: string;
  summary: string;
  body?: string;
  maturity?: string;
  scope?: string;
  source_ids?: string[];
  outbound_links?: string[];
}

export interface RankWikiContextOptions {
  query: string;
  stage: "diagnosis" | "repair" | "verification" | "proposal";
  maxItems: number;
}

export function tokenizeForWikiSearch(text: string): string[];
export function rankWikiContextItems(
  candidates: WikiContextCandidate[],
  options: RankWikiContextOptions
): WikiContextCandidate[];
```

Ranking rules:

- Exact signature/object id/path/title match adds the largest score.
- English tokens match on title, summary, body, and path.
- CJK bigrams match Chinese title/summary/body.
- Maturity weight: `proven > verified > draft > stale > archived`.
- Scope weight: `project > team > global > personal`; personal is not promoted above shared results.
- Stage bias:
  - diagnosis favors `known_fix` and `pitfall`.
  - repair favors `skill` and `procedure`.
  - verification favors `procedure`, `known_fix`, and text containing verification/rollback.
  - proposal favors `note`, `decision`, `review`, and `proposal`.
- After seed matches, add graph expansion from `outbound_links` and shared `source_ids`.
- Sort by score descending, then path ascending.

- [ ] **Step 4: Replace context ranking internals**

Modify `packages/core/src/experience/context.ts`:

- Keep `BuildContextInput`, `BuildContextOutput`, JSON report writing, warnings, budget behavior, and `ContextResponseSchema` shape.
- Replace `scoreText` and simple sort with:
  - collector-style file scanning of `kb`, `skills`, `.praxisbase/indexes`, `.praxisbase/bundles`.
  - Markdown metadata parsing for `id`, `scope`, `maturity`, `signatures`, and title.
  - `rankWikiContextItems`.
- Keep `context_unavailable` warning when no selected items.
- Budget degradation order:
  - remove bodies but keep summaries/citations;
  - then drop lower-ranked items but keep top paths and warning.

- [ ] **Step 5: Export retrieval**

Add package export and root export for `./wiki/retrieval.js`.

- [ ] **Step 6: Run M9 tests**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-resolver.test.js dist-tests/tests/core/wiki-retrieval.test.js dist-tests/tests/core/experience-context.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit M9**

Run:

```bash
git add packages/core/src/wiki/resolver.ts packages/core/src/wiki/retrieval.ts packages/core/src/experience/context.ts packages/core/src/index.ts packages/core/package.json tests/core/wiki-resolver.test.ts tests/core/wiki-retrieval.test.ts tests/core/experience-context.test.ts
git commit -m "feat: add wiki graph retrieval"
```

## M10: Knowledge Site

### Task 7: Static Site Renderer

**Files:**
- Create: `packages/core/src/wiki/render-site.ts`
- Modify: `packages/core/src/build/html.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/index.ts`
- Test: `tests/core/wiki-render-site.test.ts`

- [ ] **Step 1: Write failing render-site tests**

Create `tests/core/wiki-render-site.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWikiSite } from "@praxisbase/core/wiki/render-site.js";

describe("buildWikiSite", () => {
  it("renders dashboard, page shell, search assets, graph, and AI exports", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-site-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await writeFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), `---
id: openclaw-auth-expired
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: published
maturity: proven
signatures: ["openclaw:auth-expired"]
skills: []
sources: [{ uri: "raw-vault://codex/session-1", hash: "sha256:s1" }]
confidence: 0.9
reference_count: 3
last_referenced_at: null
supersedes: []
superseded_by: null
updated_at: "2026-05-20T00:00:00.000Z"
---
# OpenClaw Auth Expired

Refresh login. <script>alert("x")</script>
`);

    const result = await buildWikiSite(root);
    assert.ok(result.outputs.includes("dist/index.html"));
    assert.ok(result.outputs.includes("dist/pages/openclaw-auth-expired.html"));
    assert.ok(result.outputs.includes("dist/pages/openclaw-auth-expired.txt"));
    assert.ok(result.outputs.includes("dist/pages/openclaw-auth-expired.json"));
    assert.ok(result.outputs.includes("dist/llms-full.txt"));
    assert.ok(result.outputs.includes("dist/graph.jsonld"));
    assert.ok(result.outputs.includes("dist/ai-readme.md"));

    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Knowledge Health"));
    assert.ok(index.includes("searchInput"));
    assert.equal(index.includes("<script>alert"), false);

    const page = await readFile(join(root, "dist/pages/openclaw-auth-expired.html"), "utf8");
    assert.ok(page.includes("Provenance"));
    assert.ok(page.includes("Related"));
    assert.equal(page.includes("<script>alert"), false);

    await assert.doesNotReject(stat(join(root, "dist/style.css")));
    await assert.doesNotReject(stat(join(root, "dist/site.js")));
  });
});
```

- [ ] **Step 2: Run render-site test to verify failure**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-render-site.test.js
```

Expected: TypeScript fails because renderer module is missing.

- [ ] **Step 3: Add safe HTML helpers**

Modify `packages/core/src/build/html.ts` to export:

```ts
export function escapeHtml(value: string): string;
export function escapeJsonForHtml(value: unknown): string;
```

Requirements:

- `escapeHtml` escapes `&`, `<`, `>`, `"`, and `'`.
- `escapeJsonForHtml` returns JSON with `<`, `>`, `&`, U+2028, U+2029 escaped so `</script` cannot terminate script content.
- Keep existing `renderInspectionHtml` behavior compatible.

- [ ] **Step 4: Implement site renderer**

Create `packages/core/src/wiki/render-site.ts` with:

```ts
export interface BuildWikiSiteResult {
  outputs: string[];
  pages: number;
  health: {
    sources: number;
    pages: number;
    broken_links: number;
    duplicates: number;
    orphans: number;
  };
}

export async function buildWikiSite(root: string): Promise<BuildWikiSiteResult>;
```

Implementation behavior:

- Collect sources with `collectWikiSources(root)`.
- Convert stable `kb/` and `skills/` sources into `WikiPage[]`.
- Use `makeWikiSlug`, source ids, maturity, scope, knowledge type, and body markdown.
- Build graph with `buildWikiGraph`.
- Write:
  - `dist/index.html`
  - `dist/pages/<slug>.html`
  - `dist/pages/<slug>.txt`
  - `dist/pages/<slug>.json`
  - `dist/search-index.json`
  - `dist/graph.json`
  - `dist/graph.jsonld`
  - `dist/llms.txt`
  - `dist/llms-full.txt`
  - `dist/ai-readme.md`
  - `dist/sitemap.xml`
  - `dist/robots.txt`
  - `dist/style.css`
  - `dist/site.js`
- Dashboard first screen shows counts, broken links, duplicate count, orphan count, recent sources, top signatures when present, and repair bundle status if `dist/repair-bundles/manifest.json` exists.
- Page shell has:
  - left knowledge nav;
  - center escaped Markdown-as-readable HTML with headings, paragraphs, lists, and code fences rendered safely;
  - right rail with TOC, provenance source ids, related pages, scope, maturity, confidence.
- Search works offline by loading `search-index.json`; `/` and Cmd/Ctrl+K focus the input.
- Mobile CSS collapses the three-column shell into search, content, metadata.
- No raw HTML from Markdown is emitted.

- [ ] **Step 5: Export renderer**

Add package export and root export for `./wiki/render-site.js`.

- [ ] **Step 6: Run render-site tests**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-render-site.test.js
```

Expected: PASS.

### Task 8: Build Integration And CLI Graph/Site

**Files:**
- Modify: `packages/core/src/build/build.ts`
- Modify: `packages/cli/src/commands/wiki.ts`
- Modify: `tests/core/build.test.ts`
- Modify: `tests/cli/wiki-commands.test.ts`

- [ ] **Step 1: Add failing build and CLI tests**

Extend `tests/core/build.test.ts` first test assertions:

```ts
await assert.doesNotReject(stat(join(root, "dist/pages")));
await assert.doesNotReject(stat(join(root, "dist/graph.json")));
await assert.doesNotReject(stat(join(root, "dist/graph.jsonld")));
await assert.doesNotReject(stat(join(root, "dist/llms-full.txt")));
await assert.doesNotReject(stat(join(root, "dist/ai-readme.md")));
await assert.doesNotReject(stat(join(root, "dist/style.css")));
await assert.doesNotReject(stat(join(root, "dist/site.js")));
```

Extend `tests/cli/wiki-commands.test.ts`:

```ts
it("wiki graph and build-site return JSON reports", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-wiki-site-"));
  await mkdir(join(root, "kb/notes"), { recursive: true });
  await writeFile(join(root, "kb/notes/wiki-auth.md"), `---
id: wiki-auth
type: note
scope: team
maturity: draft
---
# Wiki Auth

Auth note.
`);

  const graphOutput = await wikiCommand(root, "graph", { json: true });
  const graphParsed = JSON.parse(graphOutput);
  assert.equal(graphParsed.ok, true);
  assert.equal(graphParsed.graph.nodes.length, 1);

  const siteOutput = await wikiCommand(root, "build-site", { json: true });
  const siteParsed = JSON.parse(siteOutput);
  assert.equal(siteParsed.ok, true);
  assert.ok(siteParsed.result.outputs.includes("dist/index.html"));
});
```

- [ ] **Step 2: Run build/CLI tests to verify failure**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/build.test.js dist-tests/tests/cli/wiki-commands.test.js
```

Expected: tests fail because build does not call wiki site and CLI graph/build-site are missing.

- [ ] **Step 3: Integrate build**

Modify `packages/core/src/build/build.ts`:

- Keep existing repair bundle and `dist/kb-index.json` writes unchanged.
- After current indexes and repair bundle manifest are written, call `buildWikiSite(root)`.
- Preserve `dist/repair-bundles/*` paths.
- Keep `dist/kb-index.json` `protocol_version` and `objects`.
- Return `indexes` including existing indexes plus wiki outputs:

```ts
indexes: [
  "dist/kb-index.json",
  "dist/search-index.json",
  "dist/graph.json",
  "dist/graph.jsonld",
  "dist/llms.txt",
  "dist/llms-full.txt",
  "dist/ai-readme.md",
]
```

- Add build run counts for `wiki_pages` and `wiki_health_issues`.

- [ ] **Step 4: Add CLI graph/build-site**

Modify `packages/cli/src/commands/wiki.ts`:

- `wiki graph --json` collects sources, converts stable sources to pages using renderer/shared helper, builds graph, writes `dist/graph.json`, and returns `{ ok: true, graph }`.
- `wiki build-site --json` calls `buildWikiSite(root)` and returns `{ ok: true, result }`.
- Non-JSON responses are concise:
  - `Wiki graph: <node count> nodes`
  - `Wiki site: <page count> pages`

- [ ] **Step 5: Run M10 tests**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-render-site.test.js dist-tests/tests/core/build.test.js dist-tests/tests/cli/wiki-commands.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit M10**

Run:

```bash
git add packages/core/src/wiki/render-site.ts packages/core/src/build/build.ts packages/core/src/build/html.ts packages/core/src/index.ts packages/core/package.json packages/cli/src/commands/wiki.ts tests/core/wiki-render-site.test.ts tests/core/build.test.ts tests/cli/wiki-commands.test.ts
git commit -m "feat: render wiki knowledge site"
```

## M11: Provenance, Lifecycle, And Health

### Task 9: Wiki Lint Reports And Health Exceptions

**Files:**
- Modify: `packages/core/src/wiki/lint.ts`
- Modify: `packages/core/src/wiki/render-site.ts`
- Modify: `packages/core/src/wiki/compile.ts`
- Modify: `packages/cli/src/commands/wiki.ts`
- Test: `tests/core/wiki-lint.test.ts`
- Test: `tests/core/wiki-render-site.test.ts`

- [ ] **Step 1: Add failing health/lint tests**

Extend `tests/core/wiki-lint.test.ts`:

```ts
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWikiLint } from "@praxisbase/core/wiki/lint.js";

describe("runWikiLint", () => {
  it("writes lint report and human-action exceptions for broken links and duplicates", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-lint-"));
    const report = await runWikiLint(root, {
      pages: [
        {
          id: "duplicate",
          slug: "same",
          title: "Same",
          page_kind: "note",
          scope: "team",
          maturity: "draft",
          lifecycle: "draft",
          source_ids: ["source-a"],
          claims: [],
          outbound_links: [],
          body_markdown: "[[missing]]",
        },
        {
          id: "duplicate",
          slug: "same",
          title: "Same",
          page_kind: "note",
          scope: "team",
          maturity: "draft",
          lifecycle: "draft",
          source_ids: ["source-b"],
          claims: [],
          outbound_links: [],
          body_markdown: "",
        },
      ] as any,
    });

    assert.equal(report.changed_stable_knowledge, false);
    assert.ok(report.findings.some((finding) => finding.rule === "broken_wikilink"));
    assert.ok(report.findings.some((finding) => finding.rule === "duplicate_slug"));

    const reportFiles = await readdir(join(root, ".praxisbase/reports/wiki-lint"));
    assert.equal(reportFiles.length, 1);
    const saved = JSON.parse(await readFile(join(root, ".praxisbase/reports/wiki-lint", reportFiles[0]), "utf8"));
    assert.equal(saved.type, "wiki_lint_report");
  });
});
```

Extend `tests/core/wiki-render-site.test.ts`:

```ts
it("shows actionable health issues on the dashboard", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-health-"));
  await mkdir(join(root, "kb/notes"), { recursive: true });
  await writeFile(join(root, "kb/notes/a.md"), `---
id: a
type: note
scope: team
maturity: draft
---
# Same

[[missing]]
`);
  await writeFile(join(root, "kb/notes/b.md"), `---
id: b
type: note
scope: team
maturity: draft
---
# Same

Body.
`);
  await buildWikiSite(root);
  const index = await readFile(join(root, "dist/index.html"), "utf8");
  assert.ok(index.includes("Broken links"));
  assert.ok(index.includes("Duplicates"));
});
```

- [ ] **Step 2: Run lint/health tests to verify failure**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-lint.test.js dist-tests/tests/core/wiki-render-site.test.js
```

Expected: tests fail because `runWikiLint` and dashboard health issue rendering are not complete.

- [ ] **Step 3: Implement wiki lint report**

Extend `packages/core/src/wiki/lint.ts`:

```ts
export type WikiLintRule =
  | "missing_source_hash"
  | "missing_citation"
  | "broken_wikilink"
  | "orphan_active_page"
  | "duplicate_slug"
  | "duplicate_title"
  | "duplicate_id"
  | "stale_active_page"
  | "personal_scope_leak"
  | "unsafe_patch_path"
  | "body_shrink_violation"
  | "raw_log_content";

export interface WikiLintReport {
  id: string;
  protocol_version: "0.1";
  type: "wiki_lint_report";
  findings: Array<{
    rule: WikiLintRule;
    severity: "error" | "warning";
    path: string;
    message: string;
    page_id?: string;
    details?: Record<string, unknown>;
  }>;
  summary: { errors: number; warnings: number };
  changed_stable_knowledge: false;
  created_at: string;
}

export async function runWikiLint(
  root: string,
  input: { pages: WikiPage[]; now?: string }
): Promise<WikiLintReport>;
```

Behavior:

- Use `buildWikiGraph(input.pages)`.
- Convert `broken_links` to error findings.
- Convert duplicate id/slug/title to error findings.
- Convert orphans to warnings.
- Flag pages with missing `source_ids`.
- Flag high-confidence claims without citations.
- Flag active pages with lifecycle `stale`.
- Write report to `.praxisbase/reports/wiki-lint/<id>.json`.
- Write human-required exceptions for errors that require manual review; conflict exceptions for duplicates.
- Never write stable knowledge.

- [ ] **Step 4: Add lifecycle and confidence calculation**

Extend `packages/core/src/wiki/model.ts`:

```ts
export function inferWikiLifecycle(input: {
  maturity?: string;
  updated_at?: string;
  superseded_by?: string | null;
  now?: string;
}): "draft" | "reviewed" | "verified" | "stale" | "archived";

export function inferWikiConfidence(input: {
  sourceCount: number;
  maturity?: string;
  referenceCount?: number;
  explicitConfidence?: number;
}): number;
```

Rules:

- `superseded_by` makes `archived`.
- `maturity: proven` maps to `verified`; `verified` maps to `verified`; `draft` maps to `draft`.
- Items older than 180 days without references map to `stale`.
- Explicit confidence is clamped to `0..1`; otherwise source count, maturity, and references contribute deterministic score.

- [ ] **Step 5: Surface health in site and compile**

Modify `render-site.ts`:

- Use `inferWikiLifecycle` and `inferWikiConfidence` when creating pages.
- Call `runWikiLint` or equivalent in-memory health calculation during site build.
- Dashboard must show:
  - Sources
  - Pages
  - Stale
  - Broken links
  - Duplicates
  - Orphans
  - Recent sources
  - Bundle status

Modify `compile.ts`:

- Before writing a review-mode candidate, check `isAllowedWikiPatchPath`, `containsPrivateMaterial`, and `validateBodyShrink` for patch actions.
- Failed checks write exception records and increase report exceptions.
- Stable writes remain absent.

- [ ] **Step 6: Add CLI lint behavior under wiki graph/build-site**

Modify `packages/cli/src/commands/wiki.ts`:

- `wiki graph --json` includes `health` and writes `dist/graph.json`.
- `wiki build-site --json` includes `result.health`.
- The existing top-level `praxisbase lint` remains stable governance; wiki lint runs as part of graph/site and writes separate `.praxisbase/reports/wiki-lint`.

- [ ] **Step 7: Run M11 tests**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-lint.test.js dist-tests/tests/core/wiki-render-site.test.js dist-tests/tests/core/wiki-compile.test.js dist-tests/tests/cli/wiki-commands.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit M11**

Run:

```bash
git add packages/core/src/wiki/model.ts packages/core/src/wiki/lint.ts packages/core/src/wiki/render-site.ts packages/core/src/wiki/compile.ts packages/cli/src/commands/wiki.ts tests/core/wiki-lint.test.ts tests/core/wiki-render-site.test.ts tests/core/wiki-compile.test.ts tests/cli/wiki-commands.test.ts
git commit -m "feat: add wiki health lint"
```

## Final Verification

### Task 10: Full Suite And Final Commit

**Files:**
- All touched files from M7-M11

- [ ] **Step 1: Run typecheck and tests**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 2: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 3: Review generated git diff**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: only planned source, tests, package exports, and docs are changed.

- [ ] **Step 4: Commit final integration only if files remain uncommitted**

Run:

```bash
git add packages/core packages/cli tests docs/superpowers/plans/2026-05-20-wiki-compiler-knowledge-site-implementation-plan.md
git commit -m "chore: finalize wiki compiler implementation"
```

Expected: commit is created only when `git status --short` shows uncommitted planned files.

## Self-Review

- Spec coverage:
  - M7 object model, collector, state: Tasks 1-2.
  - M8 compile candidates, review/dry-run, reports, state diff, exceptions: Tasks 3-4.
  - M9 resolver, graph, CJK/English retrieval, context integration: Tasks 5-6.
  - M10 static site, AI exports, search UI, build compatibility: Tasks 7-8.
  - M11 lint, lifecycle, confidence, health dashboard, unsafe candidate blocking: Task 9.
- Placeholder scan:
  - No task depends on unnamed future behavior.
  - All commands and expected outcomes are concrete.
  - Each module lists exported interfaces/functions needed by later tasks.
- Type consistency:
  - `WikiSource`, `WikiPage`, `WikiGraph`, `WikiCompileReport`, and `WikiLintReport` are named consistently across tasks.
  - CLI uses `wikiCommand(root, subcommand, options)` in tests and implementation.
  - Context integration preserves existing `ContextResponse` shape and report writing.
