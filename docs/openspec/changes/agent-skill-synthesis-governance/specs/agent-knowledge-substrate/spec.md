# Agent Knowledge Substrate Spec Delta: Agent Skill Synthesis Governance

## ADDED Requirements

### Requirement: Governed Skill Candidates

PraxisBase SHALL synthesize agent-facing skill candidates from provenance-backed experience without directly mutating stable `skills/**`.

#### Scenario: Personal evidence creates a skill candidate

- **GIVEN** personal distilled experiences contain repeated verified skill signals
- **WHEN** `praxisbase skill synthesize --mode personal --review --json` runs
- **THEN** PraxisBase writes one or more skill candidate records under `.praxisbase/inbox/proposals/`
- **AND** each candidate includes source refs, source hashes, evidence ids, source count, and scope
- **AND** PraxisBase does not write stable `skills/**`

#### Scenario: Team evidence creates a reviewable skill candidate

- **GIVEN** team-safe distilled experiences contain repeated verified skill signals
- **WHEN** `praxisbase skill synthesize --mode team --review --json` runs
- **THEN** PraxisBase writes team-scope skill candidates
- **AND** each candidate requires human/Git review before promotion
- **AND** no personal-only material is included

### Requirement: Stable Skill Audit

PraxisBase SHALL require an audit record before any skill candidate becomes a stable skill.

#### Scenario: Promotion without review is rejected

- **GIVEN** a skill candidate exists
- **AND** no approved review record exists for that candidate
- **WHEN** promotion is requested
- **THEN** PraxisBase rejects the promotion
- **AND** stable `skills/**` remains unchanged

#### Scenario: Reviewed personal skill can be promoted by the user

- **GIVEN** a personal skill candidate has an approved review record
- **AND** the candidate passes semantic skill review
- **WHEN** the user promotes the candidate
- **THEN** PraxisBase writes or patches the target `skills/**` file
- **AND** records provenance and audit metadata

#### Scenario: Audit record must match candidate

- **GIVEN** a skill candidate targets `skills/openclaw/openclaw-memory-operations/SKILL.md`
- **AND** an audit record exists for a different target path or source hash
- **WHEN** promotion is requested
- **THEN** PraxisBase rejects the promotion
- **AND** reports the audit mismatch

### Requirement: Team Skill Review Boundary

PraxisBase SHALL keep team stable skill promotion behind human/Git review.

#### Scenario: Team skill is not auto-promoted

- **GIVEN** a team skill candidate passes semantic skill review
- **WHEN** daily automation completes
- **THEN** the candidate remains pending review
- **AND** stable `skills/**` is not changed automatically
- **AND** the report includes the Git/MR next action

### Requirement: Skill Decision Ladder

PraxisBase SHALL prefer updating existing class-level skills before creating new skills.

#### Scenario: Existing umbrella is updated instead of creating a sibling

- **GIVEN** a stable skill already covers OpenClaw authentication repair
- **AND** new evidence adds a retry-guard pitfall for that same class
- **WHEN** skill synthesis runs
- **THEN** the candidate action is `skill_update` or `skill_support_file`
- **AND** PraxisBase does not create a new narrow `openclaw-auth-retry-today` skill

#### Scenario: Ambiguous existing skill match blocks new sibling

- **GIVEN** two stable skills strongly match a new skill signal
- **WHEN** the proposer chooses an action
- **THEN** PraxisBase returns `merge_or_update_existing` or `needs_human`
- **AND** it does not create a third sibling skill

### Requirement: Skill Semantic Review

PraxisBase SHALL semantically review skill candidates before they are eligible for promotion.

#### Scenario: One-off run report is rejected

- **GIVEN** a candidate names a specific smoke report or run id
- **WHEN** semantic skill review runs
- **THEN** the reviewer returns `reject` or `needs_human`
- **AND** the candidate is not eligible for stable promotion

#### Scenario: Class-level skill is approved as a candidate

- **GIVEN** a candidate has a reusable trigger, procedure, verification, pitfalls, related wiki pages, and provenance
- **WHEN** semantic skill review runs
- **THEN** the reviewer returns `approve_candidate`
- **AND** the candidate remains pending audit before stable promotion

### Requirement: Skill Candidate Site Visibility

PraxisBase SHALL show reviewed skill candidates and next actions in the generated site.

#### Scenario: Site shows skill candidate queue

- **GIVEN** two reviewed skill candidates exist
- **WHEN** `praxisbase wiki build-site --json` runs
- **THEN** the generated site shows two skill candidates
- **AND** each card shows action, scope, review decision, score, reason, source count, and next command
- **AND** raw skill signals are not counted as primary review work

### Requirement: Real Skill Smoke Quality

PraxisBase SHALL verify real skill synthesis quality with source-backed smoke criteria, not only file creation.

#### Scenario: Personal smoke separates signal and candidate quality

- **GIVEN** real local OpenClaw and Codex sources have been collected
- **WHEN** personal daily and skill synthesis run with site build enabled
- **THEN** the report separates raw signals, rejected or low-stability signals, clusters, reviewed candidates, rejected candidates, human-required candidates, and promoted stable skills
- **AND** reviewed skill candidates are the primary site queue
- **AND** candidate bodies contain no raw transcript, private path, secret, or team-unsafe personal material
- **AND** stable `skills/**` remains unchanged before audited promotion
