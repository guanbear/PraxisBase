# Context Economy, AgentMemory Interop, And Personal Bootstrap Design

## Problem

PraxisBase has the right long-term shape for an agent experience wiki, but the current personal workflow is still too expensive, too slow, and too hard to operate. Real personal runs exposed three connected gaps:

- the AI sees too much raw or weak source material before deterministic compression removes obvious noise;
- session-level memory reuse is already handled well by projects such as `agentmemory`, while PraxisBase still treats it as just another import shape;
- first-time personal setup still asks the user to understand sources, AI config, daily runs, review queues, generated site paths, and agent access commands separately.

The reference projects clarify the missing layers:

- `agentmemory` is a live shared memory server for coding agents. It captures hooks, exposes MCP/REST, performs hybrid BM25/vector/graph retrieval, and injects a small relevant context window. It is optimized for session recall and cross-agent continuity.
- OpenHuman is a personal AI harness. Its durable advantage is productization: integrations auto-fetch, sources become canonical Markdown chunks, background workers build source/topic/global memory trees, and TokenJuice compresses noisy tool/source output before it reaches an LLM.

PraxisBase should not compete head-on with either project. It should use their lessons to strengthen its own role: an auditable llm-wiki compiler for reusable agent experience.

## Goal

Add three milestones:

- **M16 Context Economy**: introduce a TokenJuice-style deterministic source compression layer before AI distill and curation.
- **M17 Agent Memory Interop**: make `agentmemory` a first-class default backend for source, sink, and retrieval interop while preserving PraxisBase `kb/` as the wiki authority.
- **M18 Personal Bootstrap UX**: provide a simple first-run path that configures AI, connects local/remote agents, initializes daily automation, and opens the human-readable site.

The target personal path should be understandable as:

```bash
praxisbase personal init
praxisbase personal connect codex
praxisbase personal connect openclaw
praxisbase personal connect agentmemory
praxisbase personal run --open
```

Advanced commands such as `source add`, `daily run`, `agent-tools`, `context get`, and `kb audit` remain available. M18 wraps them into a reliable product workflow.

## Non-Goals

- Do not replace PraxisBase's wiki compiler with `agentmemory`.
- Do not make a daemon, MCP server, or vector database mandatory.
- Do not import OpenHuman's desktop app, OAuth integration layer, or full Memory Tree implementation.
- Do not send raw personal source data to team knowledge by default.
- Do not make personal auto-promotion skip privacy, provenance, semantic review, or promotion quality gates.
- Do not commit generated local `kb/` output to the repository.

## Positioning

PraxisBase should own durable, reviewed, provenance-backed wiki knowledge:

```text
raw evidence -> deterministic compression -> chunked evidence -> AI distill
  -> AI/compile synthesis -> semantic review -> wiki pages -> agent/human access
```

`agentmemory` should be treated as an interop layer:

```text
agentmemory observations/smart-search
  -> PraxisBase source import
  -> PraxisBase wiki compile
  -> PraxisBase reviewed lessons exported back to agentmemory
```

OpenHuman should be treated as a design reference:

```text
canonicalize first
compress before LLM
chunk deterministically
score cheaply
summarize in trees/background jobs
make local Markdown readable
```

## Alternatives Considered

### A. Replace Personal Mode With AgentMemory

This is attractive for quick session recall but fails the project goal. `agentmemory` stores and retrieves memories; it does not produce a small, reviewed, HTML-visible llm-wiki with team promotion policy, GitLab authority, source provenance, and stable page governance.

Reject as the primary direction.

### B. Rebuild PraxisBase Around A Memory Tree

This would copy too much OpenHuman. A full source/topic/global tree would add a new persistence and scheduler architecture before the wiki quality issue is solved.

Reject for this phase.

### C. Add A Narrow Context Economy Layer, AgentMemory Adapter, And Bootstrap Workflow

This keeps PraxisBase file-first and Git-friendly while borrowing the highest-leverage mechanisms:

- deterministic pre-AI compression from OpenHuman/TokenJuice;
- hybrid live memory interop from `agentmemory`;
- simple `init/connect/run/open` product shape from both projects.

Choose this approach.

## M16: Context Economy

### Principle

Do not ask an LLM to read bytes that deterministic code can remove safely.

M16 adds a pre-AI compression lane between source resolution and chunking/distill:

```text
source adapter
  -> canonical source item
  -> deterministic reducer
  -> compressed source item
  -> chunking
  -> privacy precheck
  -> AI distill/cache
```

The reducer is not a summarizer. It preserves signal and provenance while cutting noisy bytes.

### Reducer Inputs

The reducer receives:

- source id, agent, channel, source type, parser;
- source ref and source hash;
- raw text or normalized item text;
- optional command/tool metadata when available;
- authority mode (`personal-local` or `team-git`);
- configured max input bytes and max output bytes.

### Rule Model

Rules are JSON files loaded in deterministic order:

```text
builtin rules
user rules: ~/.praxisbase/reducers/rules/
project rules: .praxisbase/reducers/rules/
```

Later layers override earlier ones by rule id.

A rule includes:

