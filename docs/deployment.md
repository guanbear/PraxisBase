# PraxisBase Deployment Guide

PraxisBase is designed to run with the toolchain repository separated from one or more knowledge repositories.

## Recommended Repository Layout

```text
PraxisBase                 # CLI, schemas, tests, templates, Dockerfile
praxisbase-openclaw-kb     # OpenClaw repair knowledge and bundles
praxisbase-k8s-kb          # K8s incident knowledge and bundles
```

A knowledge repository contains only file-protocol state and generated artifacts:

```text
.praxisbase/
kb/
skills/
dist/
.gitlab-ci.yml
```

This keeps permissions, audit history, and generated bundles separate between OpenClaw sandbox repair and K8s incident diagnosis.

## Create A Knowledge Repository

Build the CLI from the toolchain repo once:

```bash
cd /path/to/PraxisBase
pnpm install
pnpm --filter @praxisbase/cli build
```

Create an OpenClaw-only knowledge repo:

```bash
mkdir praxisbase-openclaw-kb
cd praxisbase-openclaw-kb
git init
node /path/to/PraxisBase/packages/cli/dist/index.js init --profile openclaw
git add .
git commit -m "Initialize OpenClaw PraxisBase knowledge repo"
```

Create a K8s-only knowledge repo:

```bash
mkdir praxisbase-k8s-kb
cd praxisbase-k8s-kb
git init
node /path/to/PraxisBase/packages/cli/dist/index.js init --profile k8s
git add .
git commit -m "Initialize K8s PraxisBase knowledge repo"
```

Use `--profile all` when one repository intentionally serves both domains.

## GitLab CI For Knowledge Repositories

Copy the split-repo template into each knowledge repo:

```bash
cp /path/to/PraxisBase/templates/gitlab/knowledge-repo.gitlab-ci.yml .gitlab-ci.yml
git add .gitlab-ci.yml
git commit -m "Add PraxisBase knowledge pipeline"
git push origin main
```

Create GitLab Scheduled Pipelines on `main`:

| Schedule | Variable |
| --- | --- |
| review queue | `PRAXISBASE_TASK=review` |
| promote approved proposals | `PRAXISBASE_TASK=promote` |
| build static artifacts | `PRAXISBASE_TASK=build` |

The template clones the PraxisBase tool repo, builds the CLI, and executes it against the knowledge repo checkout. Set these variables if needed:

| Variable | Purpose |
| --- | --- |
| `NODE_IMAGE` | CI Node image. Defaults to `artifactory.ep.chehejia.com/docker-remote/library/node:20-alpine` to avoid direct Docker Hub pulls. |
| `PRAXISBASE_TOOL_REPO` | Toolchain repo URL. Defaults to `https://github.com/guanbear/PraxisBase.git`; private HTTPS repos are cloned with `PRAXISBASE_PUSH_TOKEN` when present. |
| `PRAXISBASE_TOOL_REF` | Branch or tag to build. Defaults to `main`. |
| `PRAXISBASE_WRITEBACK` | Set to `true` to commit generated knowledge/artifacts back to the knowledge repo. |
| `PRAXISBASE_PUSH_TOKEN` | Masked token used only when writeback is enabled. |
| `PRAXISBASE_DAILY_LIMIT` | Maximum source items per daily harvest. Defaults to `500` in the GitLab template. |
| `PRAXISBASE_MAX_AI_CHUNKS` | Maximum uncached AI distill calls per daily harvest. Defaults to `40`. |
| `PRAXISBASE_MAX_CURATION_PROPOSALS` | Maximum AI wiki curation proposals per daily harvest. Defaults to `8`. |
| `PRAXISBASE_AI_CONCURRENCY` | Maximum concurrent AI calls for daily harvest. Defaults to `4`. |
| `PRAXISBASE_PAGES` | Set to `true` to publish `dist/` through GitLab Pages. |

When writeback is enabled, use a Project Access Token with the minimum write scope needed for that knowledge repo.
The GitLab template also installs a temporary Git URL rewrite with `PRAXISBASE_PUSH_TOKEN`, so private same-host Git sources such as `openclaw-ingest/answer-bot` can be cloned by the daily harvest job without embedding credentials in source config.

