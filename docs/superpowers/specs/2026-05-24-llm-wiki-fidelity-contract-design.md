# LLM Wiki Fidelity Contract Design

Date: 2026-05-24

## Problem

PraxisBase has the right outer pipeline:

```text
agent evidence -> AI distill -> wiki curate -> review/promote -> kb/site/context
```

Recent real runs still showed a deeper mismatch with the LLM Wiki idea:

- promoted pages can still feel like cleaned evidence instead of compiled knowledge;
- topic identity is partly driven by hand-coded families instead of a general compiler contract;
- root wiki files such as `index.md`, `log.md`, `purpose.md`, and `schema.md` are not first-class PraxisBase artifacts;
- source summaries are not guaranteed as stable compiler outputs;
- links exist, but typed relationships, lifecycle, supersession, and lint health are not yet strong enough to make the wiki compound;
- agent access can retrieve context, but the contract does not yet prove that agents consume the compiled wiki instead of raw backlog.

This design adds an M13 fidelity contract. The contract is not a UI polish pass. It defines what PraxisBase must produce before we can say it implements the original LLM Wiki pattern for agent experience.

## Reference Audit

### Original LLM Wiki

What must be preserved:

- raw sources are immutable;
- the wiki is a persistent, compounding artifact;
- the LLM maintains the wiki instead of re-deriving answers from raw chunks;
- a single ingest can update many pages;
- `index.md` is the content catalog and first navigation entry;
- `log.md` records chronological operations;
- `schema` tells the agent how to maintain the wiki;
- query answers worth keeping can be filed back into the wiki;
- lint checks contradictions, stale claims, orphan pages, missing pages, and missing cross-references.

PraxisBase status:

- partially matches raw evidence and review/promote;
- partially matches synthesized proposals;
- missing root wiki files as first-class artifacts;
- missing query crystallization into stable wiki pages;
- missing a strong lint contract for raw-copy, orphan, contradiction, stale, and source-summary coverage.

### LLM Wiki v2

What must be preserved:

- confidence, maturity, retention, and supersession are knowledge lifecycle fields, not decoration;
- observations, episodes, semantic knowledge, and procedures are different consolidation tiers;
- graph edges should be typed, such as `uses`, `depends_on`, `fixes`, `contradicts`, `supersedes`, and `related`;
- automation should run on source changes, session end, query save, memory writes, and scheduled lint;
- privacy and scope are compiler invariants.

PraxisBase status:

- has scope, maturity, confidence hints, and privacy gates;
- missing typed relationship output and lifecycle lint;
- missing retention/supersession behavior that affects retrieval and site health;
- scheduled daily run exists, but fidelity acceptance does not yet require compounding quality.

### `atomicstrata/llm-wiki-compiler`

What must be preserved:

- two-phase compile: concept extraction before page generation;
- source hash based incremental state;
- shared concepts merge into one page generated from all contributing sources;
- review mode writes candidates instead of mutating the wiki;
- related pages are loaded as context for page generation;
- provenance/citation lint runs before approval;
- index generation and interlink resolution are deterministic;
- prompt budget prevents popular concepts from blowing up model context.

PraxisBase status:

- has incremental source state and review/promote;
- has observations/topics/page plans, but topic identity is still too heuristic;
- has deterministic link/provenance repair, but not source-summary pages or citation-span lint;
- does not yet enforce prompt budgeting per canonical topic;
- does not yet freeze shared concepts when a source disappears.

### `nashsu/llm_wiki`

What must be preserved:

- `purpose.md` is separate from structural schema and guides every ingest/query;
- ingest is analysis first, generation second;
- each source gets traceable summary output;
- `overview.md`, `index.md`, `log.md`, graph, search, review, and activity are product surfaces;
- CJK and English search should both work;
- graph relevance can combine direct links, source overlap, common neighbors, and type affinity;
- Skill/API access can make the wiki agent-usable without making MCP mandatory.

PraxisBase status:

- has CLI, static site, graph, and skill/CLI agent access;
- missing purpose as a default project artifact;
- source summaries are not guaranteed;
- graph relevance is not yet weighted enough for query expansion;
- search exists through site/context indexes but is not yet fidelity-tested for CJK and mixed English.

### WeKnora

What to borrow:

- production ingestion discipline: connectors, queues, retry/dead-letter concepts, observability;
- Wiki mode as an agent-generated Markdown knowledge graph;
- MCP as an optional agent integration surface;
- tenant/RBAC and credential handling ideas for team mode;
- graph and wiki browser UX patterns.

What not to borrow now:

- enterprise RAG platform scope;
- mandatory database, Neo4j, vector store, or server runtime;
- built-in ReAct agent as PraxisBase core;
- replacing file-first Git review/promote with app-only state.

PraxisBase should remain a file-first agent-experience compiler. WeKnora is a mature reference for ingestion and agent access, not the product we are rebuilding.

## Design Goal

Make the compiled wiki artifact testable:

```text
raw evidence
  -> source summaries
  -> observations
  -> canonical topics
  -> compiled page plans
  -> AI synthesis or patch synthesis
  -> deterministic fidelity lint
  -> review/promote
  -> root files, graph, site, agent context
```

The wiki must have fewer durable pages than evidence items, because it compiles repeated experience. A page must cite provenance, link to related pages when such pages exist, and tell a future agent when to use it, what to do, and how to verify.

## Non-Goals

