Feature: Human required AI triage
  Human-required privacy queues should be reduced in personal mode without leaking secrets or weakening team privacy rules.

  Scenario: Auto-release high-confidence safe personal experience
    Given a personal human-required exception with redacted project experience metadata
    And AI classifies it as safe_personal_experience with confidence 0.9
    When I run privacy triage with auto release enabled in personal mode
    Then the triage item decision is auto_released
    And the exception record keeps triage audit metadata
    And stable knowledge is not changed directly

  Scenario: Hard-block concrete private values
    Given a human-required exception whose metadata contains a concrete token value
    And AI classifies it as safe_personal_experience
    When I run privacy triage with auto release enabled in personal mode
    Then the triage item decision is keep_human_required
    And the hard-block reason mentions private material

  Scenario: Team mode stays review-only
    Given a team-git human-required exception
    And AI classifies it as safe_personal_experience with confidence 0.95
    When I run privacy triage in team mode
    Then the triage item decision is team_review_only
    And the exception is not auto released

  Scenario: Review page shows triage status
    Given a human-required exception with triage metadata
    When the wiki site is built
    Then review.html shows the triage classification
    And review.html shows the triage decision and rationale
