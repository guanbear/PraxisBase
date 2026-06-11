# Human Required AI Triage Design

## Goal

Reduce personal-mode `human_required` backlog without weakening the privacy boundary.

The feature adds an AI-assisted triage pass over `.praxisbase/exceptions/human-required`. AI may classify redacted exception metadata, but it must not directly approve raw private material or move personal material into team knowledge.

## Pipeline

```text
human-required exception -> deterministic hard block -> redacted triage input -> AI classification -> deterministic release gate -> report/page
```

Triage is intentionally separate from daily ingestion. Daily can keep writing honest human-required exceptions, and operators can run triage when they want to reduce the queue.

## Classifications

AI returns one of four labels:

- `safe_personal_experience`: the item appears to be normal personal/project agent experience, not a secret or private chat.
- `needs_redaction`: useful experience exists, but some visible detail should be redacted before reuse.
- `real_private_material`: the item appears to contain credentials, personal chat, private keys, or other material that should stay blocked.
- `unclear`: evidence is insufficient or ambiguous.

The AI output also includes a short `rationale`, a `confidence` number, and optional `suggested_redactions`.

## Release Policy

Auto-release is allowed only when all conditions are true:

- authority mode is `personal-local`;
- `--auto-release` is explicitly set;
- AI classification is `safe_personal_experience`;
- confidence is at least `0.75`;
- deterministic checks on the triage text still find no concrete private value;
- exception details indicate personal or project scope, not team scope.

Team mode never auto-releases. It writes triage decisions only.

Auto-release means the exception is marked with triage metadata and reported as released for future daily/wiki processing. It does not promote stable knowledge directly and does not bypass wiki proposal review.

## Data Model

Triage reports are written under `.praxisbase/reports/privacy-triage`.

Each item records:

- exception id and path;
- source id, source ref, source hash, agent, scope;
- deterministic hard-block reasons;
- AI classification, confidence, rationale, suggested redactions;
- final decision: `auto_released`, `keep_human_required`, or `team_review_only`;
- whether the item changed stable knowledge, always `false`.

Exception records may receive `details.triage` metadata after an auto-release or review-only triage. The original exception file remains present for auditability.

## CLI

```bash
praxisbase privacy triage \
  --mode personal \
  --auto-release \
  --limit 100 \
  --json
```

Options:

- `--mode personal|team-git` controls authority mode.
- `--auto-release` enables personal-mode release gate.
- `--limit <n>` caps the number of exceptions read.
- `--ai-timeout-ms <n>` overrides provider timeout for this run.
- `--json` returns the report.

The command requires the existing AI provider config unless `--dry-run` is later added. Secrets stay in env vars and are not written to reports.

## Review Page

`dist/review.html#human-required` should show triage status when present:

- classification;
- decision;
- confidence;
- rationale;
- suggested redactions.

The page remains read-only. It tells the human what happened, but does not become a mutation surface.

## Non-Goals

- No team-mode auto release.
- No direct stable wiki promotion.
- No raw log or secret upload to AI.
- No deletion of exception audit files.
- No manual approval UI in this change.

## Acceptance

- AI triage classifies exception metadata using a redacted prompt.
- Personal auto-release only happens for high-confidence safe personal experience.
- Concrete secret indicators remain hard-blocked even when AI says safe.
- Team mode records decisions but does not auto-release.
- Review page displays triage status.
- Reports are schema-validated and do not contain secrets.