```ts
interface ContextReducerRule {
  id: string;
  enabled: boolean;
  priority: number;
  match: {
    agent?: "codex" | "openclaw" | "claude-code" | "agentmemory";
    channel?: string;
    parser?: string;
    source_type?: string;
    source_ref_pattern?: string;
    content_pattern?: string;
  };
  actions: Array<
    | { type: "strip_ansi" }
    | { type: "drop_lines_matching"; pattern: string }
    | { type: "dedupe_adjacent_lines" }
    | { type: "collapse_whitespace" }
    | { type: "head_tail"; head_chars: number; tail_chars: number }
    | { type: "preserve_sections_matching"; patterns: string[]; max_chars: number }
    | { type: "truncate"; max_chars: number }
  >;
}
```

No rule may fabricate facts, rewrite outcomes, or remove provenance markers.

### Built-In Rule Families

The first implementation should ship conservative built-ins:

- command/log noise: ANSI removal, repeated progress lines, adjacent duplicate lines;
- test/build output: preserve failing test names, error snippets, command, exit status, final summary;
- git output: preserve changed paths, commit ids, branch/ref, conflict/failure lines;
- Codex sessions: preserve user goal, final answer, file edits, test commands/results, explicit lessons;
- OpenClaw logs: preserve task goal, route/agent/model, error, fix, verification, reusable lesson;
- agentmemory observations: preserve title/content/concepts/files/session ids/score, drop viewer/server boilerplate;
- JSON/JSONL: parse structurally when possible and select known fields before falling back to text reducers.

### Reporting

Daily reports add:

```json
"context_economy": {
  "enabled": true,
  "items_seen": 120,
  "items_reduced": 97,
  "input_bytes": 18320000,
  "output_bytes": 2710000,
  "saved_bytes": 15610000,
  "reduction_ratio": 0.852,
  "rules_hit": {
    "codex-session-default": 42,
    "openclaw-log-default": 31
  },
  "warnings": []
}
```

The reducer must also write compact debug records under `.praxisbase/reports/context-economy/` with source refs, rule ids, byte counts, and hashes. It must not write unredacted raw content there.

### Failure Handling

- Parse failure falls back to safe text reduction and records `structured_parse_failed`.
- Rule error disables that rule for the item and records `reducer_rule_failed:<id>`.
- If reduction output is empty, keep a bounded head/tail fallback and record `empty_reduction_fallback`.
- If privacy precheck rejects the item, downstream AI is skipped as before.

## M17: AgentMemory Interop

### Principle

`agentmemory` should be the default live memory interop backend, not the durable wiki authority.

PraxisBase supports three roles:

```text
source:    import observations/memories/search hits into experience envelopes
sink:      export reviewed wiki lessons back to agentmemory
retrieval: use agentmemory smart-search as an optional context sidecar
```

The default personal bootstrap should prefer `agentmemory` interop when the daemon is reachable, but every command must work without it.

### Source Adapter

Add source type:

```text
source_type = "agentmemory"
agent = "agentmemory" | "codex" | "openclaw" | "claude-code"
parser = "agentmemory-memory" | "agentmemory-search" | "agentmemory-session"
```

Config fields:

```ts
interface AgentMemorySourceConfig {
  agentmemory_url?: string;       // default http://localhost:3111
  agentmemory_secret_env?: string; // default AGENTMEMORY_SECRET
  query?: string;                 // default project/recent query
  project?: string;
  limit?: number;
  since?: string;
  import_mode: "latest" | "smart-search" | "sessions";
}
```

Secrets are always env names or OS keychain references, never stored as literal tokens.

### Sink Adapter

Reviewed stable PraxisBase pages may export compact lessons:

```text
wiki page -> lesson card -> POST /agentmemory/remember
```

The exported lesson contains:

- title;
- short actionable body;
- concepts/tags;
- files if known;
- source page path;
- provenance hashes;
- `praxisbase_export_version`.

Export policy:

- personal mode: allowed by default for stable `kb/` pages;
- team mode: disabled by default unless explicit team policy enables it;
- rejected/human-required candidates are never exported.

### Retrieval Sidecar

`context get` may optionally blend:

- PraxisBase stable wiki results;
- generated skills;
- agentmemory smart-search results.

PraxisBase authority wins. AgentMemory results are never allowed to outrank a matching stable wiki page. They may fill gaps or provide recent session context.

Default behavior:

- `praxisbase context get` returns PraxisBase stable context only;
- `praxisbase context get --with-agentmemory` includes sidecar live memory;
- personal bootstrap may generate an agent Skill that teaches agents when to use `--with-agentmemory`.

### Health And Security

`praxisbase agentmemory doctor` checks:

- daemon health endpoint;
- smart-search endpoint;
- optional bearer token presence;
- plaintext bearer sent only to loopback or HTTPS;
- reachable from local MCP/CLI environment;
- whether Codex/OpenClaw already has agentmemory MCP/hooks configured.

Plain HTTP to non-loopback with bearer is blocked unless a debug override is set.

## M18: Personal Bootstrap UX

### Principle

First run should be a guided product workflow, not a collection of internal commands.

