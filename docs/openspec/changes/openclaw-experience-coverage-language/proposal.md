# OpenClaw Experience Coverage and Language Defaults

## Why

OpenClaw answer-bot memory can now flow into PraxisBase, but early runs exposed three operational gaps: curation was capped before all useful lessons could become reviewable proposals, users could not see raw-memory-to-knowledge coverage, and generated UI/content did not follow this project's Chinese default. Greeting-only team items also stayed in the human/manual backlog even though they are low-signal rejects.

## What Changes

- Raise the GitLab nightly curation proposal cap so the OpenClaw backfill can surface all current experience clusters.
- Add an experience coverage report from source item to privacy triage, lessons, wiki evidence, proposals, and stable KB.
- Add project language configuration with Chinese defaults for this PraxisBase project.
- Thread language configuration into AI distill, lesson extraction, and wiki curation prompts.
- Render review coverage and expose a UI language selector.
- Classify greeting-only team auto-review outputs as `rejected_low_signal` instead of leaving them for human review.
- Add a standard `openspec/` entry point so `openspec list` works from the repo root.

## Non-Goals

- Do not auto-promote team/Feishu knowledge into stable KB.
- Do not expose raw team transcripts or private identifiers in the generated coverage UI.
- Do not require sandbox system cron or change OpenClaw exporter runtime behavior.

## Acceptance

- `openspec list --json` works from the repository root.
- GitLab daily harvest defaults to `PRAXISBASE_MAX_CURATION_PROPOSALS=30`.
- Daily reports can include `experience_coverage` with per-source statuses.
- Review UI renders the coverage section and language selector.
- AI generation prompts include the configured output language.
- Greeting-only team auto-review items are counted as low-signal rejected.
