Feature: LLM Wiki fidelity contract

  Background:
    Given PraxisBase has harvested redacted Codex and OpenClaw experience
    And AI curation is configured
    And the wiki is built through review and promote

  Scenario: Root wiki artifacts are generated
    Given at least one stable compiled wiki page exists
    When the wiki site is built
    Then "dist/wiki/index.md" exists
    And "dist/wiki/log.md" exists
    And "dist/wiki/purpose.md" exists
    And "dist/wiki/schema.md" exists
    And "dist/wiki/overview.md" exists

  Scenario: Source summaries preserve traceability
    Given a useful Codex memory has source ref "codex:session:1"
    And the memory has source hash "sha256:abc"
    When wiki curation runs
    Then a source summary is written for "codex:session:1"
    And the source summary records "sha256:abc"
    And the source summary is not promoted as a known fix

  Scenario: Same lesson from different agents becomes one topic
    Given Codex evidence says long OpenClaw delegated work needs an ACK before dispatch
    And OpenClaw evidence says long delegated task dispatch should acknowledge before work starts
    When PraxisBase builds canonical topics
    Then one ACK timing topic is produced
    And the topic includes both source refs

  Scenario: Compiled proposal carries lifecycle metadata
    Given a useful topic is synthesized into a curated wiki proposal
    When the proposal is validated
    Then the proposal includes page kind
    And the proposal includes confidence
    And the proposal includes lifecycle
    And the proposal includes provenance

  Scenario: Graph edges are typed
    Given a stable procedure links to a stable OpenClaw coordination page
    When the wiki graph is built
    Then the graph contains a "related" edge
    And graph links resolve to stable page ids

  Scenario: Shared provenance creates source overlap
    Given two stable pages share a source hash
    When the wiki graph is built
    Then the graph contains a "source_overlap" edge between the pages

  Scenario: Fidelity lint catches raw-copy pages
    Given a stable page body is mostly raw JSON or transcript text
    When fidelity lint runs
    Then the finding list contains "raw-copy-page"

  Scenario: Fidelity lint catches source summaries promoted as guidance
    Given a source summary page is promoted as a known fix
    When fidelity lint runs
    Then the finding list contains "source-summary-promoted-as-guidance"

  Scenario: Agent context prefers compiled wiki
    Given raw evidence and a compiled procedure both mention ACK timing
    When Codex requests PraxisBase context for "ACK timing"
    Then the context includes the compiled procedure
    And the context includes provenance pointers
    And the context does not include raw transcript bodies by default

  Scenario: Golden corpus proves compounding
    Given the golden corpus contains repeated ACK timing evidence from multiple agents
    And it contains official documentation noise
    And it contains private material
    When daily curation, review policy, promotion, graph, site, and lint run
    Then useful evidence count is greater than durable page count for the ACK lesson
    And at least one page has multiple sources
    And root wiki artifacts exist
    And fidelity lint catches the seeded bad pages
