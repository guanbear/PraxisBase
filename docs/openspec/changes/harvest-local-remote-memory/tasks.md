# Harvest Local And Remote Memory Tasks

M12.2 builds on the completed M12 and M12.1 layers.

## Protocol And Paths

- [ ] Add protocol paths for `.praxisbase/remotes`, `.praxisbase/reports/harvest`, `.praxisbase/runs/harvest`, `.praxisbase/staging/remote-imports`, and `.praxisbase/cache/remotes`.
- [ ] Add schemas for `RemoteSourceConfig` and `HarvestReport`.
- [ ] Add inferred TypeScript exports for harvest/remote schemas.
- [ ] Ensure initialized workspaces create harvest/remotes directories.
- [ ] Ensure `.praxisbase/staging/` and `.praxisbase/cache/` stay ignored by Git.

## Remote Registry

- [ ] Add core remote config helpers for add/list/read/remove.
- [ ] Add remote config validation that rejects credentials in config fields.
- [ ] Add CLI `praxisbase remote add <name> --type file --path <path>`.
- [ ] Add CLI `praxisbase remote add <name> --type git --repo <repo> --path <path> [--ref <ref>]`.
- [ ] Add CLI `praxisbase remote add <name> --type ssh --host <host> --path <path>`.
- [ ] Add CLI `praxisbase remote add <name> --type http --url <url>`.
- [ ] Add CLI `praxisbase remote add <name> --type openclaw-api --remote <id>`.
- [ ] Add CLI `praxisbase remote list --json`.
- [ ] Add CLI `praxisbase remote remove <name>`.
- [ ] Add CLI `praxisbase remote doctor <name> --json`.

## Remote Adapters

- [ ] Add `file` adapter that reads a local redacted export file.
- [ ] Add `git` adapter that clones or pulls into `.praxisbase/cache/remotes/<name>` and reads configured path.
- [ ] Add `ssh` adapter with injectable command runner for tests.
- [ ] Add `http` adapter with injectable fetch for tests.
- [ ] Add `openclaw-api` adapter that delegates to M12.1 `fetchOpenClawRemoteMemory`.
- [ ] Normalize all OpenClaw export transports through M12.1 staging envelopes.
- [ ] Ensure remote adapter reports never include tokens, headers, cookies, raw logs, or full transcripts.

## Harvest Orchestrator

- [ ] Add core `runHarvest(root, input)` orchestrator.
- [ ] Support personal local mode by default.
- [ ] Support team Git mode when `--team` is set.
- [ ] Support explicit local Codex source paths.
- [ ] Support explicit local OpenClaw source paths.
- [ ] Support explicit OpenClaw export file paths.
- [ ] Support registered remote names.
- [ ] Support `--all` discovery from local adapter config and registered remotes.
- [ ] Run `scanAgentMemory` and `ingestAgentMemory` for local sources.
- [ ] Run `fetchOpenClawRemoteMemory` and `ingestAgentMemory` for OpenClaw exports/remotes.
- [ ] Run wiki compile review after successful ingest.
- [ ] Run wiki graph and report health counts.
- [ ] Run wiki build-site when `--build-site` is set.
- [ ] Run context smoke when `--context-query` is set.
- [ ] Run review only when `--auto-review` is set.
- [ ] Run promote only when `--auto-promote` is set and review succeeds.
- [ ] Write `.praxisbase/reports/harvest/*.json`.
- [ ] Write `.praxisbase/runs/harvest/*.json`.

## Team Git Behavior

- [ ] Detect current branch and protected branch names (`main`, `master`, `trunk`) in team mode.
- [ ] Require `--branch` for `--team --commit` when current branch is protected.
- [ ] Create or checkout the requested harvest branch.
- [ ] Commit generated harvest outputs when `--commit` is set.
- [ ] Require `--commit` before allowing `--push`.
- [ ] Push the harvest branch when `--push` is set.
- [ ] Return a clear diagnostic for `--pr` until GitHub/GitLab PR creation is implemented.

## CLI

- [ ] Add `packages/cli/src/commands/harvest.ts`.
- [ ] Add `packages/cli/src/commands/remote.ts`.
- [ ] Wire `harvest` and `remote` in `packages/cli/src/index.ts`.
- [ ] Export command modules in `packages/cli/package.json`.
- [ ] Add JSON error details for invalid remote config, missing branch, missing credentials, and unsafe promotion flags.

## Tests

- [ ] Add core schema/path tests.
- [ ] Add remote registry tests.
- [ ] Add remote adapter tests for file, git, ssh, http, and openclaw-api.
- [ ] Add harvest orchestrator tests for local Codex, local OpenClaw, exported OpenClaw, and registered remote OpenClaw.
- [ ] Add team Git behavior tests using a local fixture repository.
- [ ] Add CLI command tests for `harvest` and `remote`.
- [ ] Add safety tests proving raw logs and secrets are absent from reports and committed files.
- [ ] Add real smoke for `praxisbase harvest --openclaw-export <file> --build-site --json`.

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
