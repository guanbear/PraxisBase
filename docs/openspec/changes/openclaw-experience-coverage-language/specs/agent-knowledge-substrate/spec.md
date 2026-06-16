## ADDED Requirements

### Requirement: OpenClaw Daily Curation Capacity

GitLab scheduled daily harvests SHALL default to enough wiki curation proposal capacity to surface the current OpenClaw backfill instead of truncating at the previous small interactive cap.

#### Scenario: Nightly harvest uses expanded proposal cap

- **WHEN** the GitLab `praxisbase:daily-harvest` job runs without overriding `PRAXISBASE_MAX_CURATION_PROPOSALS`
- **THEN** it SHALL pass `--max-curation-proposals 30` to the daily runner

### Requirement: Experience Coverage Reporting

Daily reports SHALL include an `experience_coverage` section when source-level privacy, lesson, or proposal evidence is available, tracking each raw/source item through privacy triage, lesson extraction, wiki evidence, proposal creation, and stable KB promotion using safe identifiers and counts.

#### Scenario: Review page shows coverage

- **WHEN** a daily report includes `experience_coverage`
- **THEN** `dist/review.html` SHALL render aggregate coverage counts and per-source rows without raw transcripts or private identifiers

### Requirement: Project Language Defaults

PraxisBase SHALL support project-level UI and content language settings with environment overrides, and this OpenClaw project SHALL default to Simplified Chinese.

#### Scenario: AI prompt follows content language

- **WHEN** `content_language` is `zh-CN`
- **THEN** AI distill, lesson extraction, and wiki curation prompts SHALL request Simplified Chinese generated titles, summaries, headings, and reusable guidance

### Requirement: Low-Signal Team Triage

Team auto-review SHALL reject greeting-only sanitized summaries as low signal instead of keeping them in the manual privacy queue.

#### Scenario: Greeting-only team item is rejected

- **WHEN** team auto-review generates a sanitized summary that is greeting-only or otherwise low-signal
- **THEN** privacy triage SHALL record `decision: rejected_low_signal`
