# Agent Knowledge Substrate Spec Delta: M28 Team Repair Self-Evolution

## ADDED Requirements

### Requirement: Repair Context From Real Knowledge With Budget

PraxisBase SHALL build OpenClaw repair context from real `kb/` and `skills/` objects matched by problem signature, bounded by a query budget.

#### Scenario: Context loads promoted knowledge by signature

- **GIVEN** `kb/known-fixes/openclaw-dispatch-routing-failures.md` is promoted with maturity `verified` and declares a `signatures:` entry (e.g. `openclaw:dispatch-routing-failure`, which M28 must add to the signature detector)
- **AND** a log file matches that signature
- **WHEN** `praxisbase repair-context openclaw --logs <file> --json` runs
- **THEN** the response `known_fixes` includes that page path
- **AND** the response is ordered by maturity then reference_count
- **AND** when the byte budget is exceeded the response is marked `truncated`

#### Scenario: Missing bundle falls back to cache

- **GIVEN** the latest bundle is unavailable
- **WHEN** repair context is requested
- **THEN** PraxisBase returns the last-known-good cache with a warning
- **AND** the repair flow is not blocked

### Requirement: Team Write Through Outbox

PraxisBase SHALL accept team repair episodes and proposals through an outbox with idempotency.

#### Scenario: Sandbox agent submits via outbox

- **GIVEN** a sandbox repair agent without broad Git write access
- **WHEN** it submits an episode to `.praxisbase/outbox/episodes`
- **AND** the sync step runs
- **THEN** the episode is ingested into the inbox once even if retried with the same idempotency key

### Requirement: Team Risk-Tiered Promotion

PraxisBase SHALL auto-merge low/medium risk team proposals and route high risk to human review.

#### Scenario: Low risk known fix auto-merges

- **GIVEN** a low-risk draft known_fix proposal with provenance and reviewer approval above threshold
- **WHEN** `praxisbase promote --auto` runs
- **THEN** the object is promoted into `kb/`

#### Scenario: High risk routes to human exception

- **GIVEN** a proposal that enables a new default skill
- **WHEN** `praxisbase review --auto` runs
- **THEN** it is routed to `.praxisbase/exceptions/human-required`
- **AND** stable knowledge is unchanged

### Requirement: Reference Tracking And Maturity Lifecycle

PraxisBase SHALL update reference counts from episodes and evolve maturity automatically.

#### Scenario: Episode reference increments count

- **GIVEN** an episode whose `knowledge_references` cite a known fix
- **WHEN** `praxisbase promote --auto` or `praxisbase build` processes it
- **THEN** the known fix `reference_count` increments and `last_referenced_at` is set

#### Scenario: Verified promotes to proven across environments

- **GIVEN** a verified known fix referenced successfully in two distinct environments
- **WHEN** the maturity lifecycle runs
- **THEN** the known fix becomes `proven`

#### Scenario: Idle proven decays but is restorable

- **GIVEN** a proven object not referenced for the configured idle window
- **WHEN** decay runs
- **THEN** it is downgraded and removed from the active index without deleting content
- **AND** a later reference restores its maturity

### Requirement: Three-Tier Progressive Index

PraxisBase SHALL generate a three-tier index so agents can locate knowledge under a query budget.

#### Scenario: Build emits catalog, category lists, and objects

- **WHEN** `praxisbase build` runs
- **THEN** it produces a Layer A catalog, Layer B per-category one-line lists, and Layer C full objects

### Requirement: Team Skill Self-Evolution Behind Review

PraxisBase SHALL synthesize team skill candidates and require human/Git review before promotion.

#### Scenario: Team skill candidate is not auto-promoted

- **GIVEN** a team skill candidate passes semantic review
- **WHEN** daily team automation completes
- **THEN** stable `skills/**` is unchanged
- **AND** the report includes the Git/MR next action

#### Scenario: Promoted team skill loads into repair context

- **GIVEN** a team skill is promoted after human review
- **WHEN** a matching `repair-context openclaw` runs
- **THEN** the promoted skill path is included

### Requirement: Team Release Audit

PraxisBase SHALL provide `praxisbase team release-audit --json` evaluating team gates.

#### Scenario: Team audit reports gate statuses

- **WHEN** `praxisbase team release-audit --json` runs
- **THEN** it includes `team_repair_loop_ga`, `skill_self_evolution_ga`, `governance_ga`, `privacy_boundary_ga`, and `team_ga`
- **AND** `team_ga=pass` only when all four pass

### Requirement: Team Privacy Boundary

PraxisBase SHALL keep personal scope and credentials out of team stable knowledge.

#### Scenario: Personal-only lesson excluded from team

- **GIVEN** a personal-only lesson
- **WHEN** team distillation runs
- **THEN** the lesson does not enter team stable knowledge

#### Scenario: Credential is hard-blocked

- **GIVEN** evidence containing a raw credential
- **WHEN** proposal generation runs in team mode
- **THEN** the item is blocked before proposal creation and routed to human-required
