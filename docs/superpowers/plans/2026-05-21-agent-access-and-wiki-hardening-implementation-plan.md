# Agent Access And Wiki Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PraxisBase easy for agents to use through generated Skill+CLI, add an optional MCP stdio bridge, harden wiki source analysis, and upgrade the static wiki browser.

**Architecture:** Keep behavior in `@praxisbase/core`. Generate agent-facing manifests and Skills from canonical tool descriptors. Keep MCP as a thin stdio adapter over the same core functions. Split wiki source analysis, quality reports, graph slicing, and site rendering into focused modules.

**Tech Stack:** TypeScript ESM, Node built-ins, Commander CLI, Zod schemas, existing file-store helpers, existing harvest/wiki/context functions, Node test runner, optional MCP SDK if selected during implementation, Playwright for static HTML smoke.

---

## Document Traceability

- Design: `docs/superpowers/specs/2026-05-21-agent-access-and-wiki-hardening-design.md`
- OpenSpec: `docs/openspec/changes/agent-access-and-wiki-hardening/`
- BDD: `docs/bdd/agent-access-and-wiki-hardening.feature`

## File Structure

- Modify `packages/core/src/protocol/paths.ts`
  - Add agent-tools and wiki-quality paths.
- Modify `packages/core/src/protocol/schemas.ts`
  - Add agent tool, MCP manifest, wiki source analysis, graph slice, and quality report schemas.
- Create `packages/core/src/agent-access/manifest.ts`
  - Define canonical PraxisBase tool descriptors.
- Create `packages/core/src/agent-access/skill.ts`
  - Render generated `SKILL.md` for supported agents.
- Create `packages/core/src/agent-access/mcp.ts`
  - Provide tool handlers that call existing core functions.
- Create `packages/cli/src/commands/agent-tools.ts`
  - Add manifest and Skill generation command wrappers.
- Create `packages/cli/src/commands/mcp.ts`
  - Add MCP manifest and stdio server command wrappers.
- Modify `packages/cli/src/index.ts`
  - Wire `agent-tools` and `mcp`.
- Modify `packages/core/src/experience/install.ts`
  - Include generated PraxisBase Skill in install plans.
- Create `packages/core/src/wiki/analyze.ts`
  - Classify sources, signatures, aliases, risks, and candidate paths.
- Create `packages/core/src/wiki/quality.ts`
  - Emit wiki quality reports.
- Create `packages/core/src/wiki/graph-slices.ts`
  - Emit overview and ego graph slices.
- Create `packages/core/src/wiki/site-model.ts`
  - Build render-ready static site objects.
- Create `packages/core/src/wiki/site-html.ts`
  - HTML layout helpers and escaping boundaries.
- Create `packages/core/src/wiki/site-assets.ts`
  - CSS and JS assets.
- Modify `packages/core/src/wiki/compile.ts`
  - Integrate source analysis and safer candidate paths.
- Modify `packages/core/src/wiki/render-site.ts`
  - Use site model, graph slices, issues page, and updated assets.
- Modify `packages/cli/src/commands/wiki.ts`
  - Add graph mode/center/depth/limit options.
- Add tests:
  - `tests/core/agent-access.test.ts`
  - `tests/core/wiki-analyze.test.ts`
  - `tests/core/wiki-quality.test.ts`
  - `tests/core/wiki-graph-slices.test.ts`
  - `tests/core/wiki-site-model.test.ts`
  - `tests/cli/agent-tools-command.test.ts`
  - `tests/cli/mcp-command.test.ts`
  - `tests/cli/wiki-graph-options.test.ts`

## Task 1: Protocol Paths And Schemas

**Files:**
- Modify: `packages/core/src/protocol/paths.ts`
- Modify: `packages/core/src/protocol/schemas.ts`
- Test: `tests/core/agent-access.test.ts`

- [ ] **Step 1: Write failing schema/path test**

