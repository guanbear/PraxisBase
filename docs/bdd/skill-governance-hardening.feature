Feature: Skill governance hardening
  PraxisBase hardens M23 so stable knowledge remains governed even when GBrain and AgentMemory are available.

  Scenario: Skill promotion requires passing validation when policy enables the gate
    Given a skill candidate has semantic approval and a human audit
    And validation-required promotion policy is enabled
    When no matching passing validation report exists
    Then PraxisBase rejects stable skill promotion
    And the candidate remains in the reviewable queue

  Scenario: Passing validation unlocks audited promotion
    Given a skill candidate has semantic approval, passing validation, and a matching audit
    When skill promotion runs
    Then PraxisBase writes the stable skill through the promote path
    And the validation report is linked as promotion evidence

  Scenario: Stale validation does not authorize promotion
    Given a skill candidate changed after validation passed
    When promotion policy checks validation evidence
    Then PraxisBase treats the validation report as stale
    And the user is told to rerun skill validation

  Scenario: Daily next actions surface lifecycle work
    Given lifecycle analysis proposes promote, decay, archive, and conflict actions
    When daily reporting completes
    Then the next actions include lifecycle review commands
    And stable knowledge is unchanged until review and promote complete

  Scenario: Daily next actions surface validation work before promotion
    Given skill candidates exist without passing validation
    When daily reporting derives next actions
    Then skill validation is recommended before skill promotion
    And GBrain export is not recommended for unpromoted candidates

  Scenario: Site shows lifecycle and validation queues
    Given lifecycle proposals and skill validation reports exist
    When the site is built
    Then the review page shows lifecycle decisions and validation status
    And catalog entries do not increase pending proposal counts

  Scenario: Stable PB context outranks sidecar hits
    Given stable PB knowledge and AgentMemory sidecar hits match the same topic
    And GBrain sidecar search also returns the topic
    When context retrieval ranks results
    Then stable PB context appears first
    And sidecar hits do not count as promotion evidence

  Scenario: Source adapters preserve bounded trajectory metadata
    Given a supported session source contains tool outcomes, read skills, and verification events
    When PraxisBase imports the source
    Then the experience envelope includes bounded trajectory fields
    And raw transcripts and raw logs are rejected

  Scenario: AgentMemory failure is warning-only
    Given AgentMemory is configured but unhealthy
    When daily, site build, review, promotion, and GBrain export run
    Then PraxisBase records AgentMemory warnings
    And PB governance and GBrain export continue when their own prerequisites pass

  Scenario: Team mode excludes personal AgentMemory sidecar evidence
    Given personal AgentMemory hits match a team skill topic
    When team skill synthesis evaluates promotion evidence
    Then personal sidecar hits are ignored
    And only imported, privacy-reviewed, team-safe PB evidence can contribute
