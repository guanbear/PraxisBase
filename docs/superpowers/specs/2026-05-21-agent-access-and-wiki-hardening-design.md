# Agent Access And Wiki Hardening Design

## Goal

PraxisBase already has the M12 harvest path for local Codex, local OpenClaw, and remote OpenClaw exports. The next improvement is to make that path dependable and comfortable enough that an agent can use it every day without reading implementation details.

This design hardens three surfaces:

1. The wiki kernel: source analysis, proposal generation, graph slicing, quality reports, and repeatable smoke runs.
2. The agent access layer: CLI plus generated Skill as the default integration, with MCP as an optional bridge over the same core commands.
3. The static HTML site: a more useful and better-looking wiki browser inspired by WeKnora and html-anything, while staying file-first and serverless.

## References Studied

- Tencent/WeKnora at commit `6a6513caba9a48bd42156bd31bd5fef1489eeb41`
  - `README_CN.md`: positions WeKnora as enterprise RAG, ReAct Agent, MCP, and Wiki Mode.
  - `docs/agent-skills.md`: progressive-disclosure Skill loading with optional sandboxed scripts.
  - `mcp-server/README.md` and `mcp-server/MCP_CONFIG.md`: MCP wrapper over the WeKnora REST API.
  - `internal/application/service/wiki_ingest.go`: durable pending-op queue, dead-letter handling, per-KB locking, and batch ingest.
  - `internal/types/wiki_page.go` and `internal/application/service/wiki_page.go`: wiki page taxonomy and overview/ego graph slicing.
- nexu-io/html-anything at commit `1d2204d8fce3f1292690d90c6530060e5c049cb6`
  - `README.md`: local-first agent CLI reuse, skill-template catalog, live preview, and export focus.
  - `CONTRIBUTING.md`: high-leverage contribution model based on Skill folders, agent adapters, and export adapters.
  - `next/src/lib/templates/skills/*`: example-driven design quality for generated HTML.
- Existing PraxisBase docs:
  - `docs/openspec/changes/wiki-compiler-knowledge-site/`
  - `docs/openspec/changes/harvest-local-remote-memory/`
  - `docs/bdd/wiki-compiler-knowledge-site.feature`
  - `docs/bdd/harvest-local-remote-memory.feature`

## Positioning

PraxisBase is not a replacement for WeKnora.

WeKnora is a full enterprise knowledge platform: ingestion UI, RAG service, model providers, vector stores, graph storage, MCP server, IM channels, tenant management, and conversational agent runtime.

PraxisBase is a file-first, Git-friendly agent memory substrate. It is optimized for coding agents, repair agents, local workspaces, and team knowledge repos. Its authority model is `kb/`, `skills/`, proposals, reviews, and Git. A remote WeKnora instance can become a source or export target later, but the core must not require a database, vector store, web app, daemon, or hosted RAG service.

The correct relationship is:

- Borrow WeKnora's mature product patterns for wiki taxonomy, graph exploration, batch reliability, MCP/HITL ergonomics, and Skill usage.
- Keep PraxisBase's core as deterministic files plus CLI.
- Add adapters where they improve agent ergonomics, but do not move authority out of Git/file protocol.

## Access Decision: CLI Plus Skill First, MCP Second

### Default Path

The default agent interface is a generated Skill plus the `praxisbase` CLI.

Reasons:

- Every target agent in this project can run shell commands or read files.
- CLI works locally, in CI, in SSH sessions, and in short-lived sandboxes.
- It reuses existing M12 commands and preserves explicit human-readable audit trails.
- It avoids forcing users to install an MCP client, start a daemon, or configure a web service before they can harvest experience.

The generated Skill should tell the agent:

- how to discover or initialize a PraxisBase workspace,
- how to harvest local and remote memory,
- how to get context before repair,
- how to capture a finished run,
- how to compile/build the wiki,
- how to avoid raw transcript/log leaks,
- which commands mutate stable knowledge and which only write reports/proposals.

### Optional MCP Bridge

MCP is useful when the caller is an MCP-capable desktop app, IDE, or long-running agent environment. It should be a thin bridge over the same core functions and should expose only a small tool set:

- `praxisbase_context_get`
- `praxisbase_harvest`
- `praxisbase_capture_finish`
- `praxisbase_wiki_compile`
- `praxisbase_wiki_build_site`
- `praxisbase_health`

Write-capable tools must be explicitly marked as mutating and must support a dry-run mode. Promotion should remain blocked unless the caller passes explicit review/promote options.

MCP is not the canonical source of behavior. It is an access adapter.

### ACP

