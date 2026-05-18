Feature: SRE-autopilot K8s incident integration

  PraxisBase should support live K8s incident systems as peer clients
  without becoming a synchronous runtime dependency or production executor.

  Scenario: Fetch matching K8s incident bundle
    Given a built k8s-incident bundle contains signature "k8s:pod-oomkilled"
    When sre-autopilot requests context for "k8s:pod-oomkilled"
    Then the response includes only matching known fixes and skills
    And the response includes forbidden operations and verification steps
    And the response includes source references

  Scenario: Missing bundle does not fail live diagnosis
    Given no k8s-incident bundle is available
    When sre-autopilot starts CP direction analysis
    Then diagnosis continues using live evidence and rules
    And PraxisBase unavailability is recorded as a warning or data gap

  Scenario: Invalid checksum falls back safely
    Given manifest checksum does not match a k8s-incident bundle entry
    When the bundle is fetched
    Then the invalid entry is rejected
    And the consumer uses last-known-good cache or an empty bundle

  Scenario: Submit valid incident episode
    Given an incident episode contains protocol_version, run_id, environment_id, problem_signature, source_refs, and evidence_summary
    When the episode is submitted
    Then the episode is validated
    And it is written to .praxisbase/inbox/episodes

  Scenario: Reject incident episode without provenance
    Given an incident episode has no source_refs
    When the episode is submitted
    Then validation fails with a machine-readable error
    And no inbox episode is written

  Scenario: Authority repo unavailable writes outbox
    Given a valid incident episode
    And the authority repo cannot be written
    When the consumer submits the episode
    Then the episode is written to .praxisbase/outbox/episodes
    And the object includes an idempotency key

  Scenario: Production remediation remains recommendation only
    Given a known fix recommends changing Kubernetes resource limits
    When the k8s-incident bundle is generated
    Then the remediation is marked as recommendation guidance
    And the bundle does not contain an automatically executable production write action
    And verification and escalation conditions are included

  Scenario: Stable knowledge update requires proposal review
    Given sre-autopilot finds a reusable K8s troubleshooting step
    When it wants to update shared knowledge
    Then it submits a proposal with source refs, evidence hash, and verification observation
    And the proposal must pass review and promotion before changing kb or skills
