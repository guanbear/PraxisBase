# OpenClaw Remote Memory CLI Traceability

## Scope

M12.1 defines how PraxisBase CLI fetches non-local OpenClaw memory into safe staging envelopes and then hands those envelopes to M12 `memory ingest`. It does not require OpenClaw CLI or an OpenClaw plugin for the default path.

## Source Documents

- OpenSpec proposal: `docs/openspec/changes/openclaw-remote-memory-cli/proposal.md`
- OpenSpec design: `docs/openspec/changes/openclaw-remote-memory-cli/design.md`
- OpenSpec tasks: `docs/openspec/changes/openclaw-remote-memory-cli/tasks.md`
- BDD: `docs/bdd/openclaw-remote-memory-cli.feature`
- Superpowers design: `docs/superpowers/specs/2026-05-20-openclaw-remote-memory-cli-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-20-openclaw-remote-memory-cli-implementation-plan.md`

## Requirement Mapping

| Requirement | OpenSpec | BDD Scenario | Implementation Task | Test Target |
|---|---|---|---|---|
| PraxisBase CLI is the control entrypoint | design: CLI Runtime Modes | source checkout, installed mode | Task 4 | `tests/cli/experience-commands.test.ts` |
| Support source checkout mode | design: Source Checkout Mode | source checkout mode | Task 4 | `tests/cli/experience-commands.test.ts` |
| Support exported JSON fetch | design: provider `exported-json` | exported-json provider | Task 2, Task 4 | `tests/core/openclaw-remote-memory.test.ts`, `tests/cli/experience-commands.test.ts` |
| Support OpenClaw API fetch | design: provider `openclaw-api` | openclaw-api provider | Task 3 | `tests/core/openclaw-remote-memory.test.ts` |
| Keep OpenClaw CLI optional | proposal: Non-Goals | openclaw-cli missing | Task 3, Task 4 | `tests/cli/doctor-command.test.ts` |
| Do not persist auth or raw logs | design: Safety Rules | API auth, exported-json staging | Tasks 2-3 | core and CLI tests |
| Explain provider readiness | design: doctor command | doctor missing token, staging ignore | Task 3, Task 4 | `tests/cli/doctor-command.test.ts` |
| Stage then ingest | design: Overview | fetch after ingest | Task 5 | `tests/core/openclaw-remote-memory.test.ts` |
| Avoid stable knowledge mutation | proposal: Acceptance Summary | all scenarios | Tasks 2-5 | core and CLI tests |

## Acceptance Gates

- `pnpm check`
- `git diff --check`
- Manual source checkout smoke:

```bash
pnpm build
tmpdir=$(mktemp -d)
printf '{"items":[{"id":"remote-auth-expired-1","summary":"OpenClaw detected Claude auth expired.","signature":"openclaw:claude-auth-expired"}]}' > "$tmpdir/openclaw-export.json"
node packages/cli/dist/index.js memory fetch --agent openclaw --provider exported-json --source "$tmpdir/openclaw-export.json" --json
node packages/cli/dist/index.js memory ingest --agent openclaw --source .praxisbase/staging/openclaw --write --json
```

## Non-Regression Checks

- Existing `memory import` and `memory refresh` behavior must remain stable.
- M12 `memory scan`, `memory ingest`, and `smoke real-wiki` behavior must remain stable.
- Existing `wiki compile`, `wiki graph`, `wiki build-site`, `context get`, and `praxisbase build` tests must still pass.
- No M12.1 command may directly write stable `kb/` or `skills/`.
