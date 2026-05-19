# Agent Knowledge Substrate Capability

## ADDED Requirements

### Requirement: Knowledge Lint

The system shall lint stable knowledge and protocol state using deterministic rules.

#### Scenario: Report lint errors and warnings

- **GIVEN** a workspace with stable knowledge objects
- **WHEN** the user runs `praxisbase lint --json`
- **THEN** the system emits machine-readable lint findings
- **AND** findings have severity `error` or `warning`
- **AND** missing frontmatter is an error
- **AND** raw log-like content under `kb/` is an error
- **AND** duplicate signatures are warnings unless object ids also duplicate
- **AND** a lint report is written under `.praxisbase/reports/lint/`

### Requirement: Deterministic Duplicate Detection

The system shall detect likely duplicate knowledge without vector search.

#### Scenario: Detect duplicate objects

- **GIVEN** two knowledge objects with the same id
- **WHEN** `praxisbase lint --json` runs
- **THEN** the system reports a duplicate-id error
- **AND** writes a conflict exception

#### Scenario: Detect duplicate signature candidates

- **GIVEN** two knowledge objects with the same problem signature and normalized title match
- **WHEN** `praxisbase lint --json` runs
- **THEN** the system reports a duplicate-signature warning
- **AND** does not modify either object

### Requirement: Deterministic Contradiction Detection

The system shall detect explicit contradictions between recommended and forbidden actions without vector search.

#### Scenario: Recommended action conflicts with pitfall

- **GIVEN** a known-fix or procedure recommends an action for a problem signature
- **AND** a pitfall for the same problem signature lists the normalized action in `forbidden_actions`
- **WHEN** `praxisbase lint --json` runs
- **THEN** the system reports a contradiction error
- **AND** writes a human-required exception
- **AND** does not modify either object

#### Scenario: Active superseded object remains in bundle

- **GIVEN** an object has `superseded_by`
- **AND** the object is still active in generated bundle output
- **WHEN** `praxisbase lint --json` runs
- **THEN** the system reports a contradiction warning
- **AND** suggests removing the superseded object from active bundles

### Requirement: Reference Aggregation

The system shall aggregate knowledge references from episodes.

#### Scenario: Aggregate positive references

- **GIVEN** episodes containing `knowledge_references`
- **WHEN** reference aggregation runs
- **THEN** the system counts cumulative references
- **AND** computes positive references within the last 180 days
- **AND** records last positive reference time
- **AND** writes a reference report

#### Scenario: Track negative references

- **GIVEN** episodes with failed, partial, inconclusive, or data-gap outcomes
- **WHEN** reference aggregation runs
- **THEN** the system records negative references
- **AND** blocks maturity promotion for affected objects when the negative reference is newer than positive references

### Requirement: Maturity Proposal Generation

The system shall propose maturity changes through the proposal lane.

#### Scenario: Draft becomes verified candidate

- **GIVEN** a draft object has at least 2 positive references within 180 days
- **AND** no newer negative reference exists
- **WHEN** maturity proposal generation runs
- **THEN** the system writes a proposal to change `maturity` to `verified`
- **AND** does not edit the stable object directly

#### Scenario: Verified becomes proven candidate

- **GIVEN** a verified object has at least 5 positive references
- **AND** references cover at least 2 distinct environments
- **AND** references cover at least 2 distinct agent ids
- **AND** references span at least 7 days
- **AND** no unresolved negative reference exists in the last 30 days
- **WHEN** maturity proposal generation runs
- **THEN** the system writes a proposal to change `maturity` to `proven`
- **AND** does not edit the stable object directly

### Requirement: Decay And Stale Proposal Generation

The system shall identify stale knowledge without silently demoting it.

#### Scenario: Verified object becomes stale

- **GIVEN** a verified object has no positive references for 180 days
- **WHEN** decay evaluation runs
- **THEN** the system writes a stale or maturity downgrade proposal
- **AND** writes a decay report
- **AND** does not edit the stable object directly

#### Scenario: Proven object receives negative reference

- **GIVEN** a proven object receives a negative reference
- **WHEN** decay evaluation runs
- **THEN** the system writes a human-required warning exception
- **AND** does not demote the object directly

### Requirement: Cold-Start Import

The system shall import legacy knowledge only as draft proposals or structured episodes.

#### Scenario: Import Markdown directory

- **GIVEN** a directory of Markdown documents
- **WHEN** the user runs `praxisbase import markdown <path> --json`
- **THEN** the system creates proposal objects with `maturity: draft`
- **AND** each proposal includes source refs, source hash, and redacted summary
- **AND** no stable `kb/` object is written directly

#### Scenario: Import Feishu export

- **GIVEN** a Feishu export file
- **WHEN** the user runs `praxisbase import feishu <path> --json`
- **THEN** the system creates proposal objects or draft episodes
- **AND** raw chat logs are not committed into Git

### Requirement: Stage-Aware Compact Retrieval

The system shall build compact context according to the agent's current stage.

#### Scenario: Diagnosis context respects budget

- **GIVEN** many matching known fixes and pitfalls
- **WHEN** the agent requests diagnosis context
- **THEN** the serialized context is at most 16 KB by default
- **AND** exact signature matches are ranked first
- **AND** higher maturity objects are preferred
- **AND** dropped objects remain as citations

#### Scenario: Repair context prefers skills and procedures

- **GIVEN** matching skills, procedures, known fixes, and pitfalls
- **WHEN** the agent requests repair context
- **THEN** the serialized context is at most 24 KB by default
- **AND** skills and procedures are preferred after exact signature matches

#### Scenario: Verification context is compact

- **GIVEN** matching repair knowledge
- **WHEN** the agent requests verification context
- **THEN** the serialized context is at most 12 KB by default
- **AND** verification, rollback, and escalation content is preferred
