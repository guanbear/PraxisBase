Feature: M25 memory-first experience distillation
  PraxisBase should extract useful agent experience from raw memory/session/log evidence without relying on agents to summarize themselves first.

  Background:
    Given PraxisBase is running in personal mode
    And AI lesson extraction is configured
    And stable knowledge changes still require governed review or policy-based promotion

  Scenario: Long OpenClaw memory is not skipped
    Given an OpenClaw MEMORY.md source is larger than the default source byte limit
    And the file contains headings and bullets about dispatch failures, ACK timing, and memory truncation
    When memory-first source inventory runs
    Then PraxisBase creates evidence spans for the headings and bullets
    And the report says the large memory file was section-mapped
    And the file is not skipped solely because of its size

  Scenario: Native memory outranks newer low-signal logs
    Given a source directory contains one useful MEMORY.md file
    And it also contains many newer smoke logs without reusable lessons
    When the signal planner selects spans under a small budget
    Then at least one selected span comes from MEMORY.md
    And ordinary logs cannot consume the entire budget before memory spans are considered

  Scenario: PB extracts an ACK lesson from raw memory
    Given raw OpenClaw memory says long tool, network, or dispatch tasks should receive a brief ACK before work continues
    When deterministic and LLM lesson extraction run
    Then PraxisBase emits an ExperienceLesson
    And the lesson claim is about acknowledging long-running work before tool execution
    And the lesson has trigger, action, portability, privacy tier, applies-to agents, and evidence spans

  Scenario: PB extracts fail-closed delegation honesty from raw memory
    Given raw OpenClaw memory says delegation failure must not be reported as success
    And the same memory says direct completed work should be reported honestly instead of saying dispatch failed
    When LLM lesson extraction runs
    Then PraxisBase emits one or more lessons about delegation honesty
    And the lessons apply to OpenClaw or agent orchestration systems
    And the evidence spans point to the raw memory source, not to an agent-generated summary

  Scenario: Private remote details are abstracted
    Given remote OpenClaw memory contains a private host, account, path, or wrapper command
    And the same span contains a reusable lesson about confirming the target machine before executing
    When privacy abstraction runs
    Then the safe claim keeps the target-machine confirmation lesson
    And the safe claim does not contain the concrete private host, account, path, or credential
    And the raw excerpt remains local or human-required according to policy

  Scenario: Team mode blocks private instance leakage
    Given a personal remote OpenClaw lesson contains concrete private environment details
    When team wiki, skill, HTML site, GBrain export, or AgentMemory export is built
    Then the concrete private host, IP, account, key path, token, and credential values do not appear
    And the lesson is safely abstracted, marked personal-only, routed to human-required, or rejected

  Scenario: Weak run report does not become a wiki page
    Given a source span only reports that a smoke command ran once
    And it contains no reusable trigger, action, verification, or lesson
    When lesson extraction and wiki compilation run
    Then PraxisBase does not create a wiki-ready lesson from that span
    And the report records a weak one-off evidence skip reason

  Scenario: Personal lesson becomes runtime-usable before wiki promotion
    Given a safe high-confidence personal lesson has evidence spans
    When the lesson cache rebuilds
    Then the lesson can become active_personal, wiki_ready, or skill_ready
    And context bundle can render it as Relevant PB Experience
    And stable PB pages and promoted skills still rank above the runtime lesson hit

  Scenario: Forgotten personal lesson is not injected
    Given an active personal lesson is marked forgotten
    When the same raw evidence is processed again
    Then the lesson is not injected into personal runtime context
    And it does not become wiki-ready without explicit user action

  Scenario: Wiki page is synthesized from lessons
    Given repeated raw evidence supports a Slack raw user id format lesson
    When wiki compilation runs from lesson clusters
    Then the wiki candidate explains when to use the lesson, what to do, how to verify it, and what mistake to avoid
    And it includes related links and provenance spans
    And it does not copy the raw source summary as the body

  Scenario: Skill synthesis prefers update-before-create
    Given a procedural lesson about OpenClaw operation is skill-ready
    And an existing promoted OpenClaw operating skill covers the same domain
    When skill synthesis runs
    Then PraxisBase proposes updating the existing skill before creating a new skill
    And the unreviewed candidate is not injected into normal agent runtime

  Scenario: Lesson clusters outrank legacy summaries
    Given the same source has a legacy distilled summary
    And the same source also has a wiki-ready ExperienceLesson cluster
    When wiki compilation runs in production mode
    Then the wiki candidate is built from the lesson cluster
    And the legacy summary is used only as supporting diagnostics or compatibility metadata

  Scenario: Skill synthesis requires lesson-state authority
    Given a one-off distilled summary suggests creating a skill
    And no skill-ready lesson cluster or stable procedural wiki page supports it
    When skill synthesis runs in production mode
    Then PraxisBase does not create a promotion-eligible skill candidate
    And the report says the signal lacked lesson-state authority

  Scenario: GBrain and AgentMemory sidecars cannot promote knowledge
    Given GBrain or AgentMemory returns a relevant sidecar hit
    When wiki, skill, GBrain export, or AgentMemory export decisions run
    Then the sidecar hit does not count as stable PB authority
    And it can become evidence only after import with source refs, hashes, privacy review, and lesson extraction

  Scenario: Local OpenClaw golden validation passes target coverage
    Given the local OpenClaw golden fixture is built from raw memory and session evidence
    When M25 golden validation runs
    Then at least 5 of 8 expected local lessons are matched
    And every matched lesson has source refs, source hashes, and evidence spans

  Scenario: Remote OpenClaw golden validation passes target coverage
    Given the trusted personal remote OpenClaw golden fixture is built from raw memory and session evidence
    When M25 golden validation runs
    Then at least 6 of 8 expected remote lessons are matched
    And stable outputs contain no concrete private host, IP, path, account, key, or credential value
