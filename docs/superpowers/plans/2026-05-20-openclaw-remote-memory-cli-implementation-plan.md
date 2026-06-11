# OpenClaw Remote Memory CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PraxisBase CLI support for fetching non-local OpenClaw memory into safe staging envelopes that M12 `memory ingest` can import.

**Architecture:** Add a core remote fetch module with provider adapters, safe envelope normalization, report writing, and doctor diagnostics. CLI commands stay thin: `memory fetch` calls the core fetcher, and `doctor openclaw-remote` calls the core doctor.

**Tech Stack:** TypeScript ESM, Node built-ins, Commander CLI, existing protocol schemas, existing file-store helpers, existing redaction guards, Node test runner.

---

## Document Traceability

- OpenSpec: `docs/openspec/changes/openclaw-remote-memory-cli/`
- Design: `docs/superpowers/specs/2026-05-20-openclaw-remote-memory-cli-design.md`
- BDD: `docs/bdd/openclaw-remote-memory-cli.feature`
- Traceability matrix: `docs/superpowers/plans/2026-05-20-openclaw-remote-memory-cli-traceability.md`

## File Structure

- Create `packages/core/src/experience/openclaw-remote.ts`
  - `fetchOpenClawRemoteMemory`, `doctorOpenClawRemote`, provider adapters, normalization, redaction, source hash, and report writing.
- Modify `packages/core/src/protocol/paths.ts`
  - Add `stagingOpenClaw`, `reportsMemoryFetch`, and `runsMemoryFetch`.
- Modify `packages/core/src/protocol/schemas.ts`
  - Add `OpenClawRemoteMemoryEnvelopeSchema`, `AgentMemoryFetchReportSchema`, and `OpenClawRemoteDoctorReportSchema`.
- Modify `packages/core/src/index.ts`
  - Export `experience/openclaw-remote.js`.
- Modify `packages/core/package.json`
  - Export `./experience/openclaw-remote.js`.
- Modify `packages/cli/src/commands/memory.ts`
  - Add `fetch` subcommand while preserving `import`, `refresh`, `scan`, and `ingest`.
- Create `packages/cli/src/commands/doctor.ts`
  - Add `openclaw-remote` doctor command wrapper.
- Modify `packages/cli/src/index.ts`
  - Wire `memory fetch` options and `doctor openclaw-remote`.
- Modify `.gitignore`
  - Ignore `.praxisbase/staging/`.
- Modify `packages/cli/src/commands/init.ts`
  - Ensure initialized workspaces include staging directories and generated ignore guidance when appropriate.
- Create `tests/core/openclaw-remote-memory.test.ts`
- Modify `tests/cli/experience-commands.test.ts`
  - Add `memory fetch` CLI coverage.
- Create `tests/cli/doctor-command.test.ts`

## M12.1 Task 1: Protocol Paths, Schemas, And Git Ignore

**Files:**
- Modify: `packages/core/src/protocol/paths.ts`
- Modify: `packages/core/src/protocol/schemas.ts`
- Modify: `.gitignore`
- Test: `tests/core/openclaw-remote-memory.test.ts`

- [ ] **Step 1: Write failing schema/path tests**