Add:

```bash
praxisbase personal init
praxisbase personal connect codex
praxisbase personal connect openclaw
praxisbase personal connect agentmemory
praxisbase personal doctor
praxisbase personal run --open
praxisbase personal schedule --print
```

These wrap existing primitives:

```text
ai config
source add/doctor
daily run
agent-tools generate
kb audit/rebuild
site build/open
```

### `personal init`

Creates or updates:

- `.praxisbase/config.json` with personal defaults;
- AI config if missing, using existing env-name based secret handling;
- built-in reducer rules directory marker;
- generated agent-facing instruction file;
- optional local schedule template;
- default `kb/`, `.praxisbase/`, and `dist/` directories as needed.

It should detect `ZAI_API_KEY`, existing GLM config, and existing opencode/codex config but never copy secrets.

### `personal connect`

Connect commands should auto-detect common paths and then write source configs:

- Codex CLI/session logs and Codex app paths;
- user's `codex-cliproxyapi` variant;
- OpenClaw local memory/export/log paths;
- agentmemory daemon if reachable;
- optional remote OpenClaw source through the existing `remote`/`source` config.

Each connect prints:

- detected path or endpoint;
- source name written;
- privacy scope;
- next command.

### `personal run --open`

Runs:

```text
source doctor
daily run --mode personal --build-site
kb audit
agent-tools generate
open site
```

The HTML landing page should clearly show:

- latest wiki pages;
- review-required count with actionable links;
- context economy savings;
- agentmemory interop health;
- agent-facing commands.

This does not require a new UI framework. It is a site-model/render-site extension.

### Agent-Facing First-Run Skill

Generate a local skill/instruction document that tells Codex/OpenClaw:

- how to initialize PraxisBase;
- how to run daily collection;
- how to query stable context;
- when to include agentmemory sidecar retrieval;
- how to avoid importing private/team-inappropriate content.

This answers the first-run concern: an AI agent should be able to read one file and operate PraxisBase without the human remembering command details.

## Privacy Model

Personal mode is permissive but still redacts credentials and secrets.

Team mode remains strict:

- personal sources do not write to team knowledge by default;
- agentmemory imports marked personal cannot export to team sinks;
- team Git authority must use explicit team sources and policy;
- sink export from team `kb/` to agentmemory requires explicit policy because agentmemory may be shared across personal agents.

Privacy is enforced before AI calls and again before promotion/export.

## Data Flow

Full personal flow after M16-M18:

```text
personal init/connect
  -> source configs
  -> source adapters
  -> context reducer
  -> chunks + privacy precheck
  -> AI distill cache
  -> experience envelopes
  -> wiki compile/curate
  -> semantic review
  -> review/promote policy
  -> kb + skills + dist
  -> optional export to agentmemory
  -> human site + agent context
```

## Acceptance Criteria

- A personal run over the same source corpus uses fewer AI input bytes than the baseline and reports byte savings by rule.
- Reducer output preserves source refs, source hashes, failed command/test information, and user/agent-authored reusable lessons.
- Disabling context economy reproduces the old chunk/distill path for debugging.
- `praxisbase source add ... --type agentmemory` can import reachable agentmemory memories into experience envelopes.
- `praxisbase agentmemory export` exports only stable reviewed personal wiki pages.
- `context get --with-agentmemory` includes sidecar results without outranking stable PraxisBase wiki pages.
- `praxisbase personal init/connect/run` can set up and run a local personal workflow without requiring GitHub/GitLab, MCP, or a daemon.
- Generated HTML shows latest wiki pages, review queue, context economy savings, and agentmemory health.
- Team mode does not import or export personal agentmemory content unless explicit team policy allows it.

## Test Strategy

- Unit tests for reducer rule matching, deterministic transformations, byte accounting, and fallback behavior.
- Unit tests for JSON/JSONL structured extraction from Codex/OpenClaw/agentmemory-shaped records.
- Daily pipeline tests proving reducer runs before chunking and AI distill.
- Report schema tests for `context_economy`.
- AgentMemory adapter tests with mocked REST endpoints for health, memories, smart-search, and remember.
- Context retrieval tests proving stable wiki authority outranks agentmemory sidecar hits.
- CLI tests for `personal init`, `personal connect`, `personal run --dry-run`, and `agentmemory doctor`.
- BDD smoke for a personal run with local Codex/OpenClaw plus mocked agentmemory.

## Open Questions Settled By This Design

- **Does agentmemory replace PraxisBase personal mode?** No. It becomes the default live-memory interop backend, while PraxisBase remains the durable wiki compiler.
- **Should AI distill be optional?** No for production wiki synthesis. It may be skipped only in degraded/debug mode, and skipped AI cannot auto-promote new knowledge.
- **Should personal mode review everything?** No. Personal mode may auto-promote high-confidence, low-risk, semantic-review-approved pages. Team/global scope still requires human or Git review policy.
- **Should OpenHuman's Memory Tree be copied?** No. Borrow canonicalization, deterministic compression, byte-budgeting, and local-readable Markdown; defer full source/topic/global trees unless later evidence shows wiki quality requires them.
