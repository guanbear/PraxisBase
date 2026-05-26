Feature: Agent skill synthesis governance
  Agent-facing skills are synthesized from durable experience but require audit before stable promotion.

  Scenario: Personal mode generates a reviewed skill candidate
    Given personal distilled experiences contain repeated successful OpenClaw repair lessons
    And each experience has source refs, source hashes, verification, and reusable lessons
    When skill synthesis runs in personal review mode
    Then PraxisBase writes a skill candidate
    And the candidate is semantically reviewed
    And stable skills are not changed

  Scenario: Team mode generates a Git-reviewable skill candidate
    Given team-safe experiences contain repeated Claude Code repair workflow lessons
    When skill synthesis runs in team review mode
    Then PraxisBase writes a team-scope skill candidate
    And the next action requires human Git review
    And personal-only source material is excluded

  Scenario: Existing umbrella skill is preferred
    Given a stable OpenClaw operations skill already exists
    And new evidence adds one reusable authentication repair pitfall
    When the skill proposer chooses an action
    Then it chooses skill update or support file
    And it does not create a new narrow sibling skill

  Scenario: Ambiguous existing umbrella match requires review
    Given two stable OpenClaw skills strongly match the same new skill signal
    When the skill proposer chooses an action
    Then it chooses merge or human review
    And it does not create a third sibling skill

  Scenario: New skill creation is class-level
    Given repeated evidence describes a durable class of work
    And no existing skill covers that class
    When skill synthesis creates a candidate
    Then the target skill name is class-level
    And the body includes When To Use, Procedure, Verification, Pitfalls, Do Not Use When, Related Wiki Pages, and Provenance

  Scenario: One-off reports are rejected
    Given a candidate is based on one post-deploy smoke report
    And its title includes a specific run id
    When semantic skill review runs
    Then the reviewer rejects it or requires human review
    And it is not eligible for stable promotion

  Scenario: Environment failure is not fossilized as a skill
    Given evidence says a local binary was missing
    And the durable fix pattern is not established
    When skill synthesis runs
    Then PraxisBase rejects the signal
    And no "tool is broken" skill is created

  Scenario: Personal promotion requires audit
    Given a personal skill candidate passed semantic review
    And no approved review record exists
    When skill promotion is requested
    Then promotion fails
    And stable skills remain unchanged

  Scenario: Audit record must match the candidate
    Given a personal skill candidate targets skills/openclaw/openclaw-memory-operations/SKILL.md
    And an approved audit record exists for a different target path
    When skill promotion is requested
    Then promotion fails
    And the failure explains the audit mismatch

  Scenario: Reviewed personal skill can be promoted
    Given a personal skill candidate passed semantic review
    And the user approved the candidate
    When skill promotion runs
    Then PraxisBase writes the target skill through the promotion path
    And the stable skill contains provenance and audit metadata

  Scenario: Team skill is not auto-promoted
    Given a team skill candidate passed semantic review
    When daily automation completes
    Then the candidate remains pending team review
    And no team stable skill is written automatically

  Scenario: Site shows skill candidates
    Given reviewed skill candidates exist
    When the wiki site is built
    Then the site shows skill candidate cards
    And each card shows action, scope, review decision, score, reason, source count, and next command

  Scenario: Real smoke checks quality rather than only file creation
    Given real local OpenClaw and Codex sources have been collected
    When personal daily skill synthesis runs with site build enabled
    Then the report separates signals, rejected or low-stability signals, clusters, candidates, rejected items, human-required items, and promoted skills
    And the site primary queue shows reviewed skill candidates rather than raw signals
    And candidate bodies contain no raw transcript, private path, secret, or team-unsafe personal material
    And stable skills remain unchanged before audited promotion
