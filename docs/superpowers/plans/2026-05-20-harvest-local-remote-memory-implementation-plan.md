# Harvest Local And Remote Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `praxisbase harvest` and `praxisbase remote` so local and remote agent experience extraction can be run through one safe high-level workflow.

**Architecture:** Keep CLI wrappers thin. Add core modules for remote source config, remote transport adapters, harvest orchestration, and team Git guardrails. Reuse M12 `scanAgentMemory`/`ingestAgentMemory` and M12.1 `fetchOpenClawRemoteMemory` rather than shelling out to the CLI internally.

**Tech Stack:** TypeScript ESM, Node built-ins, Commander CLI, existing protocol schemas, existing file-store helpers, existing memory/wiki core functions, Node test runner, Git CLI through injected command runner for testability.

---

## Document Traceability

- OpenSpec: `docs/openspec/changes/harvest-local-remote-memory/`
- Design: `docs/superpowers/specs/2026-05-20-harvest-local-remote-memory-design.md`
- BDD: `docs/bdd/harvest-local-remote-memory.feature`

## File Structure

- Modify `packages/core/src/protocol/paths.ts`
  - Add remotes, harvest reports/runs, remote staging, and remote cache paths.
- Modify `packages/core/src/protocol/schemas.ts`
  - Add `RemoteSourceConfigSchema`, `HarvestReportSchema`, and inferred types.
- Create `packages/core/src/experience/remote-sources.ts`
  - Add/list/read/remove remote source configs; validate no secrets are stored.
- Create `packages/core/src/experience/remote-adapters.ts`
  - Resolve `file`, `git`, `ssh`, `http`, and `openclaw-api` remotes into local export files or staged fetch reports.
- Create `packages/core/src/experience/harvest.ts`
  - `runHarvest(root, input)` orchestrates local scan/ingest, remote fetch, wiki compile, graph, site, context, optional review/promote, and optional Git actions.
- Create `packages/core/src/experience/git-workflow.ts`
  - Branch checks, branch creation, commit, and push helpers with injected command runner.
- Modify `packages/core/src/index.ts`
  - Export new modules.
- Modify `packages/core/package.json`
  - Export new module entrypoints if subpath imports are needed in tests.
- Create `packages/cli/src/commands/remote.ts`
  - Thin wrapper for remote add/list/remove/doctor.
- Create `packages/cli/src/commands/harvest.ts`
  - Thin wrapper for `runHarvest`.
- Modify `packages/cli/src/index.ts`
  - Wire `remote` and `harvest`.
- Modify `packages/cli/package.json`
  - Export command modules.
- Modify `packages/cli/src/commands/init.ts`
  - Create new directories.
- Create `tests/core/harvest-protocol.test.ts`
- Create `tests/core/remote-sources.test.ts`
- Create `tests/core/remote-adapters.test.ts`
- Create `tests/core/harvest.test.ts`
- Create `tests/core/harvest-git.test.ts`
- Create `tests/cli/remote-command.test.ts`
- Create `tests/cli/harvest-command.test.ts`

## Task 1: Protocol Paths And Schemas

**Files:**
- Modify: `packages/core/src/protocol/paths.ts`
- Modify: `packages/core/src/protocol/schemas.ts`
- Modify: `packages/core/src/index.ts`
- Test: `tests/core/harvest-protocol.test.ts`

- [ ] **Step 1: Write failing protocol test**

Create `tests/core/harvest-protocol.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HarvestReportSchema,
  RemoteSourceConfigSchema,
  protocolPaths,
} from "@praxisbase/core";

describe("harvest protocol", () => {
  it("exposes harvest paths and validates schemas", () => {
    assert.equal(protocolPaths.remotes, ".praxisbase/remotes");
    assert.equal(protocolPaths.reportsHarvest, ".praxisbase/reports/harvest");
    assert.equal(protocolPaths.runsHarvest, ".praxisbase/runs/harvest");
    assert.equal(protocolPaths.stagingRemoteImports, ".praxisbase/staging/remote-imports");
    assert.equal(protocolPaths.cacheRemotes, ".praxisbase/cache/remotes");

    const remote = RemoteSourceConfigSchema.parse({
      id: "remote_openclaw-prod",
      protocol_version: "0.1",
      type: "remote_source_config",
      name: "openclaw-prod",
      source_type: "git",
      agent: "openclaw",
      repo: "git@example.com:org/openclaw-export-private.git",
      path: "exports/openclaw-prod/latest.json",
      created_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(remote.source_type, "git");

    const report = HarvestReportSchema.parse({
      id: "harvest_openclaw-prod",
      protocol_version: "0.1",
      type: "harvest_report",
      authority_mode: "team-git",
      mode: "write",
      sources: [{
        name: "openclaw-prod",
        agent: "openclaw",
        source_type: "git",
        status: "completed",
        scanned: 0,
        fetched: 1,
        imported: 1,
        duplicates: 0,
        skipped: 0,
        unsafe: 0,
        warnings: [],
      }],
      proposal_candidates: 1,
      graph_nodes: 0,
      graph_broken_links: 0,
      site_pages: 1,
      context_items: 0,
      git: { branch: "harvest/openclaw-prod", committed: true, pushed: false },
      outputs: ["dist/index.html"],
      warnings: [],
      changed_stable_knowledge: false,
      created_at: "2026-05-20T00:00:00.000Z",
    });
    assert.equal(report.changed_stable_knowledge, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/harvest-protocol.test.js
```

Expected: TypeScript fails because schemas and paths do not exist.

- [ ] **Step 3: Add paths**

Add to `packages/core/src/protocol/paths.ts`:

```ts
remotes: ".praxisbase/remotes",
reportsHarvest: ".praxisbase/reports/harvest",
runsHarvest: ".praxisbase/runs/harvest",
stagingRemoteImports: ".praxisbase/staging/remote-imports",
cacheRemotes: ".praxisbase/cache/remotes",
```