Create `tests/core/agent-access.test.ts` with assertions that `protocolPaths.agentTools`, `protocolPaths.agentToolsSkills`, `protocolPaths.agentToolsManifest`, and `protocolPaths.reportsWikiQuality` exist. Also parse representative `AgentToolManifest`, `McpToolManifest`, `WikiSourceAnalysis`, `WikiGraphSlice`, and `WikiQualityReport` objects.

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/agent-access.test.js
```

Expected: TypeScript or runtime failure because paths and schemas do not exist.

- [ ] **Step 3: Add paths**

Add:

```ts
agentTools: ".praxisbase/agent-tools",
agentToolsSkills: ".praxisbase/agent-tools/skills",
agentToolsManifest: ".praxisbase/agent-tools/manifest.json",
mcpManifest: ".praxisbase/agent-tools/mcp.json",
reportsWikiQuality: ".praxisbase/reports/wiki-quality",
runsWiki: ".praxisbase/runs/wiki",
```

- [ ] **Step 4: Add schemas**

Add schemas matching the contracts in the design document. Reuse existing `ProtocolVersionSchema`, `ScopeSchema`, `AgentProfileSchema`, and `LintSeveritySchema`.

- [ ] **Step 5: Export schemas**

Ensure root `@praxisbase/core` exports the new schemas through `packages/core/src/index.ts`.

- [ ] **Step 6: Run focused test**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/agent-access.test.js
```

Expected: PASS.

## Task 2: Canonical Agent Tool Manifest

**Files:**
- Create: `packages/core/src/agent-access/manifest.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Test: `tests/core/agent-access.test.ts`

- [ ] **Step 1: Extend failing test**

Add assertions for:

- `buildAgentToolManifest(root, { agent: "codex" })` returns stable tool names.
- `context_get` has `mutates: "reports"`.
- `harvest` has `dry_run_supported: true`.
- no tool has `mutates: "stable_knowledge"` in this change.

- [ ] **Step 2: Implement manifest builder**

Create `packages/core/src/agent-access/manifest.ts` with:

- `AgentAccessInput`
- `AgentToolDescriptor`
- `buildAgentToolManifest`
- `writeAgentToolManifest`

The descriptor list should cover context, harvest, capture finish, wiki compile, wiki graph, wiki build-site, and health.

- [ ] **Step 3: Add exports**

Export the module from `packages/core/src/index.ts` and `packages/core/package.json`.

- [ ] **Step 4: Run tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/agent-access.test.js
```

Expected: PASS.

## Task 3: Generated PraxisBase Skill

**Files:**
- Create: `packages/core/src/agent-access/skill.ts`
- Create: `packages/cli/src/commands/agent-tools.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/cli/agent-tools-command.test.ts`

- [ ] **Step 1: Write failing CLI test**

Create a temporary workspace, run `node packages/cli/dist/index.js agent-tools generate --agent codex --json`, and assert:

- JSON output has `ok: true`;
- `.praxisbase/agent-tools/manifest.json` exists;
- `.praxisbase/agent-tools/skills/praxisbase/SKILL.md` exists;
- Skill text contains `context get`, `harvest`, `capture finish`, `wiki build-site`, and `review/promote`.

- [ ] **Step 2: Implement Skill renderer**

Render a deterministic Skill with sections:

- Overview
- When To Use
- Safety Rules
- Local Harvest
- Remote Harvest
- Context Before Repair
- Capture After Repair
- Build And Inspect Wiki
- Optional MCP Bridge

- [ ] **Step 3: Implement CLI wrapper**

Add `agent-tools` command with subcommands `generate` and `manifest`.

- [ ] **Step 4: Wire CLI**

Import the command in `packages/cli/src/index.ts` and add parser options:

```bash
praxisbase agent-tools generate --agent <agent> --json
praxisbase agent-tools manifest --json
```

- [ ] **Step 5: Run tests**

```bash
pnpm check && node --test dist-tests/tests/cli/agent-tools-command.test.js
```

Expected: PASS.

## Task 4: Install Plan Integration

**Files:**
- Modify: `packages/core/src/experience/install.ts`
- Test: `tests/core/experience-install.test.ts`
- Test: `tests/cli/agent-tools-command.test.ts`

