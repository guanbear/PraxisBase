# Design: M25.2 Personal GA Release Contract

## Release Definition

Personal GA means PraxisBase can, on the user's machine, run a production personal daily loop that:

- reads configured local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi sources when available;
- uses production AI lesson extraction or valid AI cache;
- abstracts personal private references before stable output;
- promotes low-risk high-confidence personal knowledge into stable wiki or active personal context;
- builds HTML showing what was learned;
- serves agent context from PB authority without requiring sidecars.

## Readiness Taxonomy

`personal_ga.production_ready` is true only when all PB core gates pass.

Hard blockers:

- `ai_unavailable`: AI is configured but the production call/cache path cannot run.
- `ai_lesson_extraction_disabled`: degraded/no-AI mode was requested.
- `required_source_unavailable:<agent>:<kind>`: a source explicitly marked required is unavailable.
- `privacy_hard_blocker`: current run contains true secret/key/password or unabstractable private material.
- `no_personal_knowledge_output`: no stable wiki, active personal lesson, or promoted skill was produced or available.
- `agent_context_unavailable`: PB context cannot return stable PB knowledge or active personal lessons.

Warnings, not blockers by default:

- GBrain unavailable.
- AgentMemory unavailable.
- Optional source unavailable.
- Historical human-required backlog.
- Proposal limit queue when at least one usable knowledge output exists.

## Source Requirements

Sources have `required_for_personal_ga` semantics:

- PB core sources default to required when configured: local OpenClaw, trusted remote OpenClaw, Codex app, codex-cliproxyapi.
- Sidecars default to optional: GBrain, AgentMemory.
- The user may explicitly mark any source required later; M25.2 does not add a new CLI flag unless the source config already supports a compatible metadata field.

## Privacy Rule

Personal mode must abstract before blocking:

- host/IP/SSH alias -> configured private route or personal remote machine;
- local path -> local agent config path;
- raw Slack user id -> platform user id at integration boundary;
- account/login name -> configured service account;
- token/key/password/private key -> hard blocker.

The GA report uses current-run privacy blockers, not total historical exception files. Historical backlog can be shown as maintenance debt, but it cannot fail the latest release gate by itself.

## Promotion Rule

In personal mode, low-risk high-confidence lessons are automatically usable:

- `active_personal` lessons go to runtime context.
- `wiki_ready` lessons with safe or abstracted personal privacy and sufficient confidence can auto-promote to stable personal wiki when deterministic and semantic guards pass.
- `skill_ready` lessons can become skill candidates; malformed headings or shape issues should be auto-repaired once before human review.

No team output receives `personal_only` or `private_instance` material without explicit team review.

## HTML And Agent Use

The site must show:

- learned knowledge count and top learned items;
- stable wiki/context/skill availability;
- PB context authority status;
- sidecar status as optional unless required;
- remaining hard blockers and warnings.

Agent context must continue to rank:

```text
stable_pb_page > promoted_skill > active_personal_lesson > sidecar hits > raw audit
```

## Final Acceptance

Final validation runs:

1. Focused unit/integration tests for GA readiness, sidecar downgrade, privacy blocker counting, promotion output, and context availability.
2. `lesson golden --json` with all four personal families.
3. One real production personal daily using GLM-4.7 with bounded budget and cache.
4. HTML and context inspection proving learned knowledge is visible and usable.

If the final daily still returns false, the status report must identify only hard external blockers or true hard privacy blockers. Anything else is an implementation defect.
