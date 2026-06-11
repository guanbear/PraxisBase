# Agent Skill Synthesis Governance Tasks

## 1. Finish M19.1 Semantic Wiki Gate

- [x] Add semantic review counts to daily reports.
- [x] Require passing semantic review for personal auto-promotion of new wiki pages.
- [x] Ensure reviewer input uses distilled summaries, source summaries, candidate bodies, and provenance excerpts, not raw transcripts.
- [x] Treat AgentMemory sidecar hits as non-authoritative unless ingested into PraxisBase provenance.
- [x] Render semantic review decisions and reasons in the generated site/review UI.
- [x] Add bad-example regressions for task-runner fragments, one-off smoke reports, merge-worthy replay fragments, and raw-ish summaries.
- [x] Run focused wiki semantic-review and daily auto-promotion tests.

## 2. Skill Candidate Data Model

- [x] Add `SkillSynthesisCandidateSchema`.
- [x] Add `SemanticSkillReviewSchema`.
- [x] Add `SkillSynthesisReportSchema`.
- [x] Add conversion from reviewed skill candidate to existing `knowledge_proposal`.
- [x] Preserve backward compatibility with existing `generateSkillDraftsFromDistilledExperiences()`.
- [x] Add schema tests.
- [x] Report low-stability rejected skill signals separately from reviewed candidate rejections.

## 3. Skill Signal Collection And Stability

- [x] Collect signals from `DistilledExperience.skill_candidate`.
- [x] Collect signals from promoted wiki procedures, known fixes, pitfalls, and preferences.
- [x] Add deterministic signal rejection for one-off narratives, exact run ids, environment failures, negative tool claims, raw copies, and privacy/scope violations.
- [x] Add file-first stability scoring and clustering.
- [x] Add tests proving repeated verified signals become a cluster and low-signal singletons do not enter the primary queue.

## 4. Stable Skill Inventory

- [x] Load existing stable `skills/**/SKILL.md` inventory.
- [x] Extract path, slug, frontmatter, headings, `When To Use`, `Procedure`, `Pitfalls`, `Provenance`, and related wiki links.
- [x] Score strong, medium, weak, and no-match update targets.
- [x] Route multiple strong matches to merge/update or human review.
- [x] Add tests proving existing umbrella skills are preferred over new sibling skills.

## 5. Skill Proposer

- [x] Add a skill proposer prompt and strict JSON output.
- [x] Enforce Hermes-style ladder: update loaded, update existing umbrella, add support file, create new umbrella.
- [x] Provide stable skill inventory matches to the proposer.
- [x] Generate required `SKILL.md` sections.
- [x] Support `references/`, `templates/`, and `scripts/` support-file candidates.
- [x] Reject unsafe target paths and missing provenance.
- [x] Add mocked proposer tests.

## 6. Skill Semantic Reviewer

- [x] Add reviewer prompt, schema normalization, and AI runner.
- [x] Add deterministic arbitration policy.
- [x] Reject one-off reports, raw copies, exact run ids, environment failures, unsafe future-agent behavior, and non-class-level names.
- [x] Route ambiguous existing-skill matches to human review.
- [x] Add mocked review tests for approve, revise, merge/update, reject, needs-human, timeout, and malformed JSON.

## 7. CLI Integration

- [x] Add `praxisbase skill synthesize`.
- [x] Add `praxisbase skill review`.
- [x] Add `praxisbase skill promote`.
- [x] Add `praxisbase skill curate --dry-run`.
- [x] Add `praxisbase skill export --agent`.
- [x] Add CLI tests proving commands write candidates/reports and do not write stable `skills/**` without promotion.

## 8. Daily And Site Integration

- [x] Run skill synthesis after wiki curation/review in personal daily when enabled.
- [x] Run skill synthesis in team daily as candidate-only.
- [x] Add skill synthesis counts to daily reports.
- [x] Render skill candidate cards and next actions in the generated site.
- [x] Keep raw skill signals secondary/debug-only.
- [x] Add site tests.

## 9. Audit And Promotion Policy

- [x] Add skill promotion audit record schema.
- [x] Require review records for all stable skill writes.
- [x] Verify proposal id, candidate id, target path, source hashes, reviewer, semantic review id, and decision before stable promotion.
- [x] Personal mode: require user audit for brand-new skills by default.
- [x] Team mode: require human/Git review for all stable skill writes.
- [x] Block personal/private evidence from team skills by default.
- [x] Add tests proving stable skill promotion fails without audit.

## 10. Smoke And Verification

- [x] Run `pnpm build`.
- [x] Run `pnpm exec tsc -p tsconfig.tests.json`.
- [x] Run focused node tests for skill synthesis, semantic skill review, daily reports, and site rendering.
- [x] Run a small personal daily smoke with skill synthesis enabled.
- [x] Verify smoke quality: separate signal/cluster/candidate/reject counts, few reviewed candidates, no raw transcript, no private paths, no team-unsafe personal material, and no stable `skills/**` write before audited promotion.
- [x] Confirm stable `skills/**` changes only occur through review/promote.
