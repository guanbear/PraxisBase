# Agent Knowledge Substrate Spec Delta: Wiki Curation Synthesis

## ADDED Requirements

### Requirement: Curated Wiki Proposals

PraxisBase SHALL synthesize safe evidence into curated wiki proposals before presenting the default human review queue.

#### Scenario: Raw evidence becomes curated proposals

- **GIVEN** multiple captures, native memory summaries, or distilled experiences describe the same fix
- **WHEN** `praxisbase wiki curate --review --json` runs
- **THEN** PraxisBase writes one or more `wiki_curated_proposal` records under `.praxisbase/inbox/proposals/`
- **AND** each record includes `source_refs`, `source_hashes`, `source_count`, and `evidence_ids`
- **AND** PraxisBase does not write `kb/` or `skills/`

### Requirement: Operational Noise Filtering

PraxisBase SHALL filter operational noise before wiki curation.

#### Scenario: Session metadata does not become review work

- **GIVEN** evidence contains `session_meta`, base instructions, `openclaw:unknown`, or an empty promotion log
- **WHEN** wiki curation runs
- **THEN** those items are counted as filtered noise
- **AND** they do not become curated proposals

### Requirement: Production AI Curation

PraxisBase SHALL require configured AI for production wiki curation unless degraded mode is explicit.

#### Scenario: Missing AI fails production curation

- **GIVEN** no AI provider is configured
- **WHEN** the user runs `praxisbase wiki curate --review --json`
- **THEN** the command fails with `AI_CURATOR_NOT_CONFIGURED`
- **AND** it does not write curated proposals

### Requirement: Policy Driven Auto Review

PraxisBase SHALL support review policies that decide which curated proposals can be automatically reviewed or promoted.

#### Scenario: Personal low-risk proposal can auto promote

- **GIVEN** personal review policy is initialized
- **AND** a curated `known_fix` proposal has passing guards and confidence above policy threshold
- **WHEN** `praxisbase review auto --promote-approved --json` runs
- **THEN** PraxisBase writes a review record
- **AND** promotes the proposal through the existing promote path
- **AND** records provenance in the stable page

#### Scenario: Team proposal is not auto promoted by default

- **GIVEN** team review policy is initialized
- **AND** a curated team proposal is approved by automated review
- **WHEN** `praxisbase review auto --promote-approved --json` runs
- **THEN** PraxisBase does not promote it by default
- **AND** reports that team auto-promotion is disabled

### Requirement: Curated Queue Is Primary Review UI

PraxisBase SHALL use curated proposal count as the primary pending review count.

#### Scenario: Dashboard count matches clickable proposals

- **GIVEN** there are 3 curated proposals and 57 raw evidence items
- **WHEN** the user opens the generated site or review page
- **THEN** the primary pending count is 3
- **AND** clicking the count shows the 3 curated proposals
- **AND** raw evidence count appears only as secondary evidence/debug information
