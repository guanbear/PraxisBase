# M27 Personal GA Freeze Tasks

## 1. Release Audit Command (already exists — harden, do not rewrite)

> Reality: `praxisbase personal release-audit --json` and `buildPersonalReleaseAuditReport` already exist in `experience/personal-release-audit.ts` and already emit `wiki_context_ga` / `skill_compiler_ga` / `gbrain_runtime_ga` / `personal_ga`, `gates`, `blocking_reasons`, `ok`. Read the code first. Do NOT recreate the report.

- [ ] Keep the existing report field names (`personal_ga`, `wiki_context_ga`, `skill_compiler_ga`, `gbrain_runtime_ga`, `gates`, `blocking_reasons`, `ok`).
- [ ] Add `waived` to `gbrain_runtime_ga` and make `aggregatePersonalGaStatus` treat `waived` as passing.
- [ ] Ensure each gate's blocker carries an executable `next_command` (extend `blocking_reasons` or add a parallel structured field).
- [ ] Keep audit read-only by default; add `--refresh` for cheap deterministic checks only (leak scan, kb audit, inject-preview); never run paid AI.
- [ ] Tests: gate classification pass/fail/waived + combined.

## 2. Gate 1 Full Personal Queue

- [ ] Add `daily run --mode personal --full` resumable full queue (budget + cache + resume_state).
- [ ] Compute `remaining_high_priority_items` from source chunks + source-item ledger.
- [ ] Set `queue.run_kind = full_run` only when all high-priority chunks have current ledger entries and no high-priority skipped/unresolved-failed.
- [x] Block `wiki_context_ga` when high-priority coverage missing without explicit per-item blocker.
- [x] Verify `context get` for openclaw and codex returns PB-authoritative items without sidecars.
- [ ] Add stable-output leak scan (no dreaming/corpus/candidate/private strings). NOTE: site/wiki leak scan exists, but provenance leak (frontmatter `sources`/`source_refs`) is NOT scanned — see Section 5 B1.
- [x] Tests: full vs bounded classification; remaining computation; context authority.

> Status 2026-06-02 (commit d424f8c): Gate 1 passes. Root cause fixed — filtered dreaming/Candidate noise was wrongly counted as unprocessed high-priority; now `remaining_high_priority_items=0`.

## 3. Gate 2A Skill Promotion

- [x] Promote at least one real personal skill with promotion audit (proposal/candidate/validation/semantic-review ids, source hashes, reviewer/policy).
- [x] Verify `skill inject-preview --query "openclaw dispatch routing failure"` returns the promoted skill.
- [x] Tests: skill source authority; promote path; inject-preview non-empty.

## 4. Gate 2B GBrain Optional

> Status: `gbrain_runtime_ga=pass` in the real run (publish + retrieval evidence). The `waived` state below is still worth adding so locked-down/offline users without GBrain can also reach personal GA.
- [ ] Add `gbrain_runtime_ga` states: pass / waived / fail.
- [ ] Add `--waive-gbrain` and auto-waive when GBrain unconfigured.
- [x] When healthy: verify publish + `context get --with-gbrain` retrieval; GBrain hits ranked after PB.
- [x] Ensure GBrain/AgentMemory hits never count as promotion evidence.
- [ ] Tests: waived path keeps personal_ga passable; retrieval ranking.

## 5. Quality Fixes (STILL OPEN — required before M28)

> Status 2026-06-02: gates are green but these are NOT done. `kb audit` reports 13/13 pass while `kb/**` and `skills/**` still carry `memory/dreaming/*` provenance — `kb audit` is a false-green because `promotionTimeGuard` has no dreaming/corpus check. Must fix before M28 or dirty provenance flows into the team layer.
- [ ] B1: `promotionTimeGuard` rejects dreaming/corpus/candidate provenance in `kb/**` and `skills/**` (currently MISSING — this is why `kb audit` is falsely green).
- [ ] B1: `kb audit` surfaces violations; `kb prune --yes` removes + cleans wikilinks.
- [ ] B1: re-promote or prune existing pages still carrying dreaming sources: `openclaw-dispatch-routing-failures` (kb + skill), `ack-timing-before-long-running-agent-work`, `wiki-openclaw-task-runner-presence-checks`, `openclaw-gateway-restart-after-configuration-changes`, `verify-openclaw-agent-identification-response`, and any others surfaced by the new guard.
- [ ] B1-G1: mixed-provenance pages (>=1 valid log/raw-vault source) MUST strip only dreaming/corpus entries and keep the page; only fully-dirty pages may be archived/deleted. Do NOT delete a valuable known_fix/skill just because it has one dreaming source.
- [ ] B2: add slug util (kebab-case, <=80 chars); call from all promotion paths; full title in frontmatter (filenames are still full sentences).
- [ ] B2: one-time migration renames over-long kb/skill filenames + fixes inbound wikilinks.
- [ ] B2-G2: rename migration must REPOINT `[[old-slug]]`/`[[old-slug|label]]` to the new slug (not unlink). Do NOT reuse `removeLinksToDeletedPages`. Also update frontmatter `id`, `related_wiki_paths`, `dist/graph.json` node ids, and GBrain export `praxisbase_path`.
- [ ] B2-G3: slug util detects collisions and appends a deterministic suffix (`-2`/short hash) to keep slugs unique and reproducible.
- [ ] Tests: B1 guard; B1-G1 strip-vs-delete; B2 normalization + migration; B2-G2 repoint; B2-G3 collision.
- [ ] Post-fix verify: build + GBrain export show 0 broken links/orphans/duplicates and renamed pages have updated GBrain paths.

## 6. Real Validation And Status

- [x] Run `lesson golden --json`.
- [x] Run `daily run --mode personal --full --build-site --json` to drain high-priority sources.
- [x] Run skill synthesize/review/validate/promote until >=1 skill promoted.
- [ ] Run `kb audit --json` clean (no dreaming/corpus provenance). BLOCKED by B1 — currently falsely green.
- [x] Run `praxisbase personal release-audit --json` and record pass evidence.
- [x] Write `docs/status/m27-personal-ga-freeze-<date>.md` (see `docs/status/m27-personal-ga-freeze-2026-06-02.md`).
- [x] Confirm `pnpm check` passes (1367/1367 tests).
