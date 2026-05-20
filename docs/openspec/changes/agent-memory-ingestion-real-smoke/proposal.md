# OpenSpec Change: Agent Memory Ingestion Real Smoke

## Why

M7-M11 prove that PraxisBase can compile reviewed knowledge, safe evidence summaries, graph links, retrieval context, and a static wiki site. The remaining gap is realistic input: a fresh repository often has no `kb/`, no promoted captures, and no native memory report. The project therefore cannot yet prove, with real local agent material, that it can bootstrap useful wiki candidates from Codex/OpenClaw experience.

PraxisBase already defines adapter profiles, capture records, native memory reports, raw-vault refs, wiki compile, review/promote, and site generation. M12 connects those pieces with safe importers and smoke flows:

1. discover allowlisted local Codex/OpenClaw memory sources,
2. extract bounded redacted summaries and source hashes,
3. write protocol evidence objects only,
4. run compile/build/context smoke without direct stable knowledge mutation.

## What Changes

- Add a small agent memory ingestion layer for Codex archived sessions and OpenClaw logs/episode refs.
- Add explicit scan and ingest commands that default to dry-run and never copy raw transcripts/logs into Git.
- Add raw-vault ref writers for `source_ref`, `source_hash`, `redacted_summary`, agent, kind, scope, and created time.
- Add capture/native-memory candidates from imported summaries.
- Add a real smoke command or documented command sequence that runs ingestion, wiki compile, graph, site build, and context retrieval against real protocol objects.
- Add lint/safety reporting for skipped files, oversized files, private-looking material, unreadable paths, duplicates, and unsupported native formats.
- Add BDD and TDD coverage for Codex ingest, OpenClaw ingest, dedupe, privacy rejection, no stable writes, and end-to-end real smoke.

## Non-Goals

- Do not automatically promote imported material into `kb/` or `skills/`.
- Do not copy raw Codex sessions, OpenClaw logs, Feishu chats, terminal transcripts, tokens, cookies, credentials, or private keys into Git.
- Do not scan the entire home directory or arbitrary filesystem paths by default.
- Do not require an online LLM, vector database, daemon, MCP server, GUI, or browser extension.
- Do not overwrite Codex/OpenClaw native memory, instructions, or runtime state.
- Do not treat imported summaries as stable team knowledge without review/promote.
- Do not infer `team`, `org`, or `global` scope from personal local sessions unless explicitly requested and reviewed.

## Acceptance Summary

- `memory scan` can discover Codex/OpenClaw candidate sources from explicit allowlisted roots and return JSON without writing files.
- `memory ingest` writes only `.praxisbase/raw-vault/refs/*.json`, `.praxisbase/outbox/captures/*.json`, `.praxisbase/reports/memory-ingest/*.json`, `.praxisbase/runs/memory-ingest/*.json`, and human-required exceptions when unsafe material is found.
- Ingestion preserves `source_ref` and deterministic `source_hash`.
- Ingestion deduplicates by source hash across previous raw-vault refs, captures, existing memory import reports, and M12 memory-ingest reports.
- Private/raw-looking material is skipped or routed to `.praxisbase/exceptions/human-required/`.
- Imported summaries are redacted, bounded, and suitable for wiki compile as evidence.
- `wiki compile --review` can turn imported summaries into proposal candidates without stable writes.
- A real smoke flow produces graph/site/context outputs and reports counts for imported, skipped, duplicate, unsafe, proposal, page, graph, and context items.
- `pnpm check` and `git diff --check` pass.

## Guardrails For Implementing Agents

- Keep raw source paths outside stable knowledge and generated `dist/`.
- Use `safePath` for workspace-relative reads and explicit allowlist expansion for home/profile paths.
- Hash the raw source content or a stable canonical source descriptor; never hash only the summary.
- Store only redacted summaries and source metadata in Git.
- Route uncertainty to exceptions and warnings; do not silently drop unsafe material.
- Keep command wrappers thin; core ingestion behavior belongs in `@praxisbase/core`.
- Do not add hidden background scanning. Every ingest must be user-invoked and report what was read.