## Static HTML And Bundles

Run:

```bash
node /path/to/PraxisBase/packages/cli/dist/index.js review --auto
node /path/to/PraxisBase/packages/cli/dist/index.js promote --auto
node /path/to/PraxisBase/packages/cli/dist/index.js build
```

Build output always includes inspection and index files, and includes only the bundles enabled by the repository profile:

```text
dist/index.html
dist/llms.txt
dist/kb-index.json
dist/search-index.json
dist/repair-bundles/manifest.json
# openclaw profile:
dist/repair-bundles/openclaw-sandbox.json
# k8s profile:
dist/repair-bundles/k8s-incident/manifest.json
dist/repair-bundles/k8s-incident/*.json
```

`dist/index.html` is the human inspection page. `dist/repair-bundles/` is the machine-consumable bundle surface for agents.

## OpenClaw Integration

Before repair, ask the OpenClaw knowledge repo for context:

```bash
node /path/to/PraxisBase/packages/cli/dist/index.js repair-context openclaw --logs /path/to/openclaw.log --json
```

After repair, submit an episode and optional proposal:

```bash
node /path/to/PraxisBase/packages/cli/dist/index.js episode submit repair-episode.json
node /path/to/PraxisBase/packages/cli/dist/index.js propose knowledge-proposal.json
```

If the bot cannot write the authority repo directly, submit to outbox:

```bash
node /path/to/PraxisBase/packages/cli/dist/index.js episode submit repair-episode.json --offline-ok
node /path/to/PraxisBase/packages/cli/dist/index.js propose knowledge-proposal.json --offline-ok
```

## Multi-Agent Experience Commands

For local personal use, install a lightweight adapter snippet and fetch bounded context before a task:

```bash
node /path/to/PraxisBase/packages/cli/dist/index.js install codex --dry-run --json
node /path/to/PraxisBase/packages/cli/dist/index.js context get --agent codex --stage diagnosis --query "openclaw auth expired" --json
```

After a task, capture redacted evidence by reference only:

```bash
node /path/to/PraxisBase/packages/cli/dist/index.js capture finish --agent codex --result success --source-ref raw-vault://codex/session-1 --source-hash sha256:session1 --summary "Fixed a project issue and tests passed." --json
node /path/to/PraxisBase/packages/cli/dist/index.js capture submit capture.json --json
node /path/to/PraxisBase/packages/cli/dist/index.js distill run --json
```

To backfill agent-native memory or prepare reviewed knowledge for an agent:

```bash
node /path/to/PraxisBase/packages/cli/dist/index.js memory import --agent hermes --source hermes-memory.json --json
node /path/to/PraxisBase/packages/cli/dist/index.js memory refresh --agent hermes --target instruction-snippet --source-refs kb/known-fixes/openclaw-auth-expired.md --json
node /path/to/PraxisBase/packages/cli/dist/index.js watch --agent claude-code --workspace . --once --json
```

Team scheduled use should run `distill run`, review, promote, and build as separate jobs. `memory import`, `memory refresh`, `capture`, `watch`, and `distill` must not write stable `kb/` or `skills/` files directly; they produce reports, proposals, captures, refresh plans, or exceptions for review.

## Daily Experience Loop

PraxisBase can run a daily experience loop that collects agent experience from configured sources into the wiki.

### Personal Daily

Configure local sources and run a daily personal loop:

```bash
praxisbase source add local-codex --agent codex --type local --path ~/.codex/archived_sessions --scope personal
praxisbase source add local-openclaw --agent openclaw --type local --path ~/.openclaw/exports/latest.json --scope project
praxisbase daily run --mode personal --build-site --json
```

The personal loop writes redacted experience envelopes, harvest reports, daily reports, wiki compile reports, and proposal candidates. It builds the local static site. It does not mutate stable `kb/` or `skills/` unless the user explicitly enables review/promote.

### Team GitLab Daily

Configure team sources and add a scheduled daily harvest job:

```bash
praxisbase source add openclaw-bot --agent openclaw --channel feishu --type openclaw-api --remote bot-prod --scope team
praxisbase source add claude-repair-log --agent claude-code --type http --url "$LOG_API" --scope team
praxisbase daily run --mode team-git --branch "harvest/daily-$(date +%Y-%m-%d)" --commit --push --build-site --json
```

