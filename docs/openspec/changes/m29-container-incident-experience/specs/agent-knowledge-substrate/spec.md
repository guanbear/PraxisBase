# Agent Knowledge Substrate Spec Delta: M29 Container Incident Experience

## ADDED Requirements

### Requirement: K8s Incident Domain On Shared Protocol

PraxisBase SHALL support a K8s incident domain reusing the existing episode, proposal, known_fix, and skill object model.

#### Scenario: Incident episode uses the shared schema

- **GIVEN** an sre-autopilot DirectionResult for signature `k8s:pod-oomkilled`
- **WHEN** the adapter produces an episode
- **THEN** the episode validates as `IncidentEpisode` with scope `team`
- **AND** no parallel object type is introduced

### Requirement: Read-Only K8s Incident Bundle

PraxisBase SHALL produce signature-filtered, read-only K8s incident bundles with mandatory safety fields.

#### Scenario: Bundle fetch returns a compact safe bundle

- **GIVEN** a promoted `kb/known-fixes/k8s-pod-oomkilled.md`
- **WHEN** `praxisbase bundle fetch k8s-incident --signature k8s:pod-oomkilled --json` runs
- **THEN** the bundle contains matching known_fixes, skills, forbidden_operations, verification_steps, and source_refs
- **AND** it contains no full raw logs or credentials

#### Scenario: Checksum mismatch is rejected and downgraded

- **GIVEN** a bundle entry whose checksum does not match the manifest
- **WHEN** the bundle is fetched
- **THEN** the entry is rejected with a warning
- **AND** the consumer can still diagnose from rules and live evidence

### Requirement: Incident Episode Intake

PraxisBase SHALL accept sre-autopilot incident episodes and proposals through outbox into team review/promote.

#### Scenario: Incident proposal enters review

- **GIVEN** an sre-autopilot incident proposal written to `.praxisbase/outbox/proposals`
- **WHEN** the sync step runs and `praxisbase review --auto` processes it
- **THEN** the proposal enters the team review/promote flow
- **AND** stable knowledge changes only through promotion

### Requirement: K8s Governance Reuse

PraxisBase SHALL govern K8s objects with the same lifecycle as repair objects.

#### Scenario: K8s known fix gains references and matures

- **GIVEN** incident episodes citing a k8s known fix across two distinct environments
- **WHEN** the maturity lifecycle runs
- **THEN** the k8s known fix maturity advances using the same rules as repair objects

### Requirement: K8s Production Boundary

PraxisBase SHALL not grant Kubernetes permissions and SHALL keep bundles recommendation-only.

#### Scenario: Bundle marks remediation as recommendation only

- **GIVEN** a k8s known fix with remediation guidance
- **WHEN** it is included in a bundle
- **THEN** remediation is marked recommendation with verification and escalation
- **AND** no automatic production execution is requested

#### Scenario: New default k8s skill requires human approval

- **GIVEN** a proposal to enable a new default k8s triage skill
- **WHEN** review runs
- **THEN** it is routed to human-required

### Requirement: K8s Release Audit Gates

PraxisBase SHALL extend the team release audit with K8s gates.

#### Scenario: Team audit includes K8s gates

- **WHEN** `praxisbase team release-audit --json` runs after M29
- **THEN** it includes `k8s_bundle_ga`, `incident_episode_intake_ga`, and `k8s_boundary_ga`
- **AND** `team_ga` requires these to pass alongside the M28 gates
