# Design: M25.1 Personal GA Stabilization

## Overview

M25.1 is a convergence change. It does not introduce another knowledge backend. It makes existing PraxisBase personal mode prove the end-to-end knowledge loop from raw evidence to human-readable pages and agent-usable knowledge.

The central invariant:

```text
No personal GA output can bypass ExperienceLesson, privacy abstraction, disposition, and authority labeling.
```

## Data Flow

```text
SourceInventoryItem
  -> EvidenceSpan
  -> SourcePlan
  -> SessionPreSummary
  -> ExperienceLesson
  -> LessonDisposition
  -> WikiCandidate | SkillCandidate | RuntimeLesson | BackendPublishPayload
  -> PersonalGaReport
```

Existing M25 objects remain valid. M25.1 adds missing control surfaces around them.

## Source Normalization

All personal sources must report normalized source identity:

- `agent`: `openclaw | codex | claude-code | opencode | unknown`
- `source_kind`: `memory_file | tools_file | sqlite_memory | session | report | skill | sidecar_import | generic_file`
- `origin`: `local | trusted_personal_remote | team_git | external`
- `trust`: `local_personal | trusted_remote_personal | team | sidecar`
- `privacy_scope`: `personal | team_candidate`
- `source_ref`
- `source_hash`
- `parser_identity`
- `content_spans`

The Personal GA report groups source coverage by agent and source kind. Missing configured sources are blockers only when the user explicitly enabled the source.

## Session Pre-Summary

Codex-style sessions are event streams. The pre-summary stage exists to reduce noise before lesson extraction while keeping span provenance.

Input:

- Codex app JSONL sessions;
- codex-cliproxyapi JSONL sessions;
- later Claude Code/OpenCode session adapters through the same interface.

Retain:

- explicit user instructions, corrections, and preferences;
- failures, repairs, and verification;
- repeated mistakes;
- decisions and rationale;
- successful procedure sequences;
- tool failures only when they change the lesson.

Drop:

- system and developer prompt text;
- tool schemas;
- long successful command output;
- repeated progress chatter;
- one-off metadata;
- raw private values after abstraction.

Cache identity:

- `source_hash`
- `parser_identity`
- `reducer_identity`
- `pre_summary_prompt_version`
- `model_id`
- `privacy_profile`
- `agent`

Pre-summary output must be represented as evidence-backed spans or span groups. It is not stable knowledge.

## Production AI Semantics

M25.1 daily has three modes:

- `production_ai`: AI configured, not degraded, and uncached LLM lesson extraction is allowed within budget.
- `degraded_no_ai`: user asked for `--no-ai` or degraded mode; deterministic-only output is allowed but not production-ready.
- `budget_exhausted`: cached AI and deterministic output are used; uncached skipped work receives `delayed_by_budget` disposition.

Rules:

- No hidden uncached LLM calls outside the configured budget.
- AI extraction cache hits are allowed and reported.
- A production-ready Personal GA report requires `production_ai` unless all configured sources were already covered by valid AI cache entries.
- Deterministic extraction remains a fallback and smoke aid, not the sole production-quality path.

## Lesson Disposition

M25.1 adds a disposition record for every lesson in every run.

Required fields:

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

Allowed decisions:

- `promoted_to_wiki`
- `merged_into_existing_page`
- `promoted_to_skill`
- `active_personal_context`
- `needs_human`
- `rejected_low_signal`
- `delayed_by_budget`
- `blocked_by_privacy`
- `queued_for_next_run`

Disposition is written to a report and rendered in HTML. It must include all `wiki_ready`, `skill_ready`, `active_personal`, `candidate`, and `human_required` lessons.

## Wiki Completeness

Wiki curation must consume latest lesson output and produce a disposition for every wiki-eligible lesson.

If proposal limits prevent materialization, the skipped lesson receives `queued_for_next_run` or `delayed_by_budget` with the exact limit reason. The HTML review page shows those queued lessons separately from human-required review.

Generated proposal pages remain topic-based. They must include:

- when to use;
- action or procedure;
- verification;
- negative case;
- applies-to agents/systems;
- portability and privacy tier;
- related links;
- compact span provenance.

Raw excerpts stay hidden by default.

## Privacy Abstraction And Triage Reuse

Personal mode abstracts before blocking.

Abstraction classes:

- host/IP/SSH alias -> configured private route;
- local path -> local agent config path;
- raw Slack user id -> platform user id at integration boundary;
- account/login -> configured service account;
- private machine name -> personal remote machine;
- secret/token/key -> secret reference and human-required or reject.

Triage reuse uses a privacy signature that survives timestamp and path noise. A repeated blocker should not create a new human-required item every daily run unless the class or risk changes.

Team mode remains stricter: `personal_only` and `private_instance` do not enter team wiki, team skills, team GBrain, or team AgentMemory.

## HTML Experience View

The generated site adds a personal experience view to the homepage/review page.

Required sections:

- source coverage by agent and source kind;
- lesson quality and golden validation;
- disposition counts and queued lessons;
- review queue with concrete actions;
- privacy blockers grouped by signature;
- agent consumption status for PB context, skills, GBrain, and AgentMemory.

The view must answer "what did PB learn and how can I or an agent use it?"

## Agent Consumption

Agent-facing outputs must label authority:

- `stable_pb_page`
- `promoted_skill`
- `active_personal_lesson`
- `gbrain_sidecar`
- `agentmemory_sidecar`
- `raw_audit`

Stable PB pages and promoted skills outrank personal lesson hits. Sidecar hits are never promotion evidence until imported and processed through PB.

## Personal GA Report

Add a report object that summarizes:

- mode: `production_ai | degraded_no_ai | budget_exhausted`;
- source coverage;
- lesson counts;
- disposition counts;
- golden validation;
- privacy leakage scan;
- cache hits/misses;
- HTML output paths;
- agent consumption status;
- `production_ready: boolean`;
- `blocking_reasons: string[]`.

The CLI should expose this through personal daily JSON and a direct validation command or flag.

## Testing

Test in layers:

- source normalization fixtures for the four personal source families;
- Codex session pre-summary cache and noise removal;
- production AI mode budget semantics;
- disposition completeness;
- wiki completeness under proposal limits;
- privacy abstraction and triage reuse;
- HTML experience rendering;
- context/backend authority labels;
- golden validation and real smoke report parsing.

## Migration

Existing M25 reports remain readable. M25.1 adds new report fields rather than deleting old ones. Code that only knows M25 can ignore M25.1 disposition and Personal GA sections.