- [ ] **Step 1: Add failing install dry-run assertion**

Assert that `planInstall(root, "codex", { dryRun: true })` includes the generated PraxisBase Skill path when `.praxisbase/agent-tools/skills/praxisbase/SKILL.md` exists.

- [ ] **Step 2: Update install planning**

Read the generated Skill path and include a copy/write operation for supported local-skill agents. If the Skill does not exist, include a warning telling the user to run `praxisbase agent-tools generate --agent <agent>`.

- [ ] **Step 3: Run focused tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/experience-install.test.js dist-tests/tests/cli/agent-tools-command.test.js
```

Expected: PASS.

## Task 5: MCP Manifest And Stdio Bridge

**Files:**
- Create: `packages/core/src/agent-access/mcp.ts`
- Create: `packages/cli/src/commands/mcp.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/cli/mcp-command.test.ts`

- [ ] **Step 1: Write failing manifest test**

Run `node packages/cli/dist/index.js mcp manifest --json` and assert the output lists the expected tools and stdio command args.

- [ ] **Step 2: Implement MCP manifest**

Use the canonical tool descriptors to generate `.praxisbase/agent-tools/mcp.json`.

- [ ] **Step 3: Implement stdio server wrapper**

Implement `praxisbase mcp serve --stdio --workspace <path>` as a thin adapter. If the MCP SDK is added, keep it isolated to the CLI command module and do not make core depend on transport details.

- [ ] **Step 4: Add handler tests**

Test core handler functions directly for read-only `context_get` and write-scoped `wiki_compile --dry-run`.

- [ ] **Step 5: Run tests**

```bash
pnpm check && node --test dist-tests/tests/cli/mcp-command.test.js
```

Expected: PASS.

## Task 6: Wiki Source Analysis

**Files:**
- Create: `packages/core/src/wiki/analyze.ts`
- Modify: `packages/core/src/wiki/compile.ts`
- Test: `tests/core/wiki-analyze.test.ts`

- [ ] **Step 1: Write failing analysis tests**

Cover:

- OpenClaw auth text classifies as `known_fix`;
- command/runbook text classifies as `procedure`;
- repeated failure warning classifies as `pitfall`;
- personal source keeps `scope: "personal"`;
- candidate paths stay under `kb/` or `skills/`;
- token/cookie text produces a privacy risk.

- [ ] **Step 2: Implement deterministic analysis**

Use rule-based classification from source kind, title, summary, body, signatures, and path. Keep it deterministic and independent of LLM calls.

- [ ] **Step 3: Integrate compile report**

Extend `WikiCompileReport` with `source_analysis`. Use suggested candidate path when creating candidates.

- [ ] **Step 4: Add conflict routing**

If two changed sources suggest the same path without merge evidence, write a conflict exception and skip unsafe duplicate candidate writes.

- [ ] **Step 5: Run tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-analyze.test.js dist-tests/tests/core/wiki-compile.test.js
```

Expected: PASS.

## Task 7: Wiki Quality Reports

**Files:**
- Create: `packages/core/src/wiki/quality.ts`
- Modify: `packages/core/src/wiki/render-site.ts`
- Test: `tests/core/wiki-quality.test.ts`

- [ ] **Step 1: Write failing quality tests**

Build fixture pages and sources that produce broken links, duplicate signatures, orphan pages, stale pages, missing source hashes, and private material findings.

- [ ] **Step 2: Implement quality report builder**

Return `WikiQualityReport` and write it to `.praxisbase/reports/wiki-quality/<report-id>.json`.

- [ ] **Step 3: Integrate site build**

`buildWikiSite` should run quality reporting and include the latest report in output metadata.

