Feature: LLM semantic review gate
  Wiki candidates are semantically reviewed before becoming stable agent guidance.

  Scenario: A useful multi-source procedure is accepted
    Given a synthesized wiki candidate with multiple sources
    And the candidate has concrete triggers, actions, verification, and provenance
    When semantic review runs
    Then the reviewer returns promote with a high quality score
    And the candidate remains eligible for personal auto-promotion

  Scenario: A one-off smoke test report is not created as a stable page
    Given a synthesized wiki candidate titled like a specific post-deploy smoke failure
    And the candidate has only one source
    When semantic review runs
    Then the reviewer returns merge or reject
    And the system does not write it as a standalone create candidate

  Scenario: A malformed synthesis is blocked
    Given a synthesized wiki candidate with repeated text
    And it contains dangling fragments and a JSON-shaped lesson bullet
    When semantic review runs
    Then the reviewer returns reject or revise
    And the candidate is not promoted to stable knowledge

  Scenario: A merge-worthy fragment updates an existing topic
    Given a candidate about missing replay data
    And an existing stable page covers Slack replay and post-deploy stability failures
    When semantic review runs
    Then the reviewer returns merge with the existing page path
    And deterministic arbitration rewrites the action as an update or merge

  Scenario: Team knowledge still requires human review
    Given a team-scope wiki candidate
    And semantic review returns promote
    When deterministic arbitration runs
    Then the final action is needs_human
    And no team page is auto-promoted

  Scenario: Semantic review unavailable blocks auto-promotion
    Given a personal wiki candidate that passes deterministic gates
    And the semantic reviewer times out
    When deterministic arbitration runs
    Then the final action is needs_human
    And the curation report counts the reviewer as unavailable

  Scenario: Review model falls back through curation model
    Given AI config has model "GLM-5.1" and curation_model "GLM-4.7"
    And review_model is not configured
    When semantic review runs
    Then the reviewer uses model "GLM-4.7"

  Scenario: Agentmemory sidecar is not promotion evidence
    Given a synthesized wiki candidate has one agentmemory sidecar hit
    And that hit has not been ingested into PraxisBase provenance
    When semantic review runs
    Then the reviewer treats the hit as related context only
    And the candidate cannot be promoted solely because of that hit
