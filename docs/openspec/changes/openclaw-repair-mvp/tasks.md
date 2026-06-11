# OpenClaw Repair MVP Tasks

- [x] Create TypeScript pnpm monorepo scaffold.
- [x] Define protocol schemas and schema tests.
- [x] Implement file store and `praxisbase init`.
- [x] Add knowledge governance schema fields and protocol directories for exceptions and run records.
- [x] Add OpenClaw seed skills and known fix.
- [x] Implement OpenClaw log signature detection.
- [x] Implement `praxisbase repair-context openclaw --logs <file> --json`.
- [x] Implement episode intake and proposal intake.
- [x] Implement deterministic MVP reviewer and risk classifier.
- [x] Implement promotion for approved proposals.
- [x] Implement static build for bundles, indexes, HTML, and `llms.txt`.
- [x] Implement `praxisbase bundle fetch` with last-known-good cache fallback.
- [x] Add GitLab scheduled pipeline template.
- [x] Run full verification with `pnpm check` and local smoke flow.

## Required Verification

Each task that changes behavior must include a failing test first. The final branch must pass:

```bash
pnpm check
```

The final branch must also pass a local smoke flow:

```bash
repo=$(pwd)
tmpdir=$(mktemp -d)
pnpm --filter @praxisbase/cli build
(cd "$tmpdir" && node "$repo/packages/cli/dist/index.js" init)
(cd "$tmpdir" && node "$repo/packages/cli/dist/index.js" repair-context openclaw --logs "$repo/tests/fixtures/openclaw/logs/claude-auth-expired.log" --json)
(cd "$tmpdir" && node "$repo/packages/cli/dist/index.js" build)
(cd "$tmpdir" && node "$repo/packages/cli/dist/index.js" bundle fetch openclaw --signature openclaw:claude-auth-expired)
test -f "$tmpdir/dist/repair-bundles/manifest.json"
```

## Required Non-Regression

- No complete raw logs are committed into `kb/`.
- No MCP server files are created.
- No Hermes runner files are created.
- No external search or vector database dependency is added.
- No K8s runtime integration code is added.
- No automatic maturity promotion, automatic decay, knowledge lint, or cold-start import code is added.