- [ ] **Step 4: Add schemas**

Add to `packages/core/src/protocol/schemas.ts` near existing experience schemas:

```ts
export const RemoteSourceTypeSchema = z.enum(["file", "git", "ssh", "http", "openclaw-api"]);
export const HarvestAuthorityModeSchema = z.enum(["personal-local", "team-git"]);

export const RemoteSourceConfigSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("remote_source_config"),
  name: z.string().min(1),
  source_type: RemoteSourceTypeSchema,
  agent: z.literal("openclaw"),
  repo: z.string().optional(),
  ref: z.string().optional(),
  path: z.string().optional(),
  host: z.string().optional(),
  url: z.string().optional(),
  remote: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const HarvestReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("harvest_report"),
  authority_mode: HarvestAuthorityModeSchema,
  mode: z.enum(["dry-run", "write"]),
  sources: z.array(z.object({
    name: z.string().min(1),
    agent: z.enum(["codex", "openclaw"]),
    source_type: z.enum(["local", "file", "git", "ssh", "http", "openclaw-api"]),
    status: z.enum(["completed", "partial", "failed"]),
    scanned: z.number().int().nonnegative(),
    fetched: z.number().int().nonnegative(),
    imported: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    unsafe: z.number().int().nonnegative(),
    warnings: z.array(z.string()).default([]),
  })),
  proposal_candidates: z.number().int().nonnegative(),
  graph_nodes: z.number().int().nonnegative(),
  graph_broken_links: z.number().int().nonnegative(),
  site_pages: z.number().int().nonnegative(),
  context_items: z.number().int().nonnegative(),
  git: z.object({
    branch: z.string().optional(),
    committed: z.boolean(),
    pushed: z.boolean(),
    commit_sha: z.string().optional(),
    pr_url: z.string().optional(),
  }).optional(),
  outputs: z.array(z.string()),
  warnings: z.array(z.string()).default([]),
  changed_stable_knowledge: z.boolean(),
  created_at: z.string(),
});

export type RemoteSourceType = z.infer<typeof RemoteSourceTypeSchema>;
export type RemoteSourceConfig = z.infer<typeof RemoteSourceConfigSchema>;
export type HarvestReport = z.infer<typeof HarvestReportSchema>;
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/harvest-protocol.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit protocol**

```bash
git add packages/core/src/protocol/paths.ts packages/core/src/protocol/schemas.ts packages/core/src/index.ts tests/core/harvest-protocol.test.ts
git commit -m "feat: add harvest protocol schemas"
```

## Task 2: Remote Source Registry

**Files:**
- Create: `packages/core/src/experience/remote-sources.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Test: `tests/core/remote-sources.test.ts`

- [ ] **Step 1: Write failing remote registry tests**

Create `tests/core/remote-sources.test.ts`:

```ts
import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addRemoteSource,
  listRemoteSources,
  readRemoteSource,
  removeRemoteSource,
} from "@praxisbase/core/experience/remote-sources.js";

describe("remote source registry", () => {
  it("adds, lists, reads, and removes remote source configs", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-remote-registry-"));
    const created = await addRemoteSource(root, {
      name: "openclaw-prod",
      sourceType: "git",
      agent: "openclaw",
      repo: "git@example.com:org/openclaw-export-private.git",
      path: "exports/prod/latest.json",
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(created.name, "openclaw-prod");
    assert.equal(created.source_type, "git");

    const listed = await listRemoteSources(root);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, "openclaw-prod");

    const read = await readRemoteSource(root, "openclaw-prod");
    assert.equal(read.repo, "git@example.com:org/openclaw-export-private.git");

    await removeRemoteSource(root, "openclaw-prod");
    assert.deepEqual(await listRemoteSources(root), []);
    await assert.rejects(() => stat(join(root, ".praxisbase/remotes/remote_openclaw-prod.json")), { code: "ENOENT" });
  });

  it("rejects credentials in persisted remote config", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-remote-secret-"));
    await assert.rejects(
      () => addRemoteSource(root, {
        name: "bad-http",
        sourceType: "http",
        agent: "openclaw",
        url: "https://token:secret@example.com/export.json",
        now: "2026-05-20T00:00:00.000Z",
      }),
      /REMOTE_CONFIG_SECRET_REJECTED/
    );
    await assert.rejects(() => readdir(join(root, ".praxisbase/remotes")), { code: "ENOENT" });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/remote-sources.test.js
```

Expected: TypeScript fails because remote source functions do not exist.

- [ ] **Step 3: Implement remote source registry**

Create `packages/core/src/experience/remote-sources.ts`:

