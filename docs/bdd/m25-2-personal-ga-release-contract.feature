Feature: M25.2 personal GA release contract
  PraxisBase personal mode should be considered complete when PB core can learn from personal agent evidence, show the knowledge to humans, and serve it to agents without depending on optional sidecars.

  Background:
    Given PraxisBase is running in personal mode
    And Codex app, codex-cliproxyapi, local OpenClaw, and trusted remote OpenClaw may be configured
    And AgentMemory and GBrain are optional sidecars unless explicitly required

  Scenario: Sidecar failure does not fail PB core personal GA
    Given PB produced stable wiki or active personal context
    And AgentMemory is unavailable
    And GBrain is unavailable
    When Personal GA readiness is computed
    Then production readiness does not fail because of those sidecars
    And the sidecar failures appear as warnings

  Scenario: No-AI smoke is useful but not a release pass
    Given a degraded no-AI personal daily run extracts deterministic lessons
    When Personal GA readiness is computed
    Then production_ready is false
    And the blocker says AI lesson extraction was disabled

  Scenario: Historical privacy backlog is not a latest-run blocker
    Given old human-required exceptions exist
    And the latest run has no hard secret or credential blocker
    When Personal GA readiness is computed
    Then historical exception count does not block production_ready

  Scenario: Personal private references are abstracted
    Given a trusted remote OpenClaw lesson mentions a concrete host or SSH alias
    When privacy abstraction runs in personal mode
    Then the lesson keeps the reusable action
    And stable outputs contain abstract personal wording instead of the raw private reference

  Scenario: Personal mode has usable knowledge output
    Given a production personal daily run extracts high-confidence low-risk lessons
    When output routing runs
    Then at least one lesson becomes stable wiki, active personal context, or promoted skill
    And remaining ready lessons are queued with visible reasons

  Scenario: Agent can use PB knowledge without sidecars
    Given sidecars are unavailable
    And PB stable wiki or active personal context exists
    When an agent requests context
    Then PB returns authority-labeled PB knowledge
    And the response includes sidecar unavailability only as warnings
