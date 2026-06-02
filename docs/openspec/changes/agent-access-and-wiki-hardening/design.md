# Agent Access And Wiki Hardening OpenSpec Design

## Overview

This change makes PraxisBase easier for agents to use and harder for the wiki compiler to misuse.

```text
agent
  |
  +-- generated Skill + praxisbase CLI  (default)
  |
  +-- optional MCP stdio bridge          (adapter)
        |
        v
canonical core tool descriptors
        |
        v
harvest / context / capture / wiki compile / wiki graph / wiki build-site
        |
        v
source analysis -> proposal candidates -> graph slices -> quality reports -> static site
```

The system remains file-first. The durable authority is still reviewed `kb/`, reviewed `skills/`, proposal/review records, and Git.

## External Lessons Applied

### From WeKnora

- Separate wiki page types instead of treating everything as one note class.
- Expose graph overview and ego-neighborhood modes so large wikis do not overload the client.
- Keep pending work and failed work visible through operational records.
- Make Skills a progressive-disclosure interface for agents.
- Use MCP as an integration adapter with explicit approval for sensitive write tools.

### From html-anything

- Treat HTML as a designed final artifact, not an afterthought.
- Use example-driven output quality and visual regression checks.
- Keep agent CLI adapters thin.
- Keep local-first flows working without API keys or hosted services.
- Make export/download artifacts self-contained.

## Agent Access Layer

### Canonical Tool Descriptor

Create `packages/core/src/agent-access/manifest.ts`.

Each tool descriptor includes:

- stable tool name,
- command args,
- JSON input schema,
- mutation level,
- dry-run support,
- human-review requirement,
- output contract name.

Initial tools:

- `context_get`
- `harvest`
- `capture_finish`
- `wiki_compile`
- `wiki_graph`
- `wiki_build_site`
- `health`

### Generated Skill

Create `packages/core/src/agent-access/skill.ts`.

The generated Skill must be concise enough for coding agents to load, but complete enough to prevent unsafe behavior:

- default local flow,
- default remote OpenClaw flow,
- context-before-repair rule,
- capture-after-repair rule,
- raw material prohibition,
- review/promote gate,
- site build flow,
- optional MCP setup.

Generated path:

- `.praxisbase/agent-tools/skills/praxisbase/SKILL.md`

### CLI

Add:

```bash
praxisbase agent-tools generate --agent codex --json
praxisbase agent-tools generate --agent opencode --json
praxisbase agent-tools manifest --json
```

`praxisbase install <agent>` should continue to work and should include the generated Skill when the target agent supports local skills.

### MCP Bridge

Add:

```bash
praxisbase mcp serve --stdio --workspace <path>
praxisbase mcp manifest --json
```

The MCP server uses stdio only in this change. It should not bind a network port.

Each MCP tool calls core functions directly instead of shelling out:

- `buildContext`
- `runHarvest`
- `captureFinish`
- `compileWiki`
- `buildWikiGraph`
- `buildWikiSite`
- health summary helpers

Mutating tools must expose explicit flags. Promotion is not exposed as a default MCP tool in this change.

## Wiki Kernel Hardening

### Source Analysis

Create `packages/core/src/wiki/analyze.ts`.

For every `WikiSource`, produce `WikiSourceAnalysis`:

- suggested page kind,
- signatures,
- aliases,
- scope,
- confidence,
- candidate path,
- risks.

Classification is deterministic in this change. A future LLM-assisted extractor can write proposal candidates, but it must not be required for smoke tests.

### Merge-Aware Candidate Generation

Update `packages/core/src/wiki/compile.ts`:

- call source analysis before candidate generation,
- use suggested candidate paths,
- merge by exact signature or stable id,
- write conflicts instead of duplicates,
- include `source_analysis` in compile reports,
- preserve existing `changed_stable_knowledge: false`.

### Quality Reports

Create `packages/core/src/wiki/quality.ts`.

The quality report includes:

- source count,
- candidate count,
- missing source hashes,
- missing citations,
- duplicate signatures,
- broken links,
- orphan pages,
- stale pages,
- private material findings,
- personal-scope promotion risks,
- unsafe patch paths.

Write reports under:

- `.praxisbase/reports/wiki-quality/<report-id>.json`

### Graph Slices

Create `packages/core/src/wiki/graph-slices.ts`.

Support:

- overview mode: top linked pages capped by limit;
- ego mode: BFS neighborhood around a center slug;
- deterministic sorting;
- type filters;
- truncation metadata.

CLI:

```bash
praxisbase wiki graph --mode overview --limit 80 --json
praxisbase wiki graph --mode ego --center openclaw-auth-expired --depth 2 --json
```

## Static Site

Split render logic:

- `site-model.ts`: build render-ready objects.
- `site-html.ts`: layout and escaping helpers.
- `site-assets.ts`: CSS and JS assets.
- `render-site.ts`: orchestration and writes.

Required outputs:

- `dist/index.html`
- `dist/graph.html`
- `dist/issues.html`
- `dist/pages/<slug>.html`
- `dist/pages/<slug>.txt`
- `dist/pages/<slug>.json`
- `dist/search-index.json`
- `dist/graph.json`
- `dist/graph-slices/overview.json`
- `dist/llms.txt`
- `dist/llms-full.txt`
- `dist/ai-readme.md`
- `dist/style.css`
- `dist/site.js`

The UI should be dense and operational:

- top command/search bar,
- left taxonomy navigation,
- main content column,
- right metadata/provenance/related rail,
- health dashboard,
- issues page,
- graph page with local JSON data.

## Data Contracts

### AgentToolManifest

```ts
interface AgentToolManifest {
  id: string;
  protocol_version: "0.1";
  type: "agent_tool_manifest";
  workspace: string;
  generated_at: string;
  tools: AgentToolDescriptor[];
}
```

### WikiCompileReport Extension

```ts
interface WikiCompileReport {
  source_analysis: WikiSourceAnalysis[];
}
```

### WikiQualityReport

```ts
interface WikiQualityReport {
  id: string;
  protocol_version: "0.1";
  type: "wiki_quality_report";
  sources: number;
  pages: number;
  findings: Array<{
    rule: string;
    severity: "error" | "warning";
    path?: string;
    source_id?: string;
    message: string;
  }>;
  created_at: string;
}
```

## Failure Handling

- Unsafe source analysis writes human-required exceptions.
- Duplicate candidate paths write conflict exceptions.
- MCP tool errors return structured JSON with `ok: false`, `code`, `message`, and `retryable`.
- Static site build should still emit `issues.html` when graph or quality warnings exist.
- If graph slice generation fails for a page, the site links to the full JSON export and records a quality finding.

## Verification

Required automated verification:

```bash
pnpm check
git diff --check
```

Required smoke:

```bash
pnpm build
tmpdir=$(mktemp -d)
node packages/cli/dist/index.js init --profile all
node packages/cli/dist/index.js agent-tools generate --agent codex --json
node packages/cli/dist/index.js harvest --codex "$tmpdir/codex-session.txt" --build-site --context-query "openclaw auth expired" --json
node packages/cli/dist/index.js wiki graph --mode overview --limit 80 --json
node packages/cli/dist/index.js wiki build-site --json
node packages/cli/dist/index.js mcp manifest --json
```

The smoke must show generated Skill, manifest, wiki reports, graph slice, site outputs, and no stable knowledge mutation.