```ts
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import {
  RemoteSourceConfigSchema,
  type RemoteSourceConfig,
  type RemoteSourceType,
} from "../protocol/schemas.js";
import { readJson, safePath, writeJson } from "../store/file-store.js";

export interface AddRemoteSourceInput {
  name: string;
  sourceType: RemoteSourceType;
  agent: "openclaw";
  repo?: string;
  ref?: string;
  path?: string;
  host?: string;
  url?: string;
  remote?: string;
  now?: string;
}

function assertNoConfigSecret(input: AddRemoteSourceInput): void {
  const values = [input.repo, input.ref, input.path, input.host, input.url, input.remote].filter(Boolean);
  const joined = values.join(" ");
  if (/(token|secret|password|authorization|bearer|cookie)=/i.test(joined) || /https?:\/\/[^/\s]+:[^@\s]+@/i.test(joined)) {
    throw new Error("REMOTE_CONFIG_SECRET_REJECTED: remote configs must not store credentials.");
  }
}

function remotePath(name: string): string {
  return `${protocolPaths.remotes}/${makeId("remote", name)}.json`;
}

export async function addRemoteSource(root: string, input: AddRemoteSourceInput): Promise<RemoteSourceConfig> {
  assertNoConfigSecret(input);
  const now = input.now ?? new Date().toISOString();
  const config = RemoteSourceConfigSchema.parse({
    id: makeId("remote", input.name),
    protocol_version: PROTOCOL_VERSION,
    type: "remote_source_config",
    name: input.name,
    source_type: input.sourceType,
    agent: input.agent,
    repo: input.repo,
    ref: input.ref,
    path: input.path,
    host: input.host,
    url: input.url,
    remote: input.remote,
    created_at: now,
    updated_at: now,
  });
  await writeJson(root, remotePath(input.name), config);
  return config;
}

export async function readRemoteSource(root: string, name: string): Promise<RemoteSourceConfig> {
  return RemoteSourceConfigSchema.parse(await readJson(root, remotePath(name)));
}

export async function listRemoteSources(root: string): Promise<RemoteSourceConfig[]> {
  let files: string[];
  try {
    files = await readdir(safePath(root, protocolPaths.remotes));
  } catch {
    return [];
  }
  const configs: RemoteSourceConfig[] = [];
  for (const file of files.sort()) {
    if (!file.endsWith(".json")) continue;
    configs.push(RemoteSourceConfigSchema.parse(await readJson(root, `${protocolPaths.remotes}/${file}`)));
  }
  return configs;
}

export async function removeRemoteSource(root: string, name: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(safePath(root, remotePath(name)), { force: true });
}
```

- [ ] **Step 4: Export module**

Add to `packages/core/src/index.ts`:

```ts
export * from "./experience/remote-sources.js";
```

Add subpath export to `packages/core/package.json` if tests import it directly:

```json
"./experience/remote-sources.js": {
  "types": "./src/experience/remote-sources.ts",
  "default": "./dist/experience/remote-sources.js"
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/remote-sources.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit registry**

```bash
git add packages/core/src/experience/remote-sources.ts packages/core/src/index.ts packages/core/package.json tests/core/remote-sources.test.ts
git commit -m "feat: add remote source registry"
```

## Task 3: Remote Transport Adapters

**Files:**
- Create: `packages/core/src/experience/remote-adapters.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Test: `tests/core/remote-adapters.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Create `tests/core/remote-adapters.test.ts`:

```ts
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addRemoteSource } from "@praxisbase/core/experience/remote-sources.js";
import { resolveRemoteSource } from "@praxisbase/core/experience/remote-adapters.js";

