# Collective Skill And Knowledge Governance Tasks

## 0. Product Outcome Gates

- [ ] Add an end-to-end test path from trajectory import to candidate proposal, validation evidence, promotion audit, catalog update, and GBrain export.
- [ ] Add tests proving skills and MCP are complementary: GBrain can surface a promoted skill, and the skill can reference MCP usage guidance without either path bypassing PB review.
- [x] Add tests proving repeated failures produce reviewable knowledge or skill candidates, not raw stable transcript dumps.
- [ ] Add tests proving stable PB context outranks GBrain sidecar and AgentMemory sidecar hits when authoritative stable knowledge exists.
- [ ] Add tests proving AgentMemory being absent or failing does not block daily, review, promotion, site rendering, or GBrain export.

## 1. M22 Integration Boundary

- [ ] Treat M22 source item ledger as the prerequisite for trajectory item identity.
- [x] Treat M22 skill origin metadata as the prerequisite for distinguishing PB-generated skills from external installed skills.
- [ ] Add tests proving this change does not process externally installed skills as raw evidence by default.
- [x] Keep all new lifecycle and validation writes under `.praxisbase/` until review/promote.

## 2. Knowledge Lifecycle Model

- [x] Add schemas for lifecycle observations, lifecycle reports, and lifecycle proposals.
- [x] Add maturity transition rules for `draft`, `verified`, `proven`, `stale`, and `archived`.
- [ ] Add promotion evidence rules based on source count, verification events, cross-project/team evidence, and explicit user/team review.
- [ ] Add decay evidence rules based on stale timestamps, low usage, contradiction, failed validation, and dependency-sensitive age.
- [x] Add tests for promote, decay, archive, conflict, and no-op decisions.

## 3. Knowledge Catalog

- [x] Generate a stable knowledge catalog from promoted wiki pages and promoted skills.
- [x] Group catalog entries by scope, layer, type, maturity, and related skills.
- [x] Include provenance hashes and source refs without raw evidence.
- [x] Add catalog output to GBrain export payloads when stable knowledge changes.
- [ ] Add site tests proving the catalog appears without inflating review queue counts.

## 4. Trajectory Envelope Extension

- [x] Extend experience envelope schemas with optional trajectory steps, tool outcomes, read skills, modified skills, injected context, verification events, and skill effectiveness hints.
- [ ] Add context reducer rules that preserve trajectory failure/fix/verification/provenance signals.
- [ ] Add source adapter support for Codex, Claude Code, OpenCode, and OpenClaw trajectory fields where available.
- [ ] Add AgentMemory import support for trajectory-like memory records when present.
- [x] Add tests proving raw transcripts are not written to stable knowledge or reports.

## 5. Skill Attribution And Signal Collection

- [ ] Collect skill signals from trajectory read/modified skill attribution.
- [ ] Distinguish "skill helped", "skill hurt", "skill missing", "skill stale", and "skill ignored" hints.
- [ ] Group signals by existing stable skill id/path before considering new skill creation.
- [x] Reject signals caused only by agent misuse, context overflow, or transient environment failures.
- [x] Add tests for skill problem, agent problem, environment problem, and weak evidence skip.

## 6. Skill Proposer Actions

- [x] Add `skill_optimize_description` and `skip` as first-class proposer decisions.
- [x] Keep `skill_update`, `skill_support_file`, and `skill_create` with update-before-create precedence.
- [x] Add proposer prompt rules based on SkillClaw's conservative targeted-edit model.
- [x] Ensure skill creation remains class-level and last resort.
- [ ] Add mocked proposer tests for targeted update, description optimization, support-file update, create, and skip.

## 7. Skill Validation Evidence

- [x] Add skill validation schemas and report paths.
- [x] Add static validation for frontmatter, required sections, safe paths, support-file references, provenance, and source hashes.
- [x] Add evidence simulation validation using representative trajectory summaries.
- [x] Add optional replay validation hooks that are disabled unless a safe harness is configured.
- [x] Add `praxisbase skill validate --proposal <id> --json`.
- [x] Add tests proving validation writes evidence but cannot promote a skill.

## 8. Promotion And Audit Policy

- [ ] Allow policy to require passing validation evidence before skill promotion.
- [x] Require human/user audit for new personal stable skills by default.
- [x] Require Git/human audit metadata for team/org/global stable skills and lifecycle promotions.
- [ ] Ensure lifecycle promotion/decay/archive proposals use the same review/promote discipline as wiki and skill changes.
- [ ] Add tests for audit mismatch, missing validation, personal audit, and team Git review requirements.

## 9. GBrain Export Of Promoted Skills

- [x] Extend GBrain export to include promoted stable skills in addition to stable wiki pages.
- [x] Compact skill export payloads into trigger, procedure, verification, pitfalls, and provenance sections.
- [x] Preserve provenance hash idempotency.
- [x] Keep team GBrain export behind explicit allow flag and team-safe scope checks.
- [x] Add tests proving raw evidence, inbox candidates, rejected material, and human-required material are not exported.

## 10. Optional AgentMemory Interop

- [ ] Export promoted skills to AgentMemory only when an AgentMemory source is configured.
- [ ] Keep AgentMemory export idempotent by provenance hash.
- [ ] Keep AgentMemory sidecar retrieval ranked after stable PB context.
- [ ] Keep personal AgentMemory imports blocked from team knowledge by default.
- [ ] Add tests proving AgentMemory failure is warning-only.

## 11. Daily, Site, And Next Actions

- [ ] Add lifecycle, trajectory attribution, validation, GBrain skill export, and optional AgentMemory counts to daily reports.
- [ ] Show lifecycle queues, catalog summary, validation results, and export status in HTML.
- [ ] Add precise next commands for privacy triage, lifecycle review, skill validation, skill promotion, GBrain export, and AgentMemory export.
- [ ] Keep raw trajectory signals debug-only.
- [x] Add site/render tests.

## 12. Verification

- [x] Run `pnpm build`.
- [x] Run `pnpm exec tsc -p tsconfig.tests.json`.
- [x] Run focused node tests for lifecycle, trajectory envelopes, skill synthesis, skill validation, GBrain export, AgentMemory export, daily reports, and site rendering.
- [ ] Run a bounded personal daily smoke with skill synthesis and validation enabled.
- [x] Verify stable `kb/**` and `skills/**` change only through review/promote.
- [x] Verify GBrain receives only stable wiki pages, promoted skills, and catalog entries.
