# Tasks

## M19 Personal Review Auto-Governance

- [x] Add a derived daily next-action summary for users and agents.
- [x] Surface next actions in `personal run` and `daily run` JSON output.
- [x] Keep personal-mode privacy auto-release behind explicit `--auto-release`.
- [x] Add triage count summaries by `auto_released`, `keep_human_required`, and `team_review_only`.
- [x] Render site queue sections for privacy-required, review-required, rejected, and promoted material.
- [x] Show recommended command text for each queue class.
- [x] Make AgentMemory export summary clearer and idempotent.
- [x] Update generated agent Skill with the daily -> triage -> wiki -> AgentMemory loop.
- [x] Add focused unit and CLI tests.
- [x] Bound wiki curation synthesis so `--max-curation-proposals` fills successful proposals without scanning every planned page.
- [x] Run the real validation ladder through at least `--limit 200`.

## Verification

- [x] Run focused M19 test suites.
- [x] Run `praxisbase personal doctor --json`.
- [x] Run small real daily with progress.
- [x] Run privacy triage in personal auto-release mode.
- [x] Re-run small real daily and inspect stable wiki changes.
- [x] Verify AgentMemory export dry-run idempotency.
- [x] Run medium real daily with progress.
- [x] Run `pnpm check`.
- [x] Commit source/docs/tests only unless generated KB pages are explicitly accepted.

## Real Validation Notes

- Small daily after curation-budget fix: `--limit 50 --max-ai-chunks 20 --max-curation-proposals 8 --ai-concurrency 8`.
  - Result: 168 chunks, 167 distilled, 0 AI failures, 29 privacy-required before final triage.
  - Wiki curation processed a bounded `16` synthesis window from 68 topics and wrote 4 review candidates.
- Privacy triage: `--auto-release --limit 100 --ai-concurrency 8`.
  - Result: 100 processed, 64 auto-released, 36 kept human-required, 199 already-triaged skipped, 757 non-privacy exceptions skipped.
- Small daily after final triage:
  - Result: 168 chunks, 167 distilled, 0 AI failures, privacy-required reduced to 19, curation stayed bounded at 16.
- Medium daily: `--limit 200 --max-ai-chunks 80 --max-curation-proposals 8 --ai-concurrency 8`.
  - Result: 605 chunks, 597 distilled, 0 AI failures, 53 privacy-required.
  - Wiki curation processed a bounded `16` synthesis window from 135 topics and wrote 5 review candidates.
- AgentMemory export dry-run:
  - Result: daemon healthy, dry-run exported 0 and skipped 8 existing stable wiki payloads, with no errors.
