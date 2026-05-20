# Agent Memory Ingestion Real Smoke Traceability

## Scope

M12 connects local agent memory sources to the M7-M11 wiki compiler through safe protocol evidence. It does not promote stable knowledge and does not copy raw transcripts/logs into Git.

## Source Documents

- OpenSpec proposal: `docs/openspec/changes/agent-memory-ingestion-real-smoke/proposal.md`
- OpenSpec design: `docs/openspec/changes/agent-memory-ingestion-real-smoke/design.md`
- OpenSpec tasks: `docs/openspec/changes/agent-memory-ingestion-real-smoke/tasks.md`
- BDD: `docs/bdd/agent-memory-ingestion-real-smoke.feature`
- Superpowers design: `docs/superpowers/specs/2026-05-20-agent-memory-ingestion-real-smoke-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-20-agent-memory-ingestion-real-smoke-implementation-plan.md`

## Requirement Mapping

| Requirement | OpenSpec | BDD Scenario | Implementation Task | Test Target |
|---|---|---|---|---|
| Scan Codex sources without writes | design: Commands / `memory scan` | M12 Codex scan | Task 2, Task 4 | `tests/core/agent-memory.test.ts`, `tests/cli/experience-commands.test.ts` |
| Ingest Codex evidence safely | design: Source Handling / Codex, Safety | M12 Codex ingest | Task 3, Task 4 | `tests/core/agent-memory.test.ts`, `tests/cli/experience-commands.test.ts` |
| Detect OpenClaw signatures | design: Source Handling / OpenClaw | M12 OpenClaw ingest | Task 2, Task 3 | `tests/core/agent-memory.test.ts` |
| Deduplicate by source hash | proposal: Acceptance Summary | M12 duplicate source hash | Task 3 | `tests/core/agent-memory.test.ts` |
| Route private material to exceptions | design: Safety, Error Handling | M12 private material | Task 3 | `tests/core/agent-memory.test.ts` |
| Avoid stable knowledge mutation | proposal: Non-Goals, Guardrails | all scenarios | Tasks 3-5 | core and CLI tests |
| Run real wiki smoke | design: `smoke real-wiki` | M12 real-wiki smoke | Task 5 | `tests/cli/real-smoke.test.ts` |
| Surface health/counts | design: RealWikiSmokeReport | M12 health info | Task 5 | `tests/cli/real-smoke.test.ts` |
| Feed existing wiki compiler | design: Overview | M12 imported evidence | Task 5 | `tests/cli/real-smoke.test.ts` |

## Acceptance Gates

- `pnpm check`
- `git diff --check`
- Manual smoke with an explicit source file:

```bash
tmpdir=$(mktemp -d)
printf 'Implemented PraxisBase wiki compile and ran pnpm check.' > "$tmpdir/session.txt"
node packages/cli/dist/index.js smoke real-wiki --agent codex --source "$tmpdir/session.txt" --query "wiki compile" --json
```

## Non-Regression Checks

- Existing `memory import` and `memory refresh` behavior must remain stable.
- Existing `capture finish` and `capture submit` behavior must remain stable.
- Existing `wiki compile`, `wiki graph`, `wiki build-site`, `context get`, and `praxisbase build` tests must still pass.
- No command in M12 may directly write stable `kb/` or `skills/`.
