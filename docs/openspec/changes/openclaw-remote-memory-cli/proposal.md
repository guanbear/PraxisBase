# OpenSpec Change: OpenClaw Remote Memory CLI

## Why

M12 defines safe local ingestion for Codex and OpenClaw material, but non-local OpenClaw memory still needs a PraxisBase-controlled entrypoint. The project CLI already exists, so remote OpenClaw memory should be pulled, normalized, and ingested through PraxisBase CLI commands instead of requiring an OpenClaw plugin as the default path.

The missing capability is a remote fetch stage:

1. PraxisBase CLI authenticates to an explicit OpenClaw source or reads an exported OpenClaw memory bundle.
2. It normalizes remote items into safe staging envelopes.
3. It writes only redacted summaries, source refs, source hashes, and fetch reports.
4. Existing `memory ingest` imports staged envelopes into protocol evidence.

## What Changes

- Define `praxisbase memory fetch --agent openclaw` as the PraxisBase CLI entrypoint for non-local OpenClaw memory.
- Define CLI runtime modes: source checkout, installed package, CI tool repo, and optional plugin bridge.
- Add remote providers:
  - `exported-json` for an explicit file/directory export with no network dependency,
  - `openclaw-api` for token-authenticated remote API fetch,
  - `openclaw-cli` as an optional bridge only when an OpenClaw CLI is installed and logged in.
- Add `.praxisbase/staging/openclaw/` as a transient staging area that must be ignored by Git.
- Add safe remote envelope and fetch report schemas.
- Add `praxisbase doctor openclaw-remote --provider <provider> --json` for capability checks.
- Add BDD and TDD coverage for source-mode CLI, exported JSON fetch, API fetch with redacted auth, missing dependency diagnostics, staging ignore, and fetch-to-ingest smoke.

## Non-Goals

- Do not require OpenClaw CLI, an OpenClaw plugin, MCP, daemon, browser extension, or webhook for the default path.
- Do not make PraxisBase depend on a single OpenClaw deployment shape.
- Do not write OpenClaw tokens, cookies, raw logs, full transcripts, request headers, or private keys to Git.
- Do not automatically ingest every remote workspace. Fetch must target an explicit remote source.
- Do not automatically promote fetched memory into `kb/` or `skills/`.
- Do not require live network access for the test suite; tests must use exported fixtures or a local mock HTTP server.

## Acceptance Summary

- Source checkout mode works with `node packages/cli/dist/index.js memory fetch ...`.
- Installed mode works with `praxisbase memory fetch ...` after the CLI package is installed.
- CI mode can clone/build the tool repo and run the same `node packages/cli/dist/index.js` command.
- `memory fetch --agent openclaw --provider exported-json --source <file|dir> --json` stages safe envelopes without raw log bodies.
- `memory fetch --agent openclaw --provider openclaw-api --remote <id> --json` uses environment-provided credentials and never writes secrets.
- `doctor openclaw-remote` reports missing token, missing OpenClaw CLI, unsupported provider, staging ignore state, and current CLI runtime mode.
- Fetched envelopes can be passed to `memory ingest --agent openclaw --source .praxisbase/staging/openclaw --write --json`.
- Fetch and ingest reports preserve `source_ref`, deterministic `source_hash`, provider, remote id, and redaction warnings.
- `pnpm check` and `git diff --check` pass.

## Guardrails For Implementing Agents

- Keep remote fetching in `@praxisbase/core`; keep CLI wrappers thin.
- Make `exported-json` the first implementation provider so the flow is testable without network.
- Treat `openclaw-cli` as optional. Missing CLI must produce diagnostics, not a crash.
- Normalize all provider outputs into one envelope schema before ingestion.
- Hash raw remote content or a canonical remote payload before redaction; never hash only a generated summary.
- Keep `.praxisbase/staging/openclaw/` out of Git and out of `dist/`.
- Do not store auth headers, tokens, cookies, request bodies, raw responses, or raw logs in fetch reports.
