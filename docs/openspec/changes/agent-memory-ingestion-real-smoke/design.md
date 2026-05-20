# Agent Memory Ingestion Real Smoke OpenSpec Design

## Overview

M12 adds a safe ingestion layer in front of the existing PraxisBase wiki compiler.

```text
Codex archived sessions      OpenClaw logs / episodes
explicit allowlisted roots   explicit allowlisted roots
        |                            |
        v                            v
agent memory scan -> candidate descriptors
        |
        v
agent memory ingest -> redacted summaries + source hashes
        |
        +--> .praxisbase/raw-vault/refs/*.json
        +--> .praxisbase/outbox/captures/*.json
        +--> .praxisbase/reports/memory-ingest/*.json
        +--> .praxisbase/runs/memory-ingest/*.json
        |
        v
existing wiki compile -> graph -> build-site -> context get
```

The importer does not create stable knowledge. It creates protocol evidence that the M7-M11 wiki compiler already knows how to collect. Stable knowledge still changes only through proposal, review, and promote.

## Source Types

### Codex Archived Session

Default profile hint:

```text
~/.codex/archived_sessions
```

Supported first-pass formats:

- `.json`
- `.jsonl`
- `.md`
- `.txt`

The parser is intentionally tolerant. It extracts a bounded text view from known JSON fields when present, otherwise from raw text. It then derives:

- commands run,
- tests/checks mentioned,
- changed-file paths when visible,
- final outcome phrases,
- short task summary.

The importer stores only a redacted summary and metadata. It must not store the full session body.

### OpenClaw Log Or Episode

Default profile hints:

```text
raw-vault://openclaw/episodes/
log://openclaw/
.openclaw/
```

The first implementation should accept explicit local paths passed by the user. It may classify logs with existing OpenClaw signature helpers when text is available:

- `openclaw:claude-auth-expired`
- `openclaw:workspace-lock-stuck`
- `openclaw:node-runtime-missing`
- `openclaw:unknown`

The summary should include the detected signature, safe symptoms, outcome, and verification hints when present.

## Protocol Objects

### AgentMemoryCandidate

Scan output only; not written as authority.

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

Written to `.praxisbase/reports/memory-ingest/<id>.json`.

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

### Raw Vault Ref

Written to `.praxisbase/raw-vault/refs/<id>.json`.

```json
{
  "id": "raw_ref_codex_session_abc",
  "protocol_version": "0.1",
  "type": "raw_vault_ref",
  "agent": "codex",
  "kind": "codex_session",
  "source_ref": "raw-vault://codex/session-abc",
  "source_hash": "sha256:...",
  "redacted_summary": "Implemented M9-M11 wiki graph retrieval, site rendering, and health lint. pnpm check passed.",
  "scope_hint": "personal",
  "created_at": "2026-05-20T00:00:00.000Z"
}
```

## Commands

### `praxisbase memory scan`

Purpose: discover candidate memory files and return JSON.

Required options:

- `--agent codex|openclaw`

Optional options:

- `--source <path>` repeatable; explicit source file or directory.
- `--limit <n>` default 20.
- `--since <iso-date>` optional timestamp filter.
- `--json`

Behavior:

- Does not write files.
- Uses adapter profile default roots only when no `--source` is provided and the path exists.
- Skips unsupported extensions.
- Caps per-file read size.
- Returns candidate descriptors plus warnings.

### `praxisbase memory ingest`

Purpose: write safe protocol evidence from discovered candidates.

Required options:

- `--agent codex|openclaw`

Optional options:

- `--source <path>` repeatable.
- `--dry-run` default true unless `--write` is present.
- `--write`
- `--limit <n>` default 20.
- `--scope personal|project|team` default personal for Codex and project for OpenClaw logs.
- `--json`

Behavior:

- Dry-run returns an ingest report without writing outputs.
- Write mode writes raw-vault refs and capture records.
- Native `memory import` reports are not written by this command; M12 writes dedicated memory-ingest reports so imported evidence stays separate from durable user preference/skill memory.
- Duplicate source hashes are reported and not imported twice.
- Unsafe summaries write human-required exceptions.

### `praxisbase smoke real-wiki`

Purpose: prove the local ingestion and wiki loop on real protocol evidence.

Options:

- `--agent codex|openclaw`
- `--source <path>` repeatable.
- `--query <text>` default inferred from imported summaries.
- `--json`

Behavior:

Runs:

1. `memory ingest --write`,
2. `wiki compile --review`,
3. `wiki graph`,
4. `wiki build-site`,
5. `context get`.

The command returns a single JSON report with output paths and counts. It still does not promote proposals.

## Safety Rules

- Raw source body is read only long enough to hash and summarize.
- Raw body is never written to `kb/`, `skills/`, `dist/`, reports, captures, or raw-vault refs.
- Summaries are capped at 1200 characters.
- Source files over the default byte cap are skipped with a warning unless the user passes an explicit larger cap.
- Private material patterns reuse `containsPrivateMaterial`.
- Raw log-like material may be summarized only when the summary is redacted and bounded.
- All writes use existing file-store helpers.
- Ingest commands must report `changed_stable_knowledge: false`.

## Error Handling

- Missing source roots produce warnings, not hard failures.
- Unsupported file formats are skipped with `unsupported_format`.
- Unreadable files are skipped with `read_failed`.
- Duplicate hashes increment `duplicates`.
- Private-looking material increments `unsafe` and writes a human-required exception in write mode.
- If every candidate is skipped, the command exits successfully with `imported: 0` and warnings.

## Testing Strategy

- Unit tests use temporary directories and fixture sessions/logs.
- Tests verify scan dry-run writes nothing.
- Tests verify ingest write mode writes raw-vault refs and captures only.
- Tests verify raw transcript text does not appear in any written JSON.
- Tests verify duplicate hashes are skipped.
- Tests verify unsafe content writes exceptions.
- Tests verify real smoke produces wiki compile, graph, site, and context reports without stable knowledge mutation.
