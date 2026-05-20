# OpenClaw Remote Memory CLI Tasks

M12.1 should be implemented after M12 local `memory scan`, `memory ingest`, and `smoke real-wiki` are green.

## M12.1: PraxisBase CLI Remote OpenClaw Memory Fetch

- [x] Add protocol paths for `.praxisbase/staging/openclaw`, `.praxisbase/reports/memory-fetch`, and `.praxisbase/runs/memory-fetch`.
- [x] Add schemas for `OpenClawRemoteMemoryEnvelope`, `AgentMemoryFetchReport`, and `OpenClawRemoteDoctorReport`.
- [x] Ensure initialized workspaces ignore `.praxisbase/staging/` in Git.
- [x] Add `fetchOpenClawRemoteMemory(root, input)` in `@praxisbase/core`.
- [x] Add provider interface with `exported-json`, `openclaw-api`, and optional `openclaw-cli`.
- [x] Implement `exported-json` provider first.
- [x] Implement `openclaw-api` provider with environment token support.
- [x] Add structured diagnostics for missing `OPENCLAW_TOKEN`, invalid base URL, missing OpenClaw CLI, and unsupported provider.
- [x] Write safe remote envelopes to `.praxisbase/staging/openclaw/*.json`.
- [x] Write fetch reports to `.praxisbase/reports/memory-fetch/*.json`.
- [x] Write fetch run records to `.praxisbase/runs/memory-fetch/*.json`.
- [x] Never write tokens, cookies, headers, raw response bodies, raw logs, or private keys.
- [x] Add CLI `praxisbase memory fetch --agent openclaw --provider exported-json --source <file> --json`.
- [x] Add CLI `praxisbase memory fetch --agent openclaw --provider openclaw-api --remote <id> --json`.
- [x] Add CLI `praxisbase doctor openclaw-remote --provider <provider> --json`.
- [x] Preserve source checkout invocation with `node packages/cli/dist/index.js memory fetch ...`.
- [x] Preserve installed invocation with `praxisbase memory fetch ...`.
- [x] Preserve CI invocation through a built tool repo path.
- [x] Make staged envelopes compatible with `praxisbase memory ingest --agent openclaw --source .praxisbase/staging/openclaw --write --json`.
- [x] Add tests for exported JSON fetch.
- [x] Add tests proving raw remote body and auth secrets are not staged or reported.
- [x] Add tests for API fetch using a local mock HTTP server.
- [x] Add tests for doctor diagnostics.
- [x] Add tests for fetch-to-ingest compatibility.

## Required Verification

```bash
pnpm check
git diff --check
```

## Manual Smoke

The implementation must document and support source checkout mode:

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
      "created_at": "2026-05-20T00:00:00.000Z"
    }
  ]
}
JSON
node packages/cli/dist/index.js memory fetch --agent openclaw --provider exported-json --source "$tmpdir/openclaw-export.json" --json
node packages/cli/dist/index.js memory ingest --agent openclaw --source .praxisbase/staging/openclaw --write --json
node packages/cli/dist/index.js smoke real-wiki --agent openclaw --source .praxisbase/staging/openclaw --query "openclaw auth expired" --json
```

Expected:

- fetch writes safe staging envelopes and fetch reports,
- ingest writes protocol evidence only,
- smoke succeeds without promoting stable knowledge,
- `.praxisbase/staging/` is ignored by Git,
- raw remote logs and auth credentials are absent from all committed/reportable files.

## Out Of Scope

- Requiring an OpenClaw plugin.
- Requiring OpenClaw CLI for the default path.
- Background remote sync.
- Direct stable knowledge writes.
- Full remote transcript storage in Git.
- Online LLM summarization as a required path.
