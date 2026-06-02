# M25.2 Personal GA Release Contract Tasks

## 1. Readiness Contract

- [ ] Add tests for PB core readiness independent of sidecars.
- [ ] Downgrade AgentMemory/GBrain unavailable status to warnings unless explicitly required.
- [ ] Make degraded/no-AI mode the only AI-disabled readiness blocker.
- [ ] Add hard blocker names from the design.

## 2. Latest-Run Privacy Gate

- [ ] Add tests proving historical human-required backlog does not fail the latest GA report.
- [ ] Count only current-run hard privacy blockers in `personal_ga`.
- [ ] Auto-abstract personal host/path/SSH alias/Slack id/account references before blocking.
- [ ] Keep true token/key/password/private key material as hard blockers.

## 3. Personal Output Gate

- [ ] Add tests proving personal GA requires at least one usable PB output: stable wiki, active personal context, or promoted skill.
- [ ] Auto-promote low-risk high-confidence personal wiki/context lessons when guards pass.
- [ ] Ensure proposal limits queue remaining ready lessons without failing GA when usable output exists.

## 4. HTML And Context

- [ ] Render learned knowledge and PB core readiness ahead of optional sidecar warnings.
- [ ] Show sidecar failures as optional warnings by default.
- [ ] Verify `context get` returns PB stable knowledge or active personal lessons without sidecars.

## 5. Real Validation

- [ ] Run `lesson golden --json` and record four-family coverage.
- [ ] Run production personal daily with GLM-4.7, bounded budget, cache, and real configured sources.
- [ ] Inspect generated HTML and `context get` output.
- [ ] Update status docs with final readiness or only hard external blockers.
