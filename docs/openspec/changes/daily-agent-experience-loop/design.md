# Daily Agent Experience Loop OpenSpec Design

## Overview

M14 adds a daily product layer over the existing PraxisBase kernel.

```text
source configs
    |
    v
source adapters
    |
    v
experience envelopes
    |
    v
privacy policy
    |
    v
memory ingest -> wiki compile -> quality -> site -> context
    |
    v
optional team Git commit/push
```

The existing harvest pipeline remains available. `daily` is the release-grade workflow that discovers configured sources, writes daily reports, applies mode-specific privacy, and prepares human and agent outputs.

## Source Model

### Source Is User-Facing

Users configure experience sources, not transports.

Supported agents for this change:

- `codex`
- `openclaw`
- `claude-code`

Supported source types:

- `local`
- `file`
- `git`
- `ssh`
- `http`
- `openclaw-api`

Supported channels:

- `local`
- `terminal`
- `feishu`
- `ci`
- `gitlab`
- `log-system`
- `unknown`

The `channel` records provenance. It does not change the identity of the agent that produced the experience.

### Feishu OpenClaw Bot

An OpenClaw bot used through Feishu is modeled as:

```text
agent = openclaw
channel = feishu
parser = openclaw-export
```

PraxisBase fetches OpenClaw memory/export/API data, not Feishu chat history. A future Feishu feedback adapter can be added if human feedback exists only in Feishu, but that is outside this change.

### Claude Code Repair Logs

Claude Code repair logs are modeled as:

```text
agent = claude-code
channel = log-system | gitlab | ci
parser = claude-code-repair-log
```

The parser extracts only:

- source ref;
- source hash;
- problem signature when available;
- redacted summary;
- outcome;
- created/fetched timestamps;
- privacy verdict.

Raw log content is not committed.

## Experience Envelope

Every source adapter outputs `ExperienceEnvelope` records. Downstream code should consume envelopes rather than raw source files.

Required properties:

- source id;
- agent;
- channel;
- source ref;
- source hash;
- scope hint;
- optional signature/problem signature;
- optional outcome;
- redacted summary;
- privacy verdict;
- warnings.

Envelopes are staged under:

```text
.praxisbase/staging/experience-envelopes/
```

Only allowed envelopes are ingested into raw refs and capture records.

## Privacy Policy

### Personal Local

Personal mode allows personal and project scopes, but still rejects or routes private material:

- tokens;
- cookies;
- auth headers;
- private keys;
- raw credentials;
- raw private logs;
- full transcripts that trigger private material detection.

### Team Git

Team mode allows project, team, and org scopes.

Team mode rejects:

- personal scope;
- private chat;
- direct messages;
- raw logs;
- full transcripts;
- unredacted user home-directory content;
- secrets and credentials;
- uncertain scope from a source that is not configured as team-safe.

Rejected or uncertain material must not become proposal body, stable wiki page content, or generated site content. Human-review cases are written to `.praxisbase/exceptions/human-required/`.

## Daily Command

### Init

```bash
praxisbase daily init --mode personal --json
praxisbase daily init --mode team-git --provider gitlab --json
```

Personal init creates local directories and sample source commands.

Team Git init creates or updates GitLab CI guidance and validates the workspace is a Git checkout.

### Run

```bash
praxisbase daily run --mode personal --build-site --json
praxisbase daily run --mode team-git --branch harvest/daily-YYYY-MM-DD --commit --push --build-site --json
```

Run steps:

1. load configured sources;
2. include legacy remotes when requested for compatibility;
3. fetch/scan sources;
4. produce experience envelopes;
5. enforce privacy;
6. ingest allowed envelopes;
7. run wiki compile in review mode;
8. build site when requested;
9. run context smoke when requested;
10. run review/promote only when explicitly requested;
11. write daily report and run record;
12. perform team Git branch/commit/push when requested.

`changed_stable_knowledge` is false unless explicit review/promote paths run and pass.

Agents consume fresh daily experience as default context only after review/promote turns it into stable knowledge or reviewed bundles. Daily reports and proposal candidates are human inspection artifacts, not a bypass around review.

### Doctor

```bash
praxisbase daily doctor --mode team-git --json
```

Doctor validates:

- source configs;
- missing credentials;
- parser availability;
- Git branch safety;
- GitLab variable hints;
- ignored staging/cache paths;
- writeback readiness.

Doctor must not print secret values.

### Schedule

```bash
praxisbase daily schedule --mode personal --runner launchd --print
praxisbase daily schedule --mode personal --runner cron --print
```

This release can print schedule files/scripts instead of installing them silently.

## Static Site Behavior

Do not add a separate experience page.

The existing wiki site is the human surface:

- `dist/index.html` includes recent knowledge updates from latest daily reports;
- `dist/pages/*.html` show summarized knowledge;
- provenance rails include source refs and hashes;
- `dist/issues.html` shows privacy and human-required exceptions;
- graph and search continue to work as before.

Daily report output is audit data. It should not encourage browsing raw experience.

## Agent Access

Generated Skill+CLI remains the default.

Agents read latest reviewed knowledge through:

```bash
praxisbase context get --agent openclaw --stage repair --query "..." --json
praxisbase context get --agent codex --stage diagnosis --query "..." --json
praxisbase context get --agent claude-code --stage repair --query "..." --json
```

MCP remains optional and must call the same core functions.

## GitLab

The knowledge repo template adds a scheduled daily harvest job before review/promote/build.

```text
daily-harvest -> review -> promote -> build -> pages
```

Write-capable jobs use:

```yaml
resource_group: praxisbase-write
```

Required variable families:

- PraxisBase tool repo/ref;
- writeback token;
- OpenClaw API credentials when OpenClaw API sources are configured;
- log-system credentials when HTTP log sources are configured;
- Pages enablement.

## Backward Compatibility

- Existing `praxisbase remote` configs still work.
- Existing `praxisbase harvest` behavior stays valid.
- Existing OpenClaw export JSON provider stays valid.
- Existing generated Skill and MCP commands remain valid, with added daily/source guidance.

## Acceptance Tests

- Source schema and CLI tests.
- Adapter tests for OpenClaw Feishu-channel source and Claude Code repair logs.
- Privacy tests for team rejection of personal/private content.
- Daily personal and team orchestrator tests.
- GitLab CI template tests.
- Site model tests for homepage recent updates and absence of `dist/experience.html`.
- End-to-end smoke for personal and team daily runs.
