# Spec: Agent Knowledge Substrate

## ADDED Requirements

### Requirement: GBrain-first agent access

PraxisBase SHALL recommend GBrain MCP as the default broad brain access path for agents when GBrain is configured.

#### Scenario: Generated skill prefers GBrain MCP

- **GIVEN** a PraxisBase workspace with generated agent tools
- **WHEN** the user opens `.praxisbase/agent-tools/skills/praxisbase/SKILL.md`
- **THEN** the skill explains that agents should use GBrain MCP for broad memory lookup
- **AND** PraxisBase CLI is described as the governance path for evidence capture, privacy triage, review, promote, and publish.

### Requirement: PraxisBase stable export to GBrain

PraxisBase SHALL export only stable reviewed wiki pages and promoted skills to GBrain.

#### Scenario: Pending material is not exported

- **GIVEN** a pending wiki candidate in `.praxisbase/inbox/proposals`
- **AND** a stable wiki page in `kb/`
- **WHEN** the user runs GBrain export
- **THEN** only the stable wiki page is eligible for export
- **AND** raw evidence, human-required exceptions, and rejected candidates are excluded.

### Requirement: Privacy triage categories

PraxisBase SHALL distinguish privacy-required material from review-required and quality-rejected material in reports and HTML.

#### Scenario: Daily report separates blocked categories

- **GIVEN** a daily run with private evidence and low-signal evidence
- **WHEN** the site is built
- **THEN** privacy-required and low-signal counts are shown separately
- **AND** the privacy section includes the auto-release command for personal mode.

### Requirement: Trusted personal remote privacy release

PraxisBase SHALL allow explicitly trusted personal remote OpenClaw sources to skip only the remote-source privacy blocker.

#### Scenario: Trusted remote OpenClaw safe evidence is released

- **GIVEN** an OpenClaw SSH source with `scope_default` set to `personal`
- **AND** the source has `privacy_trust` set to `trusted_personal_remote`
- **AND** a privacy exception matches that source
- **AND** AI classifies the exception as high-confidence `safe_personal_experience`
- **WHEN** personal privacy triage runs with auto-release enabled
- **THEN** the exception is eligible for auto-release
- **AND** `remote_source_requires_review` is not included as a hard block.

#### Scenario: Trusted remote OpenClaw still blocks secrets

- **GIVEN** a trusted personal remote OpenClaw source
- **AND** matching evidence contains a concrete token, secret, cookie, bearer value, or private key
- **WHEN** personal privacy triage runs with auto-release enabled
- **THEN** the exception remains human-required
- **AND** the hard block includes `private_material_detected`.

### Requirement: Quality yield through merge and revise

PraxisBase SHALL improve useful output through merge and revise paths without lowering promotion gates.

#### Scenario: Semantic merge becomes reviewable update

- **GIVEN** a wiki candidate overlaps one existing stable page
- **AND** LLM semantic review returns `merge` with that target
- **WHEN** curation writes reviewable candidates
- **THEN** PraxisBase creates a merge/update candidate
- **AND** it does not auto-promote without the normal review policy.

#### Scenario: Incomplete skill is blocked

- **GIVEN** skill synthesis produces a procedure step ending mid-sentence
- **WHEN** semantic skill review runs
- **THEN** the skill is not promoted
- **AND** the review reason identifies incomplete procedure content.
