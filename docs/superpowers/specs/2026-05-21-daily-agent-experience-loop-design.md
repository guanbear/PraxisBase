# Daily Agent Experience Loop Design

## Goal

M14 makes PraxisBase usable as a daily experience loop for personal and team agent knowledge.

The release goal is not to add a new "experience page" or to make Feishu, GitLab, or a log system into knowledge authorities. The goal is to reliably collect agent experience from configured sources, normalize it into redacted evidence, merge it into the wiki flow, and make the same reviewed knowledge available to humans and agents.

## Current Baseline

PraxisBase already has the core pieces:

- `praxisbase harvest` can ingest local Codex, local OpenClaw, exported OpenClaw JSON, registered remotes, compile the wiki, build the static site, and optionally run team Git commit/push.
- `praxisbase remote` supports file, git, ssh, http, and OpenClaw API transports for remote OpenClaw exports.
- `praxisbase agent-tools` and generated Skills make CLI access the default agent integration path.
- Optional MCP exposes a thin bridge over the same core commands.
- The static site already has wiki pages, graph, issues, quality reports, provenance, and file URL support.
- Team Git mode already treats Git as authority and protects direct writes to protected branches.

The missing layer is productization:

- users still have to think in terms of low-level transports instead of "experience sources";
- personal daily automation is not a first-class command;
- team scheduled harvest is not represented in the GitLab knowledge repo template;
- OpenClaw Feishu bot experience is not modeled clearly as OpenClaw memory with a Feishu channel;
- Claude Code repair logs are not yet a first-class harvest source;
- team privacy policy needs hard enforcement that rejects personal content before it reaches team knowledge;
- the HTML site should show daily knowledge updates through the existing wiki entry point, not through a separate experience product.

## Positioning

PraxisBase remains a file-first, Git-friendly agent knowledge substrate.

It should not become:

- a database-backed RAG platform;
- a Feishu chat archive;
- a log analytics product;
- a required daemon;
- a required MCP server;
- a hosted UI.

The durable authority is still:

- reviewed `kb/`;
- reviewed `skills/`;
- proposal, review, exception, report, and run records under `.praxisbase/`;
- Git history in team mode.

## Core Model

The central abstraction is an agent experience source.

```text
Agent Experience Source
        |
        v
Experience Envelope
        |
        v
privacy gate + source analysis
        |
        v
wiki compile / merge / review
        |
        v
kb / skills / dist
        |
        v
agent context + HTML wiki
```

PraxisBase should reason about the source of experience, not the transport used to fetch it.

Examples:

```text
local Codex sessions
local OpenClaw memory export
remote OpenClaw API
remote OpenClaw export over SSH
OpenClaw bot memory with channel=feishu
Claude Code repair logs from an HTTP log system
Claude Code repair logs from GitLab artifacts
```

Feishu is a channel, not an agent and not a knowledge authority. An OpenClaw bot used through Feishu is still an OpenClaw source:

```text
agent = openclaw
channel = feishu
transport = openclaw-api | ssh | git | http | file
```

Only if important review feedback exists exclusively in Feishu should PraxisBase later add a separate Feishu feedback adapter. That is out of scope for this M14 release.

## Authority Modes

### Personal Local

The local workspace is the authority.

Default sources:

- local Codex sessions;
- local OpenClaw memory export or logs;
- one or more remote OpenClaw sources.

Default daily run:

```bash
praxisbase daily run --mode personal --build-site --json
```

Expected results:

- writes redacted experience envelopes, harvest reports, daily reports, wiki compile reports, and proposal candidates;
- builds the local static site;
- does not require GitHub, GitLab, or a remote Git repository;
- does not mutate stable `kb/` or `skills/` unless the user explicitly enables review/promote;
- generated Skills let local Codex and OpenClaw query the newest knowledge through the CLI.

### Team Git

The GitLab knowledge repository is the authority.

Default sources:

- OpenClaw bot memory source, with `channel=feishu` when the user-facing entry point is Feishu;
- Claude Code repair experience from a log system, GitLab artifacts, or exported files;
- optional additional OpenClaw remote sources.

Default scheduled run:

```bash
praxisbase daily run --mode team-git --branch harvest/daily-YYYY-MM-DD --commit --push --build-site --json
```

Expected results:

- runs from a GitLab scheduled pipeline;
- writes reports, exceptions, and proposal candidates on a harvest branch or scheduled writeback branch;
- keeps review, promote, and build steps separate and serializable;
- publishes the existing wiki site through GitLab Pages when configured;
- makes latest reviewed knowledge available to OpenClaw, Claude Code, Codex, and other agents through generated Skill+CLI or optional MCP.

## User-Facing Commands

### Source Registry

Add a product-level `source` command while keeping existing `remote` commands compatible.

