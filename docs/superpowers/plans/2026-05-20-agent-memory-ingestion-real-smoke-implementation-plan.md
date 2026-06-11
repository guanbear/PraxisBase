# Agent Memory Ingestion Real Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add M12 safe Codex/OpenClaw memory ingestion and a real wiki smoke flow that proves imported local evidence can feed wiki compile, graph, site, and context without stable knowledge mutation.

**Architecture:** Add one focused core module for scan/ingest/smoke orchestration, expose thin CLI wrappers, and reuse existing capture, raw-vault, wiki compile, graph, site, and context functions. The importer writes only protocol evidence and reports; proposal/review/promote remains the only stable knowledge mutation path.

**Tech Stack:** TypeScript ESM, Node built-ins, existing file-store helpers, existing redaction/lint guards, existing OpenClaw signature detector, Node test runner, Commander CLI.

---

## Document Traceability

- OpenSpec: `docs/openspec/changes/agent-memory-ingestion-real-smoke/`
- Design: `docs/superpowers/specs/2026-05-20-agent-memory-ingestion-real-smoke-design.md`
- BDD: `docs/bdd/agent-memory-ingestion-real-smoke.feature`
- Traceability matrix: `docs/superpowers/plans/2026-05-20-agent-memory-ingestion-real-smoke-traceability.md`

## File Structure

- Create `packages/core/src/experience/agent-memory.ts`
  - `scanAgentMemory`, `ingestAgentMemory`, `runRealWikiSmoke`, source parsing, summary extraction, dedupe, and report writing.
- Modify `packages/core/src/protocol/paths.ts`
  - Add `reportsMemoryIngest` and `runsMemoryIngest`.
- Modify `packages/core/src/protocol/schemas.ts`
  - Add Zod schemas/types for agent memory candidates, ingest reports, and real smoke reports.
- Modify `packages/core/src/index.ts`
  - Export `experience/agent-memory.js`.
- Modify `packages/core/package.json`
  - Export `./experience/agent-memory.js`.
- Modify `packages/cli/src/commands/memory.ts`
  - Add `scan` and `ingest` subcommands while preserving existing `import` and `refresh`.
- Modify `packages/cli/src/index.ts`
  - Add `--write`, `--dry-run`, `--limit`, and repeatable `--source` handling for memory commands.
- Create `packages/cli/src/commands/smoke.ts`
  - Add `real-wiki` command wrapper.
- Modify `packages/cli/src/index.ts`
  - Wire `praxisbase smoke real-wiki`.
- Create `tests/core/agent-memory.test.ts`
- Modify `tests/cli/experience-commands.test.ts`
  - Add memory scan/ingest CLI coverage.
- Create `tests/cli/real-smoke.test.ts`

## M12 Task 1: Protocol Paths And Schemas

**Files:**
- Modify: `packages/core/src/protocol/paths.ts`
- Modify: `packages/core/src/protocol/schemas.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Test: `tests/core/agent-memory.test.ts`

- [ ] **Step 1: Write failing schema/path tests**

Create `tests/core/agent-memory.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AgentMemoryCandidateSchema,
  AgentMemoryIngestReportSchema,
  RealWikiSmokeReportSchema,
  protocolPaths,
} from "@praxisbase/core";

