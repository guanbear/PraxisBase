# M25.1 Design: Personal GA Stabilization

## Purpose

M25.1 turns the M25 memory-first lesson layer into a usable personal product loop.

M25 proved that PraxisBase can extract useful OpenClaw lessons from raw memory. It did not yet prove that personal mode is reliable end to end across local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi. The remaining failures are not isolated bugs. They are gaps in the product contract:

- useful lessons can be extracted but not all have an auditable destination;
- Codex sessions are too large and noisy for span sampling to recover experience reliably;
- trusted remote OpenClaw still repeats privacy blockers instead of abstracting reusable lessons;
- generated HTML shows signals, but not always as a clear operator workflow;
- agent consumption exists through CLI, GBrain, AgentMemory, and skills, but the authority boundary is not explicit enough for daily use;
- success is measured by counts instead of golden end-to-end quality.

M25.1 defines personal GA as a hard contract:

```text
local OpenClaw + trusted remote OpenClaw + Codex app + codex-cliproxyapi raw evidence
  -> normalized source inventory
  -> memory-first and session-aware selection
  -> mandatory AI lesson extraction when production AI is configured
  -> privacy abstraction and scope classification
  -> complete lesson disposition
  -> personal wiki / skill / runtime context outputs
  -> HTML review surface
  -> agent consumption through PB CLI, exported skills, GBrain, or AgentMemory
  -> golden validation and cache-aware reruns
```

## Why Previous Iterations Drifted

Previous milestones added many correct components, but they did not force every output to pass through one acceptance contract.

The observed drift patterns:

- **Metric drift:** `deterministic_lessons`, `wiki_ready`, `proposal_candidates`, and `privacy_required` can all improve independently without proving the user can read and reuse the result.
- **Authority drift:** raw distill summaries, sidecar hits, old lesson reports, stable pages, and fresh lessons can compete unless downstream code ranks them consistently.
- **Source-shape drift:** OpenClaw memory behaves like durable notes, while Codex sessions behave like long event streams. One selector cannot treat them the same.
- **Privacy drift:** personal mode should be more automatic, but raw private entities still need abstraction before wiki, skill, site, or backend export.
- **Review drift:** a lesson being `wiki_ready` is not enough if the page was not written, was silently merged, was blocked by a limit, or was only visible as a raw-ish candidate.

M25.1 fixes the drift by making disposition, source-specific selection, privacy abstraction, and golden validation mandatory.

## Non-Goals

- Do not rewrite GBrain, AgentMemory, or MCP servers.
- Do not make GBrain the promotion authority. GBrain remains retrieval and publish infrastructure for PB-approved knowledge.
- Do not create a new raw "agent summary" source type from user-pasted summaries. User-provided OpenClaw summaries remain golden validation targets only.
- Do not auto-promote team knowledge from personal sources.
- Do not copy OpenHuman, SkillClaw, or llm-wiki code or prompts. Borrow mechanisms only.
- Do not optimize for page volume. Fewer, more useful, provenance-backed pages are better than many thin pages.

## Product Acceptance Contract

Personal mode is GA-ready only when one bounded command can prove all of these:

1. Source coverage includes local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi when configured.
2. OpenClaw memory lessons match golden targets such as ACK before slow work, fail-closed delegation honesty, target-machine confirmation, self-test after changes, memory truncation, cache busting, NOCASE collation, voice delivery, and model failover.
3. Codex sessions produce at least one useful lesson or an explicit source-specific no-signal reason, without spending tokens on already analyzed sessions.
4. Every lesson has one final disposition:
   - `promoted_to_wiki`
   - `merged_into_existing_page`
   - `promoted_to_skill`
   - `active_personal_context`
   - `needs_human`
   - `rejected_low_signal`
   - `delayed_by_budget`
   - `blocked_by_privacy`
5. No raw private host, account, token, SSH alias, raw Slack user id, local user path, or credential-like string appears in `kb/`, `skills/`, `dist/`, GBrain export, AgentMemory export, or review cards.
6. Generated HTML lets a person answer:
   - what useful experience was found;
   - where each experience went;
   - what needs review and why;
   - how agents can use the accepted knowledge.
