# Tasks

- [x] Document scheme A design for OpenClaw cron-triggered memory export.
- [x] Add deployable exporter template.
- [x] Add OpenSpec proposal/design/tasks artifacts.
- [x] Document GitLab and OpenClaw cron configuration.
- [x] Smoke the current `pm.sqlite` through local Git staging and PraxisBase team daily ingestion.
- [x] Set GitLab daily harvest template to pass an explicit `PRAXISBASE_DAILY_LIMIT=500`.
- [x] Move OpenClaw exporter install/config/state paths to durable `/workspace/praxisbase-openclaw` paths.
- [ ] After user provides GitLab token/branch policy, install the exporter and OpenClaw cron job on the bot environment.
- [ ] After first real GitLab run, tune frequency, limit, and human-required triage policy.
