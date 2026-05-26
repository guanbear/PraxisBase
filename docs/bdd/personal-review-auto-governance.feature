Feature: Personal review auto-governance
  Personal mode should turn local agent experience into reusable wiki and shared AgentMemory context with minimal manual work and strict team privacy.

  Scenario: Personal daily run explains next actions
    Given personal sources for Codex, OpenClaw, and AgentMemory are configured
    When I run the personal daily loop
    Then the result summarizes privacy-required, review-required, rejected, and promoted counts
    And the result recommends the next command to run
    And the result does not require inspecting internal .praxisbase paths

  Scenario: Personal privacy triage auto-releases safe experience
    Given a personal human-required exception with redacted agent repair experience
    And AI classifies it as safe_personal_experience with high confidence
    When I run privacy triage with auto release enabled in personal mode
    Then the triage decision is auto_released
    And the exception keeps audit metadata
    And no stable wiki page is promoted directly by triage

  Scenario: Team privacy remains strict
    Given a personal-scope source is configured in a team-git run
    When privacy triage evaluates the exception
    Then the decision is team_review_only
    And the item is not released into team knowledge

  Scenario: Review site separates action queues
    Given the latest run has privacy-required exceptions, review-required candidates, rejected candidates, and promoted pages
    When I build the static site
    Then the review page shows separate queue sections for each class
    And each queue card includes the reason and recommended command

  Scenario: Stable wiki exports to AgentMemory
    Given stable personal wiki pages exist
    And AgentMemory is healthy
    When I run AgentMemory export in personal write mode
    Then compact lesson payloads are sent to AgentMemory
    And review candidates, human-required items, raw evidence, and rejected material are skipped

  Scenario: Validation ladder prevents bad full runs
    Given a small real daily run has not passed quality inspection
    When I prepare a release validation run
    Then I run doctor, small daily, privacy triage, second small daily, AgentMemory export, and medium daily before any full run
    And one-off pass/fail reports do not enter stable wiki