Add a GitLab scheduled pipeline with `PRAXISBASE_TASK=daily-harvest` to run the team daily loop automatically. The same jobs also allow manual `Run new pipeline` runs from the web UI when `PRAXISBASE_TASK` is set, which is useful for smoke testing schedules before waiting for the nightly window.

Required CI variables for team mode:

| Variable | Purpose |
| --- | --- |
| `PRAXISBASE_TASK` | Set to `daily-harvest` for the daily harvest job. |
| `OPENCLAW_TOKEN` | OpenClaw API token (when using OpenClaw API sources). |
| `OPENCLAW_BASE_URL` | OpenClaw API base URL (when using OpenClaw API sources). |
| `PRAXISBASE_PUSH_TOKEN` | Masked token for push when writeback is enabled. |

Team mode enforces privacy: personal scope, private chat content, and raw credentials are rejected before proposal generation. For `channel=feishu` non-Feishu transports such as the OpenClaw answer-bot Git export, team mode is review-first: envelopes are written to the human-required queue before they can become stable `kb/` or `skills/` knowledge.

### OpenClaw Cron Export For Answer Bots

When the OpenClaw bot runs in temporary sandboxes, do not configure PraxisBase against the sandbox IP or SSH endpoint. Use OpenClaw cron to push a stable GitLab source instead.

1. Create a GitLab project access token or bot token for `https://gitlab.chehejia.com/sre/praxisbase` with only the write scope required for the staging branch.
2. Copy the exporter into the OpenClaw bot environment under `/workspace`, because `/workspace` survives sandbox upgrades better than the root filesystem:

```bash
install -d -m 0700 /workspace/praxisbase-openclaw/bin /workspace/praxisbase-openclaw/state
install -m 0755 templates/openclaw/pb-openclaw-pm-export.sh /workspace/praxisbase-openclaw/bin/pb-openclaw-pm-export
```

3. Store exporter secrets outside Git:

```bash
cat >/workspace/praxisbase-openclaw/export.env <<'EOF'
export PB_GIT_REPO="https://gitlab.chehejia.com/sre/praxisbase.git"
export PB_GIT_BRANCH="openclaw-ingest/answer-bot"
export PB_GIT_PATH=".praxisbase/sources/openclaw-answer-bot/pm-memory.jsonl"
export PB_AGENT_ID="answer-bot"
export PB_SQLITE_PATH="/root/.openclaw/memory/pm.sqlite"
export PB_WORKDIR="/workspace/praxisbase-openclaw/state"
export PB_GIT_USERNAME="oauth2"
export PB_GIT_TOKEN="<masked GitLab token>"
EOF
chmod 600 /workspace/praxisbase-openclaw/export.env
```

4. Test network and write permission from the OpenClaw machine before adding cron:

```bash
. /workspace/praxisbase-openclaw/export.env
git -c "http.extraHeader=Authorization: Basic $(python3 - <<'PY' "$PB_GIT_USERNAME" "$PB_GIT_TOKEN"
import base64, sys
print(base64.b64encode(f"{sys.argv[1]}:{sys.argv[2]}".encode()).decode())
PY
)" ls-remote "$PB_GIT_REPO" HEAD
PB_DRY_RUN=1 /workspace/praxisbase-openclaw/bin/pb-openclaw-pm-export
/workspace/praxisbase-openclaw/bin/pb-openclaw-pm-export
```

`ls-remote` proves outbound network and token read access. `PB_DRY_RUN=1` proves SQLite parsing and local JSONL generation without pushing. The final command proves real push to `openclaw-ingest/answer-bot`.

5. Create an OpenClaw cron job. This uses a tiny agent turn only to invoke the script; the script does not call a model:

```bash
openclaw cron add \
  --name "PraxisBase OpenClaw answer-bot memory export" \
  --cron "0 3 * * *" \
  --session isolated \
  --light-context \
  --thinking off \
  --tools exec \
  --timeout-seconds 90 \
  --no-deliver \
  --message "Run exactly: . /workspace/praxisbase-openclaw/export.env && /workspace/praxisbase-openclaw/bin/pb-openclaw-pm-export. Do not inspect unrelated files. Do not summarize memory content. Return only one line: praxisbase_export status=<ok|skip|error> rows=<n> commit=<sha-or-none>."
```

