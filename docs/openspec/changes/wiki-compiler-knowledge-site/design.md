# Wiki Compiler Knowledge Site OpenSpec Design

## Overview

This change adds a deterministic wiki compiler layer between PraxisBase evidence/authority files and distribution outputs.

```text
captures + episodes + memory reports + proposals + reviews
stable kb + skills
        |
        v
wiki collect + state hash diff
        |
        +--> wiki compile --dry-run: reports only
        |
        +--> wiki compile --review: proposal candidates + reports + state + exceptions
        |
        v
wiki pages + resolver graph + retrieval index + lint health
        |
        v
context get + static knowledge site + AI-readable exports + repair bundles
```

The compiler is file-first. Stable knowledge remains in Git. Compiler state and generated output are rebuildable. Any stable knowledge update is represented as a proposal candidate and must still pass review/promote.

## Layers

### Evidence Layer

Inputs from agent work and integrations:

- `.praxisbase/outbox/captures/*.json`
- `.praxisbase/inbox/episodes/*.json`
- `.praxisbase/reports/memory/*.json`
- `.praxisbase/raw-vault/refs/*.json`
- external source refs, hashes, and redacted summaries

Evidence is not stable knowledge. Capture and memory bodies are never copied into Git; only source refs, hashes, excerpts, and redacted summaries are used.

### Authority Layer

Reviewed knowledge:

- `kb/**/*.md`
- `skills/**/SKILL.md`
- approved proposals and review records

Authority objects are the durable source of truth. They can be read by the compiler and build system, but only review/promote may mutate them.

### Compiled Wiki Layer

Rebuildable intermediate outputs:

- `WikiSource[]`
- `WikiPage[]`
- `WikiClaim[]`
- `WikiGraph`
- retrieval candidates
- wiki compile reports
- wiki lint reports
- `.praxisbase/wiki/state.json`

This layer is deterministic by default. LLM use is allowed only at controlled extraction, classification, merge proposal, or page draft points in later iterations.

### Distribution Layer

Human and agent consumption outputs:

- `dist/index.html`
- `dist/pages/<slug>.html`
- `dist/pages/<slug>.txt`
- `dist/pages/<slug>.json`
- `dist/search-index.json`
- `dist/graph.json`
- `dist/graph.jsonld`
- `dist/llms.txt`
- `dist/llms-full.txt`
- `dist/ai-readme.md`
- `dist/sitemap.xml`
- `dist/robots.txt`
- `dist/style.css`
- `dist/site.js`
- existing `dist/repair-bundles/*`

## Protocol Objects

### Wiki Source

`WikiSource` normalizes stable knowledge and evidence into one collector output.

Required fields:

- `id`
- `kind`
- `source_hash`
- `title`
- `summary`
- `scope`

Optional fields:

- `path`
- `source_ref`
- `body`
- `layer`
- `knowledge_type`
- `maturity`
- `created_at`
- `updated_at`

`kind` values:

- `stable_kb`
- `skill`
- `episode`
- `capture`
- `native_memory`
- `proposal`
- `review`
- `external_ref`

`body` may come from stable Markdown, skills, safe summaries, or explicitly redacted summaries only. Raw transcripts and full logs never become `body`.

### Wiki Page

`WikiPage` is the compiled document unit.

Required fields:

- `id`
- `slug`
- `title`
- `page_kind`
- `scope`
- `maturity`
- `lifecycle`
- `source_ids`
- `claims`
- `outbound_links`
- `body_markdown`

`page_kind` values:

- `overview`
- `concept`
- `entity`
- `procedure`
- `known_fix`
- `skill`
- `decision`
- `pitfall`
- `memory`

`lifecycle` values:

- `draft`
- `reviewed`
- `verified`
- `stale`
- `archived`

### Wiki Claim And Citation

Claims must preserve source provenance.

Required claim fields:

- `id`
- `text`
- `source_ids`
- `citations`
- `confidence`
- `provenance_state`

`provenance_state` values:

- `extracted`
- `merged`
- `inferred`
- `ambiguous`

High-confidence claims without citations become wiki lint findings.

### Wiki State

`.praxisbase/wiki/state.json` tracks incremental compile status:

```json
{
  "protocol_version": "0.1",
  "sources": {
    "source_id": {
      "source_hash": "sha256:...",
      "last_compiled_at": "2026-05-20T00:00:00.000Z",
      "candidate_ids": ["..."],
      "page_ids": ["..."]
    }
  }
}
```

State is not authority. Deleting it forces a full rebuild.

### Wiki Graph

Graph output includes:

- nodes with id, slug, title, kind, scope, maturity, and source ids,
- links from wikilinks, source overlap, and deterministic relatedness,
- backlinks,
- broken links,
- duplicate id/slug/title findings,
- orphan active pages.

The graph resolver never calls an LLM.

## Collector

The collector reads only allowlisted locations:

```text
kb/**/*.md
skills/**/SKILL.md
.praxisbase/inbox/episodes/*.json
.praxisbase/outbox/captures/*.json
.praxisbase/reports/memory/*.json
.praxisbase/inbox/proposals/*.json
.praxisbase/inbox/reviews/*.json
.praxisbase/raw-vault/refs/*.json
```

Rules:

- All paths must be resolved through `safePath`.
- Stable Markdown uses compiler-generated sha256 when no stronger source hash exists.
- Captures and native memory use redacted summaries only.
- Personal sources remain personal unless a proposal/review explicitly changes scope.
- Collector output is sorted by source id.
- Missing optional directories are treated as empty.

## Compile

### `praxisbase wiki compile --dry-run --json`

Behavior:

