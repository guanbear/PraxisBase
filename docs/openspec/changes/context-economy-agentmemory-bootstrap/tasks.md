# Tasks

## M16 Context Economy

- [x] Add context reducer schemas, built-in rules, and deterministic reduction actions.
- [x] Add source/tool normalization for command, argv, stdout, stderr, combined text, exit code, and metadata.
- [x] Add specificity-based rule classification and pass-through safety for tiny inputs, poor compression ratio, file-content inspection commands, and failed command output.
- [x] Add reducer version, rule-set hash, reduction hash, matched rule, facts, and warnings to reduction results.
- [x] Add built-in rule families for Codex sessions, OpenClaw logs, command output, test output, git output, agentmemory-shaped memories, JSON/JSONL, and generic fallback.
- [x] Add deterministic user/project rule overlay by rule id and diagnostics for invalid regex.
- [x] Add user/project rule overlay loading from disk.
- [x] Insert reducer before chunking and AI distill in daily/source ingestion.
- [x] Ensure reducer version/rule-set changes cannot silently reuse stale AI distill cache entries.
- [x] Add `context_economy` report fields and compact reducer debug reports.
- [x] Add a `--no-context-economy` or equivalent bypass for debugging.
- [x] Run focused reducer/daily tests.

## M17 AgentMemory Interop

- [ ] Add an agentmemory REST client with health, latest memories, smart-search, sessions, and remember operations.
- [ ] Extend source config and source CLI for `source_type=agentmemory`.
- [ ] Add `praxisbase agentmemory doctor/import/export` commands.
- [ ] Add optional `context get --with-agentmemory` sidecar retrieval with PraxisBase stable wiki authority ranking first.

## M18 Personal Bootstrap UX

- [ ] Add `praxisbase personal init/connect/doctor/run/schedule` commands.
- [ ] Extend generated site model and HTML with context economy and agentmemory health summaries.
- [ ] Extend generated agent Skill/instructions with first-run and sidecar retrieval guidance.

## Verification

- [ ] Add unit, CLI, and e2e tests for reducer, agentmemory adapter, personal bootstrap, retrieval ranking, and site summaries.
- [ ] Run `pnpm check`.
- [ ] Run a real local personal smoke without committing generated `kb/`.
