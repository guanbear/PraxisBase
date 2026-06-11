# M25.2 Personal GA Release Contract Design

## Goal

Make PraxisBase personal mode complete by freezing the release contract: PB core must learn from local/remote personal agent evidence, show the learned knowledge to the human, and serve it to agents without requiring optional sidecars.

## Release Contract

Personal GA passes when a production personal daily run:

- uses production AI extraction or valid AI cache;
- reads configured PB core personal sources;
- abstracts personal private references;
- produces at least one usable PB-authoritative output: stable wiki, active personal context, or promoted skill;
- builds HTML that shows learned knowledge and remaining blockers;
- returns PB-authoritative context to agents.

AgentMemory and GBrain are optional sidecars by default. Their failure is a warning unless explicitly configured as required.

## Hard Blockers

The only hard blockers are:

- `ai_lesson_extraction_disabled`
- `ai_unavailable`
- `required_source_unavailable:<agent>:<kind>`
- `privacy_hard_blocker`
- `no_personal_knowledge_output`
- `agent_context_unavailable`

Historical human-required backlog and optional sidecar failures are warnings, not release blockers.

## Implementation Scope

Modify the existing M25.1 surfaces rather than adding a new pipeline:

- `packages/core/src/experience/personal-ga.ts`
- `packages/core/src/experience/daily.ts`
- privacy abstraction/release helpers used by lesson output
- HTML rendering in `packages/core/src/wiki/render-site.ts`
- focused tests in M25.1/M25 production suites

## Acceptance

Final validation must include focused tests, `lesson golden --json`, one real production personal daily using GLM-4.7 with bounded budget and cache, generated HTML inspection, and `context get` inspection.

After these pass, personal mode is considered complete for the current goal. Future GBrain/AgentMemory improvements are enhancements, not blockers.
