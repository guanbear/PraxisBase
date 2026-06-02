# Spec: Agent Knowledge Substrate

## ADDED Requirements

### Requirement: Incremental session processing

PraxisBase SHALL avoid repeated provider calls for unchanged session items when source hash, parser, reducer identity, authority mode, and distill model are unchanged.

#### Scenario: Unchanged sessions reuse processed state

- **GIVEN** a local session source has already been processed in production daily mode
- **AND** its AI distill cache entries still exist and parse
- **WHEN** daily runs again with the same authority mode, model, parser, source hash, and reducer rule identity
- **THEN** PraxisBase does not call the distill provider for that session item
- **AND** the daily report records cache or ledger reuse.

#### Scenario: Changed reducer rules invalidate reuse

- **GIVEN** a local session source has already been processed
- **WHEN** reducer rules change
- **THEN** PraxisBase treats affected chunks as uncached
- **AND** the next production daily run may call the distill provider again.

### Requirement: Claude Code and OpenCode sources

PraxisBase SHALL support Claude Code and OpenCode as first-class local experience sources.

#### Scenario: OpenCode source add

- **GIVEN** a user has an OpenCode session directory
- **WHEN** they run `praxisbase source add local-opencode --agent opencode --type local --path <dir> --scope personal`
- **THEN** the source config uses agent `opencode`
- **AND** the inferred parser is `opencode-session`
- **AND** generated source refs do not use an OpenClaw namespace.

### Requirement: Skill origin provenance

PraxisBase SHALL distinguish synthesized skills from externally installed skills.

#### Scenario: PraxisBase synthesized skill is marked

- **GIVEN** skill synthesis creates a skill candidate from distilled evidence
- **WHEN** the candidate content is written
- **THEN** the skill contains machine-readable `origin: praxisbase_synthesized`
- **AND** it contains source refs and source hashes.

#### Scenario: External skill is not raw evidence

- **GIVEN** a `skills/**/SKILL.md` file has no PraxisBase provenance
- **WHEN** wiki evidence is collected
- **THEN** the skill may be listed as stable skill inventory
- **AND** it is not treated as raw evidence for new wiki synthesis.