describe("remote transport adapters", () => {
  it("resolves file remotes to local export paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-remote-file-"));
    const exportPath = join(root, "openclaw-export.json");
    await writeFile(exportPath, JSON.stringify({ items: [{ id: "one", summary: "Safe summary" }] }));
    const config = await addRemoteSource(root, {
      name: "file-prod",
      sourceType: "file",
      agent: "openclaw",
      path: exportPath,
      now: "2026-05-20T00:00:00.000Z",
    });

    const resolved = await resolveRemoteSource(root, config);
    assert.equal(resolved.kind, "exported-json");
    assert.equal(resolved.sources[0], exportPath);
  });

  it("downloads http remotes into ignored remote-import staging", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-remote-http-"));
    const server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ items: [{ id: "http-1", summary: "HTTP export summary" }] }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");

    try {
      const config = await addRemoteSource(root, {
        name: "http-prod",
        sourceType: "http",
        agent: "openclaw",
        url: `http://127.0.0.1:${address.port}/export.json`,
        now: "2026-05-20T00:00:00.000Z",
      });
      const resolved = await resolveRemoteSource(root, config);
      assert.equal(resolved.kind, "exported-json");
      assert.match(resolved.sources[0], /\.praxisbase\/staging\/remote-imports\/http-prod\.json$/);
      const raw = await readFile(join(root, resolved.sources[0]), "utf8");
      assert.ok(raw.includes("HTTP export summary"));
    } finally {
      server.close();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/remote-adapters.test.js
```

Expected: TypeScript fails because `resolveRemoteSource` does not exist.

- [ ] **Step 3: Implement file/http/openclaw-api adapter baseline**

Create `packages/core/src/experience/remote-adapters.ts`:

```ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { protocolPaths } from "../protocol/paths.js";
import type { RemoteSourceConfig } from "../protocol/schemas.js";
import { safePath } from "../store/file-store.js";

export type ResolvedRemoteSource =
  | { kind: "exported-json"; name: string; sources: string[] }
  | { kind: "openclaw-api"; name: string; remote: string };

export interface ResolveRemoteSourceOptions {
  fetchImpl?: typeof fetch;
}

export async function resolveRemoteSource(
  root: string,
  config: RemoteSourceConfig,
  options: ResolveRemoteSourceOptions = {}
): Promise<ResolvedRemoteSource> {
  if (config.source_type === "file") {
    if (!config.path) throw new Error("REMOTE_CONFIG_INVALID: file remote requires path.");
    return { kind: "exported-json", name: config.name, sources: [config.path] };
  }

  if (config.source_type === "http") {
    if (!config.url) throw new Error("REMOTE_CONFIG_INVALID: http remote requires url.");
    const response = await (options.fetchImpl ?? fetch)(config.url);
    if (!response.ok) throw new Error(`REMOTE_HTTP_FAILED: ${response.status} ${response.statusText}`);
    const body = await response.text();
    const relativePath = `${protocolPaths.stagingRemoteImports}/${config.name}.json`;
    await writeFile(safePath(root, relativePath), body);
    return { kind: "exported-json", name: config.name, sources: [relativePath] };
  }

  if (config.source_type === "openclaw-api") {
    if (!config.remote) throw new Error("REMOTE_CONFIG_INVALID: openclaw-api remote requires remote.");
    return { kind: "openclaw-api", name: config.name, remote: config.remote };
  }

  throw new Error(`REMOTE_ADAPTER_UNIMPLEMENTED: ${config.source_type}`);
}
```

- [ ] **Step 4: Add git and ssh tests before implementing those adapters**

Extend `tests/core/remote-adapters.test.ts` with:

```ts
it("resolves ssh remotes through an injected command runner", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-remote-ssh-"));
  const config = await addRemoteSource(root, {
    name: "ssh-prod",
    sourceType: "ssh",
    agent: "openclaw",
    host: "user@example.com",
    path: "~/.openclaw/exports/latest.json",
    now: "2026-05-20T00:00:00.000Z",
  });
  const resolved = await resolveRemoteSource(root, config, {
    runCommand: async () => JSON.stringify({ items: [{ id: "ssh-1", summary: "SSH export summary" }] }),
  });
  assert.equal(resolved.kind, "exported-json");
  const raw = await readFile(join(root, resolved.sources[0]), "utf8");
  assert.ok(raw.includes("SSH export summary"));
});
```

Expected: TypeScript fails because `runCommand` is not supported.

- [ ] **Step 5: Implement ssh adapter**

Add to `ResolveRemoteSourceOptions`:

```ts
runCommand?: (command: string, args: string[]) => Promise<string>;
```

Add `ssh` case:

```ts
if (config.source_type === "ssh") {
  if (!config.host || !config.path) throw new Error("REMOTE_CONFIG_INVALID: ssh remote requires host and path.");
  const runCommand = options.runCommand;
  if (!runCommand) throw new Error("REMOTE_SSH_RUNNER_REQUIRED");
  const body = await runCommand("ssh", [config.host, "cat", config.path]);
  const relativePath = `${protocolPaths.stagingRemoteImports}/${config.name}.json`;
  await writeFile(safePath(root, relativePath), body);
  return { kind: "exported-json", name: config.name, sources: [relativePath] };
}
```

- [ ] **Step 6: Add git adapter test with injected runner**

Add a test that verifies command shape without network:

```ts
it("resolves git remotes through an injected command runner", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-remote-git-"));
  const config = await addRemoteSource(root, {
    name: "git-prod",
    sourceType: "git",
    agent: "openclaw",
    repo: "git@example.com:org/export.git",
    path: "exports/latest.json",
    now: "2026-05-20T00:00:00.000Z",
  });
  const cachePath = join(root, ".praxisbase/cache/remotes/git-prod");
  await mkdir(join(cachePath, "exports"), { recursive: true });
  await writeFile(join(cachePath, "exports/latest.json"), JSON.stringify({ items: [{ id: "git-1", summary: "Git export summary" }] }));
  const commands: string[] = [];
  const resolved = await resolveRemoteSource(root, config, {
    runCommand: async (command, args) => {
      commands.push([command, ...args].join(" "));
      return "";
    },
  });
  assert.equal(resolved.kind, "exported-json");
  assert.ok(commands.some((cmd) => cmd.includes("git")));
  const raw = await readFile(join(root, resolved.sources[0]), "utf8");
  assert.ok(raw.includes("Git export summary"));
});
```

- [ ] **Step 7: Implement git adapter**

Add `git` case:

```ts
if (config.source_type === "git") {
  if (!config.repo || !config.path) throw new Error("REMOTE_CONFIG_INVALID: git remote requires repo and path.");
  const runCommand = options.runCommand;
  if (!runCommand) throw new Error("REMOTE_GIT_RUNNER_REQUIRED");
  const cacheRelative = `${protocolPaths.cacheRemotes}/${config.name}`;
  const cacheAbsolute = safePath(root, cacheRelative);
  await runCommand("git", ["clone", "--depth", "1", config.repo, cacheAbsolute]).catch(async () => {
    await runCommand("git", ["-C", cacheAbsolute, "pull", "--ff-only"]);
  });
  if (config.ref) {
    await runCommand("git", ["-C", cacheAbsolute, "checkout", config.ref]);
  }
  return { kind: "exported-json", name: config.name, sources: [`${cacheRelative}/${config.path}`] };
}
```

- [ ] **Step 8: Export module and run tests**

Add exports like Task 2, then run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/remote-adapters.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit adapters**

```bash
git add packages/core/src/experience/remote-adapters.ts packages/core/src/index.ts packages/core/package.json tests/core/remote-adapters.test.ts
git commit -m "feat: resolve remote memory sources"
```

## Task 4: Harvest Orchestrator

**Files:**
- Create: `packages/core/src/experience/harvest.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Test: `tests/core/harvest.test.ts`

- [ ] **Step 1: Write failing harvest test for OpenClaw export**

Create `tests/core/harvest.test.ts`:

```ts
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runHarvest } from "@praxisbase/core/experience/harvest.js";

describe("runHarvest", () => {
  it("harvests an OpenClaw export without changing stable knowledge", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-export-"));
    const exportPath = join(root, "openclaw-export.json");
    await writeFile(exportPath, JSON.stringify({
      items: [{
        id: "remote-auth-expired-1",
        summary: "OpenClaw detected Claude auth expired and asked the user to login again.",
        signature: "openclaw:claude-auth-expired",
        raw_log: "RAW LOG MUST NOT BE WRITTEN",
      }],
    }));

    const report = await runHarvest(root, {
      openclawExports: [exportPath],
      buildSite: true,
      json: true,
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(report.authority_mode, "personal-local");
    assert.equal(report.sources[0].imported, 1);
    assert.equal(report.changed_stable_knowledge, false);
    await assert.doesNotReject(() => stat(join(root, "dist/index.html")));
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
    const rawReport = await readFile(join(root, ".praxisbase/reports/harvest", `${report.id}.json`), "utf8");
    assert.equal(rawReport.includes("RAW LOG MUST NOT BE WRITTEN"), false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/harvest.test.js
```

