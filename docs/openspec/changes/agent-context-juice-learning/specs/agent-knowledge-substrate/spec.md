# Agent Knowledge Substrate Spec Delta: Agent Context Juice And Personal Learning

## ADDED Requirements

### Requirement: Context Juice Budgeting

PraxisBase SHALL apply deterministic byte and token budgets before expensive AI/review inputs and agent-facing bundles.

#### Scenario: Oversized source item is budgeted before AI

- **GIVEN** a session source item contains a large tool result and source provenance
- **WHEN** daily processing prepares AI distill input
- **THEN** PraxisBase applies a UTF-8 safe source item budget
- **AND** the output contains a dropped-byte marker when truncated
- **AND** the report records original bytes, kept bytes, saved bytes, source ref, and source hash

#### Scenario: Context juice identity prevents stale cache reuse

- **GIVEN** a source item was processed with context juice budget id "old"
- **WHEN** the same source item is processed with budget id "new"
- **THEN** PraxisBase does not silently reuse the old AI distill cache entry
- **AND** the daily report records the new context juice identity

### Requirement: Trajectory Microcompact

PraxisBase SHALL compact session-like trajectories by clearing old low-signal payload bodies while preserving envelope order and protected signals.

#### Scenario: Microcompact preserves reusable repair evidence

- **GIVEN** a long Codex or OpenClaw session contains old tool outputs, a failure, a fix, a verification event, an explicit lesson, and provenance
- **WHEN** trajectory microcompact runs
- **THEN** old low-signal tool result bodies are replaced by a stable placeholder
- **AND** the failure, fix, verification, explicit lesson, source ref, and source hash remain
- **AND** the most recent configured tool results remain intact

#### Scenario: Microcompact is idempotent

- **GIVEN** a trajectory has already been microcompacted
- **WHEN** microcompact runs again with the same settings
- **THEN** the output does not change
- **AND** the report records no additional cleared bodies

### Requirement: Optional Oversized Payload Pre-Summary

PraxisBase SHALL allow optional model-backed pre-summary only under strict budget and safety controls.

#### Scenario: Pre-summary failure falls back to deterministic budget

- **GIVEN** an oversized payload qualifies for optional pre-summary
- **AND** the configured AI model returns an empty, non-shrinking, or malformed summary
- **WHEN** daily processing continues
- **THEN** PraxisBase discards the summary
- **AND** uses deterministic context juice output
- **AND** records a warning without failing the run

### Requirement: Trust-Aware Agent Bundles

PraxisBase SHALL build agent context bundles that preserve PB authority and wrap untrusted content.

#### Scenario: Stable PB outranks sidecars

- **GIVEN** a stable PB page, a GBrain sidecar hit, and an AgentMemory sidecar hit all match a query
- **WHEN** `praxisbase context bundle --query <q> --json` runs
- **THEN** the stable PB item appears before sidecar hits
- **AND** sidecar hits are marked with lower authority
- **AND** untrusted sidecar bodies are wrapped before agent injection

#### Scenario: Bundle budget preserves citations

- **GIVEN** matching stable pages and sidecar hits exceed the configured bundle budget
- **WHEN** the bundle is packed
- **THEN** lower-authority full bodies are dropped before citations
- **AND** the omitted-item summary explains what was excluded

### Requirement: Promoted Skill Injection

PraxisBase SHALL inject only promoted PB skills into normal agent runtime bundles.

#### Scenario: Explicit skill mention wins

- **GIVEN** two promoted PB skills match a task
- **AND** the user query explicitly mentions one skill by `@skill`
- **WHEN** skill injection preview runs
- **THEN** the explicitly mentioned skill appears first
- **AND** each considered skill has a match or skip decision with reason and byte count

#### Scenario: Candidates are not injected

- **GIVEN** a review candidate and a promoted skill both match a query
- **WHEN** an agent context bundle is built
- **THEN** the promoted skill may be injected
- **AND** the review candidate body is not injected

### Requirement: Personal Learning Facets

PraxisBase SHALL maintain personal runtime preference facets separately from stable team knowledge.

#### Scenario: Personal facet becomes active by stability

- **GIVEN** repeated personal evidence shows the user prefers terse final answers
- **WHEN** the personal learning cache rebuilds
- **THEN** a `style/verbosity` facet can become active
- **AND** the facet appears in personal agent bundles within the personal facet budget
- **AND** it is not exported to team knowledge by default

#### Scenario: Explicit profile instruction seeds a personal facet

- **GIVEN** a user has a personal PraxisBase workspace
- **WHEN** the user runs `praxisbase personal profile add "以后默认用 pnpm 跑测试" --json`
- **THEN** PraxisBase creates or updates a personal facet candidate from that instruction
- **AND** profile rebuild renders managed personal profile output
- **AND** team mode excludes that facet by default

#### Scenario: User forget blocks re-promotion

- **GIVEN** an active personal facet exists
- **WHEN** the user runs `praxisbase personal profile forget <class>/<key>`
- **THEN** the facet becomes forgotten
- **AND** it is removed from managed profile output
- **AND** repeated automatic evidence cannot re-promote it without explicit user action

### Requirement: Site And Report Visibility

PraxisBase SHALL expose context juice, bundle, trust, skill injection, and personal learning status without leaking raw private evidence.

#### Scenario: Site shows runtime context health

- **GIVEN** context juice, bundle building, skill injection, and personal learning have run
- **WHEN** the generated HTML site is built
- **THEN** it shows byte savings, bundle budget usage, trust-tier counts, skill injection decisions, and personal facet counts
- **AND** raw private facet evidence and raw sidecar bodies are not rendered by default
