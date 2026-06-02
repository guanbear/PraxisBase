# M26 Personal GA Cut Tasks

## 1. Release Audit Contract

- [ ] Add `PersonalReleaseAuditReport` schema with gate statuses, blockers, warnings, evidence reports, and next commands.
- [ ] Add `praxisbase personal release-audit --json`.
- [ ] Make the audit read latest daily, lesson, skill synthesis, validation, GBrain export, context, and site reports without rerunning expensive stages by default.
- [ ] Add tests for pass/fail classification across Gate 1, Gate 2A, and Gate 2B.
- [ ] Ensure `personal_ga.production_ready=true` alone is not treated as full personal GA.

## 2. Gate 1 PB Wiki/Context GA

- [ ] Define full personal queue report fields: planned source items, selected spans, processed spans, cache hits, uncached calls, remaining high-priority items, resume state.
- [ ] Add tests proving high-priority local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi sources are represented in the queue/audit.
- [ ] Ensure full queue can run resumably with cache and bounded uncached AI calls.
- [ ] Compute `remaining_high_priority_items` from current source chunks and source-item ledger entries, not from `--max-ai-chunks` alone.
- [ ] Treat a finite `--max-ai-chunks` run as full only when all high-priority chunks have current ledger entries and no high-priority `skipped` or unresolved `failed` entries remain.
- [ ] Treat missing queue evidence in older successful daily reports as `personal_queue_report_missing`.
- [ ] Block Gate 1 when high-priority source coverage is missing without an explicit external blocker.
- [ ] Block Gate 1 when no stable wiki or active personal context exists.
- [ ] Verify `context get` for OpenClaw and Codex returns PB-authoritative items without sidecars.
- [ ] Add stable output leak checks for generated wiki/context/site.

## 3. Gate 2A PB Skill Compiler GA

- [x] Restrict stable skill synthesis inputs to stable wiki, approved/`skill_ready` lessons, and safe active personal lessons.
- [x] Exclude raw, dreaming, session-corpus, untriaged staging, sidecar-only, and legacy-distill-only sources from stable skill eligibility.
- [x] Add a skill source authority report showing why each signal was accepted or rejected.
- [x] Auto-repair fixable skill shape defects once before human review.
- [x] Validate required skill sections, concrete trigger, actionable procedure, verification, pitfalls, do-not-use, related wiki, provenance, and leak safety.
- [x] Add promotion audit path for personal skills that records proposal id, candidate id, validation id, semantic review id, source hashes, and reviewer/policy.
- [ ] Promote at least one real personal skill in the final validation run.
- [x] Verify `skill inject-preview` returns the promoted skill for a realistic OpenClaw/Codex query.

## 4. Gate 2B GBrain Runtime GA

- [ ] Add release audit checks for GBrain config, doctor status, source id, publish status, and retrieval status.
- [ ] Keep all PB compiler commands usable when GBrain is unavailable; surface GBrain absence only as Gate 2B/final GA failure.
- [ ] Publish stable PB wiki pages and promoted skills to GBrain source `praxisbase`.
- [ ] Verify GBrain export excludes pending proposals, human-required, rejected, raw, private, and candidate skill material.
- [ ] Verify `context get --with-gbrain` returns PB stable results first and GBrain sidecar hits after them.
- [ ] If MCP is available locally, add an optional MCP query smoke; if unavailable, report exact setup guidance without blocking Gate 1 or Gate 2A.
- [ ] Add tests that GBrain retrieval cannot count as PB promotion evidence.

## 5. HTML And Human UX

- [ ] Render a Personal GA Cut section with Gate 1, Gate 2A, Gate 2B, blockers, warnings, and next commands.
- [ ] Render promoted skills separately from pending skill candidates.
- [ ] Render GBrain publish/retrieval status and source id.
- [ ] Keep pending candidates visibly separate from stable wiki/skills.
- [ ] Hide raw private bodies and show only redacted summaries/reason codes for privacy blockers.
- [ ] Add tests for the rendered sections.

## 6. Real Validation And Status

- [ ] Run focused tests for release audit, skill source authority, skill promotion/injection, GBrain export/retrieval, and site rendering.
- [ ] Run `lesson golden --json`.
- [ ] Run resumable full personal queue over real configured personal sources.
- [ ] Run skill synthesis/review/validation/promotion until at least one real skill is promoted.
- [ ] Run GBrain export and retrieval validation.
- [ ] Run `praxisbase personal release-audit --json` and record pass/fail evidence.
- [ ] Update `docs/status/` with the final M26 real validation.
