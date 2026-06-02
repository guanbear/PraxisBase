Feature: Agent context juice and personal learning
  PraxisBase should give agents bounded, trusted, useful context without wasting tokens or leaking personal runtime preferences into team knowledge.

  Scenario: Long source item is budgeted before AI
    Given a Codex session source item contains a large tool result and source provenance
    When daily prepares AI distill input with context juice enabled
    Then PraxisBase truncates the payload at a UTF-8 boundary when over budget
    And the reduced payload contains a dropped-byte marker
    And the daily report records original bytes, kept bytes, saved bytes, source ref, and source hash

  Scenario: Trajectory microcompact preserves repair evidence
    Given a long OpenClaw trajectory contains old tool outputs, a failure, a fix, a verification event, an explicit lesson, and provenance
    When trajectory microcompact runs
    Then old low-signal tool result bodies are replaced by a stable placeholder
    And the failure, fix, verification event, explicit lesson, source ref, and source hash remain
    And the newest configured tool results remain intact

  Scenario: Microcompact is idempotent
    Given a trajectory has already been microcompacted
    When trajectory microcompact runs again with the same settings
    Then the output does not change
    And no additional cleared body count is recorded

  Scenario: Optional payload pre-summary falls back safely
    Given an oversized payload qualifies for optional AI pre-summary
    And the configured model returns a non-shrinking summary
    When daily continues processing
    Then PraxisBase discards the summary
    And it uses deterministic context juice output
    And the report records a warning without failing the run

  Scenario: Stable PB context outranks sidecars
    Given a stable PraxisBase page, a GBrain sidecar hit, and an AgentMemory sidecar hit all match "OpenClaw memory repair"
    When I run `praxisbase context bundle --query "OpenClaw memory repair" --json`
    Then the stable PraxisBase page appears before sidecar hits
    And sidecar hits are marked as lower authority
    And untrusted sidecar bodies are wrapped before agent use

  Scenario: Bundle budget preserves citations
    Given matching stable pages, promoted skills, catalog entries, and sidecar hits exceed the bundle budget
    When the agent context bundle is packed
    Then lower-authority full bodies are dropped before citations
    And the omitted-item summary names excluded item ids and reasons

  Scenario: Promoted skill explicit mention wins
    Given two promoted PB skills match a user task
    And the user query explicitly mentions one skill with @skill
    When skill injection preview runs
    Then the mentioned skill appears first
    And every considered skill has a match or skip reason and byte count

  Scenario: Candidate skills are not injected
    Given a review candidate and a promoted PB skill both match a query
    When an agent context bundle is built
    Then the promoted skill may appear in the skill section
    And the review candidate body does not appear

  Scenario: Personal facet enters personal bundle
    Given repeated local personal evidence says the user prefers terse final answers
    When the personal learning cache rebuilds
    Then a style verbosity facet can become active
    And the facet appears in personal mode within the personal facet budget
    And the facet is excluded from team mode by default

  Scenario: Explicit personal instruction can seed a profile facet
    Given I have a personal PraxisBase workspace
    When I run `praxisbase personal profile add "以后默认用 pnpm 跑测试" --json`
    And the personal learning cache rebuilds
    Then a tooling facet can become active or provisional
    And it can appear in personal mode runtime context
    And it is excluded from team mode by default

  Scenario: Forgotten personal facet stays forgotten
    Given an active personal facet exists
    When I run `praxisbase personal profile forget style/verbosity`
    Then the facet is removed from managed profile output
    And repeated automatic evidence cannot re-promote it without explicit user action

  Scenario: Site shows runtime context health without private evidence
    Given context juice, bundle building, skill injection, and personal profile rebuild have run
    When I build the HTML site
    Then the site shows byte savings, bundle budget usage, trust-tier counts, skill injection decisions, and personal facet counts
    And raw private facet evidence and raw sidecar bodies are not rendered by default
