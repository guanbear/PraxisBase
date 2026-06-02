# Human Required AI Triage Proposal

## Problem

Production daily runs can produce a large `human_required` backlog. Many items are cautious privacy blocks, especially in personal mode, and reviewing every item manually makes the experience pipeline feel unintelligent.

## Proposed Change

Add an AI-assisted privacy triage command that classifies redacted human-required exception metadata and applies a deterministic release gate. Personal mode may auto-release high-confidence safe personal experience. Team mode remains review-only.

## Scope

- Add privacy triage report protocol.
- Add core triage runner.
- Add `praxisbase privacy triage`.
- Show triage status on the review page.

## Out Of Scope

- Team-mode auto release.
- Raw secret upload to AI.
- Direct wiki promotion.
- Deleting exception audit records.
