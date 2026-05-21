# OpenSpec Change: Daily Agent Experience Loop

## Why

PraxisBase has the core harvest, wiki, static site, agent Skill, MCP, remote OpenClaw, and team Git building blocks. The remaining release gap is that users still have to assemble those blocks manually.

The next release must solve two concrete workflows:

- personal users need a daily local loop that collects local Codex, local OpenClaw, and remote OpenClaw experience, then makes the summarized knowledge available to local agents and to a human-readable wiki;
- teams need a GitLab-based loop that collects OpenClaw bot memory and Claude Code repair experience, applies stricter privacy rules, updates the team wiki, and makes the latest reviewed knowledge available to team agents.

The design must not treat Feishu, GitLab, or log systems as knowledge authorities. Feishu is only a channel for an OpenClaw bot. GitLab is the team Git authority. Log systems are transports for Claude Code repair experience.

## What Changes

- Add a first-class experience source registry:
  - local Codex;
  - local OpenClaw;
  - remote OpenClaw over file, git, ssh, http, or OpenClaw API;
  - OpenClaw bot memory with `channel=feishu`;
  - Claude Code repair logs.
- Normalize sources into redacted `ExperienceEnvelope` records.
- Add explicit personal and team privacy policies.
- Add `praxisbase daily` as the productized daily workflow.
- Keep `praxisbase harvest` and `praxisbase remote` as lower-level compatible commands.
- Extend team GitLab templates with scheduled daily harvest.
- Show recent daily knowledge updates through the existing wiki homepage and provenance surfaces.
- Keep generated Skill+CLI as the default agent access path; keep MCP optional.

## Non-Goals

- Do not add `dist/experience.html`.
- Do not archive or browse raw Feishu messages as a PraxisBase knowledge surface.
- Do not require a database, vector store, web server, daemon, or hosted service.
- Do not require MCP for normal agent access.
- Do not write back into OpenClaw memory in this change.
- Do not remove existing `remote` or `harvest` commands.
- Do not allow personal-scope content into team Git knowledge.
- Do not store raw transcripts, raw logs, full chat bodies, tokens, cookies, headers, private keys, or raw credentials in Git.
- Do not mutate stable `kb/` or `skills/` outside explicit review/promote paths.

## Acceptance Summary

- `praxisbase source add/list/remove/doctor` manages experience sources.
- OpenClaw Feishu bot experience is represented as an OpenClaw source with `channel=feishu`.
- Claude Code repair logs can be normalized into redacted experience envelopes.
- `praxisbase daily run --mode personal --build-site --json` runs a personal daily loop.
- `praxisbase daily run --mode team-git --branch <branch> --commit --push --build-site --json` runs a team Git loop.
- Team mode rejects personal scope and raw/private material before proposal generation.
- GitLab template includes a scheduled daily harvest job.
- `dist/index.html` shows recent knowledge updates from daily reports.
- No separate experience page is generated.
- Agents can read the latest reviewed knowledge through generated Skill+CLI and optional MCP.
- Full verification includes `pnpm check`, `pnpm test:e2e`, and `git diff --check`.

## Guardrails For Implementing Agents

- Put behavior in `@praxisbase/core`; CLI wrappers should stay thin.
- Reuse existing harvest, remote, Git workflow, wiki compile, site build, and agent access modules instead of duplicating their behavior.
- Treat `source` as a product layer over transports; keep `remote` compatibility.
- Write tests before implementation.
- Never put credentials in source configs or reports.
- Keep daily reports compact and audit-oriented.
- Keep the HTML site wiki-first.