```bash
praxisbase source add local-codex --agent codex --type local --path ~/.codex/archived_sessions --scope personal
praxisbase source add local-openclaw --agent openclaw --type local --path ~/.openclaw/exports/latest.json --scope project
praxisbase source add remote-openclaw --agent openclaw --type ssh --host user@host --path ~/.openclaw/exports/latest.json --scope project
praxisbase source add openclaw-bot --agent openclaw --channel feishu --type openclaw-api --remote bot-prod --scope team
praxisbase source add claude-repair-log --agent claude-code --type http --url "$LOG_API" --parser claude-code-repair-log --scope team
praxisbase source list --json
praxisbase source doctor openclaw-bot --json
```

`source` is the user-facing abstraction. `remote` remains the lower-level OpenClaw transport registry introduced in M12.2.

### Daily Automation

Add a `daily` command as the productized workflow over `source`, `harvest`, wiki compile, site build, Git, and agent tool generation.

```bash
praxisbase daily init --mode personal --json
praxisbase daily init --mode team-git --provider gitlab --json
praxisbase daily run --mode personal --build-site --json
praxisbase daily run --mode team-git --branch harvest/daily-YYYY-MM-DD --commit --push --build-site --json
praxisbase daily doctor --mode team-git --json
```

`daily init` writes only configuration and templates. `daily run` performs the actual collection and build work.

`daily run` may expose the existing explicit review/promote switches:

```bash
praxisbase daily run --mode personal --build-site --auto-review --auto-promote --json
```

These switches remain explicit because they can mutate stable knowledge through the existing review/promote gates.

Personal scheduling should be generated but not silently installed:

```bash
praxisbase daily schedule --mode personal --runner launchd --print
praxisbase daily schedule --mode personal --runner cron --print
```

The command may install the schedule later with an explicit flag, but this release can start with printable runner files/scripts.

## Data Contracts

### ExperienceSourceConfig

Stored under `.praxisbase/sources/<name>.json`.

```ts
interface ExperienceSourceConfig {
  id: string;
  protocol_version: "0.1";
  type: "experience_source_config";
  name: string;
  agent: "codex" | "openclaw" | "claude-code";
  source_type: "local" | "file" | "git" | "ssh" | "http" | "openclaw-api";
  channel: "local" | "terminal" | "feishu" | "ci" | "gitlab" | "log-system" | "unknown";
  parser: "codex-session" | "openclaw-export" | "openclaw-log" | "claude-code-repair-log";
  scope_default: "personal" | "project" | "team" | "org";
  path?: string;
  repo?: string;
  ref?: string;
  host?: string;
  url?: string;
  remote?: string;
  created_at: string;
  updated_at: string;
}
```

Configs must never store tokens, cookies, auth headers, private keys, or raw credential material.

### ExperienceEnvelope

Written under `.praxisbase/staging/experience-envelopes/` before ingest and referenced from reports.

```ts
interface ExperienceEnvelope {
  id: string;
  protocol_version: "0.1";
  type: "experience_envelope";
  source_id: string;
  agent: "codex" | "openclaw" | "claude-code";
  channel: string;
  source_ref: string;
  source_hash: string;
  scope_hint: "personal" | "project" | "team" | "org";
  signature?: string;
  problem_signature?: string;
  outcome?: "success" | "failed" | "partial" | "unknown";
  redacted_summary: string;
  created_at?: string;
  fetched_at: string;
  privacy: {
    mode: "personal-local" | "team-git";
    verdict: "allow" | "reject" | "human_required";
    reasons: string[];
  };
  warnings: string[];
}
```

The envelope is the only staging object that downstream daily, harvest, and wiki code should consume. Raw source content stays outside Git or inside ignored cache/staging paths.

### DailyExperienceReport

Written under `.praxisbase/reports/daily/<id>.json` and `.praxisbase/runs/daily/<id>.json`.

```ts
interface DailyExperienceReport {
  id: string;
  protocol_version: "0.1";
  type: "daily_experience_report";
  authority_mode: "personal-local" | "team-git";
  mode: "dry-run" | "write";
  sources: Array<{
    name: string;
    agent: "codex" | "openclaw" | "claude-code";
    channel: string;
    source_type: string;
    status: "completed" | "partial" | "failed";
    scanned: number;
    fetched: number;
    enveloped: number;
    imported: number;
    rejected: number;
    human_required: number;
    warnings: string[];
  }>;
  proposal_candidates: number;
  quality_findings: number;
  site_pages: number;
  changed_stable_knowledge: boolean;
  git?: {
    branch?: string;
    committed: boolean;
    pushed: boolean;
    commit_sha?: string;
  };
  outputs: string[];
  warnings: string[];
  created_at: string;
}
```

## Privacy Policy

M14 must make privacy mode explicit.

### Personal Local Policy

Allowed:

- personal scope;
- project scope;
- local-only reports and local-only site generation.

Rejected:

