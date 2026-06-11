# Harvest Local And Remote Memory Design

## Goal

M12.2 turns the lower-level M12 and M12.1 commands into a simple harvest workflow for personal and team use. A user should not have to manually chain `memory scan`, `memory fetch`, `memory ingest`, `wiki compile`, `wiki build-site`, `review`, and `promote` for normal experience extraction.

The core product promise is:

```bash
praxisbase harvest --all --build-site --json
praxisbase harvest --remote openclaw-prod --build-site --json
```

## Authority Model

PraxisBase has two valid authority modes.

### Personal Local Authority

For a single user, the local workspace is the knowledge authority:

```text
local workspace
  kb/
  skills/
  .praxisbase/
```

Git is optional in this mode. It can be used for backup or sync, but the CLI can run without GitHub, GitLab, or any remote repository.

### Team Git Authority

For a team, the Git repository is the knowledge authority. The local workspace is only a checkout or working copy.

```text
team knowledge repo on GitHub/GitLab/internal Git
        |
        v
local checkout
  kb/
  skills/
  .praxisbase/
```

Team harvest must not silently mutate `main`. It should create or reuse a branch, write protocol evidence and proposal candidates, optionally commit and push, and optionally open a PR through a later provider-specific integration. Stable knowledge still flows through proposal, review, and promote.

### Remote Export Transport

Remote OpenClaw exports are transport artifacts, not stable knowledge authority.

```text
remote OpenClaw
  -> safe export JSON
  -> file / git / ssh / http / openclaw-api transport
  -> local PraxisBase staging
  -> memory ingest
```

A Git repository can be used as the transport channel for redacted exports, but that export repo is not the PraxisBase knowledge repo. It must stay private and must not contain raw logs, transcripts, tokens, cookies, headers, or private keys.

## UX Principles

1. One command for common harvest flows.
2. Explicit authority mode: personal by default, team mode only when requested or detected from config.
3. Git is optional for personal use and expected for team use.
4. Remote acquisition adapters are transport-only.
5. Default behavior is safe: no automatic stable knowledge promotion.
6. `--auto-promote` must be explicit and blocked unless review gates pass.
7. JSON output must be machine-readable enough for CI and OpenClaw/OpenHuman wrappers.

## CLI Surface

### Harvest

Common personal mode:

```bash
praxisbase harvest --all --build-site --json
```

Explicit local sources:

```bash
praxisbase harvest \
  --codex ~/.codex/archived_sessions \
  --openclaw ~/.openclaw/logs \
  --openclaw-export ./openclaw-export.json \
  --limit 50 \
  --build-site \
  --json
```

Remote source by registered name:

```bash
praxisbase harvest --remote openclaw-prod --build-site --json
```

Team mode:

```bash
praxisbase harvest \
  --remote openclaw-prod \
  --team \
  --branch harvest/openclaw-prod-2026-05-20 \
  --commit \
  --push \
  --build-site \
  --json
```

Optional promotion:

```bash
praxisbase harvest --all --auto-review --auto-promote --json
```

Rules:

- `--all` discovers configured local adapters and registered remotes.
- `--codex <path>` adds a Codex local source.
- `--openclaw <path>` adds an OpenClaw local source.
- `--openclaw-export <path>` fetches a local exported JSON file through the M12.1 `exported-json` path.
- `--remote <name>` resolves a remote source config.
- `--team` enables team Git authority behavior.
- `--branch <name>` is required when `--team --commit` would otherwise commit on the current protected branch.
- `--commit` commits generated protocol evidence, reports, proposals, and site output.
- `--push` requires `--commit`.
- `--pr` is reserved for a later GitHub/GitLab integration and requires `--push`.
- `--auto-promote` requires `--auto-review`.

### Remote Registry

The remote registry is optional. Users can pass direct source options for one-off use, or register a reusable remote:

```bash
praxisbase remote add openclaw-prod \
  --type git \
  --repo git@github.com:org/openclaw-memory-export-private.git \
  --path exports/openclaw-prod/latest.json

praxisbase remote add openclaw-prod-ssh \
  --type ssh \
  --host user@example.com \
  --path ~/.openclaw/exports/latest.json

praxisbase remote add openclaw-prod-http \
  --type http \
  --url https://openclaw.example.com/exports/latest.json

praxisbase remote add openclaw-prod-api \
  --type openclaw-api \
  --remote workspace/project
```

Configs are stored under `.praxisbase/remotes/<name>.json` and must never store secrets. Tokens stay in environment variables, credential managers, SSH agent, or Git credential helpers.

## Remote Adapter Types

### `file`

Reads a local export file. This is the simplest bridge for manual download, browser download, AirDrop, SFTP, or any other human-operated transfer.

### `git`

