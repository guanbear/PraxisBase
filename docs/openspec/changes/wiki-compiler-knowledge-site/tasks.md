# Wiki Compiler Knowledge Site Tasks

Implementation traceability lives in `docs/superpowers/plans/2026-05-20-wiki-compiler-knowledge-site-traceability.md`. Each milestone below must satisfy its corresponding BDD rows, module contracts, tests, and acceptance gates before it can be marked complete.

## M7: Wiki Object Model And Collector

- [ ] Add `packages/core/src/wiki/model.ts` with `WikiSource`, `WikiPage`, `WikiClaim`, `WikiCitation`, graph-related types, slug/hash helpers, lifecycle helpers, and confidence helpers.
- [ ] Add `packages/core/src/wiki/state.ts` for `.praxisbase/wiki/state.json`.
- [ ] Add protocol paths for wiki root, state, compile reports, and lint reports.
- [ ] Add `packages/core/src/wiki/collect.ts`.
- [ ] Collect `kb/**/*.md` with frontmatter, title, body, scope, maturity, and compiler hash.
- [ ] Collect `skills/**/SKILL.md` as skill sources.
- [ ] Collect captures from `.praxisbase/outbox/captures/*.json` using redacted summaries only.
- [ ] Collect episodes, memory reports, proposals, reviews, and raw-vault refs from allowlisted protocol paths.
- [ ] Reject path traversal and unsafe source paths through `safePath`.
- [ ] Preserve personal scope instead of silently promoting it.
- [ ] Sort collector output deterministically.
- [ ] Add tests for stable kb, skills, captures, memory reports, personal scope handling, raw summary-only collection, state read/write, and hash diff behavior.

## M8: Compile Candidates

- [ ] Add `packages/core/src/wiki/compile.ts`.
- [ ] Add `packages/core/src/wiki/lint.ts` candidate guard helpers.
- [ ] Add `praxisbase wiki compile --dry-run --json`.
- [ ] Add `praxisbase wiki compile --review --json`.
- [ ] Generate deterministic candidate ids from source id and source hash.
- [ ] Generate proposal candidate patch paths only under `kb/**/*.md` or `skills/**/SKILL.md`.
- [ ] Write compile reports to `.praxisbase/reports/wiki-compile/*.json`.
- [ ] In review mode, write proposal candidates to `.praxisbase/inbox/proposals/*.json`.
- [ ] In review mode, update `.praxisbase/wiki/state.json` only for safely emitted candidates.
- [ ] In dry-run mode, avoid proposal, stable knowledge, state, and site writes unless explicitly documented by the report.
- [ ] Skip unchanged sources by source hash.
- [ ] Write human-required exceptions for privacy uncertainty or raw/private content.
- [ ] Write conflict/human exceptions for unsafe paths and merge guard failures.
- [ ] Enforce body shrink threshold for merge proposals.
- [ ] Ensure compile reports include `changed_stable_knowledge: false`.
- [ ] Add tests for dry-run, review mode, unchanged skip, privacy exception, unsafe path rejection, body shrink guard, and no stable `kb/` or `skills/` mutation.

## M9: Graph And Retrieval

- [ ] Add `packages/core/src/wiki/resolver.ts`.
- [ ] Resolve `[[slug]]` and `[[slug|label]]`.
- [ ] Ignore links inside fenced code blocks, inline code, and citation markers.
- [ ] Build deterministic title and slug indexes.
- [ ] Emit backlinks, broken links, orphans, duplicate id/slug/title findings, graph nodes, and graph links.
- [ ] Add source-overlap and direct-link related edges.
- [ ] Add `packages/core/src/wiki/retrieval.ts`.
- [ ] Add English tokenization and CJK bigram tokenization.
- [ ] Rank by exact signature/id/path/title match.
- [ ] Rank by token match, maturity, scope, graph relation, recency, reference count, and stage bias.
- [ ] Integrate wiki retrieval into `packages/core/src/experience/context.ts` while preserving the current `ContextResponse` contract.
- [ ] Preserve citations when budget removes full bodies.
- [ ] Return warning instead of hard failure when context is unavailable.
- [ ] Add `praxisbase wiki graph --json`.
- [ ] Add tests for wikilink resolution, code fence ignores, broken links, duplicates, CJK query matching, exact signature priority, graph expansion, budget truncation, and context compatibility.

## M10: Knowledge Site

