# Tasks

## M21.1 GBrain-First Agent Guidance

- [x] Update generated PB skill to make GBrain MCP the default broad brain lookup path.
- [x] Add first-run GBrain MCP setup guidance to `personal init` / `bootstrap personal` output.
- [x] Extend `personal doctor` with GBrain readiness checks.
- [x] Add tests for generated skill and personal doctor output.

## M21.2 Privacy Triage Productization

- [x] Separate privacy, review, quality, low-signal, and duplicate counts in site/next actions.
- [x] Show redacted privacy queue summaries and reason codes in HTML.
- [x] Tune personal auto-release for safe local Codex/OpenClaw evidence.
- [x] Keep team mode review-only for personal/private uncertainty.
- [x] Add focused privacy triage tests.

## M21.3 Quality Yield Without Lowering Gates

- [x] Materialize semantic `merge` decisions as update/merge candidates when target is unambiguous.
- [x] Add skill completeness validation for truncated procedure steps.
- [x] Add one safe rewrite/retry path for structural skill revisions.
- [x] Report rejected low-signal evidence separately from privacy-required material.
- [x] Add tests for merge, revise, reject, and incomplete skill behavior.

## M21.4 GBrain Publish Defaults And Safety

- [x] Prefer GBrain export in personal next actions when GBrain is configured.
- [x] Keep mutating publish explicit unless user config opts in.
- [x] Verify export includes only stable PB pages/skills.
- [x] Verify export payload excludes raw evidence and human-required material.

## M21.5 Real Smoke

- [x] Run privacy triage with `--progress`.
- [x] Run bounded personal daily with semantic review and skill synthesis.
- [x] Inspect HTML review page for actionable privacy/quality/GBrain next actions.
- [x] Publish stable reviewed knowledge to GBrain if stable changes exist. No write was performed in this smoke because `changed_stable_knowledge=false`.

## M21.6 Trusted Personal Remote OpenClaw

- [x] Add source-level `privacy_trust: trusted_personal_remote`.
- [x] Allow trusted personal remote OpenClaw to skip only `remote_source_requires_review` in personal mode.
- [x] Keep deterministic secret/private hard blocks and team review-only behavior.
- [x] Add tests for safe trusted remote release and trusted remote secret blocking.
