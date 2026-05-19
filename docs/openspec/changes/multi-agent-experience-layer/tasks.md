# Multi-Agent Experience Layer Tasks

## M0: Protocol Schemas And Paths

- [ ] Add capture record schema.
- [ ] Add adapter profile schema.
- [ ] Add context request/response schemas.
- [ ] Add structured error schema.
- [ ] Add paths for captures, reports, runs, adapters, and raw vault refs.
- [ ] Export new schemas and types through existing core exports.
- [ ] Add tests for valid and invalid capture records.
- [ ] Add tests for adapter profile validation.
- [ ] Add tests for structured errors.

## M1: Capture And Raw Vault

- [ ] Implement `finishCapture` in `packages/core/src/experience/capture.ts`.
- [ ] Reject raw refs that point under `kb/`, `skills/`, or `dist/`.
- [ ] Allow `raw-vault://`, `log://`, `artifact://`, `file-ref://`, and `ci-artifact://` refs.
- [ ] Write capture records under `.praxisbase/outbox/captures/`.
- [ ] Add `praxisbase capture finish`.
- [ ] Add `praxisbase capture submit` if structured capture file submission is implemented in the same batch.
- [ ] Add CLI tests for capture output and rejection behavior.

## M2: Adapter Profiles And Install

- [ ] Add built-in profiles for `codex`, `claude-code`, `opencode`, `openclaw`, `hermes`, and `generic`.
- [ ] Add install dry-run planner.
- [ ] Add non-dry-run install that writes `.praxisbase/adapters/<agent>.json`.
- [ ] Append instruction snippets only inside PraxisBase markers.
- [ ] Prevent whole-file overwrite of instruction files.
- [ ] Add `praxisbase install <agent> --dry-run --json`.
- [ ] Add tests for dry-run output and safe write behavior.

## M3: Context Get

- [ ] Implement stage-aware `context get` core logic.
- [ ] Support `diagnosis`, `repair`, `verification`, and `proposal` stages.
- [ ] Enforce default stage budgets.
- [ ] Preserve citations when dropping full object bodies.
- [ ] Return warnings when generated bundles or indexes are missing.
- [ ] Add `praxisbase context get`.
- [ ] Add tests for budget, citations, and no-hard-fail behavior.

## M4: Distill And Watch

- [ ] Implement `distill run` that reads captures and writes reports/proposals/exceptions.
- [ ] Default generated candidates to `scope=personal`.
- [ ] Suggest `scope=project` only when workspace evidence is clear.
- [ ] Never suggest `team` or `org` without explicit marker or reviewer input.
- [ ] Ensure distill reports `changed_stable_knowledge: false`.
- [ ] Add `praxisbase distill run --json`.
- [ ] Add `praxisbase watch --agent <agent> --workspace <path> --once --json`.
- [ ] Add tests for proposal output, exception output, and stable knowledge non-mutation.

## M5: Docs, Seed, And Smoke Flow

- [ ] Update `praxisbase init` seed paths.
- [ ] Update README links and command examples.
- [ ] Update deployment docs for personal local use and team scheduled use.
- [ ] Keep design, implementation plan, OpenSpec, and BDD in sync with final command names.
- [ ] Run full smoke flow from the implementation plan.

## Required Verification

```bash
pnpm check
git diff --check
```

Smoke flow:

```bash
tmpdir=$(mktemp -d)
pnpm build
cd "$tmpdir"
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js init --profile all
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js install codex --dry-run --json
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js capture finish --agent codex --result success --source-ref raw-vault://codex/session-1 --source-hash sha256:session1 --summary "Fixed a project issue and tests passed." --json
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js distill run --json
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js context get --agent codex --stage diagnosis --query "openclaw auth expired" --json
```

Expected:

- capture is written under `.praxisbase/outbox/captures/`,
- distill writes report/proposal/exception outputs only,
- context response contains stage, warnings, and citations,
- capture/watch/distill do not write stable `kb/` or `skills/`.

## Out Of Scope

- GUI, browser extension, IDE plugin, MCP server.
- Vector database or external semantic search.
- Long-running database service or queue worker.
- Deep per-agent plugin frameworks.
- Raw transcript/log/chat storage in Git.
- Direct stable knowledge mutation from capture, watch, or distill.

