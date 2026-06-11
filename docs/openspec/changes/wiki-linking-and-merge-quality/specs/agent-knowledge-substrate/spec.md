## ADDED Requirements

### Requirement: Deterministic Wiki Relationship Planning

PraxisBase SHALL derive deterministic relationship plans between canonical wiki topics and existing stable wiki pages before AI synthesis.

#### Scenario: Related pages are discovered before synthesis

- **GIVEN** a wiki topic and two stable pages sharing signatures or normalized problem/action entities
- **WHEN** wiki curation plans the topic
- **THEN** the planner records related pages with strength, reasons, path, title, and slug
- **AND** the output is sorted deterministically

#### Scenario: Canonical stable page prevents duplicate create

- **GIVEN** a topic has the same canonical topic key or source hash as a stable page
- **WHEN** the compiler creates a page plan
- **THEN** the action is `update` or `merge`
- **AND** the compiler does not write a duplicate create proposal for the same canonical page

### Requirement: Required Links In Curated Wiki Proposals

PraxisBase SHALL pass required and suggested wikilinks into AI wiki synthesis and preserve them on curated proposal records.

#### Scenario: Required link is present in generated page

- **GIVEN** a page plan has one required link to a stable page
- **WHEN** AI synthesis returns a body containing `[[stable-slug|Stable Page]]`
- **THEN** the quality gate accepts the link requirement
- **AND** the proposal records the required link and relationship reason

#### Scenario: Missing required links require human review

- **GIVEN** a page plan has required links
- **WHEN** AI synthesis returns a body with no valid required wikilink
- **THEN** the quality gate records `missing_wikilinks`
- **AND** auto-promotion is blocked

### Requirement: Merge Quality And Scope Safety

PraxisBase SHALL keep merge/update plans reviewable and scope-safe.

#### Scenario: Ambiguous merge target requires human review

- **GIVEN** a topic has canonical relationships to multiple stable pages
- **WHEN** no deterministic target wins
- **THEN** the proposal is marked human-required with `ambiguous_merge_target`
- **AND** no stable page is archived automatically

#### Scenario: Personal material does not merge into team scope

- **GIVEN** a personal topic is related to a team stable page
- **WHEN** the relationship planner evaluates merge candidates
- **THEN** it does not create an automatic team merge
- **AND** it records a cross-scope review reason instead

### Requirement: Relationship Counts In Reports And Site

PraxisBase SHALL expose linking and merge quality in reports and static HTML.

#### Scenario: Curation report explains relationship planning

- **GIVEN** wiki curation has planned topics with required links, suggested links, merge plans, and isolated topics
- **WHEN** the curation report is written
- **THEN** `relationship_counts` contains required links, suggested links, merge plans, ambiguous merge targets, isolated topics, and orphan risk

#### Scenario: Review page shows link and merge explanations

- **GIVEN** a pending curated proposal has required links and merge candidates
- **WHEN** the user opens `dist/review.html`
- **THEN** the candidate card shows required links, merge target, and relationship reasons
- **AND** raw evidence human-required counts do not inflate the main review queue count