Create `tests/core/openclaw-remote-memory.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AgentMemoryFetchReportSchema,
  OpenClawRemoteDoctorReportSchema,
  OpenClawRemoteMemoryEnvelopeSchema,
  protocolPaths,
} from "@praxisbase/core";

describe("OpenClaw remote memory protocol", () => {
  it("exposes M12.1 paths and validates remote schemas", () => {
    assert.equal(protocolPaths.stagingOpenClaw, ".praxisbase/staging/openclaw");
    assert.equal(protocolPaths.reportsMemoryFetch, ".praxisbase/reports/memory-fetch");
    assert.equal(protocolPaths.runsMemoryFetch, ".praxisbase/runs/memory-fetch");

    const envelope = OpenClawRemoteMemoryEnvelopeSchema.parse({
      id: "openclaw-remote_remote-auth-expired-1",
      protocol_version: "0.1",
      type: "openclaw_remote_memory",
      provider: "exported-json",
      remote_id: "remote-auth-expired-1",
      source_ref: "openclaw://exported-json/remote-auth-expired-1",
      source_hash: "sha256:abc",
      redacted_summary: "OpenClaw detected Claude auth expired.",
      signature: "openclaw:claude-auth-expired",
      fetched_at: "2026-05-20T00:00:00.000Z",
      warnings: [],
    });
    assert.equal(envelope.provider, "exported-json");

    const fetchReport = AgentMemoryFetchReportSchema.parse({
      id: "memory-fetch_openclaw_exported-json",
      protocol_version: "0.1",
      type: "agent_memory_fetch_report",
      agent: "openclaw",
      provider: "exported-json",
      runtime_mode: "source",
      fetched: 1,
      staged: 1,
      duplicates: 0,
      skipped: 0,
      unsafe: 0,
      outputs: [".praxisbase/staging/openclaw/openclaw-remote_remote-auth-expired-1.json"],
      warnings: [],
      changed_stable_knowledge: false,
      created_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(fetchReport.changed_stable_knowledge, false);

    const doctor = OpenClawRemoteDoctorReportSchema.parse({
      id: "openclaw-remote-doctor_openclaw-api",
      protocol_version: "0.1",
      type: "openclaw_remote_doctor_report",
      provider: "openclaw-api",
      runtime_mode: "source",
      ok: false,
      checks: [
        { id: "openclaw-token", ok: false, severity: "error", message: "OPENCLAW_TOKEN is not set." },
      ],
      warnings: ["OPENCLAW_TOKEN is not set."],
      created_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(doctor.ok, false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/openclaw-remote-memory.test.js
```

Expected: TypeScript fails because schemas and paths do not exist.

- [ ] **Step 3: Add paths and schemas**

Add to `packages/core/src/protocol/paths.ts`:

```ts
stagingOpenClaw: ".praxisbase/staging/openclaw",
reportsMemoryFetch: ".praxisbase/reports/memory-fetch",
runsMemoryFetch: ".praxisbase/runs/memory-fetch",
```

Add to `packages/core/src/protocol/schemas.ts`:

```ts
export const OpenClawRemoteProviderSchema = z.enum(["exported-json", "openclaw-api", "openclaw-cli"]);
export const PraxisBaseCliRuntimeModeSchema = z.enum(["source", "installed", "ci", "unknown"]);

export const OpenClawRemoteMemoryEnvelopeSchema = z.object({
  id: z.string().min(1),
  protocol_version: z.literal("0.1"),
  type: z.literal("openclaw_remote_memory"),
  provider: OpenClawRemoteProviderSchema,
  remote_id: z.string().min(1),
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  redacted_summary: z.string().min(1),
  signature: z.string().optional(),
  created_at: z.string().optional(),
  fetched_at: z.string(),
  warnings: z.array(z.string()).default([]),
});

export const AgentMemoryFetchReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: z.literal("0.1"),
  type: z.literal("agent_memory_fetch_report"),
  agent: z.literal("openclaw"),
  provider: OpenClawRemoteProviderSchema,
  runtime_mode: PraxisBaseCliRuntimeModeSchema,
  fetched: z.number().int().nonnegative(),
  staged: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  unsafe: z.number().int().nonnegative(),
  outputs: z.array(z.string()),
  warnings: z.array(z.string()).default([]),
  changed_stable_knowledge: z.literal(false),
  created_at: z.string(),
});

export const OpenClawRemoteDoctorReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: z.literal("0.1"),
  type: z.literal("openclaw_remote_doctor_report"),
  provider: OpenClawRemoteProviderSchema,
  runtime_mode: PraxisBaseCliRuntimeModeSchema,
  ok: z.boolean(),
  checks: z.array(z.object({
    id: z.string().min(1),
    ok: z.boolean(),
    severity: z.enum(["info", "warning", "error"]),
    message: z.string().min(1),
  })),
  warnings: z.array(z.string()).default([]),
  created_at: z.string(),
});
```

Export inferred types next to existing protocol exports.

- [ ] **Step 4: Ignore staging**

Add to `.gitignore`:

```gitignore
.praxisbase/staging/
```

