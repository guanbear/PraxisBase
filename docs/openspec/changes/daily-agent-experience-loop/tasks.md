# Daily Agent Experience Loop Tasks

This change is planned as M14.

## M14.0 Documentation And Contracts

- [x] Add design document under `docs/superpowers/specs/`.
- [x] Add implementation plan under `docs/superpowers/plans/`.
- [x] Add OpenSpec proposal/design/tasks under `docs/openspec/changes/daily-agent-experience-loop/`.
- [x] Add BDD scenarios under `docs/bdd/daily-agent-experience-loop.feature`.
- [x] Link design, implementation plan, OpenSpec, and BDD around the same source/envelope/daily model.

## M14.1 Protocol And Paths

- [x] Add protocol paths for `.praxisbase/sources`, `.praxisbase/staging/experience-envelopes`, `.praxisbase/reports/daily`, and `.praxisbase/runs/daily`.
- [x] Add `ExperienceSourceConfig` schema.
- [x] Add `ExperienceEnvelope` schema.
- [x] Add `DailyExperienceReport` schema.
- [x] Extend agent memory schemas to support `claude-code` repair logs.
- [x] Ensure staging/cache paths remain ignored by Git.

## M14.2 Source Registry

- [x] Add core helpers to add/list/read/remove experience sources.
- [x] Reject credentials in source config fields.
- [x] Add `praxisbase source add <name>`.
- [x] Add `praxisbase source list --json`.
- [x] Add `praxisbase source remove <name>`.
- [x] Add `praxisbase source doctor <name> --json`.
- [x] Infer parser defaults for common Codex, OpenClaw, and Claude Code source combinations.
- [x] Keep existing `praxisbase remote` compatibility.

## M14.3 Source Adapters And Envelopes

- [x] Normalize local Codex sessions into experience envelopes.
- [x] Normalize local OpenClaw logs/exports into experience envelopes.
- [x] Normalize remote OpenClaw file/git/ssh/http/OpenClaw API sources into experience envelopes.
- [x] Represent OpenClaw Feishu bot memory as `agent=openclaw` and `channel=feishu`.
- [x] Normalize Claude Code repair logs into experience envelopes.
- [x] Ensure envelopes contain redacted summaries, source refs, hashes, scope hints, and privacy verdicts.
- [x] Ensure raw source content is never committed.

## M14.4 Privacy Enforcement

- [x] Add personal-local privacy policy.
- [x] Add team-git privacy policy.
- [x] Reject personal scope in team-git mode.
- [x] Route secrets/private material to human-required exceptions.
- [x] Block rejected or human-required envelopes from proposal body and wiki site content.
- [x] Add tests proving personal/private content cannot enter team Git knowledge.

## M14.5 Daily Orchestrator

- [x] Add `runDailyExperience(root, input)` core orchestrator.
- [x] Add `praxisbase daily init --mode personal`.
- [x] Add `praxisbase daily init --mode team-git --provider gitlab`.
- [x] Add `praxisbase daily run --mode personal`.
- [x] Add `praxisbase daily run --mode team-git`.
- [x] Add `praxisbase daily doctor`.
- [x] Add printable personal schedule helpers for launchd and cron.
- [x] Write daily reports and run records.
- [x] Preserve `changed_stable_knowledge: false` unless explicit review/promote succeeds.

## M14.6 Wiki Site Integration

- [x] Add recent daily knowledge updates to `dist/index.html`.
- [ ] Add provenance links from wiki pages to source refs and hashes where available.
- [x] Surface privacy and human-required daily findings in `dist/issues.html`.
- [x] Do not generate `dist/experience.html`.
- [x] Add site tests for recent updates and no separate experience page.

## M14.7 GitLab Team Schedule

- [x] Add `praxisbase:daily-harvest` scheduled job to knowledge repo GitLab template.
- [x] Add `harvest` stage before review/promote/build where needed.
- [x] Use `resource_group: praxisbase-write` for write-capable scheduled jobs.
- [x] Document OpenClaw API and log-system variables.
- [x] Keep GitLab Pages build behavior compatible with existing template.

## M14.8 Agent Access And Docs

- [x] Update generated PraxisBase Skill with `source` and `daily` guidance.
- [x] Document personal daily flow in README and deployment docs.
- [x] Document team GitLab daily flow in README and deployment docs.
- [x] Document that Feishu is an OpenClaw channel, not a source agent.
- [x] Document that Skill+CLI is default and MCP is optional.

## M14.9 Verification

- [x] Run source registry tests.
- [x] Run source adapter tests.
- [x] Run privacy policy tests.
- [x] Run daily orchestrator tests.
- [x] Run CLI tests for `source` and `daily`.
- [x] Run GitLab CI template tests.
- [x] Run static site tests and Playwright smoke.
- [x] Run `pnpm check`.
- [x] Run `pnpm test:e2e`.
- [x] Run `git diff --check`.

## Out Of Scope

- Required MCP setup.
- OpenClaw memory writeback.
- Feishu raw chat ingestion.
- Feishu feedback adapter.
- Database-backed scheduler.
- Hosted web UI.
- Vector database or external search service.
- Separate `experience.html` page.
