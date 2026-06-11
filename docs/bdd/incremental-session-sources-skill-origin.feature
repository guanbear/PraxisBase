Feature: Incremental session sources and skill origin

  Scenario: Re-running personal daily skips unchanged session provider calls
    Given a local Codex, Claude Code, or OpenCode source was already distilled
    And the source hash, parser, reducer identity, authority mode, and model are unchanged
    When personal daily runs again
    Then PraxisBase reuses valid cached distill output
    And no new provider call is made for the unchanged item

  Scenario: Adding one new session only spends one uncached budget item
    Given two existing sessions already have valid cache entries
    And one new session file appears
    When daily runs with "--max-ai-chunks 1"
    Then PraxisBase distills the new session
    And the two existing sessions are reused from cache

  Scenario: OpenCode can be configured as a local source
    Given an OpenCode session directory exists
    When the user adds it as an opencode source
    Then the inferred parser is "opencode-session"
    And generated source refs use an OpenCode namespace

  Scenario: PraxisBase-generated skills carry provenance
    Given repeated distilled experiences produce a skill candidate
    When PraxisBase writes the candidate
    Then the skill frontmatter says it was synthesized by PraxisBase
    And the source refs and hashes remain visible for review

  Scenario: External installed skills do not pollute wiki evidence
    Given an installed skill has no PraxisBase provenance
    When PraxisBase collects wiki evidence
    Then the skill is classified as external installed
    And it is not converted into a new wiki candidate by default

