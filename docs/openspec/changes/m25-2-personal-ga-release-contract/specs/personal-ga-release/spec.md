# Personal GA Release Contract Spec

## ADDED Requirements

### Requirement: PB Core Readiness Does Not Depend On Optional Sidecars

PraxisBase SHALL treat GBrain and AgentMemory as optional sidecars for personal GA unless explicitly configured as required.

#### Scenario: AgentMemory is unavailable but PB core is ready

- **GIVEN** a personal daily run has usable PB stable wiki or active personal lessons
- **AND** AgentMemory health fails
- **WHEN** Personal GA readiness is computed
- **THEN** AgentMemory failure is reported as a warning
- **AND** it is not included in `blocking_reasons`

### Requirement: Production AI Is Required For Final Personal GA

PraxisBase SHALL mark degraded no-AI personal daily runs as not production-ready.

#### Scenario: Degraded run remains non-GA

- **GIVEN** the user runs personal daily with no AI or degraded mode
- **WHEN** Personal GA readiness is computed
- **THEN** `production_ready` is false
- **AND** `blocking_reasons` includes `ai_lesson_extraction_disabled`

### Requirement: Historical Privacy Backlog Does Not Fail Latest GA

PraxisBase SHALL distinguish current-run hard privacy blockers from historical human-required maintenance backlog.

#### Scenario: Historical backlog exists but latest run is clean

- **GIVEN** the repository contains old human-required exception files
- **AND** the latest daily run has no true secret/key/password/private-key blocker
- **WHEN** Personal GA readiness is computed
- **THEN** historical backlog is not a blocker
- **AND** optional maintenance debt may be shown as a warning

### Requirement: Personal Private References Are Abstracted Before Blocking

PraxisBase SHALL abstract personal host, path, SSH alias, Slack user id, and account references before deciding whether a lesson can be used in personal wiki or context.

#### Scenario: Trusted remote host appears in a reusable lesson

- **GIVEN** trusted remote OpenClaw evidence says to confirm the target machine before restart
- **AND** the evidence contains a concrete remote host or SSH alias
- **WHEN** personal privacy handling runs
- **THEN** the reusable lesson is preserved with abstract personal wording
- **AND** the raw host or alias does not enter stable wiki, skills, HTML, or context

### Requirement: Personal GA Requires Usable PB Knowledge Output

PraxisBase SHALL require at least one PB-authoritative knowledge output for personal GA.

#### Scenario: Lessons exist but no output is usable

- **GIVEN** a personal daily run extracts lessons
- **BUT** no stable wiki, active personal lesson, or promoted skill is available
- **WHEN** Personal GA readiness is computed
- **THEN** `production_ready` is false
- **AND** `blocking_reasons` includes `no_personal_knowledge_output`

### Requirement: Agent Context Works Without Sidecars

PraxisBase SHALL return PB stable knowledge or active personal lessons to agents even when sidecars are unavailable.

#### Scenario: Context query with sidecars down

- **GIVEN** PB stable knowledge or active personal lessons exist
- **AND** GBrain and AgentMemory are unavailable
- **WHEN** an agent requests context
- **THEN** the response contains PB-authoritative items
- **AND** sidecar failures are warnings rather than emptying the context response
