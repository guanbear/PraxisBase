# M26 Personal GA Cut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development when subagents are available, or superpowers:executing-plans when working sequentially. Track each checkbox. Do not implement unrelated team, AgentMemory, or new-backend work while any M26 gate is failing.

**Goal:** Make PraxisBase personal mode truly usable by passing PB wiki/context GA, PB skill compiler GA, and GBrain runtime GA on real local personal data.

**Architecture:** Add a release audit layer over the existing M25 lesson/wiki/context pipeline, M23/M23.1 skill governance, and GBrain export/retrieval integration. Do not add a parallel pipeline. PB stable `kb/**` and promoted `skills/**` remain the authority; GBrain is the runtime brain and sidecar retrieval/export target.

**Tech Stack:** TypeScript, Node test runner, Zod schemas, existing PraxisBase CLI/core packages, generated static HTML, existing local GBrain CLI adapter.

---

## File Map

- Add `packages/core/src/experience/personal-release-audit.ts`: gate status computation and report schema helpers.
- Update `packages/core/src/protocol/schemas.ts`: release audit schema if persisted in protocol reports.
- Update `packages/core/src/experience/daily.ts`: emit enough full queue, skill, GBrain, and context evidence for release audit.
- Update `packages/cli/src/commands/personal.ts` or current personal command wiring: add `personal release-audit --json`.
- Update `packages/core/src/synthesis/skill-signals.ts`: stable-only source authority for promotable skills.
- Update `packages/core/src/synthesis/skill.ts`, `skill-proposer.ts`, review/validation/promotion helpers: repair, validate, promote path.
- Update `packages/core/src/agent-access/skill-injection.ts`: ensure promoted PB skill injection evidence is available.
- Update `packages/core/src/experience/gbrain-export.ts` and context retrieval only if audit evidence or filtering is missing.
- Update `packages/core/src/wiki/render-site.ts`: render M26 gate statuses and next commands.
- Add or update tests:
  - `tests/core/personal-release-audit.test.ts`
  - `tests/core/experience-daily.test.ts`
  - `tests/core/skill-signals.test.ts`
  - `tests/core/skill-synthesis.test.ts`
  - `tests/core/skill-injection.test.ts`
  - `tests/core/gbrain-export.test.ts`
  - `tests/core/experience-context.test.ts`
  - `tests/core/wiki-render-site.test.ts`
- Update `docs/status/` only after real validation.

---

## Task 1: Release Audit Skeleton

- [ ] Add failing tests for audit classification when Gate 1 passes but Gate 2A/2B fail.
- [ ] Implement release audit report type with gate statuses: `pass | fail | warning | not_run`.
- [ ] Add blocker/warning taxonomy and exact next command generation.
- [ ] Add CLI command `praxisbase personal release-audit --json`.
- [ ] Verify the command reads latest reports and stable files without rerunning daily/AI.
- [ ] Run focused tests for the audit module and CLI command.
- [ ] Commit `feat: add personal release audit gate`.

## Task 2: Gate 1 PB Wiki/Context GA

- [ ] Add tests for high-priority source coverage across local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi.
- [ ] Define and persist full personal queue evidence: planned, selected, processed, cached, skipped low-priority, remaining high-priority, resume state.
- [ ] Ensure release audit distinguishes bounded smoke from full queue evidence.
- [ ] Verify stable wiki or active personal lesson output is required.
- [ ] Verify OpenClaw and Codex `context get` can return PB-authoritative knowledge without sidecars.
- [ ] Add stable-output leak checks to the audit.
- [ ] Run Gate 1 focused tests.
- [ ] Commit `feat: audit personal wiki context ga`.

## Task 3: Gate 2A Skill Source Authority

- [ ] Add tests proving raw/dreaming/session-corpus/untriaged/sidecar-only/legacy-distill-only signals are rejected for stable skill eligibility.
- [ ] Update skill signal collection to label source authority and stable eligibility.
- [ ] Disable legacy-distill skill promotion input in production M26 unless explicitly degraded and non-promotable.
- [ ] Add skill source authority counts to skill synthesis report.
- [ ] Update HTML/reports to show why skill signals were rejected.
- [ ] Run skill signal and synthesis focused tests.
- [ ] Commit `feat: require governed pb skill sources`.

## Task 4: Gate 2A Skill Repair, Validation, Promotion, Injection

- [ ] Add failing tests for one-shot repair of malformed headings, missing sections, short procedure, and truncated procedure text.
- [ ] Implement or wire structural auto-repair before final human-required routing.
- [ ] Ensure semantic review and validation reports must match candidate id, target path, and source hashes.
- [ ] Add personal policy path for promoting a real validated PB skill with audit metadata.
- [ ] Ensure promoted `skills/**/SKILL.md` carries `origin: praxisbase_synthesized`, `status: promoted`, source hashes, promotion id, and related wiki links.
- [ ] Verify `skill inject-preview --query "openclaw dispatch routing failure" --json` returns the promoted skill.
- [ ] Run skill promotion/injection focused tests.
- [ ] Commit `feat: promote injectable personal pb skills`.

## Task 5: Gate 2B GBrain Publish And Retrieval

- [ ] Add release audit tests for GBrain config, doctor, publish status, source id, and retrieval evidence.
- [ ] Ensure GBrain export includes stable wiki, promoted skills, and catalog only.
- [ ] Ensure GBrain export excludes candidate skills, pending proposals, human-required records, rejected records, raw evidence, and private material.
- [ ] Verify `context get --with-gbrain` ranks PB stable results before GBrain sidecar hits.
- [ ] Add optional MCP query smoke when local MCP support is discoverable; otherwise report setup guidance without failing Gate 1/2A.
- [ ] Run GBrain export/context focused tests.
- [ ] Commit `feat: audit gbrain personal runtime ga`.

## Task 6: HTML Gate UX

- [ ] Add render tests for Gate 1, Gate 2A, Gate 2B statuses.
- [ ] Render stable wiki, active lessons, promoted skills, pending skill candidates, privacy blockers, and GBrain status separately.
- [ ] Show exact next commands for each failed gate.
- [ ] Ensure pending candidates do not appear as stable knowledge.
- [ ] Run wiki render tests.
- [ ] Commit `feat: render personal ga cut status`.

## Task 7: Real Personal Validation

- [ ] Run `node packages/cli/dist/index.js lesson golden --json`.
- [ ] Run resumable full personal queue on real configured personal sources with GLM-4.7, cache, progress, and build-site.
- [ ] Run skill synthesis/review/validation/promotion until at least one real skill is promoted.
- [ ] Run GBrain export to source `praxisbase`.
- [ ] Run `context get` for OpenClaw, Codex, and Codex with `--with-gbrain`.
- [ ] Run `skill inject-preview` for an OpenClaw dispatch query.
- [ ] Run `personal release-audit --json` and verify all three gates pass.
- [ ] Update `docs/status/m26-personal-ga-cut-YYYY-MM-DD.md` with report paths and aggregate evidence only.
- [ ] Commit `docs: record m26 personal ga validation`.

## Self-Review

- The plan makes PB core, skill compiler, and GBrain runtime independently diagnosable.
- GBrain is required for final personal runtime GA, but never for PB promotion authority.
- AgentMemory remains out of scope and warning-only.
- Team mode remains out of scope.
- The final pass condition is one release audit command, not a subjective report review.
