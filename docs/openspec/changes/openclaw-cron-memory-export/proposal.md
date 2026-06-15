# OpenClaw Cron Memory Export

## Why

The OpenClaw answer bot runs in sandboxes whose IP, id, and SSH access are temporary. PraxisBase team ingestion should depend on a stable logical bot identity and GitLab-backed source artifacts, not on ad hoc SSH into a current sandbox.

## What Changes

- Add a deployable OpenClaw PM memory exporter template.
- Document OpenClaw cron invocation for low-token scheduled export.
- Document GitLab staging branch and PraxisBase git source configuration.
- Validate the current `pm.sqlite` path through a local Git staging smoke before automating.

## Non-Goals

- Do not add a new OpenClaw API/A2A adapter in this change.
- Do not use sandbox system cron.
- Do not upload raw sqlite databases to GitLab.
- Do not auto-promote Feishu-channel team knowledge without review.

## Acceptance

- Exporter reads `pm.sqlite` through Python stdlib SQLite and writes JSONL records with stable `source_ref` values.
- Exporter supports cursor-based incremental export and updates cursor only after successful push.
- GitLab setup instructions include token, branch, path, source add, and schedule variables.
- Smoke evidence demonstrates current answer-bot memory can flow through a git source into `daily run --mode team-git`.