describe("agent memory ingestion protocol", () => {
  it("exposes M12 paths and validates report schemas", async () => {
    await mkdtemp(join(tmpdir(), "praxisbase-agent-memory-"));
    assert.equal(protocolPaths.reportsMemoryIngest, ".praxisbase/reports/memory-ingest");
    assert.equal(protocolPaths.runsMemoryIngest, ".praxisbase/runs/memory-ingest");

    const candidate = AgentMemoryCandidateSchema.parse({
      id: "agent-memory-candidate_codex_session_1",
      agent: "codex",
      kind: "codex_session",
      source_path: "sessions/session-1.json",
      source_ref: "raw-vault://codex/session-1",
      source_hash: "sha256:session1",
      size_bytes: 128,
      warnings: [],
    });
    assert.equal(candidate.agent, "codex");

    const ingest = AgentMemoryIngestReportSchema.parse({
      id: "agent-memory-ingest_codex",
      protocol_version: "0.1",
      type: "agent_memory_ingest_report",
      agent: "codex",
      mode: "dry-run",
      scanned: 1,
      imported: 0,
      duplicates: 0,
      skipped: 0,
      unsafe: 0,
      outputs: [],
      warnings: [],
      changed_stable_knowledge: false,
      created_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(ingest.changed_stable_knowledge, false);

    const smoke = RealWikiSmokeReportSchema.parse({
      id: "real-wiki-smoke_codex",
      protocol_version: "0.1",
      type: "real_wiki_smoke_report",
      agent: "codex",
      imported: 1,
      duplicates: 0,
      unsafe: 0,
      proposal_candidates: 1,
      graph_nodes: 1,
      graph_broken_links: 0,
      site_pages: 1,
      context_items: 1,
      outputs: ["dist/index.html"],
      changed_stable_knowledge: false,
      created_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(smoke.type, "real_wiki_smoke_report");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/agent-memory.test.js
```

Expected: TypeScript fails because schemas/paths do not exist.

- [ ] **Step 3: Implement schemas and paths**

Add to `packages/core/src/protocol/paths.ts`:

```ts
runsMemoryIngest: ".praxisbase/runs/memory-ingest",
reportsMemoryIngest: ".praxisbase/reports/memory-ingest",
```

Add to `packages/core/src/protocol/schemas.ts`:

```ts
export const AgentMemoryCandidateSchema = z.object({
  id: z.string().min(1),
  agent: z.enum(["codex", "openclaw"]),
  kind: z.enum(["codex_session", "openclaw_log", "openclaw_episode"]),
  source_path: z.string().min(1),
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
  created_at: z.string().optional(),
  summary_hint: z.string().optional(),
  warnings: z.array(z.string()).default([]),
});

export const AgentMemoryIngestReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: z.literal("0.1"),
  type: z.literal("agent_memory_ingest_report"),
  agent: z.enum(["codex", "openclaw"]),
  mode: z.enum(["dry-run", "write"]),
  scanned: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  unsafe: z.number().int().nonnegative(),
  outputs: z.array(z.string()),
  warnings: z.array(z.string()).default([]),
  changed_stable_knowledge: z.literal(false),
  created_at: z.string(),
});

export const RealWikiSmokeReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: z.literal("0.1"),
  type: z.literal("real_wiki_smoke_report"),
  agent: z.enum(["codex", "openclaw"]),
  imported: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  unsafe: z.number().int().nonnegative(),
  proposal_candidates: z.number().int().nonnegative(),
  graph_nodes: z.number().int().nonnegative(),
  graph_broken_links: z.number().int().nonnegative(),
  site_pages: z.number().int().nonnegative(),
  context_items: z.number().int().nonnegative(),
  outputs: z.array(z.string()),
  changed_stable_knowledge: z.literal(false),
  created_at: z.string(),
});
```

Export inferred types next to existing protocol exports.

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/agent-memory.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit M12 protocol**

```bash
git add packages/core/src/protocol/paths.ts packages/core/src/protocol/schemas.ts tests/core/agent-memory.test.ts
git commit -m "feat: add agent memory ingestion protocol"
```

## M12 Task 2: Scan Codex And OpenClaw Sources

**Files:**
- Create: `packages/core/src/experience/agent-memory.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Test: `tests/core/agent-memory.test.ts`

- [ ] **Step 1: Add failing scan tests**

Extend `tests/core/agent-memory.test.ts`:

```ts
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { scanAgentMemory } from "@praxisbase/core/experience/agent-memory.js";

describe("scanAgentMemory", () => {
  it("scans Codex session fixtures without writing files", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-codex-scan-"));
    const sessions = join(root, "codex-sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.json"), JSON.stringify({
      id: "session-1",
      messages: [
        { role: "user", content: "Implement wiki graph retrieval." },
        { role: "assistant", content: "Changed packages/core/src/wiki/resolver.ts and ran pnpm check." }
      ],
      created_at: "2026-05-20T00:00:00.000Z"
    }));

    const result = await scanAgentMemory(root, {
      agent: "codex",
      sources: [sessions],
      limit: 10,
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].agent, "codex");
    assert.equal(result.candidates[0].kind, "codex_session");
    assert.ok(result.candidates[0].source_hash.startsWith("sha256:"));
    await assert.rejects(() => stat(join(root, ".praxisbase/raw-vault/refs")), { code: "ENOENT" });
  });

  it("scans OpenClaw logs and detects known signatures", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-scan-"));
    const logs = join(root, "logs");
    await mkdir(logs, { recursive: true });
    await writeFile(join(logs, "openclaw.log"), "Claude auth expired. Please login again.");

    const result = await scanAgentMemory(root, {
      agent: "openclaw",
      sources: [logs],
      limit: 10,
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].kind, "openclaw_log");
    assert.ok(result.candidates[0].summary_hint?.includes("openclaw:claude-auth-expired"));
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/agent-memory.test.js
```

Expected: module/function missing.

- [ ] **Step 3: Implement scan**

Create `packages/core/src/experience/agent-memory.ts` with exported interfaces and functions:

```ts
export interface ScanAgentMemoryInput {
  agent: "codex" | "openclaw";
  sources?: string[];
  limit?: number;
  maxBytes?: number;
  now?: string;
}

export interface ScanAgentMemoryResult {
  candidates: AgentMemoryCandidate[];
  skipped: number;
  warnings: string[];
}

export async function scanAgentMemory(root: string, input: ScanAgentMemoryInput): Promise<ScanAgentMemoryResult>;
```

Implementation requirements:

- Recursively list only `.json`, `.jsonl`, `.md`, `.txt`, `.log`.
- Default `limit` is 20 and `maxBytes` is `512 * 1024`.
- Use `stat` before reading; skip oversize files.
- Compute `source_hash` with `computeHash(rawText)`.
- For Codex, `source_ref` is `raw-vault://codex/<basename-without-extension>`.
- For OpenClaw, `source_ref` is `log://openclaw/<basename>`.
- Summaries are hints only; no writes in scan.
- Sort candidates by `source_ref`.

- [ ] **Step 4: Export module**

Add package export:

```json
"./experience/agent-memory.js": {
  "types": "./src/experience/agent-memory.ts",
  "default": "./dist/experience/agent-memory.js"
}
```

Add root export:

```ts
export * from "./experience/agent-memory.js";
```

- [ ] **Step 5: Run scan tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/agent-memory.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit scan**

```bash
git add packages/core/src/experience/agent-memory.ts packages/core/src/index.ts packages/core/package.json tests/core/agent-memory.test.ts
git commit -m "feat: scan agent memory sources"
```

## M12 Task 3: Ingest Evidence Safely

**Files:**
- Modify: `packages/core/src/experience/agent-memory.ts`
- Test: `tests/core/agent-memory.test.ts`

- [ ] **Step 1: Add failing ingest tests**

Extend `tests/core/agent-memory.test.ts`:

```ts
import { ingestAgentMemory } from "@praxisbase/core/experience/agent-memory.js";

describe("ingestAgentMemory", () => {
  it("writes raw-vault refs and captures without raw session text", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-codex-ingest-"));
    const source = join(root, "session-1.txt");
    await writeFile(source, "User: build wiki\nAssistant: implemented graph retrieval and pnpm check passed\nRAW SHOULD NOT BE STORED");

    const report = await ingestAgentMemory(root, {
      agent: "codex",
      sources: [source],
      mode: "write",
      limit: 10,
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(report.imported, 1);
    assert.equal(report.changed_stable_knowledge, false);
    const refs = await readdir(join(root, ".praxisbase/raw-vault/refs"));
    const captures = await readdir(join(root, ".praxisbase/outbox/captures"));
    assert.equal(refs.length, 1);
    assert.equal(captures.length, 1);
    const refRaw = await readFile(join(root, ".praxisbase/raw-vault/refs", refs[0]), "utf8");
    const captureRaw = await readFile(join(root, ".praxisbase/outbox/captures", captures[0]), "utf8");
    assert.equal(refRaw.includes("RAW SHOULD NOT BE STORED"), false);
    assert.equal(captureRaw.includes("RAW SHOULD NOT BE STORED"), false);
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
  });

  it("deduplicates imported source hashes", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-codex-dedupe-"));
    const source = join(root, "session-1.txt");
    await writeFile(source, "Implemented wiki site and tests passed.");

    const first = await ingestAgentMemory(root, { agent: "codex", sources: [source], mode: "write", now: "2026-05-20T00:00:00.000Z" });
    const second = await ingestAgentMemory(root, { agent: "codex", sources: [source], mode: "write", now: "2026-05-20T00:00:00.000Z" });
    assert.equal(first.imported, 1);
    assert.equal(second.imported, 0);
    assert.equal(second.duplicates, 1);
  });

  it("routes private material to human-required exceptions", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-codex-private-"));
    const source = join(root, "session-secret.txt");
    await writeFile(source, "The token abc123 was printed.");

    const report = await ingestAgentMemory(root, { agent: "codex", sources: [source], mode: "write", now: "2026-05-20T00:00:00.000Z" });
    assert.equal(report.imported, 0);
    assert.equal(report.unsafe, 1);
    const exceptions = await readdir(join(root, ".praxisbase/exceptions/human-required"));
    assert.equal(exceptions.length, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/agent-memory.test.js
```

Expected: `ingestAgentMemory` missing or not writing outputs.

- [ ] **Step 3: Implement ingest**

Add:

```ts
export interface IngestAgentMemoryInput extends ScanAgentMemoryInput {
  mode?: "dry-run" | "write";
  scope?: "personal" | "project" | "team";
}

export async function ingestAgentMemory(root: string, input: IngestAgentMemoryInput): Promise<AgentMemoryIngestReport>;
```

Implementation rules:

- Call `scanAgentMemory`.
- Load existing hashes from `.praxisbase/raw-vault/refs/*.json`, `.praxisbase/outbox/captures/*.json`, `.praxisbase/reports/memory/*.json`, and `.praxisbase/reports/memory-ingest/*.json`.
- Skip duplicate hashes.
- Generate summaries from candidate hints capped to 1200 characters.
- Use `containsPrivateMaterial` on raw text and generated summary before write.
- In dry-run mode, write nothing.
- In write mode, write raw-vault ref and capture per imported candidate.
- Always write ingest report and run record in write mode; for dry-run return report only unless CLI explicitly asks to save reports later.

- [ ] **Step 4: Run ingest tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/agent-memory.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit ingest**

```bash
git add packages/core/src/experience/agent-memory.ts tests/core/agent-memory.test.ts
git commit -m "feat: ingest agent memory evidence"
```

## M12 Task 4: CLI Memory Scan And Ingest

**Files:**
- Modify: `packages/cli/src/commands/memory.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/cli/experience-commands.test.ts`

- [ ] **Step 1: Add failing CLI tests**

Extend `tests/cli/experience-commands.test.ts`:

```ts
it("memory scan returns Codex candidates without writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-memory-scan-"));
  const sessions = join(root, "sessions");
  await mkdir(sessions, { recursive: true });
  await writeFile(join(sessions, "session-1.txt"), "Implemented wiki retrieval and pnpm check passed.");

  const output = await memoryCommand(root, "scan", {
    agent: "codex",
    sources: [sessions],
    limit: 5,
    json: true,
  } as any);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.candidates.length, 1);
  await assert.rejects(() => stat(join(root, ".praxisbase/raw-vault/refs")), { code: "ENOENT" });
});

it("memory ingest writes protocol evidence only", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-memory-ingest-"));
  const source = join(root, "session-1.txt");
  await writeFile(source, "Implemented wiki health lint and tests passed.");

  const output = await memoryCommand(root, "ingest", {
    agent: "codex",
    sources: [source],
    write: true,
    limit: 5,
    json: true,
  } as any);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.report.imported, 1);
  await assert.doesNotReject(stat(join(root, ".praxisbase/raw-vault/refs")));
  await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
});
```

- [ ] **Step 2: Run CLI tests to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/experience-commands.test.js
```

Expected: unknown memory subcommands/options.

- [ ] **Step 3: Implement CLI wrapper**

Modify `packages/cli/src/commands/memory.ts`:

- Preserve existing `import` and `refresh`.
- Add `scan` returning `{ ok: true, candidates, skipped, warnings }`.
- Add `ingest` returning `{ ok: true, report }`.
- Non-JSON scan: `Memory scan: <n> candidates`.
- Non-JSON ingest: `Memory ingest: <imported> imported`.

Modify `packages/cli/src/index.ts` memory command options:

```ts
.option("--source <path>", "source file or directory", collect, [])
.option("--limit <n>")
.option("--dry-run")
.option("--write")
```

Parse limit as integer and pass `sources`.

- [ ] **Step 4: Run CLI tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/experience-commands.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit CLI memory**

```bash
git add packages/cli/src/commands/memory.ts packages/cli/src/index.ts tests/cli/experience-commands.test.ts
git commit -m "feat: add memory scan ingest cli"
```

## M12 Task 5: Real Wiki Smoke

**Files:**
- Modify: `packages/core/src/experience/agent-memory.ts`
- Create: `packages/cli/src/commands/smoke.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/cli/real-smoke.test.ts`

- [ ] **Step 1: Add failing smoke tests**

Create `tests/cli/real-smoke.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { smokeCommand } from "@praxisbase/cli/commands/smoke.js";

describe("real wiki smoke CLI", () => {
  it("runs ingest through wiki site and context without stable knowledge mutation", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-real-smoke-"));
    const source = join(root, "session-1.txt");
    await writeFile(source, "Implemented wiki compile workflow. pnpm check passed.");

    const output = await smokeCommand(root, "real-wiki", {
      agent: "codex",
      sources: [source],
      query: "wiki compile",
      json: true,
    });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.changed_stable_knowledge, false);
    assert.equal(parsed.report.imported, 1);
    assert.ok(parsed.report.proposal_candidates >= 1);
    assert.ok(parsed.report.graph_nodes >= 0);
    assert.ok(parsed.report.outputs.includes("dist/index.html"));
    await assert.doesNotReject(stat(join(root, "dist/index.html")));
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
  });
});
```

- [ ] **Step 2: Run smoke tests to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/real-smoke.test.js
```

Expected: smoke command missing.

- [ ] **Step 3: Implement core real smoke**

In `packages/core/src/experience/agent-memory.ts`, add:

```ts
export interface RunRealWikiSmokeInput extends IngestAgentMemoryInput {
  query?: string;
}

export async function runRealWikiSmoke(root: string, input: RunRealWikiSmokeInput): Promise<RealWikiSmokeReport>;
```

Implementation:

- Call `ingestAgentMemory` with `mode: "write"`.
- Call `compileWiki(root, { mode: "review" })`.
- Call `collectWikiPages(root)` and `buildWikiGraph(pages)`.
- Call `buildWikiSite(root)`.
- Call `buildContext({ root, workspace: root, agent, stage: "repair", query })`.
- Return counts and output paths.
- Do not call review/promote.

- [ ] **Step 4: Implement CLI smoke wrapper**

Create `packages/cli/src/commands/smoke.ts`:

```ts
import { runRealWikiSmoke } from "@praxisbase/core/experience/agent-memory.js";

export interface SmokeCommandOptions {
  agent?: "codex" | "openclaw";
  sources?: string[];
  source?: string;
  limit?: number;
  query?: string;
  json?: boolean;
}

export async function smokeCommand(root: string, subcommand: string, options: SmokeCommandOptions): Promise<string> {
  if (subcommand !== "real-wiki") {
    throw new Error(`Unknown subcommand "smoke ${subcommand}". Use "smoke real-wiki".`);
  }
  if (!options.agent) throw new Error("smoke real-wiki requires --agent.");
  const report = await runRealWikiSmoke(root, {
    agent: options.agent,
    sources: options.sources ?? (options.source ? [options.source] : undefined),
    limit: options.limit,
    query: options.query,
    mode: "write",
  });
  if (options.json) return JSON.stringify({ ok: true, report }, null, 2);
  return `Real wiki smoke: ${report.imported} imported, ${report.proposal_candidates} proposals, ${report.site_pages} pages`;
}
```

Wire `packages/cli/src/index.ts`:

```ts
program
  .command("smoke")
  .argument("<sub>", "subcommand (real-wiki)")
  .requiredOption("--agent <agent>")
  .option("--source <path>", "source file or directory", collect, [])
  .option("--limit <n>")
  .option("--query <query>")
  .option("--json")
  .action(async (sub, options) => {
    console.log(await smokeCommand(process.cwd(), sub, {
      ...options,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
    }));
  });
```

- [ ] **Step 5: Run smoke tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/real-smoke.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit smoke**

```bash
git add packages/core/src/experience/agent-memory.ts packages/cli/src/commands/smoke.ts packages/cli/src/index.ts tests/cli/real-smoke.test.ts
git commit -m "feat: add real wiki smoke"
```

## Final Verification

- [ ] **Step 1: Run full suite**

```bash
pnpm check
```

Expected: all tests pass.

- [ ] **Step 2: Run whitespace check**

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 3: Manual smoke on explicit source**

```bash
tmpdir=$(mktemp -d)
printf 'Implemented PraxisBase wiki compile and ran pnpm check.' > "$tmpdir/session.txt"
node packages/cli/dist/index.js smoke real-wiki --agent codex --source "$tmpdir/session.txt" --query "wiki compile" --json
```

Expected:

- JSON has `ok: true`,
- `changed_stable_knowledge: false`,
- output includes `dist/index.html`,
- `.praxisbase/outbox/captures/` and `.praxisbase/raw-vault/refs/` exist,
- `kb/` and `skills/` are not created by smoke unless the workspace already had them.

- [ ] **Step 4: Commit final fixes**

```bash
git status --short
git add <changed-files>
git commit -m "test: verify agent memory real smoke"
```

Only commit if there are additional verification/doc fixes after Task 5.
