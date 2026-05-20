# OpenClaw Remote Memory CLI Tasks

M12.1 should be implemented after M12 local `memory scan`, `memory ingest`, and `smoke real-wiki` are green.

## M12.1: PraxisBase CLI Remote OpenClaw Memory Fetch

- [ ] Add protocol paths for `.praxisbase/staging/openclaw`, `.praxisbase/reports/memory-fetch`, and `.praxisbase/runs/memory-fetch`.
- [ ] Add schemas for `OpenClawRemoteMemoryEnvelope`, `AgentMemoryFetchReport`, and `OpenClawRemoteDoctorReport`.
- [ ] Ensure initialized workspaces ignore `.praxisbase/staging/` in Git.
- [ ] Add `fetchOpenClawRemoteMemory(root, input)` in `@praxisbase/core`.
- [ ] Add provider interface with `exported-json`, `openclaw-api`, and optional `openclaw-cli`.
- [ ] Implement `exported-json` provider first.
- [ ] Implement `openclaw-api` provider with environment token support.
- [ ] Add structured diagnostics for missing `OPENCLAW_TOKEN`, invalid base URL, missing OpenClaw CLI, and unsupported provider.
- [ ] Write safe remote envelopes to `.praxisbase/staging/openclaw/*.json`.
- [ ] Write fetch reports to `.praxisbase/reports/memory-fetch/*.json`.
- [ ] Write fetch run records to `.praxisbase/runs/memory-fetch/*.json`.
- [ ] Never write tokens, cookies, headers, raw response bodies, raw logs, or private keys.
- [ ] Add CLI `praxisbase memory fetch --agent openclaw --provider exported-json --source <file> --json`.
- [ ] Add CLI `praxisbase memory fetch --agent openclaw --provider openclaw-api --remote <id> --json`.
- [ ] Add CLI `praxisbase doctor openclaw-remote --provider <provider> --json`.
- [ ] Preserve source checkout invocation with `node packages/cli/dist/index.js memory fetch ...`.
- [ ] Preserve installed invocation with `praxisbase memory fetch ...`.
- [ ] Preserve CI invocation through a built tool repo path.
- [ ] Make staged envelopes compatible with `praxisbase memory ingest --agent openclaw --source .praxisbase/staging/openclaw --write --json`.
- [ ] Add tests for exported JSON fetch.
- [ ] Add tests proving raw remote body and auth secrets are not staged or reported.
- [ ] Add tests for API fetch using a local mock HTTP server.
- [ ] Add tests for doctor diagnostics.
- [ ] Add tests for fetch-to-ingest compatibility.

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