- [ ] **Step 4: Run tests**

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-quality.test.js dist-tests/tests/core/wiki-render-site.test.js
```

Expected: PASS.

## Task 8: Graph Slices And CLI Options

**Files:**
- Create: `packages/core/src/wiki/graph-slices.ts`
- Modify: `packages/cli/src/commands/wiki.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/core/wiki-graph-slices.test.ts`
- Test: `tests/cli/wiki-graph-options.test.ts`

- [ ] **Step 1: Write failing graph slice tests**

Cover overview limit, stable order, ego depth, missing center error, type filters, and truncation metadata.

- [ ] **Step 2: Implement graph slices**

Use `buildWikiGraph` output plus page metadata to calculate bounded slices.

- [ ] **Step 3: Extend CLI**

Add:

```bash
praxisbase wiki graph --mode overview --limit 80 --json
praxisbase wiki graph --mode ego --center <slug> --depth 2 --json
```

- [ ] **Step 4: Run tests**

```bash
pnpm check && node --test dist-tests/tests/core/wiki-graph-slices.test.js dist-tests/tests/cli/wiki-graph-options.test.js
```

Expected: PASS.

## Task 9: Static Site Upgrade

**Files:**
- Create: `packages/core/src/wiki/site-model.ts`
- Create: `packages/core/src/wiki/site-html.ts`
- Create: `packages/core/src/wiki/site-assets.ts`
- Modify: `packages/core/src/wiki/render-site.ts`
- Test: `tests/core/wiki-site-model.test.ts`
- Test: `tests/core/wiki-render-site.test.ts`

- [ ] **Step 1: Write failing site tests**

Assert `buildWikiSite` writes `dist/index.html`, `dist/graph.html`, `dist/issues.html`, page siblings, `dist/graph-slices/overview.json`, and existing LLM/search outputs.

- [ ] **Step 2: Build site view models**

Create page, nav, health, issue, graph, provenance, and related-page view models.

- [ ] **Step 3: Split HTML rendering**

Move layout helpers out of the large render file. Keep escaping helpers at the boundary where data enters HTML or script JSON.

- [ ] **Step 4: Add graph and issues pages**

Use local JSON data and progressive enhancement. Core content must be visible without a network server.

- [ ] **Step 5: Add responsive CSS and JS**

Keep UI dense, operational, and readable. Avoid large decorative hero sections; this is a working knowledge browser.

- [ ] **Step 6: Run tests**

```bash
pnpm check && node --test dist-tests/tests/core/wiki-site-model.test.js dist-tests/tests/core/wiki-render-site.test.js
```

Expected: PASS.

## Task 10: End-To-End Smoke

**Files:**
- Modify: `tests/cli/real-smoke.test.ts`
- Optionally create: `tests/cli/agent-access-smoke.test.ts`

- [ ] **Step 1: Add smoke fixture**

Create a temporary Codex session text with a safe OpenClaw repair summary and no raw secrets.

- [ ] **Step 2: Run generated Skill flow**

Smoke commands:

```bash
pnpm build
tmpdir=$(mktemp -d)
printf "Fixed OpenClaw auth expired by refreshing login. Signature openclaw:auth-expired." > "$tmpdir/codex-session.txt"
node packages/cli/dist/index.js init --profile all
node packages/cli/dist/index.js agent-tools generate --agent codex --json
node packages/cli/dist/index.js harvest --codex "$tmpdir/codex-session.txt" --build-site --context-query "openclaw auth expired" --json
node packages/cli/dist/index.js wiki graph --mode overview --limit 80 --json
node packages/cli/dist/index.js wiki build-site --json
node packages/cli/dist/index.js mcp manifest --json
```

- [ ] **Step 3: Assert outputs**

Expected outputs:

- generated manifest;
- generated Skill;
- harvest report;
- wiki compile report with source analysis;
- wiki quality report;
- static site files;
- graph slice file;
- no stable knowledge mutation without review/promote.

- [ ] **Step 4: Full verification**

```bash
pnpm check
git diff --check
```

Expected: PASS.

## Execution Notes

- Implement M13.1 and M13.3 before MCP; MCP should wrap stable core functions.
- Keep each task independently reviewable.
- If MCP SDK integration adds dependency churn, isolate it in the CLI package and keep core dependency-free.
- If Playwright is not already configured for this repo, start with static HTML assertions and add Playwright only for the final layout smoke.
