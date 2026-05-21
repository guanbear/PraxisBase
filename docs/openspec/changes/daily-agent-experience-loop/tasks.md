# Daily Agent Experience Loop Tasks

This change is planned as M14.

## M14.0 Documentation And Contracts

- [x] Add design document under `docs/superpowers/specs/`.
- [x] Add implementation plan under `docs/superpowers/plans/`.
- [x] Add OpenSpec proposal/design/tasks under `docs/openspec/changes/daily-agent-experience-loop/`.
- [x] Add BDD scenarios under `docs/bdd/daily-agent-experience-loop.feature`.
- [x] Link design, implementation plan, OpenSpec, and BDD around the same source/envelope/daily model.

## M14.1 Protocol And Paths

- [ ] Add protocol paths for `.praxisbase/sources`, `.praxisbase/staging/experience-envelopes`, `.praxisbase/reports/daily`, and `.praxisbase/runs/daily`.
- [ ] Add `ExperienceSourceConfig` schema.
- [ ] Add `ExperienceEnvelope` schema.
- [ ] Add `DailyExperienceReport` schema.
- [ ] Extend agent memory schemas to support `claude-code` repair logs.
- [ ] Ensure staging/cache paths remain ignored by Git.

## M14.2 Source Registry

- [ ] Add core helpers to add/list/read/remove experience sources.
- [ ] Reject credentials in source config fields.
- [ ] Add `praxisbase source add <name>`.
- [ ] Add `praxisbase source list --json`.
- [ ] Add `praxisbase source remove <name>`.
- [ ] Add `praxisbase source doctor <name> --json`.
- [ ] Infer parser defaults for common Codex, OpenClaw, and Claude Code source combinations.
- [ ] Keep existing `praxisbase remote` compatibility.

## M14.3 Source Adapters And Envelopes

- [ ] Normalize local Codex sessions into experience envelopes.
- [ ] Normalize local OpenClaw logs/exports into experience envelopes.
- [ ] Normalize remote OpenClaw file/git/ssh/http/OpenClaw API sources into experience envelopes.
- [ ] Represent OpenClaw Feishu bot memory as `agent=openclaw` and `channel=feishu`.
- [ ] Normalize Claude Code repair logs into experience envelopes.
- [ ] Ensure envelopes contain redacted summaries, source refs, hashes, scope hints, and privacy verdicts.
- [ ] Ensure raw source content is never committed.

## M14.4 Privacy Enforcement

- [ ] Add personal-local privacy policy.
- [ ] Add team-git privacy policy.
- [ ] Reject personal scope in team-git mode.
- [ ] Route secrets/private material to human-required exceptions.
- [ ] Block rejected or human-required envelopes from proposal body and wiki site content.
- [ ] Add tests proving personal/private content cannot enter team Git knowledge.

## M14.5 Daily Orchestrator

- [ ] Add `runDailyExperienceLoop(root, input)` core orchestrator.
- [ ] Add `praxisbase daily init --mode personal`.
- [ ] Add `praxisbase daily init --mode team-git --provider gitlab`.
- [ ] Add `praxisbase daily run --mode personal`.
- [ ] Add `praxisbase daily run --mode team-git`.
- [ ] Add `praxisbase daily doctor`.
- [ ] Add printable personal schedule helpers for launchd and cron.
- [ ] Write daily reports and run records.
- [ ] Preserve `changed_stable_knowledge: false` unless explicit review/promote succeeds.

## M14.6 Wiki Site Integration

- [ ] Add recent daily knowledge updates to `dist/index.html`.
- [ ] Add provenance links from wiki pages to source refs and hashes where available.
- [ ] Surface privacy and human-required daily findings in `dist/issues.html`.
- [ ] Do not generate `dist/experience.html`.
- [ ] Add site tests for recent updates and no separate experience page.

## M14.7 GitLab Team Schedule

- [ ] Add `praxisbase:daily-harvest` scheduled job to knowledge repo GitLab template.
- [ ] Add `harvest` stage before review/promote/build where needed.
- [ ] Use `resource_group: praxisbase-write` for write-capable scheduled jobs.
- [ ] Document OpenClaw API and log-system variables.
- [ ] Keep GitLab Pages build behavior compatible with existing template.

## M14.8 Agent Access And Docs

- [ ] Update generated PraxisBase Skill with `source` and `daily` guidance.
- [ ] Document personal daily flow in README and deployment docs.
- [ ] Document team GitLab daily flow in README and deployment docs.
- [ ] Document that Feishu is an OpenClaw channel, not a source agent.
- [ ] Document that Skill+CLI is default and MCP is optional.

## M14.9 Verification

- [ ] Run source registry tests.
- [ ] Run source adapter tests.
- [ ] Run privacy policy tests.
- [ ] Run daily orchestrator tests.
- [ ] Run CLI tests for `source` and `daily`.
- [ ] Run GitLab CI template tests.
- [ ] Run static site tests and Playwright smoke.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm test:e2e`.
- [ ] Run `git diff --check`.

## Out Of Scope

- Required MCP setup.
- OpenClaw memory writeback.
- Feishu raw chat ingestion.
- Feishu feedback adapter.
- Database-backed scheduler.
- Hosted web UI.
- Vector database or external search service.
- Separate `experience.html` page.
