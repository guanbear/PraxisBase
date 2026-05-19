# Multi-Agent Experience Layer Tasks

## M0: Protocol Schemas And Paths

- [ ] Add capture record schema.
- [ ] Add adapter profile schema.
- [ ] Add native memory source, memory import report, and memory refresh plan schemas.
- [ ] Add context request/response schemas.
- [ ] Add structured error schema.
- [ ] Add paths for captures, memory reports, memory import runs, memory refresh outputs, reports, runs, adapters, and raw vault refs.
- [ ] Export new schemas and types through existing core exports.
- [ ] Add tests for valid and invalid capture records.
- [ ] Add tests for adapter profile validation.
- [ ] Add tests for native memory source and memory refresh validation.
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

- [ ] Add built-in profiles for `codex`, `claude-code`, `opencode`, `openclaw`, `hermes`, `openhuman`, and `generic`.
- [ ] Add install dry-run planner.
- [ ] Add non-dry-run install that writes `.praxisbase/adapters/<agent>.json`.
- [ ] Append instruction snippets only inside PraxisBase markers.
- [ ] Prevent whole-file overwrite of instruction files.
- [ ] Add `praxisbase install <agent> --dry-run --json`.
- [ ] Add tests for dry-run output and safe write behavior.

## M3: Native Memory Bridge

- [ ] Implement `importNativeMemory` in `packages/core/src/experience/native-memory.ts`.
- [ ] Implement `planMemoryRefresh` in `packages/core/src/experience/native-memory.ts`.
- [ ] Preserve source refs, source hashes, summaries, scope hints, and agent ids.
- [ ] Deduplicate native memory sources by source hash.
- [ ] Default OpenHuman preferences and personal memories to `scope=personal`.
- [ ] Treat Hermes skill summaries and curator patches as proposal candidates only.
- [ ] Reject source refs under `kb/`, `skills/`, or `dist/`.
- [ ] Write memory import reports under `.praxisbase/reports/memory/`.
- [ ] Write memory import runs under `.praxisbase/runs/memory-import/`.
- [ ] Add `praxisbase memory import --agent <agent> --source <file> --json`.
- [ ] Add `praxisbase memory refresh --agent <agent> --target <context|instruction-snippet|patch-proposal> --json`.
- [ ] Add tests proving memory import and refresh do not modify stable `kb/` or `skills/`.

## M4: Context Get

- [ ] Implement stage-aware `context get` core logic.
- [ ] Support `diagnosis`, `repair`, `verification`, and `proposal` stages.
- [ ] Enforce default stage budgets.
- [ ] Preserve citations when dropping full object bodies.
- [ ] Return warnings when generated bundles or indexes are missing.
- [ ] Add `praxisbase context get`.
- [ ] Add tests for budget, citations, and no-hard-fail behavior.

## M5: Distill And Watch

- [ ] Implement `distill run` that reads captures and writes reports/proposals/exceptions.
- [ ] Default generated candidates to `scope=personal`.
- [ ] Suggest `scope=project` only when workspace evidence is clear.
- [ ] Never suggest `team` or `org` without explicit marker or reviewer input.
- [ ] Ensure distill reports `changed_stable_knowledge: false`.
- [ ] Add `praxisbase distill run --json`.
- [ ] Add `praxisbase watch --agent <agent> --workspace <path> --once --json`.
- [ ] Add tests for proposal output, exception output, and stable knowledge non-mutation.

## M6: Docs, Seed, And Smoke Flow

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
printf '{"agent":"hermes","kind":"skill_summary","source_ref":"raw-vault://hermes/skill-auth-repair","source_hash":"sha256:hermes1","redacted_summary":"Hermes synthesized an auth repair skill."}' > hermes-memory.json
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js memory import --agent hermes --source hermes-memory.json --json
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js capture finish --agent codex --result success --source-ref raw-vault://codex/session-1 --source-hash sha256:session1 --summary "Fixed a project issue and tests passed." --json
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js distill run --json
node /Users/guanbear/repos/PraxisBase/packages/cli/dist/index.js context get --agent codex --stage diagnosis --query "openclaw auth expired" --json
```

Expected:

- capture is written under `.praxisbase/outbox/captures/`,
- memory import report is written under `.praxisbase/reports/memory/`,
- distill writes report/proposal/exception outputs only,
- context response contains stage, warnings, and citations,
- memory import/memory refresh/capture/watch/distill do not write stable `kb/` or `skills/`.

## Out Of Scope

- GUI, browser extension, IDE plugin, MCP server.
- Vector database or external semantic search.
- Long-running database service or queue worker.
- Deep per-agent plugin frameworks.
- Unreviewed bidirectional live sync with agent-native memories.
- Raw transcript/log/chat storage in Git.
- Direct stable knowledge mutation from memory import, memory refresh, capture, watch, or distill.
