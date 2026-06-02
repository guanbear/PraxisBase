# Proposal: M27 Personal GA Freeze

## Why

M26 defined the personal GA gate model but did not finish it:

- `praxisbase personal release-audit` is only a skeleton and does not evaluate the 4 gates;
- the latest real run is a bounded smoke (`full_run=false`, `remaining_high_priority_items=283`), yet `personal_ga.production_ready=true`, which is misleading;
- no PB skill is promoted, so `skill inject-preview` can be empty;
- GBrain is configured but doctor is unhealthy; publish/retrieval is unverified;
- the promoted `kb/known-fixes/openclaw-dispatch-routing-failures.md` carries `memory/dreaming/*` sources in its provenance, and kb filenames are full sentences (slug not normalized).

M27 finishes personal GA and freezes it behind one audit command so iteration can stop. Per the anchor roadmap (`2026-06-02-convergence-and-team-roadmap-design.md`), M27 must pass before M28 (team) starts.

## Change

- Implement `praxisbase personal release-audit --json` evaluating Gate 1 (Wiki/Context), Gate 2A (Skill Compiler), Gate 2B (GBrain, downgraded to optional), and the combined `personal_ga`.
- Add `daily run --mode personal --full` as a resumable full personal queue that drains high-priority sources under budget+cache.
- Compute `remaining_high_priority_items` from source chunks + source-item ledger, not from `--max-ai-chunks`.
- Promote at least one real personal skill with a promotion audit and verify `skill inject-preview`.
- Downgrade GBrain to optional enhancement: `gbrain_runtime_ga` may be `pass`, `waived`, or `fail`; `personal_ga` can pass when GBrain is `pass` or `waived`.
- Fix B1: stable `kb/**` and `skills/**` provenance must not contain dreaming/corpus/candidate sources; `kb audit` reports and `kb prune` cleans them.
- Fix B2: normalize kb/skill slugs (kebab-case, length-capped); full title goes to frontmatter `title`.

## Scope

In scope:
- Release audit report schema + command wired to real reports.
- Full resumable personal queue + audit distinction between `full_run` and `bounded_smoke`.
- Skill promotion (>=1) + injection verification.
- GBrain optional-gate logic + waive flag.
- Provenance leak guard + slug normalization + one-time migration of dirty pages.

Out of scope:
- Team mode (M28), container/K8s (M29).
- Any new top-level CLI command family, new retrieval backend, new storage layer.
- Unlimited historical backfill.
- Making GBrain a second brain runtime.

## Success Criteria

`praxisbase personal release-audit --json` reports:
```text
wiki_context_ga: pass
skill_compiler_ga: pass
gbrain_runtime_ga: pass | waived
personal_ga: pass
```

Required real checks:
```bash
praxisbase daily run --mode personal --full --build-site --json
praxisbase context get --agent openclaw --stage diagnosis --mode personal --query "openclaw dispatch" --json
praxisbase context get --agent codex --stage diagnosis --mode personal --query "openclaw dispatch" --json
praxisbase skill inject-preview --query "openclaw dispatch routing failure" --json
praxisbase kb audit --json
praxisbase personal release-audit --json
```

Final audit must prove: useful OpenClaw/Codex experience reached stable wiki or active personal context; >=1 PB skill promoted and injectable; no dreaming/corpus/candidate provenance in stable knowledge; slugs normalized.

## Rollout

1. Add release audit schema + command (read-only over reports).
2. Add full resumable queue + remaining-high-priority computation.
3. Promote >=1 real personal skill; verify injection.
4. GBrain optional-gate logic + waive.
5. Fix B1 provenance guard + B2 slug normalization + migrate dirty pages.
6. Run final personal release-audit; record in `docs/status/`.

Do not add new product surfaces while M27 gates are failing.