- tokens;
- cookies;
- auth headers;
- private keys;
- raw credentials;
- raw logs or full transcripts that match private material rules.

Personal mode is convenient, not unguarded.

### Team Git Policy

Allowed:

- project scope;
- team scope;
- org scope.

Rejected before proposal generation:

- personal scope;
- private chat or DM content;
- raw logs;
- full transcripts;
- user home-directory content that has not been summarized;
- tokens, cookies, auth headers, private keys, and raw credentials;
- uncertain scope when the source is not explicitly configured as team-safe.

Uncertain cases go to `.praxisbase/exceptions/human-required/` and do not enter stable knowledge, proposals, or generated wiki pages as content.

## Human UI

There is no separate `experience.html` product.

The human-facing artifact is the wiki. Summarized experience becomes:

- known fixes;
- procedures;
- pitfalls;
- decisions;
- skill seeds;
- notes.

M14 should enhance the existing site in three narrow ways:

- the homepage shows recent knowledge updates from the latest daily reports;
- knowledge pages show provenance from envelopes, reports, and source hashes;
- issues show privacy rejects, human-required exceptions, and source health problems.

Daily reports are audit/navigation data. They are not another knowledge surface and should not encourage browsing raw experience.

## Agent Access

The default agent integration remains generated Skill plus CLI:

```bash
praxisbase context get --agent openclaw --stage repair --query "..." --json
praxisbase context get --agent codex --stage diagnosis --query "..." --json
praxisbase context get --agent claude-code --stage repair --query "..." --json
```

OpenClaw does not need PraxisBase to write back into OpenClaw memory for M14. OpenClaw reads the latest PraxisBase knowledge through the same Skill+CLI surface as other agents.

MCP remains optional. It should expose the same contracts and must not bypass privacy, review, promote, or team Git rules.

### Freshness Contract

Agents should not consume unreviewed raw experience by default.

The default context surface returns reviewed stable knowledge and safe generated bundles. Fresh daily experience becomes default agent context only after it passes review/promote, either through an explicit personal run or through the team's scheduled review/promote jobs.

Daily reports and proposal candidates can be inspected by humans, but they are not a shortcut around review. This keeps latest experience useful without letting unsafe, personal, or weakly verified material silently drive future repairs.

## GitLab Team Flow

The knowledge repo should include a GitLab CI template with scheduled jobs:

```text
daily-harvest -> review -> promote -> build -> pages
```

Required variables:

- `PRAXISBASE_TASK=daily-harvest|review|promote|build`
- `PRAXISBASE_MODE=team-git`
- `PRAXISBASE_WRITEBACK=true|false`
- `PRAXISBASE_PUSH_TOKEN`
- `OPENCLAW_TOKEN` and `OPENCLAW_BASE_URL` when OpenClaw API is used
- log-system token or URL variables when Claude Code repair logs are fetched through HTTP

The template must use `resource_group: praxisbase-write` for jobs that can write to the repo.

## Error Handling

- Invalid source config fails at `source add` or `source doctor`.
- Missing credentials fail at fetch time with a clear code and without printing secrets.
- Unsupported parser fails before writing envelopes.
- Privacy reject writes a count and, in write mode, a human-required exception when review is needed.
- Team Git commit on protected branches still requires an explicit branch.
- `daily run --mode team-git --push` still requires `--commit`.
- Site build failures should not hide successful harvest reports.

## Testing Strategy

Required tests:

- schema tests for `ExperienceSourceConfig`, `ExperienceEnvelope`, and `DailyExperienceReport`;
- CLI tests for `source add/list/remove/doctor`;
- source adapter tests for local Codex, local OpenClaw, OpenClaw API, SSH/file/git/http transports, and Claude Code repair logs;
- compatibility tests proving old `remote` OpenClaw configs still work;
- privacy tests proving team mode rejects personal scope and raw/private material;
- daily orchestrator tests for personal local and team Git modes;
- GitLab template tests for scheduled daily harvest and write serialization;
- static site tests proving recent updates appear on `dist/index.html` without adding `experience.html`;
- end-to-end smoke for personal and team daily runs;
- `pnpm check`, `pnpm test:e2e`, and `git diff --check`.

## Acceptance

- A personal user can configure local Codex, local OpenClaw, and one remote OpenClaw source, then run one daily command to produce updated wiki artifacts and agent-readable context.
- A team can run GitLab scheduled daily harvest from OpenClaw bot memory and Claude Code repair logs into a GitLab knowledge repo.
- OpenClaw bot via Feishu is modeled as OpenClaw memory with `channel=feishu`, not as a Feishu knowledge source.
- Team mode rejects personal and private material before it becomes proposal or wiki content.
- Humans see summarized experience through the existing wiki pages and homepage recent updates.
- Agents read the same knowledge through generated Skill+CLI, with MCP remaining optional.
- Stable `kb/` and `skills/` are not mutated outside explicit review/promote paths.
