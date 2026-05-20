# Agent Memory Ingestion Real Smoke Design

## Goal

M12 lets PraxisBase prove the wiki loop with real local agent material instead of only synthetic fixtures. It adds safe importers for Codex archived sessions and OpenClaw logs/episodes, then runs a real smoke path through the existing M7-M11 wiki compiler.

The design deliberately keeps imported material as evidence, not authority. Raw sessions and logs stay outside Git-stable knowledge. PraxisBase stores only redacted summaries, source refs, source hashes, reports, and capture records. Stable `kb/` and `skills/` still change only through proposal, review, and promote.

## Context

Existing pieces:

- Adapter profiles already name Codex and OpenClaw source hints.
- `capture finish` can write `.praxisbase/outbox/captures/*.json`.
- `memory import` can write native memory reports from a JSON descriptor.
- `collectWikiSources` already reads captures, memory reports, episodes, proposals, reviews, stable knowledge, and raw-vault refs.
- `wiki compile --review` can create proposal candidates from safe summaries.
- `wiki graph`, `wiki build-site`, and `context get` can consume the compiled knowledge surface.

Missing piece:

- A deterministic, user-invoked importer that scans local Codex/OpenClaw material and turns it into safe protocol evidence without copying raw source bodies into Git.
- Non-local OpenClaw memory is intentionally split into M12.1 `openclaw-remote-memory-cli`: PraxisBase CLI fetches remote/exported memory into safe staging envelopes, then this M12 ingest layer imports those staged envelopes.

## Architecture

```text
CLI memory scan / memory ingest / smoke real-wiki
        |
        v
packages/core/src/experience/agent-memory.ts
        |
        +--> CodexSessionImporter
        +--> OpenClawLogImporter
        +--> redaction + source hash + dedupe
        |
        v
.praxisbase/raw-vault/refs/*.json
.praxisbase/outbox/captures/*.json
.praxisbase/reports/memory-ingest/*.json
.praxisbase/runs/memory-ingest/*.json
        |
        v
existing wiki compile / graph / build-site / context get
```

The implementation should keep command wrappers thin. Core scan/ingest/smoke logic belongs in `@praxisbase/core`; CLI commands only parse options and format JSON/text output.

## Source Handling

### Codex

Default profile hint:

```text
~/.codex/archived_sessions
```

Accepted explicit source inputs:

- a file ending in `.json`, `.jsonl`, `.md`, `.txt`, or `.log`,
- a directory containing those files.

Codex extraction should be deterministic:

- Read at most a configured byte cap per file.
- Parse JSON/JSONL best-effort when possible.
- Fall back to text extraction for plain Markdown/text logs.
- Extract visible commands, tests, changed paths, final outcome lines, and short task summaries.
- Produce a bounded `redacted_summary`.

### OpenClaw

Default profile hints:

```text
.openclaw/
raw-vault://openclaw/episodes/
log://openclaw/
```

The first implementation should prefer explicit local file/directory sources. When log text is available, it should reuse the existing OpenClaw signature detector:

- `openclaw:claude-auth-expired`
- `openclaw:workspace-lock-stuck`
- `openclaw:node-runtime-missing`
- `openclaw:unknown`

The summary should include safe symptoms, detected signature, outcome, verification hints, and source hash. It must not write raw log lines into captures/reports.

## Data Contracts

### AgentMemoryCandidate

```ts
export interface AgentMemoryCandidate {
  id: string;
  agent: "codex" | "openclaw";
  kind: "codex_session" | "openclaw_log" | "openclaw_episode";
  source_path: string;
  source_ref: string;
  source_hash: string;
  size_bytes: number;
  created_at?: string;
  summary_hint?: string;
  warnings: string[];
}
```

### AgentMemoryIngestReport

```ts
export interface AgentMemoryIngestReport {
  id: string;
  protocol_version: "0.1";
  type: "agent_memory_ingest_report";
  agent: "codex" | "openclaw";
  mode: "dry-run" | "write";
  scanned: number;
  imported: number;
  duplicates: number;
  skipped: number;
  unsafe: number;
  outputs: string[];
  warnings: string[];
  changed_stable_knowledge: false;
  created_at: string;
}
```

### RealWikiSmokeReport

```ts
export interface RealWikiSmokeReport {
  id: string;
  protocol_version: "0.1";
  type: "real_wiki_smoke_report";
  agent: "codex" | "openclaw";
  imported: number;
  duplicates: number;
  unsafe: number;
  proposal_candidates: number;
  graph_nodes: number;
  graph_broken_links: number;
  site_pages: number;
  context_items: number;
  outputs: string[];
  changed_stable_knowledge: false;
  created_at: string;
}
```

## Commands

### `praxisbase memory scan`

Dry discovery command.

```bash
praxisbase memory scan --agent codex --source ~/.codex/archived_sessions --limit 5 --json
praxisbase memory scan --agent openclaw --source .openclaw/logs --limit 5 --json
```

Rules:

- No writes.
- Missing default roots return warnings.
- Explicit unsupported files are skipped with warnings.
- JSON output includes candidates and skipped counts.

### `praxisbase memory ingest`

Evidence writer.

```bash
praxisbase memory ingest --agent codex --source ~/.codex/archived_sessions --limit 5 --write --json
praxisbase memory ingest --agent openclaw --source .openclaw/logs/openclaw.log --write --json
```

Rules:

- Default mode is dry-run unless `--write` is present.
- Write mode writes raw-vault refs, captures, reports, and run records only.
- Every report says `changed_stable_knowledge: false`.
- Duplicate hashes do not produce duplicate captures.

### `praxisbase smoke real-wiki`

End-to-end local smoke.

```bash
praxisbase smoke real-wiki --agent codex --source ~/.codex/archived_sessions --limit 5 --query "wiki compile" --json
```

Runs:

1. `memory ingest --write`,
2. `wiki compile --review`,
3. `wiki graph`,
4. `wiki build-site`,
5. `context get`.

It reports outputs and counts. It does not promote proposals.

## Safety

- The importer never writes raw source body.
- Summaries are capped at 1200 characters.
- Per-file read cap defaults to 512 KiB.
- `containsPrivateMaterial` and raw-log heuristics gate writes.
- Unsafe material writes human-required exceptions in write mode.
- Path traversal is rejected for workspace-relative paths.
- Home paths are expanded only for known adapter profile roots or explicit user-provided sources.
- Source refs use `raw-vault://` or `log://` schemes instead of direct local absolute paths in stable outputs.

## Testing

TDD coverage must include:

- Codex scan dry-run writes nothing.
- Codex ingest writes raw-vault ref and capture only.
- Raw session body is absent from all written JSON.
- OpenClaw log import detects auth-expired signature.
- Duplicate source hash is skipped.
- Private material writes human-required exception.
- Real smoke creates protocol reports, proposal candidates, site output, graph output, and context items.
- Stable `kb/` and `skills/` remain unchanged throughout ingestion and smoke.

## Traceability

- OpenSpec: `docs/openspec/changes/agent-memory-ingestion-real-smoke/`
- BDD: `docs/bdd/agent-memory-ingestion-real-smoke.feature`
- Implementation plan: `docs/superpowers/plans/2026-05-20-agent-memory-ingestion-real-smoke-implementation-plan.md`
- Traceability matrix: `docs/superpowers/plans/2026-05-20-agent-memory-ingestion-real-smoke-traceability.md`