- [ ] **Step 5: Run tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/openclaw-remote-memory.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit protocol**

```bash
git add .gitignore packages/core/src/protocol/paths.ts packages/core/src/protocol/schemas.ts tests/core/openclaw-remote-memory.test.ts
git commit -m "feat: add openclaw remote memory protocol"
```

## M12.1 Task 2: Exported JSON Provider

**Files:**
- Create: `packages/core/src/experience/openclaw-remote.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Test: `tests/core/openclaw-remote-memory.test.ts`

- [ ] **Step 1: Add failing exported JSON test**

Extend `tests/core/openclaw-remote-memory.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchOpenClawRemoteMemory } from "@praxisbase/core/experience/openclaw-remote.js";

describe("fetchOpenClawRemoteMemory exported-json", () => {
  it("stages safe envelopes without raw remote body", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-remote-export-"));
    const source = join(root, "openclaw-export.json");
    await writeFile(source, JSON.stringify({
      items: [{
        id: "remote-auth-expired-1",
        summary: "OpenClaw detected Claude auth expired and asked the user to login again.",
        signature: "openclaw:claude-auth-expired",
        created_at: "2026-05-20T00:00:00.000Z",
        raw_log: "RAW REMOTE LOG SHOULD NOT BE STAGED",
      }],
    }));

    const report = await fetchOpenClawRemoteMemory(root, {
      provider: "exported-json",
      sources: [source],
      now: "2026-05-20T00:00:00.000Z",
      runtimeMode: "source",
    });

    assert.equal(report.staged, 1);
    assert.equal(report.changed_stable_knowledge, false);
    const staged = await readdir(join(root, ".praxisbase/staging/openclaw"));
    assert.equal(staged.length, 1);
    const raw = await readFile(join(root, ".praxisbase/staging/openclaw", staged[0]), "utf8");
    assert.equal(raw.includes("RAW REMOTE LOG SHOULD NOT BE STAGED"), false);
    assert.equal(raw.includes("openclaw:claude-auth-expired"), true);
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/openclaw-remote-memory.test.js
```

Expected: module/function missing.

- [ ] **Step 3: Implement exported JSON fetch**

Create `packages/core/src/experience/openclaw-remote.ts`:

```ts
export interface FetchOpenClawRemoteMemoryInput {
  provider: "exported-json" | "openclaw-api" | "openclaw-cli";
  sources?: string[];
  remote?: string;
  since?: string;
  limit?: number;
  out?: string;
  runtimeMode?: "source" | "installed" | "ci" | "unknown";
  env?: Record<string, string | undefined>;
  now?: string;
}

export async function fetchOpenClawRemoteMemory(
  root: string,
  input: FetchOpenClawRemoteMemoryInput
): Promise<AgentMemoryFetchReport>;
```

Implementation rules:

- Require `sources` for `exported-json`.
- Support object with `items`, top-level array, JSONL, and NDJSON.
- Build `remote_id` from `id`, `remote_id`, or deterministic hash.
- Build `source_ref` as `openclaw://exported-json/<remote_id>`.
- Compute `source_hash` from the raw item JSON string.
- Use `summary`, `redacted_summary`, or a safe bounded text extraction.
- Apply existing private-material checks before staging.
- Write envelopes to `protocolPaths.stagingOpenClaw`.
- Write fetch report to `protocolPaths.reportsMemoryFetch`.
- Write run record to `protocolPaths.runsMemoryFetch`.

- [ ] **Step 4: Export module**

Add package export:

```json
"./experience/openclaw-remote.js": {
  "types": "./src/experience/openclaw-remote.ts",
  "default": "./dist/experience/openclaw-remote.js"
}
```

Add root export:

```ts
export * from "./experience/openclaw-remote.js";
```

- [ ] **Step 5: Run exported JSON tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/openclaw-remote-memory.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit exported JSON provider**

```bash
git add packages/core/src/experience/openclaw-remote.ts packages/core/src/index.ts packages/core/package.json tests/core/openclaw-remote-memory.test.ts
git commit -m "feat: fetch openclaw memory exports"
```

## M12.1 Task 3: API Provider And Doctor

**Files:**
- Modify: `packages/core/src/experience/openclaw-remote.ts`
- Test: `tests/core/openclaw-remote-memory.test.ts`

- [ ] **Step 1: Add failing API and doctor tests**

Extend `tests/core/openclaw-remote-memory.test.ts`:

```ts
import { createServer } from "node:http";
import { once } from "node:events";
import { doctorOpenClawRemote } from "@praxisbase/core/experience/openclaw-remote.js";

describe("fetchOpenClawRemoteMemory openclaw-api", () => {
  it("fetches from a mock API without persisting auth secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-remote-api-"));
    const token = "secret-token-should-not-be-written";
    const server = createServer((req, res) => {
      assert.equal(req.headers.authorization, `Bearer ${token}`);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        items: [{
          id: "remote-api-1",
          summary: "OpenClaw workspace lock was detected and cleared.",
          signature: "openclaw:workspace-lock-stuck",
          created_at: "2026-05-20T00:00:00.000Z",
        }],
      }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const report = await fetchOpenClawRemoteMemory(root, {
      provider: "openclaw-api",
      remote: "workspace/project",
      limit: 1,
      runtimeMode: "source",
      now: "2026-05-20T00:00:00.000Z",
      env: {
        OPENCLAW_TOKEN: token,
        OPENCLAW_BASE_URL: `http://127.0.0.1:${address.port}`,
      },
    } as any);
    server.close();

    assert.equal(report.staged, 1);
    const reportRaw = await readFile(join(root, ".praxisbase/reports/memory-fetch", `${report.id}.json`), "utf8");
    assert.equal(reportRaw.includes(token), false);
    assert.equal(reportRaw.includes("Authorization"), false);
  });
});