Expected: TypeScript fails because `runHarvest` does not exist.

- [ ] **Step 3: Implement minimal harvest orchestrator**

Create `packages/core/src/experience/harvest.ts` with:

```ts
import { makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { HarvestReportSchema, type HarvestReport } from "../protocol/schemas.js";
import { writeJson } from "../store/file-store.js";
import { fetchOpenClawRemoteMemory } from "./openclaw-remote.js";
import { ingestAgentMemory } from "./agent-memory.js";
import { compileWiki } from "../wiki/compile.js";
import { buildWikiGraph } from "../wiki/resolver.js";
import { collectWikiPages } from "../wiki/render-site.js";
import { buildWikiSite } from "../wiki/render-site.js";
import { buildContext } from "./context.js";

export interface RunHarvestInput {
  codexSources?: string[];
  openclawSources?: string[];
  openclawExports?: string[];
  remoteNames?: string[];
  limit?: number;
  buildSite?: boolean;
  contextQuery?: string;
  team?: boolean;
  dryRun?: boolean;
  autoReview?: boolean;
  autoPromote?: boolean;
  json?: boolean;
  now?: string;
}

export async function runHarvest(root: string, input: RunHarvestInput): Promise<HarvestReport> {
  if (input.autoPromote && !input.autoReview) {
    throw new Error("HARVEST_AUTO_REVIEW_REQUIRED: --auto-promote requires --auto-review.");
  }

  const now = input.now ?? new Date().toISOString();
  const sources: HarvestReport["sources"] = [];
  const outputs: string[] = [];

  for (const source of input.openclawExports ?? []) {
    const fetchReport = await fetchOpenClawRemoteMemory(root, {
      provider: "exported-json",
      sources: [source],
      limit: input.limit,
      now,
    });
    const ingestReport = await ingestAgentMemory(root, {
      agent: "openclaw",
      sources: [protocolPaths.stagingOpenClaw],
      limit: input.limit,
      mode: input.dryRun ? "dry-run" : "write",
      now,
    });
    outputs.push(...fetchReport.outputs, ...ingestReport.outputs);
    sources.push({
      name: source,
      agent: "openclaw",
      source_type: "file",
      status: fetchReport.warnings.length > 0 ? "partial" : "completed",
      scanned: ingestReport.scanned,
      fetched: fetchReport.fetched,
      imported: ingestReport.imported,
      duplicates: fetchReport.duplicates + ingestReport.duplicates,
      skipped: fetchReport.skipped + ingestReport.skipped,
      unsafe: fetchReport.unsafe + ingestReport.unsafe,
      warnings: [...fetchReport.warnings, ...ingestReport.warnings],
    });
  }

  const compileReport = await compileWiki(root, { mode: "review", now });
  const pages = await collectWikiPages(root);
  const graph = buildWikiGraph(pages);
  const site = input.buildSite ? await buildWikiSite(root) : { pages: 0, outputs: [] };
  const context = input.contextQuery ? await buildContext({
    root,
    workspace: root,
    agent: "codex",
    stage: "repair",
    query: input.contextQuery,
  }) : { items: [] };

  outputs.push(`${protocolPaths.reportsWikiCompile}/${compileReport.id}.json`, ...site.outputs);

  const reportId = makeId("harvest", now.replace(/[^a-z0-9]/gi, "-"));
  const report = HarvestReportSchema.parse({
    id: reportId,
    protocol_version: PROTOCOL_VERSION,
    type: "harvest_report",
    authority_mode: input.team ? "team-git" : "personal-local",
    mode: input.dryRun ? "dry-run" : "write",
    sources,
    proposal_candidates: compileReport.candidate_ids.length,
    graph_nodes: graph.nodes.length,
    graph_broken_links: graph.broken_links.length,
    site_pages: site.pages,
    context_items: context.items.length,
    outputs,
    warnings: sources.flatMap((source) => source.warnings),
    changed_stable_knowledge: false,
    created_at: now,
  });

  await writeJson(root, `${protocolPaths.reportsHarvest}/${report.id}.json`, report);
  await writeJson(root, `${protocolPaths.runsHarvest}/${report.id}.json`, {
    id: report.id,
    protocol_version: PROTOCOL_VERSION,
    command: "harvest",
    status: report.warnings.length > 0 ? "partial" : "completed",
    started_at: now,
    finished_at: now,
    counts: {
      sources: sources.length,
      imported: sources.reduce((sum, source) => sum + source.imported, 0),
      unsafe: sources.reduce((sum, source) => sum + source.unsafe, 0),
    },
    errors: [],
  });

  return report;
}
```

- [ ] **Step 4: Run test**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/harvest.test.js
```

Expected: PASS.

- [ ] **Step 5: Add local source test**

Extend `tests/core/harvest.test.ts` with a Codex source test:

```ts
it("harvests local Codex sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-codex-"));
  const source = join(root, "session.txt");
  await writeFile(source, "Implemented wiki compile workflow. pnpm check passed.");
  const report = await runHarvest(root, {
    codexSources: [source],
    buildSite: true,
    now: "2026-05-20T00:00:00.000Z",
  });
  assert.equal(report.sources[0].agent, "codex");
  assert.equal(report.sources[0].imported, 1);
});
```

- [ ] **Step 6: Implement local source handling**

In `runHarvest`, add loops for `codexSources` and `openclawSources` that call `ingestAgentMemory` directly with `agent: "codex"` or `agent: "openclaw"` and push matching source summaries into `report.sources`.

- [ ] **Step 7: Run harvest tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/harvest.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit orchestrator**

```bash
git add packages/core/src/experience/harvest.ts packages/core/src/index.ts packages/core/package.json tests/core/harvest.test.ts
git commit -m "feat: orchestrate memory harvest"
```

## Task 5: Team Git Guardrails

**Files:**
- Create: `packages/core/src/experience/git-workflow.ts`
- Modify: `packages/core/src/experience/harvest.ts`
- Test: `tests/core/harvest-git.test.ts`

- [ ] **Step 1: Write failing team Git tests**

Create `tests/core/harvest-git.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planTeamGitAction } from "@praxisbase/core/experience/git-workflow.js";

