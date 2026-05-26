# Tasks

## M19 Personal Review Auto-Governance

- [ ] Add a derived daily next-action summary for users and agents.
- [ ] Surface next actions in `personal run` and `daily run` JSON output.
- [ ] Keep personal-mode privacy auto-release behind explicit `--auto-release`.
- [ ] Add triage count summaries by `auto_released`, `keep_human_required`, and `team_review_only`.
- [ ] Render site queue sections for privacy-required, review-required, rejected, and promoted material.
- [ ] Show recommended command text for each queue class.
- [ ] Make AgentMemory export summary clearer and idempotent.
- [ ] Update generated agent Skill with the daily -> triage -> wiki -> AgentMemory loop.
- [ ] Add focused unit and CLI tests.
- [ ] Run the real validation ladder through at least `--limit 200`.

## Verification

- [ ] Run `pnpm check`.
- [ ] Run `praxisbase personal doctor --json`.
- [ ] Run small real daily with progress.
- [ ] Run privacy triage in personal auto-release mode.
- [ ] Re-run small real daily and inspect stable wiki changes.
- [ ] Export stable wiki to AgentMemory.
- [ ] Run medium real daily with progress.
- [ ] Commit source/docs/tests only unless generated KB pages are explicitly accepted.
