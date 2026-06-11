# Design: M23.1 Skill Governance Hardening

## Boundary

M23.1 hardens the already implemented M23 MVP. It does not introduce a new runtime brain.

```text
source trajectories
  -> PB redaction and envelope adapters
  -> governed proposals + validation reports
  -> review/audit/promote
  -> stable PB wiki + promoted skills + catalog
  -> GBrain MCP runtime brain
  -> optional AgentMemory sidecar/cache
```

PraxisBase remains the authority for stable knowledge. GBrain can retrieve and serve stable PB exports at runtime. AgentMemory can contribute optional source material and sidecar hits, but sidecar hits do not become evidence until imported through PB with source refs, hashes, and privacy review.

## Validation-Gated Promotion

Skill validation remains evidence, not promotion. M23.1 adds a policy gate:

- default personal mode: new stable skill promotion requires user audit and may require validation when policy enables it;
- default team/org/global mode: stable skill promotion requires team Git/human audit and passing validation when policy enables it;
- validation reports must match the candidate id, target path, source hashes, and `decision=pass`;
- stale validation reports are ignored when candidate source hashes changed.

The gate is checked at promotion time. It cannot be bypassed by daily synthesis, semantic review, GBrain export, or AgentMemory export.

## Lifecycle And Validation Queues

Daily reports should surface:

- lifecycle observations and proposal counts by decision: promote, decay, archive, conflict, no-op;
- validation counts by decision: pass, fail, needs_human;
- next commands for `praxisbase lifecycle review`, `praxisbase skill validate`, `praxisbase skill review`, `praxisbase skill promote`, and `praxisbase gbrain export`;
- AgentMemory export/import recommendations only when configured.

HTML should show lifecycle and validation as reviewable queues, not as stable knowledge. Catalog summaries must not inflate pending proposal counts.

## Context Ranking

Context retrieval should rank sources in this authority order:

1. stable PraxisBase wiki pages and promoted skills;
2. PB catalog entries and reviewed PB summaries;
3. GBrain sidecar/MCP search results;
4. AgentMemory sidecar hits when explicitly enabled;
5. raw or staged evidence summaries only in debug/review views.

When the same topic appears in PB stable context and a sidecar hit, the stable PB entry wins. Sidecar hits may be shown as supporting recall but do not count toward promotion evidence.

## Trajectory Adapter Mapping

Adapters should populate only bounded structured fields already accepted by `ExperienceEnvelopeSchema`:

- `trajectory_steps`: concise goal/action/tool/outcome summaries;
- `tool_outcomes`: tool name, result category, failure snippet, verification marker;
- `read_skills` and `modified_skills`: skill paths or ids observed in the source;
- `injected_context`: PB/GBrain/AgentMemory context ids or refs, not raw context bodies;
- `verification_events`: test/build/smoke/human verification strings;
- `skill_effectiveness_hints`: helped, hurt, missing, stale, or ignored.

Raw transcripts and raw logs remain rejected. If a source lacks structured fields, the adapter keeps current behavior and emits no trajectory fields.

## AgentMemory Optionality

AgentMemory can fail in three places: source import, sidecar retrieval, and export. All three are warning-only unless the user explicitly runs a command whose sole purpose is AgentMemory import/export.

Daily and site should distinguish:

- AgentMemory not configured;
- configured but unhealthy;
- configured and healthy;
- export/import skipped because no stable changes exist;
- export/import failed but PB/GBrain work continued.

Team mode must not use personal AgentMemory sidecar hits as team evidence. To become team evidence, the material must enter PB as imported source records with privacy review and team-safe scope.

## Testing Strategy

Use `node:test` and existing CLI/core test patterns:

- promotion policy tests around missing, stale, mismatched, failing, and passing validation reports;
- daily next action tests for lifecycle and validation queues;
- site rendering tests for lifecycle and validation queue cards;
- context ranking tests with duplicate PB/GBrain/AgentMemory topics;
- source adapter tests for trajectory field preservation and raw transcript rejection;
- AgentMemory failure tests proving warning-only behavior.
