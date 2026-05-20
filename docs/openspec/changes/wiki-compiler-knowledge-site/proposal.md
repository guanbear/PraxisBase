# OpenSpec Change: Wiki Compiler Knowledge Site

## Why

PraxisBase already has the capture, native memory bridge, proposal/review/promote lane, repair bundles, and a basic static build. What is still missing is the stable wiki compiler core: a deterministic layer that can turn reviewed knowledge and safe evidence into a rebuildable wiki model, graph, retrieval index, and human-readable knowledge site.

Without this change, future work can drift into two weak shapes:

1. session-summary accumulation that never becomes a durable wiki, or
2. an unsafe self-editing wiki where LLM output directly mutates stable `kb/` and `skills/`.

This change defines a file-first wiki compiler. LLMs may assist extraction and draft generation later, but deterministic code owns collection, hashing, graph resolution, retrieval ranking, budget enforcement, linting, and static site generation.

## What Changes

- Add internal wiki compiler objects: sources, claims, citations, pages, graph, compile reports, lint reports, and state.
- Add a collector that reads allowlisted stable knowledge and evidence locations.
- Add `.praxisbase/wiki/state.json` for incremental source hash tracking.
- Add `praxisbase wiki compile --dry-run --json`.
- Add `praxisbase wiki compile --review --json`.
- Add deterministic candidate generation that writes proposal candidates, compile reports, compiler state, and exceptions only.
- Add deterministic wikilink/title resolver and graph output.
- Replace shallow `context get` ranking with wiki retrieval signals while preserving the existing response contract.
- Add CJK bigram and English token search.
- Add `praxisbase wiki graph --json`.
- Add `praxisbase wiki build-site --json`.
- Upgrade `praxisbase build` into an umbrella build that keeps existing repair bundle outputs and adds the knowledge site and AI-readable exports.
- Add a static Knowledge Health Dashboard and multi-page knowledge site.
- Add wiki lint and health reports for provenance, lifecycle, broken links, duplicates, stale pages, unsafe candidates, and raw/private content.
- Add BDD acceptance for M7 through M11.

## Non-Goals

- Do not write stable `kb/` or `skills/` directly from `wiki compile`.
- Do not bypass proposal/review/promote.
- Do not put raw logs, full transcripts, Feishu original chats, tokens, cookies, credentials, or secrets into Git.
- Do not automatically promote `personal` experience to `team` or `org`.
- Do not require a GUI, desktop app, browser extension, MCP server, vector database, external search backend, daemon, message queue, or external database.
- Do not require an online LLM for deterministic resolver, retrieval, graph, budget, lint, or site generation.
- Do not replace existing repair bundle paths or remove existing `dist/kb-index.json`, `dist/search-index.json`, or `dist/llms.txt` contracts.

## Acceptance Summary

- Collector returns deterministic `WikiSource[]` from allowlisted inputs.
- Captures and native memory contribute redacted summaries only; raw bodies are not copied into wiki output.
- Personal sources are kept scoped and do not silently become shared team/org candidates.
- `wiki compile --dry-run --json` writes a compile report but no proposal, stable knowledge, or site output.
- `wiki compile --review --json` writes proposal candidates and compiler state, then skips unchanged source hashes on later runs.
- Privacy uncertainty, raw-like content, unsafe patch paths, and merge guard failures write exceptions instead of stable knowledge.
- Resolver produces backlinks, broken links, duplicate findings, orphan findings, and graph JSON without calling an LLM.
- `context get` keeps its current JSON shape but ranks by exact match, CJK/English tokens, maturity, scope, graph relation, recency, references, and stage bias.
- `praxisbase build` still produces repair bundles and existing indexes, and also produces `dist/pages/`, `graph.json`, `graph.jsonld`, `llms-full.txt`, `ai-readme.md`, `sitemap.xml`, `robots.txt`, `style.css`, and `site.js`.
- HTML output is escaped, responsive, offline-searchable, and suitable for daily knowledge review rather than a raw inspection table.
- Wiki lint writes `.praxisbase/reports/wiki-lint/*.json` and exception records for human-required or conflict cases.
- `pnpm check` and documented smoke flow pass after implementation.

## Guardrails For Implementing Agents

- Keep command wrappers thin; core behavior belongs in `@praxisbase/core`.
- Use existing TypeScript, Node, `gray-matter`, Zod, Commander, and file-store helpers unless a stronger local pattern already exists.
- Prefer deterministic transformations and stable sort orders.
- Treat `.praxisbase/wiki/state.json` as cache/state only, never as authority.
- Keep output rebuildable after deleting `.praxisbase/wiki/state.json` and `dist/`.
- Use proposal candidates for any stable knowledge change.
- Route uncertainty to exceptions; do not silently drop unsafe material without reporting it.