7. Agent consumption paths return promoted or runtime-eligible knowledge with authority labels.
8. Re-running daily on unchanged data uses source/session/lesson caches and does not repeat LLM work.

## Architecture

M25.1 keeps the M25 objects but tightens the flow.

```text
SourceInventoryItem
  -> EvidenceSpan
  -> SourcePlan
  -> SessionPreSummary for long sessions
  -> ExperienceLesson
  -> PrivacyAbstraction
  -> LessonDisposition
  -> Wiki/Skill/Runtime/Backend outputs
  -> PersonalGaReport
```

### Source Normalization

All source adapters must emit normalized metadata:

- `agent`: `openclaw | codex | claude-code | opencode | unknown`
- `source_kind`: `memory_file | tools_file | sqlite_memory | session | report | skill | sidecar_import | generic_file`
- `origin`: `local | trusted_personal_remote | team_git | external`
- `trust`: `local_personal | trusted_remote_personal | team | sidecar`
- `privacy_scope`: `personal | team_candidate`
- `source_ref`
- `source_hash`
- `parser_identity`
- `content_spans`

M25.1 does not need a new schema if existing `SourceInventoryItem` can carry these fields through metadata. It does need tests that assert these fields are present in reports for the four personal sources.

### Session-Aware Pre-Summary

Codex app and codex-cliproxyapi sessions must not go straight from raw session JSONL to lesson extraction by naive span sampling.

The session path becomes:

```text
session source item
  -> session event parser
  -> noise removal
  -> high-value event selection
  -> cached SessionPreSummary
  -> EvidenceSpan-backed lesson extraction
```

The pre-summary keeps:

- user directives and stable preferences;
- agent failures and recovery;
- code/config changes followed by verification;
- repeated corrections from the user;
- decisions, rationale, and rejected approaches;
- explicit lessons, pitfalls, and "next time" statements.

It removes:

- system/developer prompts;
- tool schema dumps;
- long command output unless it contains a failure signature;
- repeated progress chatter;
- raw private values that can be abstracted before model input;
- one-off run metadata with no reusable action.

The pre-summary cache key includes source hash, parser identity, reducer identity, pre-summary prompt version, model id, privacy profile, and source agent.

### Mandatory Production AI

M25.1 treats AI lesson extraction as mandatory for production personal daily when AI is configured and the user did not request degraded mode.

Allowed modes:

- `production_ai`: uses deterministic extraction plus cached/budgeted LLM lesson extraction.
- `degraded_no_ai`: deterministic only, explicitly marked not production-ready.
- `budget_exhausted`: deterministic plus cached AI results only, with `delayed_by_budget` dispositions for skipped uncached spans.

No hidden LLM calls may occur outside `--max-ai-chunks` or configured daily budget. Cached calls do not count as uncached budget spend but must report cache hits.

### Lesson Disposition

Every lesson must have a disposition record. Disposition is separate from lesson state.

Lesson state answers "how mature is this lesson?" Disposition answers "where did this lesson go in this run?"

Required disposition fields:

- `lesson_id`
- `state`
- `decision`
- `target`
- `reason`
- `blocking_reason`
- `source_refs`
- `source_hashes`
- `privacy_tier`
- `portability`
- `applies_to_agents`
- `applies_to_systems`

Examples:

- `wiki_ready` lesson updated `kb/procedures/confirm-target-machine-before-remote-operation.md`.
- `skill_ready` lesson merged into an existing OpenClaw operating skill proposal.
- `personal_only` environment lesson became `active_personal_context`.
- high-value lesson was `delayed_by_budget` because the uncached AI budget was exhausted.
- private instance fact was `blocked_by_privacy` because abstraction would destroy the lesson.

### Wiki Completeness

`wiki_ready` must not mean "maybe visible somewhere." It must produce one of:

- a written proposal file;
- an update/merge into an existing proposal;
- a stable page update when policy allows promotion;
- an explicit disposition explaining why it was not materialized.

