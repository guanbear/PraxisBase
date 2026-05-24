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

  Scenario: Links must resolve to stable page ids, not just look like wikilinks
    Given a stable note page has frontmatter id "wiki-asynchronous-task-ux-and-dispatch-mapping-anomalies"
    And its human title slug is "asynchronous-task-ux-and-dispatch-mapping-anomalies"
    When relationship planning, synthesis repair, graph build, and site render run
    Then generated relationship links use the stable page id slug
    And title-slug aliases still resolve in graph for older pages
    And rendered HTML turns resolved wikilinks into clickable page links

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

  Scenario: Personal mode may promote low-risk wiki updates
    Given a personal update proposal adds provenance and resolver-valid related wiki links to an existing page
    And the proposal has no quality hard block or human-required reason
    When the personal review policy runs with promotion enabled
    Then the existing stable wiki page is updated

  Scenario: Startup and configuration fragments stay out of wiki proposals
    Given a Codex memory chunk only describes system prompts, sandbox mode, installed skills, and session initialization
    When PraxisBase builds the wiki evidence pool
    Then the chunk is counted as filtered noise
    And no wiki page candidate is written for it

  Scenario: Repeated operational lessons cluster before synthesis
    Given one OpenClaw memory and one Codex memory both describe delayed ACK behavior for long-running delegated work
    When PraxisBase builds wiki topics
    Then there is one ACK timing topic
    And the topic has multiple source refs

  Scenario: Auto-promoted pages do not link to human-gated planned pages
    Given one planned page has repeated evidence and promotion-grade confidence
    And another planned page is a low-confidence or single-source candidate
    When PraxisBase prepares suggested links for synthesis
    Then the promotion-grade page does not receive a wikilink to the human-gated candidate

  Scenario: Safe but weak AI synthesis falls back to evidence-shaped body
    Given the AI curator returns safe markdown that lacks actionable repair guidance
    When PraxisBase validates the curated wiki proposal
    Then curation rebuilds the body from evidence actions, verification, reusable lessons, and provenance
    And the proposal still goes through the normal quality gate

  Scenario: Fallback body is written for future agents
    Given repeated evidence has concrete symptoms, actions, verification, and reusable lessons
    When deterministic fallback writes the wiki body
    Then the body contains "## When to Use"
    And the body contains "## What To Do"
    And the body contains "## Verify"
    And the body does not contain a long machine signature applicability sentence

  Scenario: Status-check topics become procedures
    Given repeated OpenClaw evidence says task runner status is missing
    And the reusable action is to verify runner presence before dispatch debugging
    When PraxisBase builds wiki topics
    Then the topic is planned as a procedure
    And the target path is under "kb/procedures/"

  Scenario: Duplicate same-run targets are reduced before review
    Given two curated wiki proposals target the same stable path
    And one proposal has higher source count and confidence
    When PraxisBase writes review proposals
    Then only the higher quality proposal is written for that target path

  Scenario: Stale pending proposal for the same target is replaced
    Given the review inbox already contains a pending wiki proposal for "kb/known-fixes/openclaw-auth-expired.md"
    And a later curation run synthesizes a current proposal for the same stable path
    When PraxisBase writes review proposals
    Then the stale pending proposal is removed
    And only the current proposal remains for that stable path

  Scenario: One-off run reports stay review-gated
    Given a single-source curated proposal describes a specific OpenClaw acceptance-test run id
    And the proposal body has action and verification sections
    When promotion quality is assessed
    Then the proposal is marked "one_off_run_report"
    And personal auto-promotion does not promote it

  Scenario: Narrow AI markdown artifacts are repaired
    Given the AI curator returns a wiki body with "n*   Test reports should be checked"
    When deterministic repair runs
    Then the proposal body contains "*   Test reports should be checked"
    And the proposal body does not contain "n*   Test reports should be checked"

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
