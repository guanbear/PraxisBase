# Design: M26 Personal GA Cut

## Product Boundary

M26 resolves the current contradiction between PB-core readiness and GBrain-first runtime positioning.

PraxisBase is the governed compiler for agent experience:

- source inventory and span provenance;
- privacy abstraction and scope classification;
- lesson extraction and stability routing;
- wiki and skill synthesis;
- semantic review, validation, audit, and promotion;
- HTML governance dashboard and release audit.

GBrain is the preferred long-term runtime brain:

- broad retrieval, graph search, MCP access, and agent-facing lookup;
- storage and indexing of stable PB exports;
- source scoping for personal/team runtime access.

The authority rule is unchanged:

```text
PB stable wiki / promoted skills > active personal lessons > GBrain sidecar > AgentMemory sidecar > raw audit
```

GBrain can store and retrieve PB outputs. It cannot promote PB candidates, replace PB privacy gates, or turn raw evidence into stable PB knowledge by itself.

## Release Gates

### Gate 1: PB Wiki/Context GA

Gate 1 proves PB can turn real personal agent evidence into usable wiki/context.

Required inputs:

- local OpenClaw memory and reports;
- trusted remote OpenClaw memory/export/report staging;
- Codex app sessions and archives;
- codex-cliproxyapi sessions.

Required outputs:

- stable personal wiki pages, or active personal lessons when wiki promotion is intentionally queued;
- PB context for both OpenClaw and Codex;
- HTML showing learned items, source coverage, privacy blockers, and next commands.

Hard failures:

- production AI unavailable and no valid cache;
- high-priority source queue not drained or resumable;
- no stable wiki or active personal lesson;
- PB context unavailable;
- true privacy leak in stable wiki/context;
- raw dreaming/corpus/session bodies used as stable wiki content.

Warnings:

- AgentMemory unavailable;
- GBrain publish not requested;
- old historical human-required backlog;
- proposal queue limits when at least one usable PB output exists.

### Gate 2A: PB Skill Compiler GA

Gate 2A proves PB can compile stable agent skills from governed PB knowledge.

Allowed skill inputs:

- stable PB wiki pages with procedure/known-fix/preference/pitfall kind;
- approved or `skill_ready` lesson clusters with safe or abstracted personal privacy;
- active personal lessons only when the generated skill remains personal and passes leak checks.

Forbidden skill inputs:

- raw transcripts;
- raw logs;
- dreaming/dream-diary/session-corpus rows;
- untriaged remote staging files;
- legacy distilled summaries unless explicitly marked degraded and excluded from stable promotion;
- GBrain or AgentMemory sidecar hits that were not imported into PB evidence.

Required pipeline:

```text
skill signal collection
  -> stable-only source filter
  -> clustering and update-before-create decision
  -> skill candidate synthesis
  -> shape validation
  -> one-shot auto-repair for structural defects
  -> semantic skill review
  -> final validation
  -> promotion audit
  -> stable skills/**
  -> skill inject-preview
```

Gate 2A passes only when at least one real promoted skill is injectable for a realistic personal agent query. Candidate-only output does not pass.

### Gate 2B: GBrain Runtime GA

Gate 2B proves PB outputs are usable through the preferred agent runtime.

Required behavior:

- GBrain local or remote config is present and doctor is healthy enough for publish/query.
- PB exports only stable wiki pages and promoted skills to GBrain source `praxisbase`.
- Exported pages include PB metadata: `generated_by`, `praxisbase_kind`, `praxisbase_path`, source hashes, scope, maturity, and publish timestamp.
- Export excludes `.praxisbase/inbox/**`, `.praxisbase/exceptions/**`, raw evidence, rejected material, human-required material, untriaged private material, and candidate skills.
- `context get --with-gbrain` returns GBrain sidecar hits after PB stable results.
- When MCP is available, GBrain MCP search/query can find PB-published wiki or skill entries.

GBrain publish or retrieval failure fails Gate 2B but does not invalidate Gate 1 or Gate 2A. This separation prevents GBrain runtime issues from being misdiagnosed as PB compiler failures.

## Full Personal Queue Semantics

"Full" must not mean unlimited token spend. It means the high-priority personal evidence queue is covered by a resumable, cache-aware plan.

Queue priority:

1. native memory files and sqlite long-term memory;
2. TOOLS/config memory;
3. trusted remote OpenClaw staged memory/report/export evidence;
4. verified reports and repeated failures;
5. Codex/codex-cliproxyapi sessions with explicit user corrections, fixes, verification, or durable preferences;
6. ordinary logs;
7. sidecar imports.

The full queue report records:

- planned source items;
- selected spans;
- processed spans;
- cache hits;
- uncached AI calls;
- skipped low-priority items;
- remaining high-priority items;
- resume token or ledger state.

Gate 1 can pass with low-priority items remaining. It cannot pass while required high-priority memory/session sources are unprocessed unless the blocker is explicit and actionable.

## Release Audit

Add a release audit report and command:

```bash
praxisbase personal release-audit --json
```

The report shape:

```json
{
  "ok": true,
  "personal_ga": "pass",
  "wiki_context_ga": "pass",
  "skill_compiler_ga": "pass",
  "gbrain_runtime_ga": "pass",
  "blocking_reasons": [],
  "warnings": [],
  "evidence_reports": [],
  "next_commands": []
}
```

The audit reads current stable files and latest reports rather than rerunning expensive stages by default. It may offer `next_commands` for missing evidence, such as daily run, skill validation/promote, GBrain export, or site rebuild.

## HTML Contract

The generated site must answer five questions without reading raw reports:

1. What stable personal wiki pages exist?
2. What active personal lessons are usable but not stable?
3. What promoted skills exist and which queries inject them?
4. What was published to GBrain, and what failed?
5. What exact command clears each blocker?

The page must visually and semantically separate:

- stable wiki;
- active personal context;
- promoted skills;
- pending wiki candidates;
- pending skill candidates;
- rejected/low-signal items;
- privacy blockers;
- GBrain publish/retrieval status.

Pending candidates must not be presented as stable knowledge.

## Privacy And Leak Rules

Personal mode may use safe abstracted personal lessons. It must not leak:

- tokens, keys, passwords, private keys;
- concrete private hostnames, IPs, SSH aliases, local user paths, account names, raw user IDs;
- untriaged remote staging paths;
- raw transcripts or long excerpts.

Stable outputs may include abstract forms such as "configured private route", "target machine", "platform user id at the integration boundary", or "local agent config path".

Team mode remains out of M26 scope and must not inherit personal auto-release behavior.

## Failure Handling

- Gate 1 fails: fix PB ingestion, lesson extraction, privacy abstraction, wiki/context, or full queue coverage.
- Gate 2A fails: fix skill source filtering, synthesis, repair, review, validation, promotion, or injection.
- Gate 2B fails: fix GBrain config, publish, export filtering, source selection, query, or MCP setup.
- AgentMemory fails: warning only in M26 unless the user explicitly runs an AgentMemory command.
- Semantic review unavailable: no auto-promotion; gate fails only if it prevents the required promoted output.

## Implementation Guardrails

M26 must not add another parallel pipeline.

Required source of truth:

- lessons remain the semantic unit for wiki/context;
- stable `kb/**` and promoted `skills/**` remain the only exportable PB artifacts;
- release audit is the only final readiness signal;
- GBrain is runtime access and storage, not PB promotion evidence.

Any implementation that makes candidates, sidecar hits, raw evidence, or historical reports count as stable personal GA output violates M26.
