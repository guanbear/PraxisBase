# M25.1 Personal GA Stabilization Tasks

## 1. Acceptance Gate And Report Schema

- [ ] Add `PersonalGaReport` schema with mode, source coverage, lesson counts, disposition counts, golden validation, privacy leakage scan, cache stats, HTML paths, agent consumption status, `production_ready`, and `blocking_reasons`.
- [ ] Add `LessonDisposition` schema with the allowed decisions defined in the design.
- [ ] Add report paths for Personal GA validation and lesson disposition.
- [ ] Add unit tests proving every lesson in a run has exactly one disposition.

## 2. Source Normalization

- [ ] Ensure local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi source reports include normalized agent/source/trust/privacy metadata.
- [ ] Add tests for source coverage by agent and source kind.
- [ ] Make missing configured sources visible as Personal GA blockers while leaving unconfigured sources non-blocking.

## 3. Codex Session Pre-Summary

- [ ] Add a session event selector that keeps user directives, failures, repairs, verification, repeated corrections, decisions, and successful procedures.
- [ ] Drop system prompts, tool schemas, long successful output, repeated progress chatter, and one-off metadata from the pre-summary path.
- [ ] Add a cache keyed by source hash, parser identity, reducer identity, prompt version, model id, privacy profile, and agent.
- [ ] Convert pre-summary output back into evidence-backed spans or span groups.
- [ ] Add tests proving unchanged sessions do not repeat LLM work.

## 4. Production AI Mode

- [ ] Add daily mode calculation for `production_ai`, `degraded_no_ai`, and `budget_exhausted`.
- [ ] Make AI lesson extraction mandatory for production-ready personal daily when AI is configured and uncached budget is available.
- [ ] Report skipped uncached work as `delayed_by_budget`.
- [ ] Add tests proving no hidden uncached LLM calls occur outside budget.

## 5. Disposition Routing

- [ ] Route every lesson to one disposition decision.
- [ ] Include state, target, reason, blocking reason, source refs, hashes, privacy tier, portability, applies-to agents, and applies-to systems.
- [ ] Add tests for `promoted_to_wiki`, `merged_into_existing_page`, `promoted_to_skill`, `active_personal_context`, `needs_human`, `rejected_low_signal`, `delayed_by_budget`, `blocked_by_privacy`, and `queued_for_next_run`.

## 6. Wiki Completeness

- [ ] Ensure each `wiki_ready` lesson either materializes into a proposal/update/merge or receives an explicit queued/delayed disposition.
- [ ] Expose proposal-limit skips in reports and HTML.
- [ ] Add tests where `wiki_ready=8` and proposal limit is 3; all 8 must have visible destinations.

## 7. Privacy Abstraction And Triage Reuse

- [x] Add or tighten abstraction rules for host/IP/SSH alias, local paths, Slack user ids, account/login strings, private machine names, and secrets.
- [x] Add privacy signature reuse so repeated trusted remote blockers do not create fresh daily human-required items.
- [x] Add leakage tests for stable wiki, skills, generated HTML, GBrain export, and AgentMemory export.

## 8. HTML Experience View

- [ ] Render source coverage by agent/source kind.
- [ ] Render golden validation and lesson quality.
- [ ] Render disposition counts and queued lessons.
- [ ] Render privacy blockers grouped by signature.
- [ ] Render agent consumption status for PB context, skills, GBrain, and AgentMemory.
- [ ] Keep raw excerpts hidden by default.

## 9. Agent Consumption Authority

- [x] Add authority labels to context output and backend publish reports.
- [x] Ensure stable PB pages and promoted skills outrank runtime lessons.
- [x] Ensure sidecar hits never count as promotion evidence unless imported through PB.
- [x] Add tests for CLI context and publish report authority labels.

## 10. Golden Validation And Real Smoke

- [ ] Extend golden validation with personal GA target coverage.
- [ ] Add Codex/codex-cliproxyapi session-derived golden targets.
- [ ] Run bounded degraded no-AI smoke and record deterministic behavior.
- [ ] Run bounded AI smoke with cache and record token/cache behavior.
- [ ] Run real personal daily over configured personal sources and record production readiness or blockers.
- [ ] Update status docs with reports, quality findings, and remaining gaps.