- [ ] Add `packages/core/src/wiki/render-site.ts`.
- [ ] Add safe HTML escaping and JSON-for-HTML escaping helpers.
- [ ] Convert stable wiki sources into pages for rendering.
- [ ] Generate `dist/index.html` Knowledge Health Dashboard.
- [ ] Generate `dist/pages/<slug>.html`.
- [ ] Generate `dist/pages/<slug>.txt`.
- [ ] Generate `dist/pages/<slug>.json`.
- [ ] Generate `dist/search-index.json`.
- [ ] Generate `dist/graph.json`.
- [ ] Generate `dist/graph.jsonld`.
- [ ] Generate `dist/llms.txt`.
- [ ] Generate `dist/llms-full.txt`.
- [ ] Generate `dist/ai-readme.md`.
- [ ] Generate `dist/sitemap.xml`.
- [ ] Generate `dist/robots.txt`.
- [ ] Generate `dist/style.css`.
- [ ] Generate `dist/site.js`.
- [ ] Implement dashboard counts for sources, pages, candidates, stale pages, duplicates, broken links, orphans, recent sources, top signatures, and bundle status.
- [ ] Implement page shell with left nav, center content, right provenance/related rail, TOC, metadata, scope, maturity, confidence, and sources.
- [ ] Implement offline search with `/` and Cmd/Ctrl+K shortcuts.
- [ ] Make the site responsive without requiring a server.
- [ ] Ensure Markdown raw HTML is escaped and script-breaking JSON is escaped.
- [ ] Integrate `buildWikiSite` into `praxisbase build` without breaking repair bundle outputs.
- [ ] Add `praxisbase wiki build-site --json`.
- [ ] Add tests for all required output files, page sibling consistency, search asset generation, HTML escaping, build compatibility, and CLI build-site output.

## M11: Provenance, Lifecycle, And Health

- [ ] Extend wiki lint to write `.praxisbase/reports/wiki-lint/*.json`.
- [ ] Write human-required exceptions for unsafe/private/raw candidates.
- [ ] Write conflict exceptions for duplicate id/slug/title cases.
- [ ] Flag missing source hashes.
- [ ] Flag missing citation for high-confidence claims.
- [ ] Flag broken wikilinks.
- [ ] Flag orphan active pages.
- [ ] Flag duplicate slug/title/id.
- [ ] Flag stale active pages.
- [ ] Flag personal source leaks into shared candidates.
- [ ] Flag unsafe patch paths.
- [ ] Flag body shrink violations.
- [ ] Flag raw-log-like candidate content.
- [ ] Calculate deterministic lifecycle from maturity, supersession, recency, and references.
- [ ] Calculate deterministic confidence from source count, maturity, reference count, and explicit confidence.
- [ ] Surface health issues on the dashboard.
- [ ] Keep lifecycle/stale changes proposal-based.
- [ ] Add tests for wiki lint reports, exception writes, lifecycle calculation, confidence calculation, health dashboard, and compile guard integration.

## Required Verification

```bash
pnpm check
git diff --check
```

Smoke flow:

```bash
tmpdir=$(mktemp -d)
pnpm build
cd "$tmpdir"
node /Users/guanbear/workspace/praxisbase/packages/cli/dist/index.js init --profile all
node /Users/guanbear/workspace/praxisbase/packages/cli/dist/index.js capture finish --agent codex --result success --source-ref raw-vault://codex/session-1 --source-hash sha256:session1 --summary "Fixed OpenClaw auth expired by refreshing login." --json
node /Users/guanbear/workspace/praxisbase/packages/cli/dist/index.js wiki compile --dry-run --json
node /Users/guanbear/workspace/praxisbase/packages/cli/dist/index.js wiki compile --review --json
node /Users/guanbear/workspace/praxisbase/packages/cli/dist/index.js wiki graph --json
node /Users/guanbear/workspace/praxisbase/packages/cli/dist/index.js build
node /Users/guanbear/workspace/praxisbase/packages/cli/dist/index.js context get --agent codex --stage diagnosis --query "openclaw auth expired" --json
```

Expected:

- capture is written under `.praxisbase/outbox/captures/`,
- dry-run compile writes report only,
- review compile writes proposal candidates and compiler state only,
- graph command returns nodes/links/health,
- build writes existing repair bundles plus knowledge site outputs,
- context response keeps citations and warnings,
- no wiki command directly modifies stable `kb/` or `skills/`.

## Out Of Scope

- GUI, desktop app, browser extension, IDE plugin, MCP server.
- Vector database or external semantic search.
- Long-running database service, daemon, queue worker, or scheduler.
- Direct stable knowledge mutation from wiki compile, graph, site, or lint.
- Raw transcript/log/chat storage in Git.
- Automatic personal-to-team/org promotion.