Clones or pulls a private export repository into `.praxisbase/cache/remotes/<name>/`, then reads the configured export path.

The export repository must contain redacted export JSON only. The adapter must not commit to the export repo in M12.2; remote-side push automation belongs to the OpenClaw exporter skill or later remote writer tooling.

### `ssh`

Copies a remote export file through `scp` or `ssh cat` into `.praxisbase/staging/remote-imports/<name>.json`, then runs the same exported-json fetch path. This requires existing user SSH setup.

### `http`

Downloads a redacted export JSON from a URL into `.praxisbase/staging/remote-imports/<name>.json`. Auth headers are out of scope for the first implementation; if needed later, credentials must come from environment variables and must not be written to reports.

### `openclaw-api`

Uses the existing M12.1 `openclaw-api` provider. It requires `OPENCLAW_TOKEN` and optionally `OPENCLAW_BASE_URL`.

## Remote OpenClaw Exporter Skill

The simplest non-local OpenClaw path is a remote OpenClaw skill:

```text
praxisbase-openclaw-exporter
```

Its responsibility is narrow:

- Read OpenClaw-local memory/log/task summaries.
- Produce safe exported JSON compatible with M12.1.
- Omit raw logs, full transcripts, tokens, cookies, headers, and private keys.
- Optionally write to a file.
- Optionally push to a private export Git repo.

The skill must not write PraxisBase `kb/`, `skills/`, `.praxisbase/`, or stable knowledge directly. Local PraxisBase remains responsible for fetch, ingest, wiki compile, review, and promote.

## Harvest Pipeline

`praxisbase harvest` orchestrates existing primitives:

```text
resolve sources
  -> local scan sources
  -> remote transport fetches
  -> M12.1 memory fetch for OpenClaw exports/API
  -> M12 memory ingest
  -> wiki compile --review
  -> wiki graph
  -> wiki build-site when requested
  -> context smoke when requested
  -> review/promote only when explicitly requested
  -> team git commit/push only when explicitly requested
```

Harvest should use existing core functions instead of shelling out to the CLI internally.

## Data Contracts

### RemoteSourceConfig

```ts
export interface RemoteSourceConfig {
  id: string;
  protocol_version: "0.1";
  type: "remote_source_config";
  name: string;
  source_type: "file" | "git" | "ssh" | "http" | "openclaw-api";
  agent: "openclaw";
  repo?: string;
  ref?: string;
  path?: string;
  host?: string;
  url?: string;
  remote?: string;
  created_at: string;
  updated_at: string;
}
```

### HarvestReport

```ts
export interface HarvestReport {
  id: string;
  protocol_version: "0.1";
  type: "harvest_report";
  authority_mode: "personal-local" | "team-git";
  mode: "dry-run" | "write";
  sources: Array<{
    name: string;
    agent: "codex" | "openclaw";
    source_type: "local" | "file" | "git" | "ssh" | "http" | "openclaw-api";
    status: "completed" | "partial" | "failed";
    scanned: number;
    fetched: number;
    imported: number;
    duplicates: number;
    skipped: number;
    unsafe: number;
    warnings: string[];
  }>;
  proposal_candidates: number;
  graph_nodes: number;
  graph_broken_links: number;
  site_pages: number;
  context_items: number;
  git?: {
    branch?: string;
    committed: boolean;
    pushed: boolean;
    commit_sha?: string;
    pr_url?: string;
  };
  outputs: string[];
  warnings: string[];
  changed_stable_knowledge: boolean;
  created_at: string;
}
```

`changed_stable_knowledge` is false unless `--auto-promote` succeeds.

## Safety

- Harvest must not write stable knowledge by default.
- `--auto-promote` must be opt-in and must run existing review gates first.
- Team mode must not commit on protected branches unless explicitly allowed by config.
- Remote transport caches under `.praxisbase/cache/` and staging under `.praxisbase/staging/` must stay out of Git.
- Reports must not include secrets, raw logs, full transcripts, auth headers, cookies, or private keys.
- Git export remotes must be treated as sensitive even when redacted.

## Testing

Required coverage:

- Personal local harvest with Codex and OpenClaw fixtures.
- Harvest from local OpenClaw exported JSON.
- Harvest from registered `file` remote.
- Harvest from registered `git` remote using a local bare repository fixture.
- Harvest from registered `ssh` remote with a mock command runner.
- Harvest from registered `http` remote with a local HTTP server.
- Harvest from `openclaw-api` with a local mock API.
- Team mode blocks commit without branch when on a protected branch.
- Team mode commit writes a harvest report and produces a commit without pushing by default.
- `--push` requires `--commit`.
- `--auto-promote` requires `--auto-review`.
- Raw export content and secrets are absent from reports, staging envelopes, and committed files.