ACP is out of scope for this change. It may become relevant if PraxisBase later coordinates long-running agent processes, but the current project goal is knowledge capture, retrieval, and review, not an agent runtime.

## Target User Flows

### Local Individual

```bash
praxisbase install codex
praxisbase harvest --all --build-site --context-query "openclaw auth expired" --json
praxisbase context get --agent codex --stage repair --query "openclaw auth expired" --json
open dist/index.html
```

Expected result:

- The agent can load the generated Skill.
- The CLI collects configured local sources.
- Wiki candidates are generated as proposals.
- The static site shows health, sources, graph, and readable pages.
- No raw transcript or token is written to Git.

### Team Knowledge Repo

```bash
praxisbase remote add openclaw-prod --type git --repo git@github.com:org/openclaw-export-private.git --path exports/prod/latest.json
praxisbase harvest --remote openclaw-prod --team --branch harvest/openclaw-prod --commit --push --build-site --json
```

Expected result:

- Git remains the authority.
- The export repo is only a transport.
- Generated reports and proposal candidates are branch-scoped.
- Stable `kb/` and `skills/` are not modified unless review/promote is explicit and allowed.

### MCP Client

```bash
praxisbase mcp serve --stdio --workspace /path/to/knowledge-repo
```

Expected result:

- MCP clients see a compact list of PraxisBase tools.
- Tool responses are the same JSON contracts returned by CLI/core commands.
- Mutating tools expose `dry_run`, `write`, or `review` flags clearly.
- The MCP adapter never invents separate state.

## Kernel Improvements

### Source Analysis

M12 ingestion can already produce memory evidence. The wiki compiler should add a stronger analysis pass before candidate creation:

- classify each source into `known_fix`, `procedure`, `decision`, `pitfall`, `skill_seed`, `preference`, `incident`, or `note`;
- extract stable signatures and aliases;
- detect source scope and promotion risk;
- preserve source hash and source ref;
- reject raw/private material before it reaches a candidate body;
- produce a machine-readable `WikiSourceAnalysis` object.

This improves the chance that PraxisBase can actually turn agent experience into a useful wiki rather than a pile of notes.

### Candidate Merge Discipline

Candidate generation should become merge-aware:

- exact signature matches update an existing known-fix candidate path;
- related signatures create backlinks rather than duplicate pages;
- personal-scope evidence cannot silently produce team/global candidates;
- large body shrinkage, missing citations, and weak provenance route to exceptions;
- stable knowledge is still mutated only by review/promote.

### Job Records And Dead Letters

PraxisBase does not need WeKnora's database-backed queue for the local CLI default. It should borrow the operational idea in a file-native form:

- `.praxisbase/runs/wiki/<run-id>.json` records each compile/build/lint/smoke run.
- `.praxisbase/reports/wiki-quality/<report-id>.json` records source quality and health metrics.
- `.praxisbase/exceptions/human-required/*.json` and `.praxisbase/exceptions/conflicts/*.json` are the file-native dead-letter lanes.

For batch CLI work, the run record is enough. A future daemon can reuse the same records.

## Static Site Improvements

The current site proves M10, but it is still too thin. The next site should be an agent-readable knowledge browser that is also pleasant for humans.

Borrow from WeKnora:

- wiki page taxonomy visible in tabs/filters;
- graph overview plus ego graph drilldown;
- queue/health status surfaced as first-class UI;
- source/provenance drawer for each page;
- issue count and actionable lint findings.

Borrow from html-anything:

- treat HTML as the final human reading artifact, not a debug dump;
- use example-driven visual standards;
- make export/download paths explicit;
- keep a local-first, no-account, no-extra-service workflow;
- use a stable layout system rather than ad hoc CSS strings.

Proposed static outputs:

- `dist/index.html`: health dashboard and entry point.
- `dist/pages/<slug>.html`: article page with left navigation, main article, right provenance/TOC/related rail.
- `dist/graph.html`: interactive graph view backed by `dist/graph-slices/*.json`.
- `dist/issues.html`: quality findings and human-required exceptions.
- `dist/search-index.json`, `dist/graph.json`, `dist/llms.txt`, `dist/llms-full.txt`, and existing siblings.

The site remains static and must work from a file URL.

## New Contracts

### AgentToolManifest

Generated at `.praxisbase/agent-tools/manifest.json`.

```ts
interface AgentToolManifest {
  id: string;
  protocol_version: "0.1";
  type: "agent_tool_manifest";
  workspace: string;
  generated_at: string;
  tools: Array<{
    name: string;
    description: string;
    command: string[];
    input_schema: Record<string, unknown>;
    mutates: "none" | "reports" | "inbox" | "outbox" | "staging" | "proposals" | "stable_knowledge";
    dry_run_supported: boolean;
    requires_human_review: boolean;
  }>;
}
```

