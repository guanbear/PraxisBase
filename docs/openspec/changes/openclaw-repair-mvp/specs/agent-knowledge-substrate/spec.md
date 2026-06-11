# Agent Knowledge Substrate Capability

## ADDED Requirements

### Requirement: Protocol Skeleton Initialization

The system shall initialize an agent knowledge substrate workspace for OpenClaw repair.

#### Scenario: Initialize a new workspace

- **GIVEN** an empty directory
- **WHEN** the user runs `praxisbase init`
- **THEN** the system creates `.praxisbase/`, `kb/`, `skills/`, and `dist/` protocol directories
- **AND** creates `.praxisbase/exceptions/` and `.praxisbase/runs/` protocol directories
- **AND** creates OpenClaw seed skills and a draft auth-expired known fix
- **AND** writes `protocol_version: "0.1"` into protocol configuration

### Requirement: Knowledge Governance Metadata

The system shall preserve lightweight governance metadata needed for later knowledge maturation, decay, and linting.

#### Scenario: Accept governed knowledge object metadata

- **GIVEN** a valid known-fix or pitfall object
- **WHEN** the object is parsed by the protocol schema
- **THEN** it includes `knowledge_type`
- **AND** includes `maturity`
- **AND** includes `scope`
- **AND** includes `reference_count`
- **AND** includes `last_referenced_at`
- **AND** includes `supersedes`
- **AND** includes `superseded_by`

### Requirement: OpenClaw Repair Context Retrieval

The system shall return a compact repair context for OpenClaw sandbox repair agents.

#### Scenario: Auth expired log

- **GIVEN** a log containing `authentication expired` or `401 unauthorized`
- **WHEN** the agent runs `praxisbase repair-context openclaw --logs <file> --json`
- **THEN** the response includes `problem_signature: "openclaw:claude-auth-expired"`
- **AND** includes auth repair skill references
- **AND** includes forbidden operations, verification steps, rollback steps, and escalation conditions

### Requirement: Episode Intake

The system shall accept structured repair episodes from temporary and persistent agents.

#### Scenario: Submit valid episode

- **GIVEN** a valid episode JSON with identity, scope, source refs, result, and idempotency key
- **WHEN** the agent runs `praxisbase episode submit <file>`
- **THEN** the system validates the episode
- **AND** writes it to `.praxisbase/inbox/episodes/<episode-id>.json`
- **AND** preserves `knowledge_references` with phase, effect, and outcome when provided

#### Scenario: Reject episode without provenance

- **GIVEN** an episode JSON with no `source_refs`
- **WHEN** the agent runs `praxisbase episode submit <file>`
- **THEN** the command fails with a machine-readable validation error
- **AND** no inbox episode file is written

### Requirement: Proposal Intake

The system shall accept knowledge update proposals with evidence.

#### Scenario: Submit valid known-fix proposal

- **GIVEN** a proposal JSON with evidence source URI, source hash, repair result, and verification observation
- **WHEN** the agent runs `praxisbase propose <file>`
- **THEN** the system validates the proposal
- **AND** writes it to `.praxisbase/inbox/proposals/<proposal-id>.json`

#### Scenario: Reject proposal without evidence

- **GIVEN** a proposal JSON missing evidence source hash
- **WHEN** the agent runs `praxisbase propose <file>`
- **THEN** the command fails with a machine-readable validation error
- **AND** no inbox proposal file is written

### Requirement: AI-Reviewed Auto-Merge

The system shall allow routine knowledge improvements to be reviewed and promoted without default human approval.

#### Scenario: Medium-risk known-fix proposal

- **GIVEN** a valid create proposal for `target_type: "known_fix"`
- **AND** the proposal contains evidence and verification
- **WHEN** `praxisbase review --auto` runs
- **THEN** the review decision is `approve`
- **AND** risk is `medium`
- **AND** confidence is at least `0.75`

#### Scenario: High-risk policy proposal

- **GIVEN** a valid patch proposal for `target_type: "policy"`
- **WHEN** `praxisbase review --auto` runs
- **THEN** the review decision is `needs_human`
- **AND** the proposal is not promoted automatically
- **AND** the exception is written under `.praxisbase/exceptions/human-required/`

### Requirement: Promotion Safety

The system shall only promote approved proposals into stable knowledge paths.

#### Scenario: Promote approved proposal

- **GIVEN** an approved review for a medium-risk proposal
- **AND** the proposal patch path starts with `kb/` or `skills/`
- **WHEN** `praxisbase promote --auto` runs
- **THEN** the patch content is written to the stable knowledge path

#### Scenario: Reject unsafe patch path

- **GIVEN** an approved proposal with patch path `../outside.md`
- **WHEN** `praxisbase promote --auto` runs
- **THEN** promotion fails
- **AND** no file outside the workspace is written

### Requirement: Static Repair Bundle Build

The system shall build static artifacts for repair agents.

#### Scenario: Build static artifacts

- **GIVEN** an initialized workspace
- **WHEN** `praxisbase build` runs
- **THEN** the system writes `dist/repair-bundles/manifest.json`
- **AND** writes `dist/repair-bundles/openclaw-sandbox.json`
- **AND** writes `dist/kb-index.json`, `dist/search-index.json`, `dist/llms.txt`, and `dist/index.html`

### Requirement: Bundle Fetch Cache Fallback

The system shall let repair agents continue with cached context when the latest generated bundle is unavailable.

#### Scenario: Return last-known-good bundle

- **GIVEN** a last-known-good OpenClaw repair bundle cache exists
- **AND** the latest generated bundle cannot be read
- **WHEN** the agent runs `praxisbase bundle fetch openclaw --signature openclaw:claude-auth-expired`
- **THEN** the command returns the cached bundle
- **AND** emits a machine-readable cache warning

### Requirement: GitLab Scheduled Automation

The system shall provide a GitLab CI template for scheduled review, promotion, and build.

#### Scenario: Write jobs are serialized

- **GIVEN** the generated GitLab CI template
- **WHEN** another agent reviews the template
- **THEN** review and promote jobs include `resource_group: praxisbase-write`
- **AND** build artifacts include `dist/`