6. In the PraxisBase knowledge repo, consume the exported Git source. This writes `.praxisbase/sources/source_openclaw-answer-bot.json`; commit it to the knowledge repo so GitLab CI can read the same source definition every night:

```bash
praxisbase source add openclaw-answer-bot \
  --agent openclaw \
  --type git \
  --repo https://gitlab.chehejia.com/sre/praxisbase.git \
  --ref openclaw-ingest/answer-bot \
  --path .praxisbase/sources/openclaw-answer-bot/pm-memory.jsonl \
  --scope team \
  --channel feishu
git add -f .praxisbase/sources/source_openclaw-answer-bot.json
git commit -m "Configure OpenClaw answer bot PraxisBase source"
git push origin main
```

In GitLab, the PraxisBase command runs inside the knowledge repository checkout, not on the OpenClaw sandbox. The OpenClaw sandbox only exports JSONL to the staging branch. GitLab scheduled pipelines then run `praxisbase daily run --mode team-git --limit "$PRAXISBASE_DAILY_LIMIT" ...` against the knowledge repo on `main`, pulling the exported branch through the configured Git source.

### GitLab Setup Checklist For `gitlab.chehejia.com/sre/praxisbase`

1. Push or merge this PraxisBase toolchain change to a branch/tag that CI can clone, then set `PRAXISBASE_TOOL_REPO=https://gitlab.chehejia.com/sre/praxisbase.git` and `PRAXISBASE_TOOL_REF=<that branch or tag>`.
2. Add `templates/gitlab/knowledge-repo.gitlab-ci.yml` as `.gitlab-ci.yml` in the knowledge repo. If the toolchain repo and knowledge repo are temporarily the same project, add the file to this project and keep generated data under `.praxisbase/`, `kb/`, `skills/`, and `dist/`.
3. Create a project access token for CI writeback with `write_repository`; store it as a masked variable `PRAXISBASE_PUSH_TOKEN`.
4. Set CI variables: `PRAXISBASE_WRITEBACK=true`, `PRAXISBASE_DAILY_LIMIT=500`, `PRAXISBASE_MAX_AI_CHUNKS=40`, `PRAXISBASE_MAX_CURATION_PROPOSALS=8`, `PRAXISBASE_AI_CONCURRENCY=4`, `PRAXISBASE_TOOL_REPO=https://gitlab.chehejia.com/sre/praxisbase.git`, and `PRAXISBASE_TOOL_REF=<branch/tag>`.
5. Allow the OpenClaw exporter token to push only `openclaw-ingest/answer-bot`. If the branch is protected, add the bot token/user to the allowed-to-push list for that branch pattern.
6. Add scheduled pipelines on `main`: `PRAXISBASE_TASK=daily-harvest` first; then `review`, `promote`, and `build` after harvest once the human-required flow is confirmed.

Keep the OpenClaw cron frequency low at first, for example once per night. If token cost becomes a problem, replace the agent-turn cron with an OpenClaw system-event hook/plugin that executes the same exporter directly.

## K8s Incident Integration

Fetch optional incident context:

```bash
node /path/to/PraxisBase/packages/cli/dist/index.js bundle fetch k8s-incident --signature k8s:pod-oomkilled
```

Submit incident evidence as file protocol objects:

```bash
node /path/to/PraxisBase/packages/cli/dist/index.js episode submit incident-episode.json --offline-ok
node /path/to/PraxisBase/packages/cli/dist/index.js propose k8s-proposal.json --offline-ok
```

PraxisBase does not run `kubectl`, does not perform production writes, and must not be a synchronous live-incident dependency.

## Container Image

The root `Dockerfile` builds a CLI image:

```bash
docker build -t praxisbase-cli:local .
docker run --rm -v "$PWD:/workspace" -w /workspace praxisbase-cli:local init --profile openclaw
docker run --rm -v "$PWD:/workspace" -w /workspace praxisbase-cli:local build
```

The image is optional. GitLab CI can also clone the tool repo and run the built CLI directly.