describe("doctorOpenClawRemote", () => {
  it("reports missing OPENCLAW_TOKEN for openclaw-api", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-remote-doctor-"));
    const report = await doctorOpenClawRemote(root, {
      provider: "openclaw-api",
      runtimeMode: "source",
      env: {},
      now: "2026-05-20T00:00:00.000Z",
    } as any);

    assert.equal(report.ok, false);
    assert.ok(report.checks.some((check) => check.id === "openclaw-token" && check.ok === false));
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/openclaw-remote-memory.test.js
```

Expected: API provider or doctor missing.

- [ ] **Step 3: Implement API provider**

Implementation rules:

- Require `remote` for `openclaw-api`.
- Read `OPENCLAW_TOKEN` and optional `OPENCLAW_BASE_URL` from an injectable env object defaulting to `process.env`.
- Send bearer token only in request headers.
- Use `limit` and `since` query params.
- Normalize API response through the same envelope builder as `exported-json`.
- Never write token, headers, or raw response body.

- [ ] **Step 4: Implement doctor**

Add:

```ts
export interface DoctorOpenClawRemoteInput {
  provider: "exported-json" | "openclaw-api" | "openclaw-cli";
  runtimeMode?: "source" | "installed" | "ci" | "unknown";
  env?: Record<string, string | undefined>;
  now?: string;
  writeReport?: boolean;
}

export async function doctorOpenClawRemote(
  root: string,
  input: DoctorOpenClawRemoteInput
): Promise<OpenClawRemoteDoctorReport>;
```

Checks:

- `exported-json`: provider available.
- `openclaw-api`: `OPENCLAW_TOKEN` exists; base URL is syntactically valid when provided.
- `openclaw-cli`: external CLI availability and login state; missing CLI is an error.
- `.praxisbase/staging/` is ignored or warn with `staging_not_ignored`.

- [ ] **Step 5: Run API and doctor tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/openclaw-remote-memory.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit API and doctor core**

```bash
git add packages/core/src/experience/openclaw-remote.ts tests/core/openclaw-remote-memory.test.ts
git commit -m "feat: add openclaw remote api doctor"
```

## M12.1 Task 4: PraxisBase CLI Commands

**Files:**
- Modify: `packages/cli/src/commands/memory.ts`
- Create: `packages/cli/src/commands/doctor.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/package.json`
- Test: `tests/cli/experience-commands.test.ts`
- Test: `tests/cli/doctor-command.test.ts`

- [ ] **Step 1: Add failing CLI tests**

Extend `tests/cli/experience-commands.test.ts`:

```ts
it("memory fetch stages OpenClaw exported JSON through PraxisBase CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-memory-fetch-"));
  const source = join(root, "openclaw-export.json");
  await writeFile(source, JSON.stringify({
    items: [{
      id: "remote-auth-expired-1",
      summary: "OpenClaw detected Claude auth expired.",
      signature: "openclaw:claude-auth-expired",
    }],
  }));

  const output = await memoryCommand(root, "fetch", {
    agent: "openclaw",
    provider: "exported-json",
    sources: [source],
    json: true,
  } as any);
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.report.provider, "exported-json");
  assert.equal(parsed.report.staged, 1);
  await assert.doesNotReject(stat(join(root, ".praxisbase/staging/openclaw")));
  await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
});
```

Create `tests/cli/doctor-command.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { doctorCommand } from "@praxisbase/cli/commands/doctor.js";

