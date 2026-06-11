# OpenClaw Remote Memory CLI Design

## Overview

M12.1 makes PraxisBase CLI the control plane for non-local OpenClaw memory.

```text
source checkout / installed CLI / CI tool repo
        |
        v
praxisbase memory fetch --agent openclaw
        |
        +--> provider: exported-json
        +--> provider: openclaw-api
        +--> provider: openclaw-cli (optional bridge)
        |
        v
.praxisbase/staging/openclaw/*.json
.praxisbase/reports/memory-fetch/*.json
.praxisbase/runs/memory-fetch/*.json
        |
        v
praxisbase memory ingest --agent openclaw --source .praxisbase/staging/openclaw --write
        |
        v
existing M12 ingest -> wiki compile -> graph -> build-site -> context get
```

Fetch is not authority. It is a deterministic staging step that turns remote OpenClaw memory into safe envelopes. Ingest remains the only command that writes capture records and raw-vault refs.

## CLI Runtime Modes

### Source Checkout Mode

Used during development and CI before publishing:

```bash
pnpm build
node packages/cli/dist/index.js memory fetch --agent openclaw --provider exported-json --source ./openclaw-export.json --json
```

### Installed Mode

Used after publishing/installing the CLI package:

```bash
praxisbase memory fetch --agent openclaw --provider openclaw-api --remote workspace/project --json
```

### CI Tool Repo Mode

Used by a split knowledge repo. CI clones or caches PraxisBase, runs `pnpm build`, then invokes:

```bash
node /path/to/PraxisBase/packages/cli/dist/index.js memory fetch --agent openclaw --provider exported-json --source "$OPENCLAW_EXPORT" --json
```

### Plugin Bridge Mode

Optional and not required for M12.1. If OpenClaw later needs to push memory into PraxisBase, a plugin or webhook may call the same CLI commands. The plugin must not bypass `memory fetch` and `memory ingest`.

## Providers

### `exported-json`

Inputs:

- `--source <file|dir>` repeatable.
- File extensions: `.json`, `.jsonl`, `.ndjson`.

Behavior:

- Reads explicit exported OpenClaw memory files.
- Normalizes each item into `OpenClawRemoteMemoryEnvelope`.
- Does not require network, OpenClaw CLI, or plugin installation.
- This is the first provider to implement because it is deterministic and testable.

### `openclaw-api`

Inputs:

- `--remote <workspace/project>` explicit remote id.
- `--since <iso-date>` optional.
- `--limit <n>` default 20.
- Environment credentials:
  - `OPENCLAW_TOKEN`
  - optional `OPENCLAW_BASE_URL`

Behavior:

- Calls an explicit OpenClaw API endpoint.
- Uses bearer token from environment only.
- Never writes token, headers, or raw responses.
- Supports paging through a small provider interface.
- Tests use a local mock HTTP server.

### `openclaw-cli`

Inputs:

- `--remote <workspace/project>` optional, depending on installed OpenClaw CLI behavior.
- `--limit <n>` default 20.

Behavior:

- Executes an installed OpenClaw CLI export command only when available.
- Missing binary or missing login returns a structured diagnostic.
- It is optional; M12.1 must remain useful without it.

## Protocol Objects

### OpenClawRemoteMemoryEnvelope

Written to `.praxisbase/staging/openclaw/<id>.json`.

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

The envelope is safe to pass to `memory ingest`, but staging still stays out of Git because remote metadata can be sensitive.

### AgentMemoryFetchReport

Written to `.praxisbase/reports/memory-fetch/<id>.json`.

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

### OpenClawRemoteDoctorReport

Returned by `doctor openclaw-remote`; written only when `--write-report` is explicitly passed.

```ts
export interface OpenClawRemoteDoctorReport {
  id: string;
  protocol_version: "0.1";
  type: "openclaw_remote_doctor_report";
  provider: "exported-json" | "openclaw-api" | "openclaw-cli";
  runtime_mode: "source" | "installed" | "ci" | "unknown";
  ok: boolean;
  checks: Array<{ id: string; ok: boolean; severity: "info" | "warning" | "error"; message: string }>;
  warnings: string[];
  created_at: string;
}
```

## Commands

### `praxisbase memory fetch`

Purpose: fetch non-local OpenClaw memory into safe staging envelopes.

Required options:

- `--agent openclaw`
- `--provider exported-json|openclaw-api|openclaw-cli`

Provider-specific options:

- `--source <file|dir>` repeatable for `exported-json`.
- `--remote <id>` for `openclaw-api` and `openclaw-cli`.
- `--since <iso-date>` optional.
- `--limit <n>` default 20.
- `--out <path>` default `.praxisbase/staging/openclaw`.
- `--json`

Behavior:

- Writes safe envelopes to staging.
- Writes fetch reports and run records.
- Does not write captures, raw-vault refs, `kb/`, or `skills/`.
- Does not require OpenClaw CLI unless `--provider openclaw-cli` is selected.

### `praxisbase doctor openclaw-remote`

Purpose: explain whether the selected remote provider can run.

Options:

- `--provider exported-json|openclaw-api|openclaw-cli`
- `--json`
- `--write-report`

Checks:

- PraxisBase CLI runtime mode.
- `OPENCLAW_TOKEN` presence for `openclaw-api`.
- `OPENCLAW_BASE_URL` validity when provided.
- OpenClaw CLI binary and login state for `openclaw-cli`.
- `.praxisbase/staging/` ignored by Git.
- Required protocol directories.

## Safety Rules

- Fetch must be user-invoked.
- Fetch must target explicit `--source` or `--remote`; no default remote workspace scan.
- Auth credentials come from environment or existing provider login only.
- Fetch reports must not contain tokens, cookies, headers, raw response bodies, or raw logs.
- Staged envelopes store redacted summaries only.
- Unsafe remote items are counted and routed to human-required exceptions only in write mode.
- `changed_stable_knowledge` is always false for fetch and doctor.

## Testing Strategy

- Unit tests validate envelope and fetch report schemas.
- `exported-json` tests use fixture files and assert no raw log body is staged.
- `openclaw-api` tests use a local mock HTTP server and assert auth is not persisted.
- CLI tests call `memoryCommand(root, "fetch", ...)`.
- Doctor tests cover missing token, missing OpenClaw CLI, and staging ignore warnings.
- End-to-end smoke runs `memory fetch` then `memory ingest` against staged envelopes.
