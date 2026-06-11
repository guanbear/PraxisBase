# Wiki Compiler Knowledge Site Traceability Matrix

日期：2026-05-20

## Purpose

This matrix keeps implementation aligned with the approved design. It maps every BDD scenario to the modules, tests, and acceptance gates that must prove the behavior. If implementation changes a command name, output path, module boundary, or acceptance rule, update this matrix together with the design, OpenSpec, BDD, and implementation plan.

Primary source documents:

- Design: `docs/superpowers/specs/2026-05-20-wiki-compiler-knowledge-site-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-20-wiki-compiler-knowledge-site-implementation-plan.md`
- OpenSpec: `docs/openspec/changes/wiki-compiler-knowledge-site/`
- BDD: `docs/bdd/wiki-compiler-knowledge-site.feature`

## Non-Negotiable Acceptance Gates

| Gate | Proof | Applies To |
| --- | --- | --- |
| No stable mutation from compile | Tests assert `kb/`, `skills/`, and `dist/` are absent or unchanged after `wiki compile --dry-run` and `wiki compile --review` | M8 |
| Proposal lane preserved | Proposal candidates are written under `.praxisbase/inbox/proposals/` and stable writes require later review/promote | M8, M11 |
| Raw/private content blocked | Tests cover token/cookie/secret/raw-log detection and exception output | M7, M8, M11 |
| Deterministic graph/retrieval | Tests cover sorted sources, deterministic state, wikilinks, duplicates, CJK tokens, exact match, and graph expansion | M7, M9 |
| Existing build compatibility | Build tests assert existing repair bundles, `kb-index.json`, `search-index.json`, and `llms.txt` remain | M10 |
| Static site quality | Render tests assert dashboard, page shell, search assets, sibling files, escaping, and health counts | M10, M11 |
| Context contract preserved | Existing `ContextResponse` fields remain: `items`, `citations`, `warnings`, `truncated`, `budget` | M9 |
| Full verification | `pnpm check` and `git diff --check` pass before final implementation commit | M11 |

## Module Contract Matrix

| Module | Owns | Allowed Writes | Forbidden Side Effects | Primary Tests |
| --- | --- | --- | --- | --- |
| `wiki/model.ts` | Types, slugs, hashes, lifecycle, confidence | None | File IO, CLI output, stable knowledge mutation | `tests/core/wiki-collect.test.ts`, `tests/core/wiki-lint.test.ts` |
| `wiki/state.ts` | `.praxisbase/wiki/state.json` read/write and source hash diff | `.praxisbase/wiki/state.json` | Stable knowledge writes, proposal writes, dist writes | `tests/core/wiki-collect.test.ts`, `tests/core/wiki-compile.test.ts` |
| `wiki/collect.ts` | Allowlisted source collection | None | Reading outside allowlist, copying raw bodies, scope promotion | `tests/core/wiki-collect.test.ts` |
| `wiki/compile.ts` | Dry-run/review compile pipeline and proposal candidates | `.praxisbase/reports/wiki-compile/*.json`, `.praxisbase/inbox/proposals/*.json`, `.praxisbase/wiki/state.json`, exceptions | Direct `kb/`, `skills/`, or `dist/` writes | `tests/core/wiki-compile.test.ts`, `tests/cli/wiki-commands.test.ts` |
| `wiki/lint.ts` | Candidate guards, graph/site health, lifecycle/stale findings | `.praxisbase/reports/wiki-lint/*.json`, exceptions | Stable knowledge mutation, online LLM calls | `tests/core/wiki-lint.test.ts` |
| `wiki/resolver.ts` | Wikilinks, backlinks, graph, duplicates, orphans | None | LLM calls, file writes | `tests/core/wiki-resolver.test.ts` |
| `wiki/retrieval.ts` | Tokenization, ranking, graph expansion, budget support | None | Changing CLI response shape, file writes | `tests/core/wiki-retrieval.test.ts`, `tests/core/experience-context.test.ts` |
| `wiki/render-site.ts` | Knowledge site and AI-readable exports | `dist/**`, `.praxisbase/reports/wiki-lint/*.json` when health runs during site build | Stable knowledge mutation, raw HTML passthrough | `tests/core/wiki-render-site.test.ts`, `tests/core/build.test.ts` |
| `experience/context.ts` | Context report shape and report writing | `.praxisbase/reports/context/*.json` | Dropping citations before bodies, throwing on missing context | `tests/core/experience-context.test.ts` |
| `build/build.ts` | Umbrella build compatibility | Existing `dist/repair-bundles/**`, indexes, wiki site outputs, build run records | Removing existing build outputs | `tests/core/build.test.ts` |
| `cli/commands/wiki.ts` | Thin CLI wrapper for `wiki` subcommands | Whatever core command writes | Reimplementing core logic in CLI | `tests/cli/wiki-commands.test.ts` |

## BDD To Test Matrix

