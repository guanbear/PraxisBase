# OpenSpec Change: Agent Access And Wiki Hardening

## Why

M12 made PraxisBase able to harvest local and remote agent experience, but the system still feels like a set of low-level commands. For the project goal, that is not enough. PraxisBase must prove that it can reliably turn Codex/OpenClaw/OpenCode-style experience into a wiki that future agents can actually use.

The gaps are:

- Agent integration is not productized. Users should not have to remember command chains.
- The project needs a clear answer on Skill+CLI versus MCP.
- The wiki compiler needs stronger source analysis, merge discipline, and quality reporting.
- The static HTML site needs to become a real knowledge browser, not only a generated artifact list.
- WeKnora has mature patterns worth borrowing, but PraxisBase must not drift into a database-backed RAG platform.

## What Changes

- Add an agent access layer:
  - canonical tool descriptors,
  - generated PraxisBase Skill,
  - generated agent tool manifest,
  - optional MCP stdio bridge over the same core functions.
- Make CLI+Skill the default integration path.
- Make MCP an optional adapter, not a core dependency.
- Add wiki source analysis before proposal candidate generation.
- Add wiki quality reports and run records.
- Add bounded graph slices with overview and ego modes.
- Improve static site outputs:
  - health dashboard,
  - page browser,
  - graph page,
  - issues page,
  - provenance and related-page rails,
  - local search and agent-readable exports.
- Add WeKnora/html-anything-inspired design standards without adding their runtime stack.

## Non-Goals

- Do not replace PraxisBase with WeKnora or require WeKnora at runtime.
- Do not add a required database, vector store, Neo4j, Redis, daemon, or web server.
- Do not make MCP mandatory.
- Do not implement ACP in this change.
- Do not auto-promote personal knowledge to team/org/global scope.
- Do not let MCP bypass proposal/review/promote.
- Do not store raw transcripts, raw logs, cookies, tokens, headers, private keys, or full chat bodies in Git.
- Do not turn the static site into a Next/Vue app.

## Acceptance Summary

- `praxisbase agent-tools generate --agent codex --json` writes `.praxisbase/agent-tools/manifest.json` and a PraxisBase Skill.
- `praxisbase install codex --dry-run --json` reports the generated Skill destination.
- `praxisbase mcp serve --stdio --help` is available.
- MCP tools expose context, harvest, capture, compile, build-site, and health through the same core contracts as the CLI.
- Wiki compile report includes `source_analysis`.
- Wiki quality report is written under `.praxisbase/reports/wiki-quality/`.
- Wiki graph supports bounded overview and ego slices.
- Static site includes `dist/index.html`, `dist/graph.html`, `dist/issues.html`, page HTML/TXT/JSON siblings, search index, graph data, and LLM exports.
- Static site is visually useful, responsive, and file-URL compatible.
- No command in this change directly mutates stable `kb/` or `skills/` except existing explicit review/promote paths.
- `pnpm check` and `git diff --check` pass.

## Guardrails For Implementing Agents

- Keep all behavior in `@praxisbase/core`; CLI and MCP wrappers stay thin.
- Define command/tool descriptors once and generate CLI help, Skill guidance, and MCP tool metadata from the same source where practical.
- Keep filesystem writes allowlisted and deterministic.
- Preserve existing harvest and wiki command compatibility.
- Add tests before implementation for each new contract.
- Site CSS should be split into reusable render helpers or stable string constants; do not grow one large unreviewable template.
- Use Playwright or static HTML assertions for layout-critical site outputs.
