# Personal GA Cut Spec

## ADDED Requirements

### Requirement: Final Personal GA Is Split Into Three Gates

PraxisBase SHALL report final personal usability through three separate gates: PB wiki/context GA, PB skill compiler GA, and GBrain runtime GA.

#### Scenario: PB core passes but skills and GBrain do not

- **GIVEN** PB stable wiki and PB context are usable
- **AND** no promoted PB skill exists
- **AND** no GBrain publish/retrieval evidence exists
- **WHEN** personal release audit runs
- **THEN** `wiki_context_ga` is `pass`
- **AND** `skill_compiler_ga` is `fail`
- **AND** `gbrain_runtime_ga` is `fail`
- **AND** final `personal_ga` is `fail`

### Requirement: PB Wiki/Context GA Requires Real Personal Source Coverage

PraxisBase SHALL require high-priority personal source coverage for local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi when those sources are configured.

#### Scenario: Trusted remote OpenClaw is configured but not processed

- **GIVEN** trusted remote OpenClaw is configured as a personal source
- **AND** the latest full personal queue has no processed high-priority remote OpenClaw evidence
- **WHEN** personal release audit runs
- **THEN** `wiki_context_ga` is `fail`
- **AND** blockers include the missing remote OpenClaw coverage

### Requirement: Full Personal Queue Is Resumable And Budget-Aware

PraxisBase SHALL distinguish a resumable full personal queue from a bounded smoke run.

PraxisBase SHALL compute full queue completion from current source chunks and source-item ledger entries. A finite AI budget SHALL NOT by itself make the run a bounded smoke when all high-priority chunks were already processed through valid cache or ledger reuse. A large or unlimited budget SHALL NOT by itself make the run full when high-priority chunks are missing, skipped, failed, or only represented by stale ledger entries.

#### Scenario: Smoke run succeeds but high-priority queue remains

- **GIVEN** a production daily smoke used a finite small AI budget
- **AND** high-priority source items remain unprocessed
- **WHEN** personal release audit runs
- **THEN** the audit reports the smoke evidence
- **AND** `wiki_context_ga` remains blocked by undrained high-priority queue items
- **AND** `next_commands` include the resume/full queue command

#### Scenario: Finite budget resumes from ledger and drains the queue

- **GIVEN** high-priority source chunks already have current `distilled` or `human_required` source-item ledger entries
- **AND** a new run uses a finite uncached AI budget
- **WHEN** no high-priority chunks are skipped or failed
- **THEN** the queue report is allowed to be `full`
- **AND** Gate 1 is not blocked by the finite budget flag alone

#### Scenario: Old readiness report lacks queue evidence

- **GIVEN** an older daily report has `personal_ga.production_ready` set to true
- **BUT** it has no `personal_ga.queue` evidence
- **WHEN** personal release audit runs
- **THEN** `wiki_context_ga` is `fail`
- **AND** blockers include `personal_queue_report_missing`

### Requirement: Stable Wiki And Context Must Be PB-Authoritative

PraxisBase SHALL pass PB wiki/context GA only when stable PB pages or active personal lessons are usable by agents.

#### Scenario: Candidates exist but no usable context exists

- **GIVEN** wiki proposals and skill candidates exist
- **BUT** no stable wiki page and no active personal lesson is available
- **WHEN** personal release audit runs
- **THEN** `wiki_context_ga` is `fail`
- **AND** blockers include `no_pb_context_output`

### Requirement: Skill Compiler Uses Only Governed PB Sources

PraxisBase SHALL generate promotable skills only from stable PB wiki, approved `skill_ready` lessons, or safe active personal lessons.

#### Scenario: Skill signal comes only from raw dreaming memory

- **GIVEN** a skill signal cites only dreaming, session-corpus, raw transcript, or untriaged staging evidence
- **WHEN** skill source authority is evaluated
- **THEN** the signal is rejected for stable skill eligibility
- **AND** it cannot produce a promoted skill

### Requirement: Skill Compiler GA Requires Promoted Injectable Skill

PraxisBase SHALL fail PB skill compiler GA unless at least one real promoted PB skill is injectable for a realistic personal query.

#### Scenario: Skill candidates exist but no skill is promoted

- **GIVEN** skill synthesis produced candidates
- **AND** `skills/**` contains no promoted PraxisBase synthesized skill
- **WHEN** personal release audit runs
- **THEN** `skill_compiler_ga` is `fail`
- **AND** blockers include `no_promoted_injectable_skill`

### Requirement: Skill Candidates Are Repaired And Validated Before Promotion

PraxisBase SHALL run shape validation, one-shot auto-repair, semantic review, final validation, and promotion audit before a skill becomes stable.

#### Scenario: Candidate has a malformed procedure heading

- **GIVEN** a skill candidate has a fixable malformed procedure heading
- **WHEN** skill review runs
- **THEN** PB attempts one structural repair
- **AND** validates the repaired candidate
- **AND** only a passing candidate can be promoted

### Requirement: GBrain Runtime GA Publishes Only Stable PB Outputs

PraxisBase SHALL publish only stable wiki pages and promoted skills to GBrain.

#### Scenario: Pending candidates and human-required records exist

- **GIVEN** stable wiki pages, promoted skills, pending proposals, and human-required records exist
- **WHEN** PB publishes to GBrain
- **THEN** only stable wiki pages, promoted skills, and the stable catalog are exported
- **AND** pending proposals, human-required records, rejected records, raw evidence, and candidate skills are excluded

### Requirement: GBrain Runtime GA Requires Retrieval Evidence

PraxisBase SHALL require proof that GBrain can retrieve PB-published personal experience for final personal GA.

PraxisBase SHALL keep PB compiler commands independent of GBrain runtime availability. GBrain absence or retrieval failure SHALL fail `gbrain_runtime_ga` and final `personal_ga`; it SHALL NOT by itself fail PB wiki/context GA or PB skill compiler GA.

#### Scenario: Publish succeeds but retrieval is unavailable

- **GIVEN** PB exported stable pages to GBrain source `praxisbase`
- **BUT** GBrain query or MCP retrieval cannot find PB-published experience
- **WHEN** personal release audit runs
- **THEN** `gbrain_runtime_ga` is `fail`
- **AND** Gate 1 and Gate 2A keep their own statuses

### Requirement: GBrain Sidecar Does Not Decide PB Promotion

PraxisBase SHALL treat GBrain hits as sidecar recall unless imported into PB evidence with source refs, hashes, privacy review, and lesson routing.

#### Scenario: GBrain returns a high-scoring hit for a candidate topic

- **GIVEN** GBrain retrieval returns a high-scoring sidecar hit
- **WHEN** PB computes promotion eligibility
- **THEN** the sidecar hit does not count as promotion evidence
- **AND** PB stable evidence and audit rules remain authoritative

### Requirement: HTML Shows Gate Status And Next Commands

PraxisBase SHALL render personal release gate status in the generated HTML.

#### Scenario: Skill compiler gate fails

- **GIVEN** wiki/context GA passes
- **AND** skill compiler GA fails because no promoted skill exists
- **WHEN** the site is built
- **THEN** the homepage shows Gate 2A as failing
- **AND** shows the exact command to synthesize, review, validate, or promote a skill
