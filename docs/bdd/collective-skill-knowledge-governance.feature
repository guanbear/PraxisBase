Feature: Collective skill and knowledge governance
  PraxisBase turns real agent trajectories into governed knowledge and skills while GBrain remains the runtime brain.

  Scenario: Knowledge catalog summarizes stable PB experience
    Given stable wiki pages and promoted skills exist
    When the knowledge catalog is generated
    Then entries are grouped by scope, layer, type, and maturity
    And each entry includes provenance hashes
    And raw evidence bodies are not included

  Scenario: Draft knowledge is promoted through review
    Given a draft technical pitfall has verified source refs from two successful runs
    When lifecycle analysis runs
    Then PraxisBase proposes a maturity promotion to verified or proven
    And stable knowledge is not changed until review and promote complete

  Scenario: Stale knowledge decays instead of staying active forever
    Given a proven guideline has not been referenced within its review window
    And a newer verified page contradicts part of it
    When lifecycle analysis runs
    Then PraxisBase proposes decay or human review
    And the active catalog does not silently overwrite the guideline

  Scenario: Trajectory attribution identifies a useful existing skill
    Given an agent session includes read_skills, tool outcomes, and passing verification events
    And the read skill matches a stable PB skill
    When skill signals are collected
    Then the existing skill receives a positive effectiveness hint
    And no new sibling skill is proposed

  Scenario: Agent misuse does not become a skill update
    Given a stable skill already contains the correct command and endpoint
    And the trajectory shows the agent never read that skill
    When skill synthesis evaluates the evidence
    Then PraxisBase classifies the cause as an agent problem
    And the skill proposer skips the update

  Scenario: Trigger mismatch optimizes the skill description
    Given a stable skill body is correct
    And trajectories show it is triggered for unrelated tasks
    When skill synthesis evaluates the evidence
    Then PraxisBase proposes a skill description optimization
    And the proposal preserves the existing body

  Scenario: Durable missing guidance updates an existing skill
    Given repeated trajectories show the same missing verification step
    And one stable skill strongly matches the task class
    When skill synthesis runs
    Then PraxisBase proposes a targeted skill update
    And the proposal includes provenance from the representative trajectories

  Scenario: Weak environment failure is skipped
    Given a trajectory failed because a local dependency was temporarily missing
    And no durable workaround or verification exists
    When skill synthesis runs
    Then PraxisBase classifies the cause as environment-only
    And no skill candidate is written

  Scenario: Static skill validation cannot promote by itself
    Given a skill candidate exists
    When static validation passes
    Then PraxisBase writes validation evidence
    And the candidate still requires promotion audit before stable skills change

  Scenario: Replay validation is optional and safe
    Given a skill candidate has representative trajectory evidence
    And no safe replay harness is configured
    When skill validation runs
    Then PraxisBase uses static validation and evidence simulation
    And the result does not require credentials or destructive actions

  Scenario: GBrain export includes promoted skills
    Given a stable wiki page and a promoted skill exist
    When GBrain export runs in personal write mode
    Then both the page and the promoted skill produce compact export payloads
    And each payload includes a provenance hash
    And inbox candidates and raw evidence are not exported

  Scenario: AgentMemory remains optional
    Given no AgentMemory source is configured
    When personal daily run completes with stable PB changes
    Then PraxisBase recommends GBrain export
    And AgentMemory export is skipped or warned without failing the run

  Scenario: Team mode requires team-safe evidence
    Given personal AgentMemory hits and team OpenClaw trajectories both match a skill topic
    When team skill synthesis runs
    Then personal AgentMemory hits are excluded unless explicitly imported and approved
    And team-scope skill candidates require Git or human review

  Scenario: Stable context outranks sidecar hits
    Given stable PB context and AgentMemory sidecar hits both match a query
    When context get runs with AgentMemory enabled
    Then stable PB context appears before AgentMemory sidecar hits
    And sidecar hits do not count as promotion evidence
