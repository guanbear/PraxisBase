# Wiki Curation Synthesis Tasks

## 1. Curation Data Model

- [ ] Add schemas and TypeScript types for `WikiEvidenceItem`, `WikiEvidenceCluster`, `CuratedWikiProposal`, and `WikiCurationReport`.
- [ ] Add conversion from `wiki_curated_proposal` to existing `knowledge_proposal`.
- [ ] Export curation APIs from core.
- [ ] Add schema and conversion tests.

## 2. Evidence Pool

- [ ] Build evidence pool from collected wiki sources and existing proposal candidates.
- [ ] Prefer `DistilledExperience` fields when present.
- [ ] Preserve real `source_ref` and `source_hash`.
- [ ] Filter `session_meta`, base instructions, `openclaw:unknown`, and empty promotion logs.
- [x] Filter reference-only official docs/API references, Codex/OpenClaw boot metadata, OpenClaw reflection themes, and memory promotion bookkeeping.
- [x] Require useful-experience signals before a source can become a curation input.
- [ ] Route private material and weak provenance to exceptions.
- [ ] Add tests for noise filtering and provenance retention.

## 3. Cluster And Dedupe

- [ ] Cluster evidence by signature, target path hint, normalized title, and reusable lesson.
- [ ] Preserve multi-source provenance in clusters.
- [ ] Detect scope conflicts and route unsafe merges to conflicts.
- [ ] Add tests proving repeated evidence becomes one cluster.

## 4. AI Curator Synthesis

- [ ] Add curator prompt and strict JSON output schema.
- [ ] Add mocked AI synthesis tests.
- [x] Validate target paths, body safety, confidence, provenance, and team scope.
- [x] Add deterministic proposal quality guards for experience signal, actionability, verification/reusable lesson, and reference-only rejection.
- [x] Add repair-or-reject handling for AI bodies that miss required wiki headings.
- [x] Add degraded deterministic synthesis for explicit degraded mode only.

## 5. CLI Command

- [x] Add `praxisbase wiki curate --dry-run --json`.
- [x] Add `praxisbase wiki curate --review --json`.
- [x] Add explicit `--degraded` mode.
- [x] Fail production curation without AI config.
- [x] Ensure curate never writes stable `kb/`, `skills/`, or `dist/`.
- [x] Add CLI tests.

## 6. Auto Review Policy

- [x] Add `.praxisbase/review-policy.json` schema.
- [x] Add personal and team default policies.
- [x] Add `praxisbase review policy init --mode personal|team --json`.
- [x] Add `praxisbase review auto --json`.
- [x] Add `praxisbase review auto --promote-approved --json`.
- [x] Add tests proving personal low-risk auto promotion and team no-auto-promotion defaults.
- [x] Ensure weak single-source curated proposals are not auto-promoted by default.
- [x] Allow high-signal single-source personal proposals to follow the low-risk personal auto-review policy.

## 7. Daily, Harvest, And Site Integration

- [x] Run `wiki curate` after compile in daily/harvest.
- [x] Keep degraded daily output marked not production-ready.
- [x] Make review/site dashboards use curated proposal count as the main pending count.
- [x] Keep raw candidate backlog as secondary/debug view.
- [x] Add integration tests for consistent counts and clickable curated proposals.

## 8. Smoke And Docs

- [ ] Add mocked personal smoke for harvest, compile, curate, auto review/promote, site, and context.
- [ ] Update README and deployment docs with personal and team defaults.
- [ ] Run `git diff --check`.
- [ ] Run `pnpm check`.