describe("doctor command", () => {
  it("reports missing OpenClaw API token", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-doctor-openclaw-"));
    const output = await doctorCommand(root, "openclaw-remote", {
      provider: "openclaw-api",
      json: true,
      env: {},
    } as any);
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, false);
    assert.ok(parsed.report.checks.some((check: { id: string; ok: boolean }) => check.id === "openclaw-token" && check.ok === false));
  });
});
```

- [ ] **Step 2: Run CLI tests to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/experience-commands.test.js dist-tests/tests/cli/doctor-command.test.js
```

Expected: unknown `memory fetch` or missing doctor command.

- [ ] **Step 3: Implement `memory fetch` wrapper**

Modify `packages/cli/src/commands/memory.ts`:

- Preserve existing `import`, `refresh`, `scan`, and `ingest`.
- Add `fetch`.
- Require `agent === "openclaw"`.
- Pass `provider`, `sources`, `source`, `remote`, `since`, `limit`, `out`, and runtime mode to core.
- JSON output shape: `{ ok: true, report }`.

- [ ] **Step 4: Implement doctor wrapper**

Create `packages/cli/src/commands/doctor.ts`:

```ts
import { doctorOpenClawRemote } from "@praxisbase/core/experience/openclaw-remote.js";

export interface DoctorCommandOptions {
  provider?: "exported-json" | "openclaw-api" | "openclaw-cli";
  json?: boolean;
  writeReport?: boolean;
}

export async function doctorCommand(root: string, subcommand: string, options: DoctorCommandOptions): Promise<string> {
  if (subcommand !== "openclaw-remote") {
    throw new Error(`Unknown subcommand "doctor ${subcommand}". Use "doctor openclaw-remote".`);
  }
  if (!options.provider) throw new Error("doctor openclaw-remote requires --provider.");
  const report = await doctorOpenClawRemote(root, {
    provider: options.provider,
    writeReport: options.writeReport,
  });
  if (options.json) return JSON.stringify({ ok: report.ok, report }, null, 2);
  return report.ok ? "OpenClaw remote provider is ready" : `OpenClaw remote provider is not ready: ${report.warnings.join("; ")}`;
}
```

- [ ] **Step 5: Wire Commander**

Modify `packages/cli/src/index.ts`:

```ts
program
  .command("doctor")
  .argument("<sub>", "subcommand (openclaw-remote)")
  .requiredOption("--provider <provider>")
  .option("--write-report")
  .option("--json")
  .action(async (sub, options) => {
    console.log(await doctorCommand(process.cwd(), sub, options));
  });
```

Add `memory fetch` options to the existing memory command:

```ts
.option("--provider <provider>")
.option("--remote <remote>")
.option("--since <iso-date>")
.option("--limit <n>")
.option("--out <path>")
```

Add package export in `packages/cli/package.json`:

```json
"./commands/doctor.js": {
  "types": "./src/commands/doctor.ts",
  "default": "./dist/commands/doctor.js"
}
```

- [ ] **Step 6: Run CLI tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/experience-commands.test.js dist-tests/tests/cli/doctor-command.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit CLI commands**

