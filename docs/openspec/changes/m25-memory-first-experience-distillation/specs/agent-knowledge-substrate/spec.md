# Agent Knowledge Substrate Spec Delta: M25 Memory-First Experience Distillation

## ADDED Requirements

### Requirement: Memory-First Source Inventory

PraxisBase SHALL build a source inventory with evidence spans before selecting raw material for lesson extraction.

#### Scenario: Long memory file is section-mapped

- **GIVEN** an OpenClaw `MEMORY.md` file is larger than the default source byte limit
- **WHEN** memory-first inventory runs
- **THEN** PraxisBase parses the file into heading, bullet, paragraph, and byte spans
- **AND** the file is not skipped solely because it exceeds the byte limit
- **AND** each span has a source ref, source hash, span id, line range, byte range, and heading path

#### Scenario: Native memory outranks ordinary logs

- **GIVEN** a source set contains a native memory file and many newer low-signal logs
- **WHEN** the signal planner selects spans under a limited budget
- **THEN** it reserves budget for the native memory file before ordinary logs
- **AND** selected spans include memory-file evidence when useful lesson markers are present

### Requirement: Experience Lesson Extraction

PraxisBase SHALL extract structured reusable lessons from raw evidence rather than only summaries.

#### Scenario: LLM extracts a reusable lesson from raw memory

- **GIVEN** raw OpenClaw memory contains evidence that long dispatch work should receive a brief ACK before tools run
- **WHEN** LLM lesson extraction runs
- **THEN** PraxisBase emits an `ExperienceLesson`
- **AND** the lesson includes claim, safe claim, problem, trigger, action, verification or negative case, portability, privacy tier, applies-to agents/systems, confidence, and evidence spans

#### Scenario: Weak run report is skipped

- **GIVEN** a source span only says a smoke command ran once without a reusable lesson
- **WHEN** deterministic and LLM lesson extraction run
- **THEN** PraxisBase emits no wiki-ready lesson
- **AND** the report records the skip reason as weak or one-off evidence

### Requirement: Privacy Abstraction

PraxisBase SHALL abstract private instance facts into safe reusable lessons when possible and block unsafe leakage.

#### Scenario: Private remote detail becomes safe lesson

- **GIVEN** remote OpenClaw memory says a concrete private host should be used for a Mac mini
- **WHEN** privacy abstraction runs in personal mode
- **THEN** PraxisBase may produce a personal lesson about using the configured private route for that remote host
- **AND** the safe claim does not contain the concrete hostname, IP, username, key path, or account secret

#### Scenario: Team output rejects private instance leakage

- **GIVEN** a lesson contains a private hostname, IP, key path, or credential
- **WHEN** team-mode wiki, skill, site, GBrain export, or AgentMemory export is built
- **THEN** the private value does not appear
- **AND** the lesson is either safely abstracted, personal-only, human-required, or rejected

### Requirement: Portability Classification

PraxisBase SHALL classify every lesson by applicability and portability.

#### Scenario: Universal agent behavior is cross-agent usable

- **GIVEN** evidence supports the lesson "acknowledge long-running tool work before starting"
- **WHEN** the lesson is classified
- **THEN** portability is `universal` or `agent_family`
- **AND** applies-to agents can include Codex, OpenClaw, Claude Code, and OpenCode when evidence supports them

#### Scenario: Environment-specific fact stays personal

- **GIVEN** evidence refers to a concrete private wrapper command or host route
- **WHEN** the lesson is classified
- **THEN** portability is `environment` or `private_instance`
- **AND** team export excludes the concrete detail by default

### Requirement: Lesson Stability Cache

PraxisBase SHALL score and state lesson candidates before wiki or skill compilation.

#### Scenario: Safe high-confidence personal lesson becomes active

- **GIVEN** a personal memory lesson has high confidence, safe privacy tier, and evidence spans
- **WHEN** the lesson cache rebuilds
- **THEN** the lesson can become `active_personal`
- **AND** it can appear in personal runtime context before stable wiki promotion
- **AND** it remains lower authority than stable PB pages and promoted skills

#### Scenario: Forgotten lesson does not reappear

- **GIVEN** a personal lesson is marked forgotten
- **WHEN** the same raw evidence is processed again
- **THEN** the lesson remains hidden from runtime injection
- **AND** it does not become wiki-ready without explicit user action

### Requirement: Wiki And Skill Compilation From Lessons

PraxisBase SHALL compile wiki and skill candidates from lesson clusters with provenance.

#### Scenario: Wiki page is synthesized from lesson cluster

- **GIVEN** multiple evidence spans support an OpenClaw dispatch honesty lesson
- **WHEN** wiki compilation runs
- **THEN** PraxisBase produces a wiki candidate with applicability, recommendation/procedure, verification, negative case, related links, portability, privacy tier, and provenance
- **AND** the body is synthesized rather than a raw copy of the source summary

#### Scenario: Skill candidate prefers update

- **GIVEN** a procedural lesson matches an existing promoted OpenClaw operating skill
- **WHEN** skill synthesis runs
- **THEN** PraxisBase proposes an update before proposing a new skill
- **AND** unreviewed skill candidates are not injected into normal agent runtime

### Requirement: M25 Integration Contract

PraxisBase SHALL route production agent-experience outputs through `ExperienceLesson` state when M25 lesson output exists.

#### Scenario: Lesson clusters outrank legacy distilled summaries

- **GIVEN** the same source has both a legacy distilled summary and a `wiki_ready` lesson cluster
- **WHEN** wiki proposal compilation runs in production mode
- **THEN** PraxisBase uses the lesson cluster as the primary semantic input
- **AND** the distilled summary may appear only as supporting diagnostics or compatibility metadata

#### Scenario: Skill synthesis rejects raw summary authority

- **GIVEN** a raw log or one-off distilled summary suggests a possible skill
- **AND** no `skill_ready` lesson cluster or stable procedural wiki page supports that skill
- **WHEN** skill synthesis runs in production mode
- **THEN** PraxisBase does not create a promotion-eligible skill candidate
- **AND** the report explains that the input lacked lesson-state authority

#### Scenario: Sidecar retrieval cannot promote PB knowledge

- **GIVEN** GBrain or AgentMemory returns a relevant sidecar hit
- **WHEN** wiki, skill, GBrain export, or AgentMemory export decisions run
- **THEN** the sidecar hit does not count as stable PB authority
- **AND** it can become evidence only after import with source refs, source hashes, privacy review, and lesson extraction

#### Scenario: Personal runtime activation is not stable promotion

- **GIVEN** a safe high-confidence personal lesson is `active_personal`, `wiki_ready`, or `skill_ready`
- **WHEN** runtime context, wiki promotion, skill promotion, and team export run
- **THEN** runtime context may inject the lesson as lower-authority personal guidance
- **AND** stable wiki, stable skills, and team export still require review or configured promotion policy

### Requirement: Golden Validation

PraxisBase SHALL validate memory-first extraction against raw OpenClaw golden fixtures.

#### Scenario: Local OpenClaw golden lessons are recovered

- **GIVEN** a local OpenClaw raw memory/session fixture contains the user's target lessons
- **WHEN** M25 golden validation runs
- **THEN** at least 5 of 8 expected local lessons are extracted
- **AND** every matched lesson cites evidence spans

#### Scenario: Remote OpenClaw golden lessons are recovered

- **GIVEN** a trusted personal remote OpenClaw raw memory/session fixture contains the user's target lessons
- **WHEN** M25 golden validation runs
- **THEN** at least 6 of 8 expected remote lessons are extracted
- **AND** stable outputs contain no private host, IP, path, account, key, or credential value