| BDD Scenario | Milestone | Modules | Required Tests | Acceptance Gate |
| --- | --- | --- | --- | --- |
| Collector reads stable kb and skills | M7 | `wiki/collect.ts`, `wiki/model.ts` | `wiki-collect.test.ts` stable kb/skill case | Deterministic ids, hashes, scope, title, body |
| Collector uses redacted summary for capture | M7 | `wiki/collect.ts` | `wiki-collect.test.ts` capture case | `body` is absent for capture, summary uses redacted text |
| Personal scope is not silently promoted | M7 | `wiki/collect.ts`, `wiki/compile.ts` | `wiki-collect.test.ts`, `wiki-compile.test.ts` personal scope cases | No team/org candidate from personal source without review marker |
| Compiler state can be deleted and rebuilt | M7 | `wiki/state.ts` | `wiki-collect.test.ts` state case | Missing state reads as empty, written state preserves source metadata |
| Dry-run compile writes report only | M8 | `wiki/compile.ts` | `wiki-compile.test.ts` dry-run case, `wiki-commands.test.ts` dry-run case | Report exists; no proposals, stable writes, or dist writes |
| Review compile writes candidate and skips unchanged source | M8 | `wiki/compile.ts`, `wiki/state.ts` | `wiki-compile.test.ts` unchanged skip case | First run emits candidate; second run emits zero candidates |
| Privacy uncertainty enters human exception | M8 | `wiki/compile.ts`, `wiki/lint.ts` | `wiki-compile.test.ts` privacy case | Human-required exception exists; no safe proposal emitted |
| Unsafe patch path is rejected | M8 | `wiki/lint.ts`, `wiki/compile.ts` | `wiki-lint.test.ts`, `wiki-compile.test.ts` unsafe path case | Path traversal and `.praxisbase/` targets fail |
| Body shrink guard blocks dangerous merge | M8 | `wiki/lint.ts` | `wiki-lint.test.ts` shrink guard case | Patch below 70 percent fails unless action is archive |
| Resolver parses wikilinks and ignores code | M9 | `wiki/resolver.ts` | `wiki-resolver.test.ts` link/code case | Link exists for real wikilink, not for code spans/fences |
| Graph outputs broken links, duplicates, backlinks | M9 | `wiki/resolver.ts`, `wiki/lint.ts` | `wiki-resolver.test.ts`, `wiki-lint.test.ts` graph health case | Findings and backlinks are deterministic |
| Diagnosis context exact signature wins | M9 | `wiki/retrieval.ts`, `experience/context.ts` | `wiki-retrieval.test.ts`, `experience-context.test.ts` exact case | Known fix ranks first; related skill follows |
| CJK query matches title and summary | M9 | `wiki/retrieval.ts`, `experience/context.ts` | `wiki-retrieval.test.ts`, `experience-context.test.ts` CJK case | Chinese query returns matching page with citation |
| Budget truncation preserves citations | M9 | `wiki/retrieval.ts`, `experience/context.ts` | Existing and extended `experience-context.test.ts` budget case | Body can be dropped before citations |
| Build generates site and repair bundles | M10 | `wiki/render-site.ts`, `build/build.ts` | `wiki-render-site.test.ts`, `build.test.ts` | Existing bundle outputs plus site outputs exist |
| Each page has HTML, TXT, and JSON siblings | M10 | `wiki/render-site.ts` | `wiki-render-site.test.ts` sibling case | Sibling files reference same page/source |
| Site is readable three-column knowledge page | M10 | `wiki/render-site.ts` | `wiki-render-site.test.ts` page shell case | Dashboard, nav, content, TOC, provenance, related pages |
| Search does not require a server | M10 | `wiki/render-site.ts` | `wiki-render-site.test.ts` search asset case | Local `search-index.json`, `/`, Cmd/Ctrl+K handlers |
| HTML escapes raw HTML and script-breaking JSON | M10 | `build/html.ts`, `wiki/render-site.ts` | `wiki-render-site.test.ts` escaping case | No executable raw script, escaped `</script` |
| Wiki lint writes health report | M11 | `wiki/lint.ts` | `wiki-lint.test.ts` report case | Report exists with errors/warnings summary |
| Dashboard exposes actionable health issues | M11 | `wiki/lint.ts`, `wiki/render-site.ts` | `wiki-render-site.test.ts` health case | Dashboard shows stale, duplicate, broken-link, orphan counts |
| Lifecycle and confidence are deterministic | M11 | `wiki/model.ts`, `wiki/render-site.ts` | `wiki-lint.test.ts`, `wiki-render-site.test.ts` lifecycle/confidence cases | Same input produces same lifecycle/confidence |
| Stale/lifecycle changes generate proposal only | M11 | `wiki/lint.ts`, `wiki/compile.ts` | `wiki-lint.test.ts`, `wiki-compile.test.ts` lifecycle proposal case | No direct `kb/` or `skills/` edit |
| Smoke flow proves wiki loop | M11 | CLI, core wiki modules, build, context | `wiki-commands.test.ts`, `build.test.ts`, full smoke command | Dry-run report, review proposal/state, graph, build, context citations |

## HTML Acceptance Matrix

| Surface | Required Evidence | Test Location |
| --- | --- | --- |
| Dashboard first screen | Contains `Knowledge Health`, counts, recent sources, bundle status, search input | `tests/core/wiki-render-site.test.ts` |
| Page shell | Contains left nav, content, TOC, provenance, related pages, metadata | `tests/core/wiki-render-site.test.ts` |
| Offline search | `dist/search-index.json` exists and `site.js` handles `/` and Cmd/Ctrl+K focus | `tests/core/wiki-render-site.test.ts` |
| AI-readable exports | `llms.txt`, `llms-full.txt`, `ai-readme.md`, page `.txt`, page `.json`, `graph.jsonld` exist | `tests/core/wiki-render-site.test.ts`, `tests/core/build.test.ts` |
| Escaping | Markdown raw HTML is escaped and embedded JSON cannot close a script tag | `tests/core/wiki-render-site.test.ts` |
| Responsiveness | CSS includes mobile collapse for dashboard/page shell without overlapping fixed-width panels | `tests/core/wiki-render-site.test.ts` string checks plus manual smoke before release |

## Worker Exit Checklist

Every worker or opencode packet must report:

- changed paths,
- BDD scenarios covered,
- tests added or updated,
- commands run with pass/fail status,
- any intentional gap against this matrix.

Codex main must not mark a milestone complete until the milestone rows in this matrix have tests or an explicitly documented deferred item in the OpenSpec tasks file.
