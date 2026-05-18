# Agent Knowledge Substrate Capability

## ADDED Requirements

### Requirement: K8s Incident Bundle Profile

The system shall define a `k8s-incident` static bundle profile for live incident consumers such as sre-autopilot.

#### Scenario: Fetch matching K8s incident bundle

- **GIVEN** a built bundle entry for `k8s:pod-oomkilled`
- **WHEN** a consumer requests `k8s-incident` context for that signature
- **THEN** the returned bundle includes matching known fixes, skills, forbidden operations, verification steps, and source refs
- **AND** the returned bundle does not include unrelated signatures

#### Scenario: Reject invalid bundle checksum

- **GIVEN** the manifest checksum for a bundle entry does not match the entry content
- **WHEN** the consumer fetches that entry
- **THEN** the entry is rejected
- **AND** the consumer may use last-known-good cache or an empty bundle

### Requirement: Live Incident Diagnosis Must Not Depend On PraxisBase Availability

The system shall treat PraxisBase bundles as optional context for live incidents.

#### Scenario: Bundle is unavailable

- **GIVEN** a live K8s incident diagnosis is running
- **AND** the `k8s-incident` bundle cannot be fetched
- **WHEN** the consumer continues diagnosis
- **THEN** the consumer uses live evidence and local rules
- **AND** the diagnosis is not failed solely because PraxisBase is unavailable

### Requirement: Incident Episode Intake

The system shall accept `incident_episode` records from live diagnosis systems.

#### Scenario: Submit valid incident episode

- **GIVEN** an episode JSON with `type: "incident_episode"`
- **AND** it includes `problem_signature`, `run_id`, `environment_id`, `source_refs`, and `evidence_summary`
- **WHEN** the agent runs `praxisbase episode submit <file>`
- **THEN** the system validates the episode
- **AND** writes it to `.praxisbase/inbox/episodes/<episode-id>.json`

#### Scenario: Reject incident episode without source refs

- **GIVEN** an incident episode without `source_refs`
- **WHEN** the agent submits it
- **THEN** the command fails with a machine-readable validation error
- **AND** no inbox episode is written

### Requirement: Async Outbox For Live Incident Consumers

The system shall support outbox submission for consumers that cannot write directly to the authority repo.

#### Scenario: Authority repo is unavailable

- **GIVEN** a valid incident episode
- **AND** the authority repo cannot be written
- **WHEN** the consumer submits the episode
- **THEN** the episode is written to `.praxisbase/outbox/episodes`
- **AND** the write can be retried idempotently later

### Requirement: Production Remediation Is Recommendation Only

PraxisBase shall not enable automatic production Kubernetes write operations through K8s incident bundles.

#### Scenario: Bundle includes remediation guidance

- **GIVEN** a known fix recommends increasing a memory limit
- **WHEN** the bundle is generated
- **THEN** the remediation is represented as a recommendation with verification and escalation conditions
- **AND** it is not represented as an automatically executable production action

### Requirement: Stable Knowledge Changes Go Through Proposal Review

Live incident consumers shall submit reusable knowledge as proposals instead of directly writing stable objects.

#### Scenario: New K8s runbook improvement is discovered

- **GIVEN** an incident episode reveals a reusable troubleshooting step
- **WHEN** the consumer wants to update shared knowledge
- **THEN** it submits a proposal with evidence source refs and verification observation
- **AND** the proposal must pass review and promotion before entering `kb/` or `skills/`
