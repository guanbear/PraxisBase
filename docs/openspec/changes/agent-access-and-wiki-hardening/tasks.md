# Agent Access And Wiki Hardening Tasks

This change is planned as M13.

## M13.0 Documentation And Contracts

- [x] Add design document under `docs/superpowers/specs/`.
- [x] Add implementation plan under `docs/superpowers/plans/`.
- [x] Add OpenSpec proposal/design/tasks under `docs/openspec/changes/agent-access-and-wiki-hardening/`.
- [x] Add BDD scenarios under `docs/bdd/agent-access-and-wiki-hardening.feature`.
- [x] Add traceability links from implementation plan to OpenSpec and BDD.

## M13.1 Agent Access Layer

- [x] Add `packages/core/src/agent-access/manifest.ts`.
- [x] Add `packages/core/src/agent-access/skill.ts`.
- [x] Add protocol paths for `.praxisbase/agent-tools`, `.praxisbase/agent-tools/skills`, and `.praxisbase/agent-tools/manifest.json`.
- [x] Add schemas for `AgentToolManifest`, `AgentToolDescriptor`, and `McpToolManifest`.
- [x] Add `praxisbase agent-tools generate --agent <agent> --json`.
- [x] Add `praxisbase agent-tools manifest --json`.
- [x] Update `praxisbase install <agent>` to include the generated PraxisBase Skill when supported.
- [x] Add tests for generated Skill content, manifest stability, mutation metadata, and install dry-run output.

## M13.2 Optional MCP Bridge

- [x] Add `packages/core/src/agent-access/mcp.ts` core handlers.
- [x] Add `packages/cli/src/commands/mcp.ts`.
- [x] Wire `praxisbase mcp serve --stdio --workspace <path>`.
- [x] Wire `praxisbase mcp manifest --json`.
- [x] Expose MCP tools for context, harvest, capture finish, wiki compile, wiki graph, wiki build-site, and health.
- [x] Mark write-capable tools with dry-run/review metadata.
- [x] Ensure MCP tool responses use the same JSON contracts as CLI/core commands.
- [x] Add CLI tests for MCP manifest and handler-level tests for each tool.

## M13.3 Wiki Source Analysis And Candidate Hardening

- [x] Add `packages/core/src/wiki/analyze.ts`.
- [x] Classify sources into known fix, procedure, decision, pitfall, skill seed, preference, incident, or note.
- [x] Extract deterministic signatures and aliases.
- [x] Suggest candidate paths from classification, source title, and signatures.
- [x] Detect personal-scope promotion risks.
- [x] Update `packages/core/src/wiki/compile.ts` to include source analysis in reports.
- [x] Update candidate generation to use suggested paths and merge by exact signatures.
- [x] Route duplicate candidate paths to conflict exceptions.
- [x] Route private/raw/weak-provenance cases to human-required exceptions.
- [x] Add tests for classification, signature extraction, path suggestions, personal-scope guard, duplicate path conflicts, and compile report output.

## M13.4 Wiki Quality Reports

- [x] Add `packages/core/src/wiki/quality.ts`.
- [x] Add protocol path `.praxisbase/reports/wiki-quality`.
- [x] Add `WikiQualityReport` schema.
- [x] Integrate quality report generation into `wiki build-site` and harvest when `--build-site` is set.
- [x] Surface quality counts in CLI JSON output.
- [x] Add tests for missing source hash, missing citation, duplicate signature, broken link, orphan page, stale page, unsafe path, and private material findings.

## M13.5 Graph Slices

- [x] Add `packages/core/src/wiki/graph-slices.ts`.
- [x] Support overview mode with deterministic top-linked nodes.
- [x] Support ego mode with BFS depth and center slug.
- [x] Support type filters.
- [x] Include truncation metadata.
- [x] Extend `praxisbase wiki graph` with `--mode`, `--center`, `--depth`, and `--limit`.
- [x] Write `dist/graph-slices/overview.json` during site build.
- [x] Add tests for overview cap, ego expansion, missing center errors, type filtering, and stable ordering.

## M13.6 Static Site Upgrade

- [x] Split site rendering into `site-model.ts`, `site-html.ts`, `site-assets.ts`, and orchestration in `render-site.ts`.
- [x] Add `dist/graph.html`.
- [x] Add `dist/issues.html`.
- [x] Add top search/command bar.
- [x] Add taxonomy/type filters in navigation.
- [x] Add source/provenance rail to page views.
- [x] Add related pages and backlink display.
- [x] Add quality report links and issue summaries.
- [x] Ensure all HTML and script-embedded JSON is escaped.
- [x] Ensure file URL usage works without an HTTP server.
- [ ] Add static output tests and Playwright smoke for desktop and mobile widths.

## M13.7 End-To-End Smoke

- [x] Add smoke for generated Skill plus local Codex harvest.
- [x] Add smoke for remote OpenClaw export plus site build.
- [x] Add smoke for MCP manifest and one read-only tool call.
- [x] Add smoke proving no stable `kb/` or `skills/` mutation without review/promote.
- [x] Run `pnpm check`.
- [x] Run `git diff --check`.

## Out Of Scope

- Required MCP server for normal use.
- ACP support.
- Database-backed queue.
- Vector database or external semantic search.
- Full web app rewrite.
- WeKnora runtime dependency.
- html-anything runtime dependency.