### Generated PraxisBase Skill

Generated under `.praxisbase/agent-tools/skills/praxisbase/SKILL.md` and optionally copied by `praxisbase install <agent>`.

The Skill has progressive disclosure sections:

- quick commands;
- safety rules;
- local harvest;
- remote harvest;
- context before repair;
- capture after repair;
- wiki review and build;
- MCP bridge setup.

### McpToolManifest

Generated at `.praxisbase/agent-tools/mcp.json`.

```ts
interface McpToolManifest {
  id: string;
  protocol_version: "0.1";
  type: "mcp_tool_manifest";
  transport: "stdio";
  command: string;
  args: string[];
  tools: string[];
  generated_at: string;
}
```

### WikiSourceAnalysis

Written into wiki compile reports and optionally `dist/source-analysis.json`.

```ts
interface WikiSourceAnalysis {
  source_id: string;
  source_hash: string;
  source_kind: string;
  suggested_page_kind: "known_fix" | "procedure" | "decision" | "pitfall" | "skill_seed" | "preference" | "incident" | "note";
  signatures: string[];
  aliases: string[];
  scope: "personal" | "project" | "team" | "org" | "global";
  confidence: number;
  risks: string[];
  candidate_path?: string;
}
```

### WikiGraphSlice

```ts
interface WikiGraphSlice {
  id: string;
  protocol_version: "0.1";
  type: "wiki_graph_slice";
  mode: "overview" | "ego";
  center?: string;
  depth?: number;
  total_nodes: number;
  returned_nodes: number;
  truncated: boolean;
  nodes: Array<{ id: string; slug: string; title: string; page_kind: string; link_count: number }>;
  links: Array<{ from: string; to: string; relation: string }>;
}
```

## File Boundaries

- `packages/core/src/agent-access/manifest.ts`: build tool manifests from canonical command descriptors.
- `packages/core/src/agent-access/skill.ts`: render the generated PraxisBase Skill.
- `packages/core/src/agent-access/mcp.ts`: core wrapper functions used by the CLI MCP server.
- `packages/cli/src/commands/agent-tools.ts`: generate manifests and Skill.
- `packages/cli/src/commands/mcp.ts`: optional stdio MCP server command.
- `packages/core/src/wiki/analyze.ts`: source analysis and candidate path suggestions.
- `packages/core/src/wiki/quality.ts`: quality report generation.
- `packages/core/src/wiki/graph-slices.ts`: overview/ego graph slicing.
- `packages/core/src/wiki/site-model.ts`: render-ready view models.
- `packages/core/src/wiki/render-site.ts`: keep orchestration only after splitting render helpers.
- `tests/core/agent-access.test.ts`
- `tests/core/wiki-analyze.test.ts`
- `tests/core/wiki-quality.test.ts`
- `tests/core/wiki-graph-slices.test.ts`
- `tests/core/wiki-site-model.test.ts`
- `tests/cli/agent-tools-command.test.ts`
- `tests/cli/mcp-command.test.ts`

## Guardrails

- No raw transcripts, raw logs, tokens, cookies, headers, private keys, or unredacted chat bodies in Git.
- No direct stable `kb/` or `skills/` mutation from harvest, compile, graph, lint, site, MCP, or agent-tool generation.
- `--auto-promote` remains explicit and still requires review.
- MCP cannot bypass CLI/core safety contracts.
- Site rendering must escape raw HTML and script-breaking JSON.
- Static outputs must not require a server.
- Personal scope cannot be auto-promoted to team/org/global.
- Graph endpoints for large wiki outputs must default to bounded overview slices.

## Acceptance

- `praxisbase agent-tools generate --agent codex --json` writes a manifest and Skill.
- `praxisbase install codex --dry-run --json` includes the generated PraxisBase Skill destination.
- `praxisbase mcp serve --stdio --help` works without starting a network server.
- MCP tool calls return the same JSON shape as the corresponding CLI/core command.
- Wiki compile reports include source analysis records.
- Wiki quality reports are written and exposed in the static site.
- `praxisbase wiki graph --mode overview --limit 80 --json` returns a bounded graph slice.
- `praxisbase wiki graph --mode ego --center <slug> --depth 2 --json` returns a deterministic ego slice.
- `praxisbase wiki build-site --json` generates `index.html`, page siblings, `graph.html`, `issues.html`, `search-index.json`, and graph slice JSON.
- Static HTML passes escaping tests and works from a file URL.
- `pnpm check` and `git diff --check` pass.
