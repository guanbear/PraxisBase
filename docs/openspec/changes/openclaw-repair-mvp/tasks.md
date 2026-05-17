# OpenClaw Repair MVP Tasks

- [ ] Create TypeScript pnpm monorepo scaffold.
- [ ] Define protocol schemas and schema tests.
- [ ] Implement file store and `llmhtml init`.
- [ ] Add OpenClaw seed skills and known fix.
- [ ] Implement OpenClaw log signature detection.
- [ ] Implement `llmhtml repair-context openclaw --logs <file> --json`.
- [ ] Implement episode intake and proposal intake.
- [ ] Implement deterministic MVP reviewer and risk classifier.
- [ ] Implement promotion for approved proposals.
- [ ] Implement static build for bundles, indexes, HTML, and `llms.txt`.
- [ ] Add GitLab scheduled pipeline template.
- [ ] Run full verification with `pnpm check` and local smoke flow.

## Required Verification

Each task that changes behavior must include a failing test first. The final branch must pass:

```bash
pnpm check
```

The final branch must also pass a local smoke flow:

```bash
repo=$(pwd)
tmpdir=$(mktemp -d)
pnpm --filter @llmhtml/cli build
(cd "$tmpdir" && node "$repo/packages/cli/dist/index.js" init)
(cd "$tmpdir" && node "$repo/packages/cli/dist/index.js" repair-context openclaw --logs "$repo/tests/fixtures/openclaw/logs/claude-auth-expired.log" --json)
(cd "$tmpdir" && node "$repo/packages/cli/dist/index.js" build)
test -f "$tmpdir/dist/repair-bundles/manifest.json"
```

## Required Non-Regression

- No complete raw logs are committed into `kb/`.
- No MCP server files are created.
- No Hermes runner files are created.
- No external search or vector database dependency is added.
- No K8s runtime integration code is added.