```bash
git add packages/cli/src/commands/memory.ts packages/cli/src/commands/doctor.ts packages/cli/src/index.ts packages/cli/package.json tests/cli/experience-commands.test.ts tests/cli/doctor-command.test.ts
git commit -m "feat: add openclaw remote cli commands"
```

## M12.1 Task 5: Fetch-To-Ingest Compatibility

**Files:**
- Modify: `packages/core/src/experience/agent-memory.ts`
- Modify: `packages/core/src/experience/openclaw-remote.ts`
- Test: `tests/core/openclaw-remote-memory.test.ts`

- [ ] **Step 1: Add failing compatibility test**

Extend `tests/core/openclaw-remote-memory.test.ts`:

```ts
import { ingestAgentMemory } from "@praxisbase/core/experience/agent-memory.js";

describe("OpenClaw remote fetch to ingest", () => {
  it("imports staged remote envelopes as OpenClaw evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-openclaw-fetch-ingest-"));
    const source = join(root, "openclaw-export.json");
    await writeFile(source, JSON.stringify({
      items: [{
        id: "remote-auth-expired-1",
        summary: "OpenClaw detected Claude auth expired.",
        signature: "openclaw:claude-auth-expired",
      }],
    }));

    await fetchOpenClawRemoteMemory(root, {
      provider: "exported-json",
      sources: [source],
      now: "2026-05-20T00:00:00.000Z",
      runtimeMode: "source",
    });

    const report = await ingestAgentMemory(root, {
      agent: "openclaw",
      sources: [join(root, ".praxisbase/staging/openclaw")],
      mode: "write",
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(report.imported, 1);
    await assert.doesNotReject(stat(join(root, ".praxisbase/raw-vault/refs")));
    await assert.doesNotReject(stat(join(root, ".praxisbase/outbox/captures")));
  });
});
```

- [ ] **Step 2: Run compatibility test to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/openclaw-remote-memory.test.js
```

Expected: staged envelope format is not yet recognized by M12 ingest.

- [ ] **Step 3: Teach ingest to read staged remote envelopes**

Implementation rules:

- Detect `type === "openclaw_remote_memory"`.
- Use envelope `redacted_summary`, `signature`, `source_ref`, and `source_hash`.
- Do not read or expect raw body.
- Preserve provider and remote id in capture metadata where compatible.
- Deduplicate by envelope `source_hash`.

- [ ] **Step 4: Run compatibility test**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/openclaw-remote-memory.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit compatibility**

```bash
git add packages/core/src/experience/agent-memory.ts packages/core/src/experience/openclaw-remote.ts tests/core/openclaw-remote-memory.test.ts
git commit -m "feat: ingest staged openclaw remote memory"
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

- [ ] **Step 3: Manual source checkout smoke**

```bash
pnpm build
tmpdir=$(mktemp -d)
cat > "$tmpdir/openclaw-export.json" <<'JSON'
{
  "items": [
    {
      "id": "remote-auth-expired-1",
      "summary": "OpenClaw detected Claude auth expired and asked the user to login again.",
      "signature": "openclaw:claude-auth-expired"
    }
  ]
}
JSON
node packages/cli/dist/index.js memory fetch --agent openclaw --provider exported-json --source "$tmpdir/openclaw-export.json" --json
node packages/cli/dist/index.js memory ingest --agent openclaw --source .praxisbase/staging/openclaw --write --json
node packages/cli/dist/index.js smoke real-wiki --agent openclaw --source .praxisbase/staging/openclaw --query "openclaw auth expired" --json
```

Expected:

- JSON reports have `changed_stable_knowledge: false`,
- `.praxisbase/staging/openclaw/` exists and is ignored by Git,
- `.praxisbase/raw-vault/refs/` and `.praxisbase/outbox/captures/` exist after ingest,
- raw remote logs and auth credentials are absent from written JSON,
- `kb/` and `skills/` are not modified by fetch or ingest.

- [ ] **Step 4: Commit final fixes**

```bash
git status --short
git add <changed-files>
git commit -m "test: verify openclaw remote memory cli"
```

Only commit if there are additional fixes after Task 5.