Proposal limits may still exist, but they cannot silently hide ready lessons. When a limit is hit, remaining lessons receive `delayed_by_budget` or `queued_for_next_run` disposition and are visible in HTML.

### Privacy Abstraction And Triage Reuse

Personal mode should aggressively preserve useful lessons by abstracting private details.

Abstraction examples:

- concrete host or SSH alias -> configured trusted private route;
- local path -> local agent config path;
- raw Slack user id -> platform user id at integration boundary;
- account/login string -> configured service account;
- private machine name -> personal remote machine;
- exact token/key -> secret reference, never copied.

Triage reuse is keyed by a privacy signature, not by full raw text, so recurring private details do not create a fresh queue every day.

Team mode only accepts `team_allowed` safe claims. `personal_only` and `private_instance` remain blocked unless explicitly imported and reviewed.

### HTML Review Surface

The personal homepage and review page must show an experience-centric view:

- source health by agent;
- lesson quality summary;
- golden validation score;
- disposition counts;
- review queue;
- privacy blockers grouped by reusable privacy signature;
- agent consumption status for CLI context, exported skills, GBrain, and AgentMemory.

The page should not expose long raw excerpts by default. Provenance should show source, span, line, heading, hash, and a short redacted summary.

### Agent Consumption

PB owns synthesis and governance. Backends serve knowledge.

- `praxisbase context get` returns stable pages, promoted skills, and runtime-eligible personal lessons with authority labels.
- `praxisbase skill export` exports promoted skills and optionally reviewable local drafts when explicitly requested.
- GBrain receives stable PB pages and promoted skills for retrieval/MCP use.
- AgentMemory receives stable PB knowledge or bounded runtime memory payloads only when explicitly configured.

The user-facing rule:

```text
PB decides what the knowledge means and whether it is safe.
GBrain/AgentMemory help agents find or remember approved knowledge.
```

## Golden Validation

M25.1 promotes golden validation from optional test coverage to the personal GA gate.

Golden targets are derived from raw OpenClaw memory/session/log fixtures, not from agent-generated summaries.

Minimum target groups:

- local OpenClaw runtime and routing lessons;
- local OpenClaw memory management lessons;
- local OpenClaw user-experience lessons;
- local OpenClaw technical detail lessons;
- trusted remote OpenClaw delivery/operation lessons;
- trusted remote OpenClaw infrastructure privacy abstraction lessons;
- Codex/codex-cliproxyapi session-derived repair and collaboration lessons.

The report must show:

- matched target ids;
- missed target ids;
- leakage scan result;
- source refs and span ids for each match;
- cache hits/misses;
- whether the run is production-ready.

## Implementation Boundaries

Expected code areas:

- `packages/core/src/experience/*` for source normalization, pre-summary, lesson extraction, state, disposition, and reports.
- `packages/core/src/wiki/*` for wiki completeness and proposal routing.
- `packages/core/src/skill*` or existing skill synthesis modules for skill-ready disposition.
- `packages/core/src/context*` for authority-labeled agent context.
- `packages/core/src/render*` or existing site modules for HTML visibility.
- `packages/cli/src/*` for personal GA smoke command and flags.
- `tests/core/*` for source fixtures, golden validation, cache, privacy, wiki, skill, context, and CLI coverage.

Expected docs:

- OpenSpec proposal/design/tasks;
- BDD feature;
- implementation plan;
- real smoke status after implementation.

## Acceptance

M25.1 is accepted only after:

1. focused tests cover all M25.1 BDD scenarios;
2. full `pnpm test -- ...` passes with no changed-code failures;
3. a bounded no-AI degraded smoke proves deterministic path and no leakage;
4. a bounded AI smoke with GLM-4.7 or configured production model proves cache-aware lesson extraction;
5. a real personal daily over configured local/remote personal sources produces a Personal GA report marked production-ready or gives exact blocking reasons;
6. generated HTML clearly shows useful experience, disposition, review, privacy, and agent consumption status;
7. no runtime/generated `.praxisbase/` or `dist/` files are committed.
