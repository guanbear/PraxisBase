Feature: Wiki synthesis quality and promotion

  Background:
    Given PraxisBase has harvested redacted Codex and OpenClaw experience
    And AI curation is configured

  Scenario: AI output is repaired into a linked wiki page
    Given relationship planning supplies a required link to "openclaw-operational-coordination"
    And the AI curator returns a body without wikilinks
    When PraxisBase synthesizes the curated wiki proposal
    Then the proposal body contains "## Related Wiki Pages"
    And the proposal body contains "[[openclaw-operational-coordination|OpenClaw operational coordination]]"
    And the proposal body contains "## Provenance"

  Scenario: Raw or weak output cannot enter stable knowledge
    Given a curated proposal body contains raw JSON or lacks reusable lessons
    When promotion quality is assessed
    Then the proposal has a hard block
    And personal auto-promotion does not promote it

  Scenario: Personal mode promotes only low-risk compiled pages
    Given a personal create proposal has problem, fix, verification, reusable lessons, provenance, confidence above 0.82, and required links
    When the personal review policy runs with promotion enabled
    Then the proposal is approved
    And the stable wiki page is written

  Scenario: Team mode remains review-gated
    Given a team-scoped curated proposal passes content quality
    When the default team review policy runs
    Then the proposal is marked for human review
    And no stable team knowledge is written automatically

  Scenario: Controlled smoke proves graph connectivity
    Given repeated agent evidence clusters into fewer wiki proposals than raw evidence items
    And related stable pages exist
    When curation, review, promotion, and site build complete
    Then the graph contains links
    And the orphan count is lower than the page count
