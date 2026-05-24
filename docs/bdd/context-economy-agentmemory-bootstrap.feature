Feature: Context economy, agentmemory interop, and personal bootstrap
  PraxisBase personal mode should be cheap to run, easy to initialize, and able to interoperate with live agent memory without giving up wiki authority.

  Scenario: Reduce noisy source material before AI distill
    Given a personal Codex source containing verbose command output and a reusable lesson
    When I run personal daily with context economy enabled
    Then the source is reduced before chunking
    And the AI distill input contains the reusable lesson
    And the AI distill input omits repeated progress noise
    And the daily report includes context economy saved bytes

  Scenario: Normalize source metadata before rule matching
    Given a source item contains command "pnpm test", stdout, stderr, exit code 1, source ref, and source hash
    When context economy classifies the item
    Then the test-output rule sees argv, command, stdout, stderr, and exit code in one canonical input
    And the reduction result preserves the source ref and source hash

  Scenario: Bypass context economy for debugging
    Given a personal OpenClaw source with noisy logs
    When I run daily with context economy disabled
    Then chunking receives the unreduced source text
    And the report says context economy is disabled

  Scenario: Tiny or non-beneficial reductions pass through unchanged
    Given a source item is already short or cannot be reduced meaningfully
    When context economy runs
    Then PraxisBase keeps the original item text
    And the context economy report records applied false

  Scenario: Failed command output preserves diagnostic tail
    Given a Codex source item contains a failed test command with long output
    When context economy reduces the item
    Then the reduced text keeps the command exit status
    And it preserves the failing test name and trailing error context

  Scenario: File inspection commands pass through by default
    Given a source item comes from command "sed -n '1,200p' src/app.ts"
    And the output is long file content
    When context economy runs
    Then PraxisBase keeps the original text
    And the context economy report records a file inspection pass-through warning

  Scenario: Invalid local reducer rules are diagnostics
    Given a project reducer rule contains an invalid regex
    When personal daily runs with context economy enabled
    Then the invalid regex is ignored
    And the run continues with a reducer warning
    And no raw source text is written to the reducer debug report

  Scenario: Reducer rule changes invalidate stale AI cache identity
    Given a source chunk was distilled with reducer rule set hash "sha256:old"
    When the same source is reduced with rule set hash "sha256:new"
    Then PraxisBase does not silently reuse the old AI distill cache entry
    And the daily report records the new reducer rule set hash

  Scenario: Import agentmemory as a source
    Given an agentmemory daemon is reachable on localhost
    And it returns memories for project "praxisbase"
    When I add an agentmemory source and run daily
    Then PraxisBase writes experience envelopes for the imported memories
    And each envelope keeps an agentmemory source ref and source hash
    And no bearer token is stored in the source config

  Scenario: Export reviewed wiki lessons to agentmemory
    Given a stable reviewed personal wiki page with provenance
    And an agentmemory daemon is reachable on localhost
    When I run agentmemory export in personal mode
    Then PraxisBase sends a compact lesson to agentmemory
    And the lesson includes the wiki page path and provenance hashes
    And rejected or human-required candidates are not exported

  Scenario: Stable wiki outranks agentmemory sidecar retrieval
    Given a stable PraxisBase wiki page matches query "OpenClaw gateway restart"
    And agentmemory smart-search also returns a matching recent memory
    When I run context get with agentmemory sidecar enabled
    Then the stable PraxisBase wiki result appears before the agentmemory sidecar result
    And the sidecar result is marked as lower authority

  Scenario: Personal bootstrap initializes a local workflow
    Given an empty local PraxisBase workspace
    And a ZAI_API_KEY environment variable is available
    When I run personal init
    Then PraxisBase creates personal configuration without storing the secret value
    And it writes agent-facing first-run guidance
    And it reports the next connect command

  Scenario: Personal connect detects local agents
    Given local Codex and OpenClaw data paths exist
    When I run personal connect for codex and openclaw
    Then PraxisBase writes source configs for the detected paths
    And each source is scoped to personal or project according to the command

  Scenario: Personal run builds human and agent access
    Given personal sources are configured
    When I run personal run with build site enabled
    Then PraxisBase runs daily collection
    And it audits the stable knowledge base
    And it generates agent access assets
    And the HTML site shows latest wiki pages, review-required count, context economy savings, and agentmemory health

  Scenario: Team mode blocks personal agentmemory leakage
    Given an agentmemory source is scoped personal
    When I run daily in team Git mode
    Then the personal agentmemory source is not imported into team knowledge
    And the report explains that explicit team policy is required
