# Wiki Compiler Core Redesign Design

Date: 2026-05-22

## Problem

The current PraxisBase pipeline can collect agent memories, run AI distill, create curated proposals, auto-review them, promote them into `kb/`, and build an HTML site. A real personal run proved the mechanics work, but the generated wiki quality is not yet acceptable:

- many promoted pages are one evidence item per page;
- duplicated source hashes produce multiple near-identical pages;
- pages often look like cleaned summaries or templates, not durable wiki articles;
- promoted pages have no wikilinks, no meaningful graph, and weak related-page structure;
- existing stable wiki pages are not used as context when new evidence arrives;
- review/promote can accept a page before the compiler has tried to merge it into the existing knowledge model.

This is a core compiler issue, not a UI issue. A better HTML site cannot compensate for a weak wiki artifact.

## Reference Lessons

Karpathy's original LLM Wiki pattern is not "turn every source into a page." It is:

```text
raw sources -> LLM-maintained persistent wiki -> query/lint
```

Raw sources stay immutable. The wiki is the compounding artifact. When new source material arrives, the LLM updates relevant pages, strengthens or contradicts existing claims, adds links, updates index/log, and keeps the graph healthy.

`atomicstrata/llm-wiki-compiler` implements the most important compiler shape for us:

```text
sources -> source hash check -> concept extraction -> merge by concept slug
        -> page generation from all contributing sources -> link resolution -> index
```

The key lesson is that extraction and page generation are separate phases. Multiple sources contributing to the same concept produce one page, not multiple pages.

`nashsu/llm_wiki` adds useful product and maintenance lessons:

- two-step ingest: analyze first, generate wiki second;
- every generated page carries source traceability;
- existing pages are merged instead of overwritten;
- duplicate/merge work is queued and reviewable;
- graph/search/review are first-class, not afterthoughts;
- agent access can be Skill/API/MCP, but agents must read the compiled wiki, not raw backlog.

LLM Wiki v2 adds the missing long-term layer:

- confidence and maturity change as evidence accumulates;
- supersession handles new evidence that contradicts old claims;
- consolidation tiers separate raw observation, episode, semantic knowledge, and procedure;
- quality scoring and self-healing keep the wiki from accumulating noise;
- shared/private scope is a compiler invariant, not only a review policy.

## Goal

Build a real wiki compiler core for agent experience:

```text
raw evidence
  -> observation extraction
  -> claim/concept/procedure extraction
  -> canonical topic clustering
  -> existing wiki lookup
  -> page plan: create/update/merge/supersede
  -> AI synthesis with existing page and related pages
  -> deterministic quality gate
  -> review/promote
  -> graph/index/site/context rebuild
```

The user-facing outcome is that daily personal or team runs produce a small number of useful, provenance-rich wiki page candidates. Those candidates should already be shaped as durable knowledge an agent can reuse, not raw evidence summaries a human must rewrite.

## Non-Goals

- Do not replace the existing privacy triage, harvest, daily, remote OpenClaw, GitLab, Skill, or MCP surfaces.
- Do not directly mutate stable `kb/` from compile/curate. Stable writes still go through proposal, review, and promote.
- Do not add a separate "experience.html" view. The wiki pages are the experience view.
- Do not build a heavy graph database. Markdown, JSON reports, and the current static site remain the persistence surface.
- Do not require MCP for agent access. Skill+CLI remains the default; MCP stays optional.

## Architecture

### 1. Evidence Remains Immutable

Evidence includes captures, episodes, distilled experiences, native memories, remote exports, and raw candidate files. Evidence may be redacted and summarized, but it is not the wiki. Evidence is only provenance and compiler input.

The compiler must never treat official docs, agent boot instructions, provider config, session metadata, memory promotion bookkeeping, or raw transcripts as stable wiki knowledge by themselves.

### 2. Observation Layer

Each evidence item becomes zero or more `WikiObservation` records:

```ts
interface WikiObservation {
  id: string;
  evidence_id: string;
  source_ref: string;
  source_hash: string;
  agent?: "codex" | "openclaw" | "claude-code" | "opencode" | "generic";
  scope: "personal" | "project" | "team" | "org" | "global";
  kind: "fix" | "procedure" | "decision" | "pitfall" | "preference" | "incident" | "note";
  problem?: string;
  action?: string;
  outcome?: "success" | "failed" | "partial" | "unknown";
  verification?: string;
  reusable_lesson?: string;
  entities: string[];
  topics: string[];
  raw_excerpt?: string;
  confidence: number;
  privacy_verdict: "safe" | "personal_only" | "team_allowed" | "human_required" | "reject";
}
```

Observations are still not wiki pages. They are normalized facts or lessons extracted from evidence.

### 3. Claim And Topic Layer

Observations are compiled into canonical `WikiTopic` records:

