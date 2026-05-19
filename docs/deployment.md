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
| `PRAXISBASE_TOOL_REPO` | Toolchain repo URL. Defaults to `https://github.com/guanbear/PraxisBase.git`. |
| `PRAXISBASE_TOOL_REF` | Branch or tag to build. Defaults to `main`. |
| `PRAXISBASE_WRITEBACK` | Set to `true` to commit generated knowledge/artifacts back to the knowledge repo. |
| `PRAXISBASE_PUSH_TOKEN` | Masked token used only when writeback is enabled. |
| `PRAXISBASE_PAGES` | Set to `true` to publish `dist/` through GitLab Pages. |

When writeback is enabled, use a Project Access Token with the minimum write scope needed for that knowledge repo.

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
