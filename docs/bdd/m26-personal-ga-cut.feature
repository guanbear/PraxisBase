Feature: M26 personal GA cut
  PraxisBase personal mode is truly usable only when PB can compile personal agent experience into wiki/context, promote at least one usable skill, and publish stable PB outputs to GBrain for agent runtime retrieval.

  Background:
    Given PraxisBase is running in personal mode
    And local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi are the required personal evidence families when configured
    And GBrain is the preferred agent runtime brain
    And PB stable wiki and promoted PB skills are the promotion authority
    And GBrain and AgentMemory sidecar hits are not PB promotion evidence

  Scenario: PB core smoke is not final personal GA
    Given a production personal daily run produced stable PB context
    And no promoted PB skill exists
    And no GBrain publish or retrieval evidence exists
    When I run the personal release audit
    Then PB wiki/context GA passes
    And PB skill compiler GA fails
    And GBrain runtime GA fails
    And final personal GA fails

  Scenario: Full personal queue drains high-priority sources
    Given the configured personal sources include local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi
    When the full personal queue runs with resume and cache enabled
    Then high-priority memory, report, and durable session spans are processed or have explicit blockers
    And low-priority skipped items do not fail the gate
    And the queue report records resume state and remaining high-priority items

  Scenario: Finite AI budget can still pass when the high-priority ledger is drained
    Given high-priority personal chunks have current source-item ledger entries
    And the run uses a finite uncached AI budget
    When no high-priority chunks are skipped or failed
    Then the queue report can be full
    And Gate 1 is not blocked by the budget flag alone

  Scenario: Historical PB readiness without queue evidence is not enough
    Given an older daily report says personal_ga.production_ready is true
    But the report has no personal queue evidence
    When I run the personal release audit
    Then PB wiki/context GA fails
    And the blockers include personal_queue_report_missing

  Scenario: Agent context uses PB authority without relying on sidecars
    Given stable PB wiki pages or active personal lessons exist
    And GBrain and AgentMemory sidecar retrieval are unavailable
    When OpenClaw requests diagnosis context
    Then PB returns PB-authoritative context items
    And sidecar failures are warnings

  Scenario: Skill promotion requires governed PB sources
    Given a skill signal cites only raw dreaming memory or raw session corpus
    When skill source authority is evaluated
    Then the signal is rejected for stable promotion
    And it may not become an injectable promoted skill

  Scenario: Skill compiler GA requires a promoted injectable skill
    Given skill candidates exist in the review queue
    But no PraxisBase synthesized skill has been promoted under skills/**
    When I run the personal release audit
    Then PB skill compiler GA fails
    And the audit tells me which review, validation, or promote command to run

  Scenario: A promoted skill is injected for a real task
    Given a validated personal OpenClaw dispatch skill has been promoted
    When I preview skill injection for "openclaw dispatch routing failure"
    Then the response includes the promoted skill
    And the injected skill carries PB stable authority and promotion metadata

  Scenario: GBrain receives only stable PB outputs
    Given stable wiki pages, promoted skills, pending proposals, and human-required records exist
    When PB publishes to GBrain source "praxisbase"
    Then only stable wiki pages, promoted skills, and stable catalog entries are exported
    And pending, human-required, rejected, raw, private, and candidate skill material is excluded

  Scenario: GBrain runtime GA requires retrieval
    Given PB has published stable wiki and promoted skills to GBrain
    When Codex requests context with GBrain enabled
    Then PB stable context appears first
    And GBrain sidecar hits appear after PB stable context
    And the release audit records GBrain retrieval evidence

  Scenario: GBrain is required for final GA but not for PB compiler gates
    Given PB wiki/context GA passes
    And PB skill compiler GA passes
    But GBrain publish or retrieval evidence is missing
    When I run the personal release audit
    Then GBrain runtime GA fails
    And final personal GA fails
    And PB wiki/context GA and PB skill compiler GA keep their pass status

  Scenario: HTML separates stable output from queues
    Given the latest release audit has mixed gate status
    When the HTML site is built
    Then the homepage shows Gate 1, Gate 2A, and Gate 2B separately
    And stable wiki, active lessons, promoted skills, pending skill candidates, privacy blockers, and GBrain status are not conflated