```ts
interface WikiTopic {
  id: string;
  topic_key: string;
  title: string;
  page_kind: "known_fix" | "procedure" | "decision" | "pitfall" | "preference" | "incident" | "note" | "skill";
  target_path: string;
  scope: "personal" | "project" | "team" | "org" | "global";
  observation_ids: string[];
  source_refs: string[];
  source_hashes: string[];
  source_count: number;
  entities: string[];
  related_topic_keys: string[];
  confidence: number;
  maturity: "draft" | "reviewed" | "proven" | "deprecated";
  conflicts: Array<{ claim: string; source_refs: string[]; reason: string }>;
}
```

Topic keys are deterministic. They are based on normalized problem/action/entity signatures, not source ids. This is the main fix for the current one-source-one-page failure.

### 4. Existing Wiki Lookup

Before generating a proposal, the compiler reads stable `kb/` and `skills/` metadata:

- exact target path match;
- same title/slug match;
- overlapping source hashes;
- overlapping entities and signatures;
- existing wikilinks and related metadata;
- deprecated/superseded pages.

This produces a `WikiPagePlan`:

```ts
interface WikiPagePlan {
  action: "create" | "update" | "merge" | "supersede" | "archive";
  target_path: string;
  existing_path?: string;
  canonical_title: string;
  topic_key: string;
  reasons: string[];
  related_paths: string[];
  required_links: string[];
}
```

The default for matching an existing page is `update`, not `create`.

### 5. AI Synthesis

The AI curator receives:

- the canonical topic;
- all contributing observations;
- existing stable page content, if any;
- related page summaries;
- required wikilink targets;
- strict output schema.

The prompt must ask for a wiki page or patch-shaped proposal, not a log summary. The output must include:

- title and summary;
- applicability: when an agent should use this;
- durable procedure/fix/decision;
- failed attempts only when useful;
- verification and confidence;
- related pages or wikilinks;
- provenance with source refs and hashes;
- supersession note when replacing stale knowledge.

### 6. Deterministic Quality Gate

AI cannot bypass deterministic gates. A proposal cannot be auto-promoted if any hard gate fails.

Hard blocks:

- no provenance;
- unsafe path;
- private material;
- raw JSON or transcript fragments in body;
- known template fallback sentences in final body;
- duplicate source hash already represented in another pending or stable page unless this proposal is an update/merge to that canonical page;
- page is only official documentation, API reference, system prompt, provider config, or session boot metadata;
- body has no wiki structure;
- target action is `create` when an existing canonical page should be updated.

Human-required gates:

- single-source weak evidence;
- confidence below policy threshold;
- unresolved conflict;
- missing links when related pages exist;
- team/org/global scope;
- skill/policy target;
- destructive archive/supersede.

Personal mode may auto-review and auto-promote low-risk proposals only after this quality gate passes. Personal mode should be convenient, but not careless.

### 7. Graph And Index Readiness

Every promoted page should contribute to the wiki graph.

Rules:

- If related stable pages exist, the body must include at least one `[[wikilink]]` or frontmatter `related:` entry.
- If no related pages exist, the quality report must say the page is an acceptable seed page.
- The compiler writes a report with duplicate groups, isolated pages, missing links, stale pages, and promotion blocks.
- The site homepage should show real wiki pages and quality status, not raw candidate counts as the primary story.

## Command Behavior

Production daily run should remain simple:

```bash
praxisbase daily run --mode personal --build-site --json
```

Internally it should run:

```text
harvest -> ai distill -> wiki compile -> wiki curate -> review policy -> promote allowed -> graph/site/context
```

`wiki curate` becomes the compiler synthesis stage:

```bash
praxisbase wiki curate --dry-run --json
praxisbase wiki curate --review --json
praxisbase review auto --promote-approved --json
praxisbase wiki build-site --json
```

Dry-run writes reports only. Review mode writes proposals only. Promotion remains separate.

## Acceptance Criteria

- A dataset with repeated ACK timing evidence produces one canonical page or one update proposal, not six pages.
- A dataset with repeated stdin-closed evidence produces one canonical page or update proposal, not six pages.
- A source hash cannot create multiple stable pages unless explicitly split by a human-approved plan.
- Existing stable pages are selected for update when topic/title/source overlap matches.
- Generated pages include provenance and either wikilinks/related metadata or an explicit seed-page explanation.
- Raw JSON, session boot instructions, provider config, and official docs cannot become stable wiki pages by themselves.
- Personal auto-promote only promotes low-risk proposals that pass the deterministic gate.
- The site and reports expose why proposals were created, updated, blocked, merged, or marked human-required.

## Failure Modes

- If AI is not configured, production curation fails. Degraded output may be generated for smoke tests, but it is marked non-production and cannot auto-promote.
- If AI returns invalid JSON, the topic is counted as synthesis failure and no proposal is written.
- If a quality gate fails, the proposal either stays human-required with explicit reasons or is rejected before review.
- If an existing page merge would shrink or drop prior content, the proposal is blocked or becomes human-required.

## Implementation Strategy

Implement this as a narrow compiler-core evolution, not a new parallel system:

- extend existing `wiki/curate.ts` and `wiki/curation-model.ts`;
- add focused helper modules only where boundaries are clear;
- reuse existing proposal/review/promote path;
- add deterministic tests before implementation;
- keep generated local `kb/`, `.praxisbase/`, and `dist/` artifacts out of commits.

