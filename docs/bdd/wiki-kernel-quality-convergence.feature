Feature: Wiki kernel quality convergence
  PraxisBase should compile raw agent experience into a small number of reusable
  wiki pages instead of exposing raw evidence as guidance.

  Scenario: Raw evidence is not default agent guidance
    Given a workspace has a stable wiki page about OpenClaw gateway restart
    And the workspace has raw-vault refs with matching gateway restart text
    When an agent asks for diagnosis context about OpenClaw gateway restart
    Then the context items should start with stable kb or skills pages
    And raw-vault refs should not appear as standalone context items

  Scenario: Process-status titles cannot auto-promote
    Given a curated wiki proposal titled "Successfully fixed and re-approved in a subsequent commit"
    And the proposal has provenance and markdown headings
    When automatic review evaluates the proposal
    Then the proposal should not be auto-promoted
    And the review should explain that the title is not a reusable topic

  Scenario: Generic wiki body cannot auto-promote
    Given a curated wiki proposal whose "When to Use" says the title appears in agent work
    And whose "What To Do" only repeats the title
    When automatic review evaluates the proposal
    Then the proposal should be blocked from auto-promotion
    And the quality report should include applicability and action-specificity failures

  Scenario: Stale generated candidates do not accumulate
    Given a workspace has generated wiki proposal files from an older curation run
    When review-mode wiki curation writes current proposal candidates
    Then stale generated wiki proposal files should be removed
    And manual non-wiki review notes should remain

  Scenario: Old low-quality stable pages are hidden from agent context
    Given a local kb page has a run-specific title with a concrete run id
    When an agent asks for default context about that run
    Then the run-specific page should not be returned as guidance
    And reusable stable pages may still be returned

  Scenario: Human-required counts reflect real decisions
    Given a personal daily run has privacy risks, weak evidence, rejected synthesis, and safe review candidates
    When the static site dashboard is built
    Then the Human required headline should count only privacy-required and review-required items
    And rejected low-signal material should be visible as diagnostics

  Scenario: Real personal smoke favors few coherent pages
    Given local Codex and OpenClaw memories contain repeated operational experiences
    When personal daily runs with AI curation enabled
    Then stable wiki pages should be synthesized from clusters with provenance
    And a single page should not mix unrelated model-change, status-check, and delegation lessons unless its title covers that combined procedure
