# OpenClaw Remote Memory CLI Design

## Goal

M12.1 makes PraxisBase CLI the official control surface for non-local OpenClaw memory. Users can fetch remote or exported OpenClaw memory into a safe staging area, then reuse M12 `memory ingest` to turn staged envelopes into protocol evidence for wiki compile, graph, site, and context.

The design does not require an OpenClaw plugin. It also does not require OpenClaw CLI unless the user explicitly selects the optional `openclaw-cli` provider.

## Context

Current state:

- The PraxisBase CLI package exists and exposes the `praxisbase` binary after build/install.
- Current `memory` CLI only supports `import` and `refresh`.
- M12 documentation defines future `memory scan`, `memory ingest`, and `smoke real-wiki`.
- M12 local ingestion expects file/directory sources.
- Non-local OpenClaw memory needs a fetch step before ingest.

Decision:

- Add `memory fetch` to PraxisBase CLI.
- Fetch writes safe staging envelopes under `.praxisbase/staging/openclaw/`.
- Ingest reads those envelopes through the same M12 source path.
- `doctor openclaw-remote` explains provider readiness and missing dependencies.

## Architecture

```text
PraxisBase CLI
  memory fetch --agent openclaw --provider ...
        |
        v
@praxisbase/core remote provider layer
        |
        +--> exported-json provider
        +--> openclaw-api provider
        +--> openclaw-cli provider (optional)
        |
        v
.praxisbase/staging/openclaw/*.json
.praxisbase/reports/memory-fetch/*.json
.praxisbase/runs/memory-fetch/*.json
        |
        v
PraxisBase CLI
  memory ingest --agent openclaw --source .praxisbase/staging/openclaw --write
        |
        v
M12 raw-vault refs, captures, memory-ingest reports
```

CLI command files stay thin. Provider logic, envelope normalization, redaction, hashing, and report writing belong in `@praxisbase/core`.

## Runtime Modes

### Source Checkout

Used by developers and unreleased deployments:

```bash
pnpm build
node packages/cli/dist/index.js memory fetch --agent openclaw --provider exported-json --source ./openclaw-export.json --json
```

### Installed CLI

Used after publishing or installing the CLI:

```bash
praxisbase memory fetch --agent openclaw --provider exported-json --source ./openclaw-export.json --json
```

### CI Tool Repo

Used by a split knowledge repo:

```bash
git clone <PraxisBase tool repo>
pnpm install --frozen-lockfile
pnpm build
node /path/to/PraxisBase/packages/cli/dist/index.js memory fetch --agent openclaw --provider exported-json --source "$OPENCLAW_EXPORT" --json
```

### Plugin Bridge

Optional. A future OpenClaw plugin may call the same PraxisBase CLI commands, but it must not write PraxisBase protocol files directly.

## Providers

### `exported-json`

Default first provider. It reads explicit OpenClaw exported files and normalizes them.

Requirements:

- Accept `.json`, `.jsonl`, and `.ndjson`.
- Require explicit `--source`.
- Support `items`, top-level array, or line-delimited JSON records.
- Extract `remote_id`, `summary`, `signature`, `created_at`, and source refs when available.
- Compute `source_hash` from raw exported item content.
- Write only `redacted_summary` and metadata to staging.

### `openclaw-api`

Remote provider for OpenClaw API deployments.

Requirements:

- Require explicit `--remote`.
- Read token from `OPENCLAW_TOKEN`.
- Read base URL from `OPENCLAW_BASE_URL` or use a documented default.
- Support `--since` and `--limit`.
- Use a local mock HTTP server in tests.
- Never persist token, request headers, or raw API response.

### `openclaw-cli`

Optional bridge when an external OpenClaw CLI is already installed.

Requirements:

- `doctor openclaw-remote --provider openclaw-cli` checks binary availability.
- Missing binary returns structured diagnostics.
- Missing login returns structured diagnostics.
- This provider is not required for baseline M12.1 acceptance.

## Data Contracts

### OpenClawRemoteMemoryEnvelope

```ts
export interface OpenClawRemoteMemoryEnvelope {
  id: string;
  protocol_version: "0.1";
  type: "openclaw_remote_memory";
  provider: "exported-json" | "openclaw-api" | "openclaw-cli";
  remote_id: string;
  source_ref: string;
  source_hash: string;
  redacted_summary: string;
  signature?: string;
  created_at?: string;
  fetched_at: string;
  warnings: string[];
}
```

### AgentMemoryFetchReport

```ts
export interface AgentMemoryFetchReport {
  id: string;
  protocol_version: "0.1";
  type: "agent_memory_fetch_report";
  agent: "openclaw";
  provider: "exported-json" | "openclaw-api" | "openclaw-cli";
  runtime_mode: "source" | "installed" | "ci" | "unknown";
  fetched: number;
  staged: number;
  duplicates: number;
  skipped: number;
  unsafe: number;
  outputs: string[];
  warnings: string[];
  changed_stable_knowledge: false;
  created_at: string;
}
```

## CLI Surface

### Fetch

```bash
praxisbase memory fetch --agent openclaw --provider exported-json --source ./openclaw-export.json --json
praxisbase memory fetch --agent openclaw --provider openclaw-api --remote workspace/project --since 2026-05-01 --limit 20 --json
```

Output:

- JSON `{ ok: true, report }` in `--json` mode.
- Human summary in non-JSON mode.

Writes:

- `.praxisbase/staging/openclaw/*.json`
- `.praxisbase/reports/memory-fetch/*.json`
- `.praxisbase/runs/memory-fetch/*.json`

Does not write:

- `.praxisbase/outbox/captures/`
- `.praxisbase/raw-vault/refs/`
- `kb/`
- `skills/`

### Doctor

```bash
praxisbase doctor openclaw-remote --provider openclaw-api --json
praxisbase doctor openclaw-remote --provider openclaw-cli --json
```

Doctor reports runtime mode, provider readiness, missing token, missing external CLI, staging ignore status, and protocol directory readiness.

## Safety

- `.praxisbase/staging/` must be ignored by Git.
- Fetch writes safe staging envelopes, not raw remote logs.
- Credentials must come from environment or provider login state.
- Fetch reports must redact all auth and request details.
- `changed_stable_knowledge` is always false.
- Any private-looking item is skipped or reported unsafe.

## Testing

Required coverage:

- Schema validation for envelope, fetch report, and doctor report.
- `exported-json` fixture fetch.
- API fetch against local mock server.
- Auth token absent from every written JSON file.
- Doctor missing-token and missing-CLI diagnostics.
- Fetch-to-ingest compatibility with M12 staged envelopes.
- Source checkout CLI invocation remains documented and testable.

## Traceability

- OpenSpec: `docs/openspec/changes/openclaw-remote-memory-cli/`
- BDD: `docs/bdd/openclaw-remote-memory-cli.feature`
- Implementation plan: `docs/superpowers/plans/2026-05-20-openclaw-remote-memory-cli-implementation-plan.md`
- Traceability matrix: `docs/superpowers/plans/2026-05-20-openclaw-remote-memory-cli-traceability.md`