- Collect sources.
- Compare source hashes with wiki state.
- Build candidate ids and a compile report.
- Write `.praxisbase/reports/wiki-compile/<report-id>.json`.
- Do not write proposals.
- Do not write stable `kb/` or `skills/`.
- Do not write `dist/`.

### `praxisbase wiki compile --review --json`

Behavior:

- Collect changed sources.
- Generate deterministic proposal candidates.
- Validate patch paths, privacy, provenance, and merge guards.
- Write `.praxisbase/inbox/proposals/<candidate-id>.json` for safe candidates.
- Write `.praxisbase/reports/wiki-compile/<report-id>.json`.
- Write `.praxisbase/wiki/state.json` only for successfully emitted candidates.
- Write exceptions for unsafe or uncertain candidates.
- Do not mutate stable knowledge.

### Candidate Guards

Patch paths are allowed only under stable knowledge targets:

- `kb/**/*.md`
- `skills/**/SKILL.md`

Rejected conditions:

- path traversal,
- absolute paths,
- `.praxisbase/` targets,
- `dist/` targets,
- raw-log-like content,
- token/cookie/secret/password/credential material,
- high-confidence claims without source refs,
- body shrink below 70 percent during merge unless action is explicit archive,
- personal source included in team/org candidate without review marker.

## Resolver And Retrieval

### Resolver

The resolver supports:

- `[[slug]]`
- `[[slug|label]]`
- plain title mention candidates for future link suggestions

It ignores:

- fenced code blocks,
- inline code,
- citation markers.

It emits:

- backlinks,
- broken links,
- orphans,
- duplicate slugs,
- duplicate titles,
- duplicate ids,
- graph nodes and links.

### Retrieval

`context get` keeps the current response shape:

- `items`
- `citations`
- `warnings`
- `truncated`
- `budget`

Ranking signals:

1. exact signature, object id, path, or title match,
2. English token match,
3. CJK bigram match,
4. maturity weight: `proven > verified > draft > stale > archived`,
5. scope weight: `project > team > global > personal`,
6. graph expansion by direct links, source overlap, common neighbor, and type affinity,
7. recency and reference count,
8. stage bias.

Stage bias:

- `diagnosis`: known fixes and pitfalls,
- `repair`: skills and procedures,
- `verification`: verification, rollback, and escalation content,
- `proposal`: similar objects, reviews, prior proposals, and evidence contract.

Budget degradation:

1. drop full bodies but keep summaries and citations,
2. drop lower-ranked items,
3. keep top paths, citations, and warnings.

Context absence is a warning, not a hard failure.

## Static Site

The site is a static Knowledge Cockpit, not a marketing page.

Home page:

- knowledge health counts,
- source count,
- page count,
- candidate count,
- stale count,
- duplicate count,
- broken-link count,
- orphan count,
- recent sources,
- top signatures when available,
- repair bundle status,
- global search.

Page shell:

- left knowledge nav,
- center content,
- right rail with TOC, provenance, related pages, scope, layer, knowledge type, maturity, confidence, sources, and last updated.

Search:

- loads `dist/search-index.json`,
- works without a server,
- `/` and Cmd/Ctrl+K focus the search field,
- supports English tokens and CJK bigrams.

Security:

- all HTML strings are escaped,
- Markdown raw HTML is not emitted,
- JSON embedded into HTML escapes `</script`,
- no local editor deep links are generated in this phase.

## Wiki Lint And Health

Wiki lint rules:

- missing source hash,
- missing citation for high-confidence claim,
- broken wikilink,
- orphan active page,
- duplicate slug/title/id,
- stale active page,
- personal source included in shared candidate,
- unsafe patch path,
- body shrink violation,
- raw/private content in candidate.

Outputs:

```text
.praxisbase/reports/wiki-lint/*.json
.praxisbase/exceptions/human-required/*.json
.praxisbase/exceptions/conflicts/*.json
```

Lifecycle and confidence are deterministic:

- superseded objects become archived,
- stale threshold defaults to 180 days without references,
- maturity and reference count increase confidence,
- explicit confidence is clamped to `0..1`.

Lifecycle changes are proposed; they are not applied directly.

## Commands

```bash
praxisbase wiki compile --dry-run --json
praxisbase wiki compile --review --json
praxisbase wiki graph --json
praxisbase wiki build-site --json
praxisbase build
praxisbase context get --agent codex --stage diagnosis --query "..." --json
```

`praxisbase build` remains compatible with existing repair bundle consumers and adds graph/site/AI export outputs.

## Failure Behavior

- Missing optional input directories: continue with empty collection.
- Privacy uncertainty: write human-required exception.
- Duplicate id/slug/title: write conflict exception.
- Broken wikilink: write wiki lint finding.
- Unsafe candidate: skip candidate, write exception, and include in compile report.
- Site rendering of malformed Markdown: escape and render as safe text.
- Build failure: preserve existing build run failure record behavior.

## Output Surfaces

```text
.praxisbase/wiki/state.json
.praxisbase/reports/wiki-compile/*.json
.praxisbase/reports/wiki-lint/*.json
.praxisbase/inbox/proposals/*.json
.praxisbase/exceptions/human-required/*.json
.praxisbase/exceptions/conflicts/*.json
dist/index.html
dist/pages/*.html
dist/pages/*.txt
dist/pages/*.json
dist/search-index.json
dist/graph.json
dist/graph.jsonld
dist/llms.txt
dist/llms-full.txt
dist/ai-readme.md
dist/sitemap.xml
dist/robots.txt
dist/style.css
dist/site.js
dist/repair-bundles/*
```

## Safety Boundary

The compiler may collect, rank, graph, lint, render, warn, and propose. It must not silently mutate stable knowledge or convert private/personal evidence into shared authority.
