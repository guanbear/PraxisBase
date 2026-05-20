# Agent Memory Ingestion Real Smoke Tasks

M12 depends on M7-M11 wiki compiler behavior. It should be implemented after `wiki compile`, `wiki graph`, `wiki build-site`, `context get`, and wiki lint are green.

## M12: Agent Memory Ingestion And Real Smoke

- [ ] Add protocol paths for `.praxisbase/reports/memory-ingest` and `.praxisbase/runs/memory-ingest`.
- [ ] Add schemas for agent memory candidates, ingest reports, and raw-vault ref records if existing schemas are not sufficient.
- [ ] Add `packages/core/src/experience/agent-memory.ts`.
- [ ] Implement `scanAgentMemory(root, input)` for Codex and OpenClaw.
- [ ] Expand `~` only for known adapter profile roots or explicit user-provided `--source` paths.
- [ ] Support `.json`, `.jsonl`, `.md`, `.txt`, and `.log` inputs.
- [ ] Cap per-file reads and report skipped oversized files.
- [ ] Compute deterministic `source_hash` from raw source content.
- [ ] Generate stable `source_ref` values using `raw-vault://codex/...` or `log://openclaw/...`.
- [ ] Extract bounded redacted summaries for Codex sessions.
- [ ] Extract bounded redacted summaries and problem signatures for OpenClaw logs.
- [ ] Reuse existing privacy/raw guards before writing any summary.
- [ ] Deduplicate by source hash across previous raw-vault refs, capture artifacts, and memory import reports.
- [ ] Implement `ingestAgentMemory(root, input)` with dry-run and write modes.
- [ ] In write mode, write `.praxisbase/raw-vault/refs/*.json`.
- [ ] In write mode, write `.praxisbase/outbox/captures/*.json`.
- [ ] Write `.praxisbase/reports/memory-ingest/*.json` and `.praxisbase/runs/memory-ingest/*.json`.
- [ ] Ensure all ingest reports include `changed_stable_knowledge: false`.
- [ ] Add CLI `praxisbase memory scan --agent <agent> --json`.
- [ ] Add CLI `praxisbase memory ingest --agent <agent> --write --json`.
- [ ] Add CLI `praxisbase smoke real-wiki --agent <agent> --json`.
- [ ] Real smoke must run memory ingest, wiki compile review, wiki graph, wiki build-site, and context get.
- [ ] Real smoke must report counts for scanned, imported, duplicates, unsafe, proposal candidates, graph nodes, graph broken links, site pages, and context items.
- [ ] Add tests for Codex scan dry-run.
- [ ] Add tests for Codex ingest write mode.
- [ ] Add tests proving raw session text is not written.
- [ ] Add tests for OpenClaw log signature extraction.
- [ ] Add tests for duplicate source hash skip.
- [ ] Add tests for private material exception routing.
- [ ] Add tests for real smoke no stable `kb/` or `skills/` mutation.

## Required Verification

```bash
pnpm check
git diff --check
```

## Manual Smoke

The implementation must document and support this shape:

```bash
pnpm build
node packages/cli/dist/index.js memory scan --agent codex --source ~/.codex/archived_sessions --limit 5 --json
node packages/cli/dist/index.js memory ingest --agent codex --source ~/.codex/archived_sessions --limit 5 --write --json
node packages/cli/dist/index.js wiki compile --review --json
node packages/cli/dist/index.js wiki graph --json
node packages/cli/dist/index.js wiki build-site --json
node packages/cli/dist/index.js context get --agent codex --stage repair --query "wiki compile" --json
```

Expected:

- scan reports candidates without writes,
- ingest writes protocol evidence only,
- compile writes proposal candidates and state only,
- graph/site/context commands succeed,
- stable `kb/` and `skills/` are unchanged unless the user separately reviews and promotes proposals.

## Out Of Scope

- Automatic background watchers.
- Direct stable knowledge writes.
- Full transcript storage in Git.
- Online LLM summarization as a required path.
- Vector search or database-backed retrieval.
