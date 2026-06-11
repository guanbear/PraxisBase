# Harvest Local And Remote Memory Tasks

M12.2 builds on the completed M12 and M12.1 layers.

## Protocol And Paths

- [x] Add protocol paths for `.praxisbase/remotes`, `.praxisbase/reports/harvest`, `.praxisbase/runs/harvest`, `.praxisbase/staging/remote-imports`, and `.praxisbase/cache/remotes`.
- [x] Add schemas for `RemoteSourceConfig` and `HarvestReport`.
- [x] Add inferred TypeScript exports for harvest/remote schemas.
- [x] Ensure initialized workspaces create harvest/remotes directories.
- [x] Ensure `.praxisbase/staging/` and `.praxisbase/cache/` stay ignored by Git.

## Remote Registry

- [x] Add core remote config helpers for add/list/read/remove.
- [x] Add remote config validation that rejects credentials in config fields.
- [x] Add CLI `praxisbase remote add <name> --type file --path <path>`.
- [x] Add CLI `praxisbase remote add <name> --type git --repo <repo> --path <path> [--ref <ref>]`.
- [x] Add CLI `praxisbase remote add <name> --type ssh --host <host> --path <path>`.
- [x] Add CLI `praxisbase remote add <name> --type http --url <url>`.
- [x] Add CLI `praxisbase remote add <name> --type openclaw-api --remote <id>`.
- [x] Add CLI `praxisbase remote list --json`.
- [x] Add CLI `praxisbase remote remove <name>`.
- [x] Add CLI `praxisbase remote doctor <name> --json`.

## Remote Adapters

- [x] Add `file` adapter that reads a local redacted export file.
- [x] Add `git` adapter that clones or pulls into `.praxisbase/cache/remotes/<name>` and reads configured path.
- [x] Add `ssh` adapter with injectable command runner for tests.
- [x] Add `http` adapter with injectable fetch for tests.
- [x] Add `openclaw-api` adapter that delegates to M12.1 `fetchOpenClawRemoteMemory`.
- [x] Normalize all OpenClaw export transports through M12.1 staging envelopes.
- [x] Ensure remote adapter reports never include tokens, headers, cookies, raw logs, or full transcripts.

## Harvest Orchestrator

- [x] Add core `runHarvest(root, input)` orchestrator.
- [x] Support personal local mode by default.
- [x] Support team Git mode when `--team` is set.
- [x] Support explicit local Codex source paths.
- [x] Support explicit local OpenClaw source paths.
- [x] Support explicit OpenClaw export file paths.
- [x] Support registered remote names.
- [x] Support `--all` discovery from local adapter config and registered remotes.
- [x] Run `scanAgentMemory` and `ingestAgentMemory` for local sources.
- [x] Run `fetchOpenClawRemoteMemory` and `ingestAgentMemory` for OpenClaw exports/remotes.
- [x] Run wiki compile review after successful ingest.
- [x] Run wiki graph and report health counts.
- [x] Run wiki build-site when `--build-site` is set.
- [x] Run context smoke when `--context-query` is set.
- [x] Run review only when `--auto-review` is set.
- [x] Run promote only when `--auto-promote` is set and review succeeds.
- [x] Write `.praxisbase/reports/harvest/*.json`.
- [x] Write `.praxisbase/runs/harvest/*.json`.

## Team Git Behavior

- [x] Detect current branch and protected branch names (`main`, `master`, `trunk`) in team mode.
- [x] Require `--branch` for `--team --commit` when current branch is protected.
- [x] Create or checkout the requested harvest branch.
- [x] Commit generated harvest outputs when `--commit` is set.
- [x] Require `--commit` before allowing `--push`.
- [x] Push the harvest branch when `--push` is set.
- [x] Return a clear diagnostic for `--pr` until GitHub/GitLab PR creation is implemented.

## CLI

- [x] Add `packages/cli/src/commands/harvest.ts`.
- [x] Add `packages/cli/src/commands/remote.ts`.
- [x] Wire `harvest` and `remote` in `packages/cli/src/index.ts`.
- [x] Export command modules in `packages/cli/package.json`.
- [x] Add JSON error details for invalid remote config, missing branch, missing credentials, and unsafe promotion flags.

## Tests

- [x] Add core schema/path tests.
- [x] Add remote registry tests.
- [x] Add remote adapter tests for file, git, ssh, http, and openclaw-api.
- [x] Add harvest orchestrator tests for local Codex, local OpenClaw, exported OpenClaw, and registered remote OpenClaw.
- [x] Add team Git behavior tests using a local fixture repository.
- [x] Add CLI command tests for `harvest` and `remote`.
- [x] Add safety tests proving raw logs and secrets are absent from reports and committed files.
- [x] Add real smoke for `praxisbase harvest --openclaw-export <file> --build-site --json`.

## Required Verification

```bash
pnpm check
git diff --check
```

## Manual Smoke

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

- Harvest report is written.
- OpenClaw item is staged and ingested.
- Wiki compile review runs.
- Site build runs.
- `changed_stable_knowledge` remains false.
- Raw log text is absent from reports, staging envelopes, and committed files.

## Out Of Scope

- GitHub/GitLab PR creation in the first harvest implementation.
- Background daemon sync.
- Remote writeback into OpenClaw.
- Storing credentials in PraxisBase config.
- Treating remote export repositories as stable knowledge authority.
