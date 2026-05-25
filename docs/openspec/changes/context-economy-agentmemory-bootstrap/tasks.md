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

## M16.1 Experience Fidelity Compression

- [x] Add deterministic experience-fidelity reduction action that preserves goal, command, edit, error, fix, verification, lesson, and provenance lines with nearby context.
- [x] Drop repeated system/developer/tool/AGENTS/skill/environment boilerplate before AI distill without copying OpenHuman GPL code or vendor rules.
- [x] Dedupe repeated paragraph blocks and report counters for preserved signal lines, dropped boilerplate lines, and repeated blocks.
- [x] Upgrade Codex, OpenClaw, and AgentMemory built-in rules to use experience-fidelity compression before bounded head/tail fallback.
- [x] Add focused reducer tests proving reusable experience survives while low-value boilerplate is removed.
- [x] Run focused tests, lint, and a real `daily run --progress` smoke.

## M17 AgentMemory Interop

- [x] Add an agentmemory REST client with health, latest memories, smart-search, sessions, and remember operations.
- [x] Extend source config and source CLI for `source_type=agentmemory`.
- [x] Add `praxisbase agentmemory doctor/import/export` commands.
- [x] Add optional `context get --with-agentmemory` sidecar retrieval with PraxisBase stable wiki authority ranking first.

## M18 Personal Bootstrap UX

- [x] Add `praxisbase personal init/connect/doctor/run/schedule` commands.
- [x] Extend generated site model and HTML with context economy and agentmemory health summaries.
- [x] Extend generated agent Skill/instructions with first-run and sidecar retrieval guidance.

## Verification

- [x] Add unit, CLI, and e2e tests for reducer, agentmemory adapter, personal bootstrap, retrieval ranking, and site summaries.
- [x] Run `pnpm check`.
- [x] Run a real local personal smoke without committing generated `kb/`.
