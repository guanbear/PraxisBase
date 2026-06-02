# Harvest Local And Remote Memory Design

## Overview

M12.2 adds a high-level `harvest` workflow over the existing memory pipeline.

```text
local and remote sources
        |
        v
remote source adapters
        |
        v
M12.1 memory fetch where needed
        |
        v
M12 memory ingest
        |
        v
wiki compile -> graph -> build-site -> context
        |
        v
optional review/promote
        |
        v
optional team Git commit/push
```

The design separates knowledge authority from remote transport.

## Authority Modes

### Personal Local

The local workspace is authoritative. Git is optional.

Use cases:

- Individual user building a personal PraxisBase memory/wiki.
- User wants local HTML and local proposals.
- User may later push to Git for backup, but PraxisBase does not require it.

### Team Git

The Git repository is authoritative. Local checkout is a working copy.

Use cases:

- Team knowledge repo on GitHub, GitLab, or internal Git.
- Harvest should create branch-scoped changes.
- Generated proposals, reports, and site output can be committed and pushed.
- Stable knowledge promotion still follows review gates.

### Remote Export Transport

Remote export transports are not authority. They only move redacted export JSON from remote OpenClaw to local PraxisBase.

Supported first-class transports:

- local file
- Git export repo
- SSH/SCP
- HTTP download
- OpenClaw API

## CLI Commands

### `praxisbase harvest`

```bash
praxisbase harvest --all --build-site --json
praxisbase harvest --codex ~/.codex/archived_sessions --openclaw ~/.openclaw/logs --json
praxisbase harvest --openclaw-export ./openclaw-export.json --build-site --json
praxisbase harvest --remote openclaw-prod --build-site --json
praxisbase harvest --remote openclaw-prod --team --branch harvest/openclaw-prod --commit --push --json
```

Important options:

- `--all`: use configured local adapter paths and registered remotes.
- `--codex <path>`: add a local Codex source.
- `--openclaw <path>`: add a local OpenClaw source.
- `--openclaw-export <path>`: add a local OpenClaw exported JSON source.
- `--remote <name>`: add a registered remote source.
- `--limit <n>`: cap each source.
- `--build-site`: run `wiki build-site`.
- `--context-query <query>`: run context smoke with a specific query.
- `--dry-run`: plan and scan without writing ingest evidence.
- `--team`: use team Git authority rules.
- `--branch <name>`: checkout or create a harvest branch.
- `--commit`: commit generated artifacts.
- `--push`: push committed branch; requires `--commit`.
- `--pr`: reserved for later provider integration; requires `--push`.
- `--auto-review`: run review after compile.
- `--auto-promote`: run promote after review; requires `--auto-review`.
- `--json`: return structured output.

### `praxisbase remote`

```bash
praxisbase remote add openclaw-prod --type git --repo git@github.com:org/openclaw-export-private.git --path exports/prod/latest.json
praxisbase remote add openclaw-prod-ssh --type ssh --host user@example.com --path ~/.openclaw/exports/latest.json
praxisbase remote add openclaw-prod-http --type http --url https://openclaw.example.com/export/latest.json
praxisbase remote add openclaw-prod-api --type openclaw-api --remote workspace/project
praxisbase remote list --json
praxisbase remote doctor openclaw-prod --json
praxisbase remote remove openclaw-prod
```

Remote configs live under `.praxisbase/remotes/<name>.json`.

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

Written to `.praxisbase/reports/harvest/<id>.json`.

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

- Personal mode does not require Git.
- Team mode treats Git as the authority and avoids direct mutation of protected branches.
- Remote export Git repos are private transport repos, not knowledge authority.
- Remote configs never store secrets.
- `git`, `ssh`, and `http` adapters must write downloaded material only into ignored cache/staging paths.
- Reports must not contain raw logs, full transcripts, auth headers, tokens, cookies, or private keys.
- `--auto-promote` must be explicit and must run review first.

## Testing

Required tests:

- Schema tests for remote config and harvest report.
- Remote registry CLI tests for add/list/remove/doctor.
- Harvest CLI tests for local Codex and OpenClaw sources.
- Harvest CLI tests for OpenClaw exported JSON.
- Git remote adapter tests using a local bare repository fixture.
- SSH remote adapter tests using an injected command runner.
- HTTP remote adapter tests using a local HTTP server.
- OpenClaw API harvest tests using a local mock API.
- Team mode branch/commit safety tests.
- Safety tests proving secrets/raw logs are not written to reports or committed files.