- Do not require MCP. Skill plus CLI remains the default agent access path.
- Do not add WeKnora as a dependency.
- Do not add a vector database or graph database as a release blocker.
- Do not auto-promote team knowledge without GitLab/CI/human gates.
- Do not generate pages from official docs, boot instructions, provider config, or raw logs by themselves.
- Do not increase page count as a success metric.

## Fidelity Contract

### 1. Root Wiki Files

PraxisBase must maintain root artifacts under the compiled wiki/site model:

- `purpose.md`: why this wiki exists, scope, audiences, priority questions, privacy stance;
- `schema.md`: page kinds, frontmatter fields, relationship types, promotion rules, source rules;
- `index.md`: content catalog by page kind/scope/maturity with one-line summaries and links;
- `log.md`: append-only parseable operation log for ingest, curation, promote, lint, query-save, and site build;
- `overview.md`: current synthesized overview of important knowledge clusters and recent changes.

These can be materialized under `dist/wiki/` and optionally proposed into `kb/wiki/`, but the compiler model must treat them as first-class generated artifacts. Agents should read these before broad queries.

### 2. Source Summary Layer

Every source that passes privacy and usefulness gates should produce or update a source summary record. A source summary is not a stable guidance page. It records:

- source id/ref/hash;
- source kind and scope;
- concise source summary;
- extracted entities/topics;
- observations produced;
- candidate canonical topics;
- privacy verdict;
- whether it contributed to promoted knowledge.

Source summaries let humans audit why evidence did or did not become wiki knowledge. They also prevent the compiler from hiding discarded raw evidence.

### 3. Consolidation Tiers

PraxisBase must distinguish four tiers:

- evidence: immutable redacted inputs;
- source summaries: source-level traceability;
- observations: normalized facts/lessons extracted from evidence;
- compiled pages: semantic/procedural/decision knowledge that agents use.

Only compiled pages are stable wiki guidance. Source summaries and observations are provenance and diagnostics.

### 4. Canonical Topics

Topic identity must be general, not mainly a list of hard-coded families. A canonical topic key should be derived from:

1. normalized entities;
2. problem/action/outcome signatures;
3. page kind;
4. scope;
5. explicit source signatures when they are not source ids;
6. optional AI-proposed merge key validated by deterministic rules.

Hard-coded families may remain as compatibility boosters, but they cannot be the primary long-term design.

### 5. Page Kinds

Compiled pages must use an explicit `page_kind`:

- `source_summary`;
- `concept`;
- `entity`;
- `procedure`;
- `known_fix`;
- `decision`;
- `pitfall`;
- `preference`;
- `incident`;
- `synthesis`;
- `skill`.

`source_summary` pages are never promoted as operational guidance. `synthesis` pages are allowed when a query or daily run produces a durable cross-topic conclusion.

### 6. Frontmatter Lifecycle

Stable wiki pages and proposal candidates should carry:

```yaml
id: wiki-...
title: ...
page_kind: procedure
scope: personal
maturity: draft
lifecycle: active
confidence: 0.86
source_count: 3
last_confirmed_at: "2026-05-24T00:00:00.000Z"
supersedes: []
superseded_by: null
relationship_types:
  - fixes
sources:
  - uri: codex:session:...
    hash: sha256:...
```

The exact storage shape may use existing proposal JSON fields first, but the compiler must have a normalized internal contract and render these fields into stable markdown where useful.

### 7. Typed Relationships

The graph should distinguish:

- `related`;
- `uses`;
- `depends_on`;
- `fixes`;
- `caused_by`;
- `verified_by`;
- `contradicts`;
- `supersedes`;
- `same_topic_as`;
- `source_overlap`.

M13 does not require a graph database. It requires typed edges in JSON graph/site artifacts and deterministic lint over unresolved or contradictory edges.

### 8. Query Crystallization

When an agent query produces durable new synthesis, PraxisBase should support saving it as a wiki proposal. It must go through the same quality gate:

```text
query answer -> source summary/query source -> synthesis topic -> review/promote
```

This is how exploration compounds, matching the original LLM Wiki idea.

### 9. Fidelity Lint

The lint layer must report:

- raw-copy pages;
- source-summary pages promoted as guidance;
- missing root files;
- missing source summary coverage;
- missing provenance;
- unresolved wikilinks;
- orphan pages;
- duplicate topics;
- stale pages;
- supersession conflicts;
- contradiction conflicts;
- pages with no agent-use section;
- pages whose source count is lower than their topic's contributing observations.

Lint findings must be machine-readable so CI and daily smoke can fail on fidelity regressions.

### 10. Agent Access

Agents should use compiled knowledge through:

- default: Skill plus `praxisbase context get`, `wiki graph`, `wiki build-site`, `review`, and `daily run`;
- optional: MCP server that exposes the same compiled wiki, graph, and source-summary read APIs;
- no direct raw-vault retrieval unless explicitly requested for audit.

Agent context should include root file summaries, relevant compiled pages, related graph neighbors, and provenance pointers within budget.

## Release Acceptance

M13 is acceptable only when a golden corpus smoke proves:

- multiple raw evidence items compile into fewer wiki pages;
- at least one page uses more than one source;
- source summaries exist for accepted sources;
- `index.md`, `log.md`, `purpose.md`, `schema.md`, and `overview.md` artifacts are generated;
- stable pages include provenance, lifecycle, confidence, and page kind metadata;
- graph has typed, resolver-valid edges when related pages exist;
- lint catches a raw-copy page, missing provenance page, unresolved link, orphan page, and stale/superseded conflict;
- agent context retrieves compiled pages plus provenance, not raw evidence blobs;
- team mode remains review-gated.

