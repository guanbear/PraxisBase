Feature: M25.1 personal GA stabilization
  PraxisBase personal mode should be usable as a daily personal knowledge loop for humans and agents.

  Background:
    Given PraxisBase is running in personal mode
    And local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi sources may be configured
    And stable knowledge still requires PB authority, privacy gating, and review or policy promotion

  Scenario: Personal GA report explains readiness
    Given a personal daily run completes
    When PraxisBase writes the Personal GA report
    Then the report includes source coverage, lesson counts, disposition counts, golden validation, privacy leakage scan, cache stats, HTML paths, and agent consumption status
    And the report sets production_ready to true only when no required blocker remains
    And every false production_ready result includes concrete blocking_reasons

  Scenario: Configured personal sources are normalized
    Given local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi sources are configured
    When source inventory runs
    Then every source report includes agent, source kind, origin, trust, privacy scope, source ref, source hash, parser identity, and content span counts
    And missing configured sources are listed as blockers
    And unconfigured optional sources are not listed as blockers

  Scenario: Codex session pre-summary keeps useful experience
    Given a Codex JSONL session contains a user correction, a failed command, a fix, and a verification command
    And the same session contains system prompt text, tool schemas, and long successful command output
    When session pre-summary runs
    Then the pre-summary keeps the correction, failure, fix, and verification
    And it drops the system prompt, tool schemas, and long successful output
    And the retained content has evidence spans back to the raw session

  Scenario: Codex session pre-summary cache prevents repeated token spend
    Given a Codex session has already been pre-summarized with the same source hash, parser identity, reducer identity, prompt version, model id, privacy profile, and agent
    When personal daily runs again on unchanged data
    Then PraxisBase reuses the pre-summary cache
    And it does not make an uncached LLM pre-summary call for that session

  Scenario: Production personal daily requires AI or valid AI cache
    Given AI is configured
    And the user did not request degraded mode
    When personal daily runs with uncached lesson work available in budget
    Then the run mode is production_ai
    And deterministic extraction is supplemented by LLM lesson extraction
    And hidden uncached LLM calls do not exceed the configured budget

  Scenario: Degraded no-AI daily is useful but not production-ready
    Given the user runs personal daily with no AI
    When deterministic lesson extraction completes
    Then useful deterministic lessons may be emitted
    But the Personal GA report sets production_ready to false
    And the blocking reason says AI lesson extraction was disabled

  Scenario: Budget exhaustion is explicit
    Given personal daily has a finite AI budget
    And some selected spans have no valid AI cache entry
    When the budget is exhausted
    Then skipped spans receive delayed_by_budget disposition
    And the report includes uncached budget used, cache hits, and skipped work counts

  Scenario: Every lesson has a disposition
    Given lesson extraction emits active_personal, wiki_ready, skill_ready, candidate, and human_required lessons
    When the Personal GA report is built
    Then every lesson id appears exactly once in the disposition list
    And every disposition has a decision, target or blocking reason, source refs, source hashes, privacy tier, portability, applies-to agents, and applies-to systems

  Scenario: Wiki-ready lessons cannot silently disappear behind proposal limits
    Given eight wiki-ready lessons exist
    And the curation proposal limit is three
    When wiki curation runs
    Then three lessons may materialize as proposals or updates
    And the remaining five lessons receive queued_for_next_run or delayed_by_budget disposition
    And the HTML review page shows the queued lessons and the limit reason

  Scenario: Trusted remote private facts are abstracted before personal wiki use
    Given trusted remote OpenClaw memory contains a concrete host, SSH alias, path, account, or private machine name
    And the same span contains a reusable lesson about confirming the target machine
    When privacy abstraction runs in personal mode
    Then the safe claim preserves the target-machine lesson
    And the safe claim uses abstract terms such as configured private route or personal remote machine
    And stable wiki, skills, generated HTML, GBrain export, and AgentMemory export do not contain the raw private value

  Scenario: Repeated trusted remote privacy blockers are grouped
    Given the same class of trusted remote private detail appears on two daily runs
    When privacy triage runs the second time
    Then PraxisBase reuses the privacy signature
    And it does not create a new unrelated human-required queue item
    And the HTML review page groups the blockers by signature

  Scenario: Personal mode does not leak team-unsafe knowledge
    Given a personal_only environment lesson is useful to the local user
    When team wiki, team skill, team GBrain, or team AgentMemory output is built
    Then the lesson is excluded unless explicitly imported and reviewed as team_allowed
    And the output contains no concrete personal host, path, account, token, or credential

  Scenario: HTML experience view answers what PB learned
    Given personal daily produced lessons, dispositions, privacy blockers, and backend status
    When the site is built
    Then the homepage or review page shows source coverage by agent and source kind
    And it shows lesson quality and golden validation
    And it shows disposition counts and queued lessons
    And it shows privacy blockers grouped by signature
    And it shows PB context, skill export, GBrain, and AgentMemory consumption status

  Scenario: Agent context labels authority
    Given stable PB pages, promoted skills, active personal lessons, and sidecar hits are available
    When an agent requests PraxisBase context
    Then stable PB pages and promoted skills rank above active personal lessons
    And active personal lessons rank above GBrain and AgentMemory sidecar hits
    And each returned item includes an authority label

  Scenario: GBrain and AgentMemory do not promote knowledge
    Given GBrain or AgentMemory returns a relevant sidecar hit
    When wiki, skill, or export decisions run
    Then the sidecar hit does not count as promotion evidence
    And it can become PB evidence only after import, privacy review, lesson extraction, and PB disposition

  Scenario: Golden OpenClaw lessons are recovered from raw memory
    Given local and trusted remote OpenClaw golden fixtures are built from raw memory, reports, and sessions
    When Personal GA validation runs
    Then PraxisBase matches the required local and remote target lesson coverage
    And every matched target has source refs, source hashes, evidence spans, and no private leakage

  Scenario: Codex golden session produces at least one reusable lesson
    Given a Codex or codex-cliproxyapi golden session contains a repeated user correction and verified repair behavior
    When Personal GA validation runs with AI or valid AI cache
    Then PraxisBase emits at least one reusable Codex lesson
    And the lesson has trigger, action, verification, negative case, and evidence spans
