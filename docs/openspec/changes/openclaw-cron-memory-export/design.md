# OpenClaw Cron Memory Export — OpenSpec Design

Full rationale: `docs/superpowers/specs/2026-06-15-openclaw-cron-memory-export-design.md`.

## Decisions

### D1. Stable source identity

The source identity is the bot role, not the sandbox. Exported items use `openclaw://answer-bot/pm.sqlite/chunks/<chunk-id>`. Sandbox IP, SSH port, and temporary credentials are excluded from exported records.

### D2. OpenClaw cron triggers a script

The scheduled job is an OpenClaw cron `agentTurn` with `light-context`, low-cost model, `thinking off`, and `tools exec`. The prompt instructs the agent to run the exporter script and return only one status line. The script itself performs all work without model calls.

### D3. GitLab staging branch is the transport

Exporter pushes JSONL into `openclaw-ingest/answer-bot` under `.praxisbase/sources/openclaw-answer-bot/pm-memory.jsonl`. PraxisBase consumes it as a `git` source in team mode.

### D4. Incremental export with retry safety

Exporter stores a local cursor under `/workspace/praxisbase-openclaw/state` and queries `updated_at > cursor`, default `LIMIT 500`. Cursor advances only after push succeeds. The JSONL file is deduplicated by `source_ref` before commit.

### D6. GitLab nightly uses an explicit team limit

The generic source adapter keeps its conservative default limit of 20 for interactive and personal scans. The GitLab scheduled daily harvest sets `PRAXISBASE_DAILY_LIMIT=500` and passes `--limit`, so the first answer-bot backfill and subsequent nightly runs do not permanently skip rows beyond the default page.

### D5. Review-first privacy

The exporter applies minimal secret redaction before Git write. PraxisBase still treats `channel=feishu` team data as review-first and routes uncertain/private material to human-required.

## Affected Files

- `templates/openclaw/pb-openclaw-pm-export.sh`
- `docs/deployment.md`
- `docs/superpowers/specs/2026-06-15-openclaw-cron-memory-export-design.md`
- `docs/status/openclaw-cron-memory-export-2026-06-15.md`
- `templates/gitlab/knowledge-repo.gitlab-ci.yml`

## Test Matrix

- Shell syntax check for exporter.
- Local dry run against copied `pm.sqlite` and a temporary Git repository.
- PraxisBase `source add --type git` plus `daily run --mode team-git --no-ai --build-site --json` against the temporary Git staging repository.