describe("team git workflow", () => {
  it("requires branch when committing on protected branch", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-git-"));
    await assert.rejects(
      () => planTeamGitAction(root, {
        team: true,
        commit: true,
        currentBranch: "main",
      }),
      /HARVEST_BRANCH_REQUIRED/
    );
  });

  it("requires commit before push", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-git-"));
    await assert.rejects(
      () => planTeamGitAction(root, {
        team: true,
        push: true,
        currentBranch: "harvest/test",
      }),
      /HARVEST_COMMIT_REQUIRED/
    );
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/harvest-git.test.js
```

Expected: TypeScript fails because `planTeamGitAction` does not exist.

- [ ] **Step 3: Implement guardrail planner**

Create `packages/core/src/experience/git-workflow.ts`:

```ts
export interface TeamGitActionInput {
  team?: boolean;
  branch?: string;
  commit?: boolean;
  push?: boolean;
  pr?: boolean;
  currentBranch?: string;
  message?: string;
}

export interface TeamGitActionPlan {
  authorityMode: "personal-local" | "team-git";
  branch?: string;
  shouldCommit: boolean;
  shouldPush: boolean;
  shouldCreatePr: boolean;
  message: string;
  warnings: string[];
}

const PROTECTED_BRANCHES = new Set(["main", "master", "trunk"]);

export async function planTeamGitAction(_root: string, input: TeamGitActionInput): Promise<TeamGitActionPlan> {
  if (input.push && !input.commit) {
    throw new Error("HARVEST_COMMIT_REQUIRED: --push requires --commit.");
  }
  if (input.pr && !input.push) {
    throw new Error("HARVEST_PUSH_REQUIRED: --pr requires --push.");
  }
  const currentBranch = input.currentBranch ?? "unknown";
  if (input.team && input.commit && PROTECTED_BRANCHES.has(currentBranch) && !input.branch) {
    throw new Error("HARVEST_BRANCH_REQUIRED: --team --commit on a protected branch requires --branch.");
  }
  return {
    authorityMode: input.team ? "team-git" : "personal-local",
    branch: input.branch,
    shouldCommit: input.commit ?? false,
    shouldPush: input.push ?? false,
    shouldCreatePr: input.pr ?? false,
    message: input.message ?? "chore: harvest memory",
    warnings: input.pr ? ["pr_creation_not_implemented"] : [],
  };
}
```

- [ ] **Step 4: Export and run tests**

Export module, then run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/harvest-git.test.js
```

Expected: PASS.

- [ ] **Step 5: Integrate planner into harvest**

Add `branch`, `commit`, `push`, `pr`, and `currentBranchForTests` fields to `RunHarvestInput`. Call `planTeamGitAction` before writing the report. Populate `report.git` from the plan. Do not implement actual commit/push until the next test step.

- [ ] **Step 6: Write failing Git execution tests**

Extend `tests/core/harvest-git.test.ts`:

```ts
import { executeTeamGitAction } from "@praxisbase/core/experience/git-workflow.js";

it("executes branch checkout, commit, and push through an injected runner", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-harvest-git-exec-"));
  const calls: string[] = [];
  const result = await executeTeamGitAction(root, {
    authorityMode: "team-git",
    branch: "harvest/openclaw-prod",
    shouldCommit: true,
    shouldPush: true,
    shouldCreatePr: false,
    message: "chore: harvest openclaw-prod",
    warnings: [],
  }, async (command, args) => {
    calls.push([command, ...args].join(" "));
    if (args.includes("rev-parse")) return "abc123\n";
    return "";
  });

  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
  assert.equal(result.commit_sha, "abc123");
  assert.ok(calls.some((call) => call === "git checkout -B harvest/openclaw-prod"));
  assert.ok(calls.some((call) => call === "git add ."));
  assert.ok(calls.some((call) => call === "git commit -m chore: harvest openclaw-prod"));
  assert.ok(calls.some((call) => call === "git push -u origin harvest/openclaw-prod"));
});
```

Expected: TypeScript fails because `executeTeamGitAction` does not exist.

- [ ] **Step 7: Implement Git execution**

Add to `packages/core/src/experience/git-workflow.ts`:

```ts
export type GitCommandRunner = (command: string, args: string[]) => Promise<string>;

export interface ExecutedTeamGitAction {
  branch?: string;
  committed: boolean;
  pushed: boolean;
  commit_sha?: string;
  pr_url?: string;
}

export async function executeTeamGitAction(
  root: string,
  plan: TeamGitActionPlan,
  runCommand: GitCommandRunner
): Promise<ExecutedTeamGitAction> {
  if (plan.authorityMode !== "team-git") {
    return { branch: plan.branch, committed: false, pushed: false };
  }
  if (plan.branch) {
    await runCommand("git", ["checkout", "-B", plan.branch]);
  }
  let commitSha: string | undefined;
  if (plan.shouldCommit) {
    await runCommand("git", ["add", "."]);
    await runCommand("git", ["commit", "-m", plan.message]);
    commitSha = (await runCommand("git", ["rev-parse", "HEAD"])).trim();
  }
  if (plan.shouldPush) {
    if (!plan.branch) throw new Error("HARVEST_BRANCH_REQUIRED: --push requires a branch.");
    await runCommand("git", ["push", "-u", "origin", plan.branch]);
  }
  return {
    branch: plan.branch,
    committed: plan.shouldCommit,
    pushed: plan.shouldPush,
    commit_sha: commitSha,
  };
}
```

- [ ] **Step 8: Integrate Git execution into harvest**

Add `runGitCommandForTests?: GitCommandRunner` to `RunHarvestInput`. After writing harvest report/run records, if the plan says commit or push, call:

```ts
const gitResult = await executeTeamGitAction(root, gitPlan, input.runGitCommandForTests ?? defaultGitRunner);
```

`defaultGitRunner` should execute `git` with `child_process.execFile` in `root` as cwd. Update the saved harvest report after Git execution so `report.git.commit_sha` is present.

- [ ] **Step 9: Run Git tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/harvest-git.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit guardrails and Git execution**

```bash
git add packages/core/src/experience/git-workflow.ts packages/core/src/experience/harvest.ts tests/core/harvest-git.test.ts
git commit -m "feat: add harvest git guardrails"
```

## Task 6: Remote CLI

**Files:**
- Create: `packages/cli/src/commands/remote.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/package.json`
- Test: `tests/cli/remote-command.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Create `tests/cli/remote-command.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { remoteCommand } from "@praxisbase/cli/commands/remote.js";

describe("remote CLI command", () => {
  it("adds and lists git remote configs", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-remote-"));
    const addOutput = await remoteCommand(root, "add", {
      name: "openclaw-prod",
      type: "git",
      repo: "git@example.com:org/export.git",
      path: "exports/latest.json",
      json: true,
    });
    assert.equal(JSON.parse(addOutput).ok, true);

    const listOutput = await remoteCommand(root, "list", { json: true });
    const parsed = JSON.parse(listOutput);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.remotes.length, 1);
    assert.equal(parsed.remotes[0].name, "openclaw-prod");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/remote-command.test.js
```

Expected: TypeScript fails because command module does not exist.

- [ ] **Step 3: Implement remote CLI wrapper**

Create `packages/cli/src/commands/remote.ts`:

```ts
import {
  addRemoteSource,
  listRemoteSources,
  readRemoteSource,
  removeRemoteSource,
} from "@praxisbase/core/experience/remote-sources.js";
import type { RemoteSourceType } from "@praxisbase/core";

export interface RemoteCommandOptions {
  name?: string;
  type?: RemoteSourceType;
  repo?: string;
  ref?: string;
  path?: string;
  host?: string;
  url?: string;
  remote?: string;
  json?: boolean;
}

export async function remoteCommand(root: string, subcommand: string, options: RemoteCommandOptions): Promise<string> {
  if (subcommand === "add") {
    if (!options.name || !options.type) throw new Error("remote add requires name and --type.");
    const config = await addRemoteSource(root, {
      name: options.name,
      sourceType: options.type,
      agent: "openclaw",
      repo: options.repo,
      ref: options.ref,
      path: options.path,
      host: options.host,
      url: options.url,
      remote: options.remote,
    });
    return options.json ? JSON.stringify({ ok: true, remote: config }, null, 2) : `Remote added: ${config.name}`;
  }
  if (subcommand === "list") {
    const remotes = await listRemoteSources(root);
    return options.json ? JSON.stringify({ ok: true, remotes }, null, 2) : remotes.map((remote) => remote.name).join("\n");
  }
  if (subcommand === "remove") {
    if (!options.name) throw new Error("remote remove requires name.");
    await removeRemoteSource(root, options.name);
    return options.json ? JSON.stringify({ ok: true }, null, 2) : `Remote removed: ${options.name}`;
  }
  if (subcommand === "doctor") {
    if (!options.name) throw new Error("remote doctor requires name.");
    const remote = await readRemoteSource(root, options.name);
    return options.json ? JSON.stringify({ ok: true, remote, checks: [] }, null, 2) : `Remote ok: ${remote.name}`;
  }
  throw new Error(`Unknown subcommand "remote ${subcommand}".`);
}
```

- [ ] **Step 4: Wire CLI**

In `packages/cli/src/index.ts`, import and wire:

```ts
program
  .command("remote")
  .argument("<sub>", "subcommand (add|list|remove|doctor)")
  .argument("[name]")
  .option("--type <type>")
  .option("--repo <repo>")
  .option("--ref <ref>")
  .option("--path <path>")
  .option("--host <host>")
  .option("--url <url>")
  .option("--remote <remote>")
  .option("--json")
  .action(async (sub: string, name: string | undefined, options) => {
    console.log(await remoteCommand(process.cwd(), sub, { ...options, name }));
  });
```

- [ ] **Step 5: Run CLI tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/remote-command.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit remote CLI**

```bash
git add packages/cli/src/commands/remote.ts packages/cli/src/index.ts packages/cli/package.json tests/cli/remote-command.test.ts
git commit -m "feat: add remote source cli"
```

## Task 7: Harvest CLI

**Files:**
- Create: `packages/cli/src/commands/harvest.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/package.json`
- Test: `tests/cli/harvest-command.test.ts`

- [ ] **Step 1: Write failing harvest CLI test**

Create `tests/cli/harvest-command.test.ts`:

```ts
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { harvestCommand } from "@praxisbase/cli/commands/harvest.js";

describe("harvest CLI command", () => {
  it("harvests an OpenClaw export and builds the site", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-harvest-"));
    const exportPath = join(root, "openclaw-export.json");
    await writeFile(exportPath, JSON.stringify({
      items: [{ id: "one", summary: "OpenClaw detected Claude auth expired.", signature: "openclaw:claude-auth-expired" }],
    }));
    const output = await harvestCommand(root, {
      openclawExports: [exportPath],
      buildSite: true,
      json: true,
    });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.changed_stable_knowledge, false);
    await assert.doesNotReject(() => stat(join(root, "dist/index.html")));
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/harvest-command.test.js
```

Expected: TypeScript fails because command module does not exist.

- [ ] **Step 3: Implement harvest CLI wrapper**

Create `packages/cli/src/commands/harvest.ts`:

```ts
import { runHarvest } from "@praxisbase/core/experience/harvest.js";

export interface HarvestCommandOptions {
  all?: boolean;
  codex?: string[];
  openclaw?: string[];
  openclawExports?: string[];
  remote?: string[];
  limit?: number;
  buildSite?: boolean;
  contextQuery?: string;
  team?: boolean;
  branch?: string;
  commit?: boolean;
  push?: boolean;
  pr?: boolean;
  autoReview?: boolean;
  autoPromote?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export async function harvestCommand(root: string, options: HarvestCommandOptions): Promise<string> {
  const report = await runHarvest(root, {
    codexSources: options.codex,
    openclawSources: options.openclaw,
    openclawExports: options.openclawExports,
    remoteNames: options.remote,
    limit: options.limit,
    buildSite: options.buildSite,
    contextQuery: options.contextQuery,
    team: options.team,
    dryRun: options.dryRun,
    autoReview: options.autoReview,
    autoPromote: options.autoPromote,
  });
  return options.json ? JSON.stringify({ ok: true, report }, null, 2) : `Harvest complete: ${report.id}`;
}
```

- [ ] **Step 4: Wire CLI options**

Add repeatable option collector in `packages/cli/src/index.ts` or reuse existing `collectOptionValue`, then wire:

```ts
program
  .command("harvest")
  .option("--all")
  .option("--codex <path>", "Codex source path", collectOptionValue, [])
  .option("--openclaw <path>", "OpenClaw source path", collectOptionValue, [])
  .option("--openclaw-export <path>", "OpenClaw export JSON", collectOptionValue, [])
  .option("--remote <name>", "registered remote source", collectOptionValue, [])
  .option("--limit <n>")
  .option("--build-site")
  .option("--context-query <query>")
  .option("--team")
  .option("--branch <name>")
  .option("--commit")
  .option("--push")
  .option("--pr")
  .option("--auto-review")
  .option("--auto-promote")
  .option("--dry-run")
  .option("--json")
  .action(async (options) => {
    console.log(await harvestCommand(process.cwd(), {
      ...options,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      openclawExports: options.openclawExport,
    }));
  });
```

- [ ] **Step 5: Run harvest CLI tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/harvest-command.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit harvest CLI**

```bash
git add packages/cli/src/commands/harvest.ts packages/cli/src/index.ts packages/cli/package.json tests/cli/harvest-command.test.ts
git commit -m "feat: add harvest cli"
```

## Task 8: Init, Safety, And Full Verification

**Files:**
- Modify: `packages/cli/src/commands/init.ts`
- Modify: `.gitignore` if needed
- Test: existing init and new safety tests

- [ ] **Step 1: Extend init tests**

Modify `tests/cli/init.test.ts` to assert:

```ts
await assert.doesNotReject(stat(join(root, ".praxisbase/remotes")));
await assert.doesNotReject(stat(join(root, ".praxisbase/reports/harvest")));
await assert.doesNotReject(stat(join(root, ".praxisbase/runs/harvest")));
await assert.doesNotReject(stat(join(root, ".praxisbase/staging/remote-imports")));
await assert.doesNotReject(stat(join(root, ".praxisbase/cache/remotes")));
```

- [ ] **Step 2: Run init test to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/init.test.js
```

Expected: FAIL due to missing directories.

- [ ] **Step 3: Update init directories**

Add new protocol paths to the directory list in `packages/cli/src/commands/init.ts`.

- [ ] **Step 4: Run init and focused harvest tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test \
  dist-tests/tests/cli/init.test.js \
  dist-tests/tests/core/harvest-protocol.test.js \
  dist-tests/tests/core/remote-sources.test.js \
  dist-tests/tests/core/remote-adapters.test.js \
  dist-tests/tests/core/harvest.test.js \
  dist-tests/tests/core/harvest-git.test.js \
  dist-tests/tests/cli/remote-command.test.js \
  dist-tests/tests/cli/harvest-command.test.js
```

Expected: PASS.

- [ ] **Step 5: Manual smoke**

```bash
pnpm build
tmpdir=$(mktemp -d)
cat > "$tmpdir/openclaw-export.json" <<'JSON'
{
  "items": [
    {
      "id": "remote-auth-expired-1",
      "summary": "OpenClaw detected Claude auth expired and asked the user to login again.",
      "signature": "openclaw:claude-auth-expired",
      "created_at": "2026-05-20T00:00:00.000Z",
      "raw_log": "RAW LOG MUST NOT BE WRITTEN"
    }
  ]
}
JSON
node packages/cli/dist/index.js harvest --openclaw-export "$tmpdir/openclaw-export.json" --build-site --json
```

Expected:

- Harvest JSON has `ok: true`.
- `report.sources[0].imported` is `1`.
- `report.changed_stable_knowledge` is `false`.
- `dist/index.html` exists under the temp workspace.
- `RAW LOG MUST NOT BE WRITTEN` is absent from `.praxisbase/reports/harvest`, `.praxisbase/staging/openclaw`, and `.praxisbase/raw-vault/refs`.

- [ ] **Step 6: Full verification**

```bash
pnpm check
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Commit final M12.2**

```bash
git add .
git commit -m "feat: add memory harvest workflow"
```

## Implementation Notes

- Prefer injected command runners for Git and SSH tests. Do not rely on real network or real remote machines in unit tests.
- Use local HTTP servers for HTTP adapter tests.
- Keep PR creation as a clear unsupported diagnostic unless implementing a provider-specific API with tests.
- Do not add daemon/background sync in this milestone.
- Do not add a database or vector store in this milestone.
