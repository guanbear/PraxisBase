# OpenSpec Change: Harvest Local And Remote Memory

## Why

M12 and M12.1 made the underlying memory pipeline work, but the user experience is still too low-level. Real users should not have to manually chain scan, fetch, ingest, wiki compile, graph, site build, context, review, promote, commit, and push commands.

The next capability is a higher-level harvest workflow that supports both personal local usage and team Git usage.

## What Changes

- Add `praxisbase harvest` as the high-level command for local and remote experience extraction.
- Add an explicit authority model:
  - Personal mode: local workspace is authoritative, Git is optional.
  - Team mode: Git repo is authoritative, local workspace is a checkout.
- Add remote source registry commands:
  - `praxisbase remote add`
  - `praxisbase remote list`
  - `praxisbase remote remove`
  - `praxisbase remote doctor`
- Add remote transport adapters:
  - `file`
  - `git`
  - `ssh`
  - `http`
  - `openclaw-api`
- Add a safe OpenClaw exporter skill contract for remote machines.
- Add harvest reports under `.praxisbase/reports/harvest/`.
- Add harvest run records under `.praxisbase/runs/harvest/`.
- Add team-mode Git orchestration flags for branch, commit, push, and later PR integration.

## Non-Goals

- Do not require GitHub or GitLab for personal local use.
- Do not treat a remote export Git repo as the PraxisBase knowledge authority.
- Do not store secrets in remote configs or reports.
- Do not store raw OpenClaw logs, raw Codex transcripts, tokens, cookies, headers, or private keys in Git.
- Do not auto-promote into `kb/` or `skills/` by default.
- Do not implement GitHub/GitLab PR creation in the first harvest implementation; reserve `--pr` behind a clear diagnostic.
- Do not require OpenClaw CLI, OpenClaw plugin, MCP, daemon, or webhook for the default path.

## Acceptance Summary

- `praxisbase harvest --all --build-site --json` runs local configured sources in personal mode.
- `praxisbase harvest --codex <path> --openclaw <path> --build-site --json` runs explicit local sources.
- `praxisbase harvest --openclaw-export <path> --build-site --json` fetches exported OpenClaw JSON, ingests it, and builds the site.
- `praxisbase remote add <name> --type git --repo <repo> --path <path>` registers a redacted export transport.
- `praxisbase harvest --remote <name> --build-site --json` resolves the remote and runs the full harvest pipeline.
- Team mode refuses unsafe direct commits on protected branches unless the user provides an explicit harvest branch.
- `--push` requires `--commit`.
- `--auto-promote` requires `--auto-review`.
- Harvest reports preserve counts for fetched, scanned, imported, skipped, duplicates, unsafe, proposal candidates, graph nodes, site pages, and context items.
- Harvest writes no stable knowledge unless `--auto-promote` succeeds.
- `pnpm check` and `git diff --check` pass.

## Guardrails For Implementing Agents

- Keep orchestration in `@praxisbase/core`; keep CLI wrappers thin.
- Reuse M12 `scanAgentMemory`, `ingestAgentMemory`, and `runRealWikiSmoke` behavior.
- Reuse M12.1 `fetchOpenClawRemoteMemory` for exported JSON and OpenClaw API paths.
- Implement adapters as small, testable modules with injected command/network runners.
- Store remote config without credentials.
- Route remote transport outputs into staging, then through existing fetch/ingest logic.
- Keep `.praxisbase/cache/` and `.praxisbase/staging/` out of Git.
- Never bypass proposal, review, and promote rules.
