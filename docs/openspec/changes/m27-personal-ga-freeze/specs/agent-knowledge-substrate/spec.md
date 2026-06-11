# Agent Knowledge Substrate Spec Delta: M27 Personal GA Freeze

## ADDED Requirements

### Requirement: Personal Release Audit

PraxisBase SHALL provide `praxisbase personal release-audit --json` that evaluates personal GA across four gates without rerunning paid AI stages by default.

#### Scenario: Audit reports four gate statuses

- **GIVEN** the latest personal daily, lesson, skill-synthesis, and context reports exist
- **WHEN** `praxisbase personal release-audit --json` runs
- **THEN** the report includes `wiki_context_ga`, `skill_compiler_ga`, `gbrain_runtime_ga`, and `personal_ga`
- **AND** every blocker includes a `next_command`
- **AND** no paid AI extraction is run

#### Scenario: personal_ga composition

- **GIVEN** `wiki_context_ga=pass` and `skill_compiler_ga=pass`
- **AND** `gbrain_runtime_ga` is `pass` or `waived`
- **WHEN** the audit computes `personal_ga`
- **THEN** `personal_ga=pass`

#### Scenario: bounded smoke does not pass Gate 1

- **GIVEN** the latest daily run has `queue.run_kind=bounded_smoke` and `remaining_high_priority_items>0` without explicit per-item blockers
- **WHEN** the audit evaluates Gate 1
- **THEN** `wiki_context_ga=fail`
- **AND** a blocker reports `personal_queue_incomplete` with a resume command

### Requirement: Full Resumable Personal Queue

PraxisBase SHALL support a resumable full personal queue that drains high-priority sources under budget and cache control.

#### Scenario: Full run drains high-priority sources

- **GIVEN** local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi sources are configured
- **WHEN** `praxisbase daily run --mode personal --full --json` runs to completion
- **THEN** `remaining_high_priority_items` is computed from source chunks and the source-item ledger
- **AND** `queue.run_kind=full_run` only when all high-priority chunks have current ledger entries and no unresolved high-priority skipped/failed entries

### Requirement: Promoted Personal Skill

PraxisBase SHALL promote at least one personal skill with a promotion audit and make it injectable.

#### Scenario: Promoted skill is injectable

- **GIVEN** a personal skill candidate passed validation and semantic review
- **WHEN** the skill is promoted and `praxisbase skill inject-preview --query "openclaw dispatch routing failure" --json` runs
- **THEN** the promoted skill is returned
- **AND** the promotion audit records proposal id, candidate id, validation id, semantic review id, source hashes, and reviewer/policy

### Requirement: GBrain Optional Gate

PraxisBase SHALL treat GBrain runtime as an optional enhancement for personal GA.

#### Scenario: Personal GA passes with GBrain waived

- **GIVEN** GBrain is not configured or `--waive-gbrain` is set
- **WHEN** the audit evaluates `gbrain_runtime_ga`
- **THEN** `gbrain_runtime_ga=waived` with a recorded reason
- **AND** `personal_ga` can still be `pass`

#### Scenario: GBrain hits are not promotion evidence

- **GIVEN** GBrain returns sidecar hits for a query
- **WHEN** promotion is evaluated
- **THEN** GBrain hits do not count as PB promotion evidence

### Requirement: Stable Provenance Hygiene

PraxisBase SHALL prevent dreaming, session-corpus, and candidate sources from entering stable knowledge provenance.

#### Scenario: Dreaming provenance is rejected at promotion

- **GIVEN** a candidate whose `sources` include `memory/dreaming/light/2026-05-19.md#...`
- **WHEN** promotion is evaluated
- **THEN** PraxisBase rejects the candidate
- **AND** `kb audit` reports the violation with the offending path

#### Scenario: kb prune cleans dirty pages and wikilinks

- **GIVEN** a stable kb page whose provenance is entirely dreaming/corpus
- **WHEN** `praxisbase kb prune --yes` runs
- **THEN** the page is removed
- **AND** inbound `[[wikilinks]]` to the removed page are unlinked

#### Scenario: Mixed-provenance page keeps valid sources

- **GIVEN** a stable kb page citing one valid `log://` source and several `memory/dreaming/*` sources
- **WHEN** provenance cleanup runs
- **THEN** only the dreaming sources are stripped from `sources`/`source_refs`/`source_hashes` and the Provenance section
- **AND** the page and its valid source are retained
- **AND** the page is not deleted

### Requirement: Normalized Stable Slugs

PraxisBase SHALL store stable kb/skill files under normalized slugs with the full title in frontmatter.

#### Scenario: Long title becomes a capped slug

- **GIVEN** a candidate titled "Missing replay data compromises the ability to debug or verify past execution behaviors"
- **WHEN** it is promoted
- **THEN** the filename is a kebab-case slug no longer than 80 characters
- **AND** the full title is stored in frontmatter `title`
