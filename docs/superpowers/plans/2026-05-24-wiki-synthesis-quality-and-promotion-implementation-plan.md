# Wiki Synthesis Quality And Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make curated wiki proposals structurally useful, linked, provenance-rich, and eligible for personal auto-promotion only when they satisfy deterministic quality gates.

**Architecture:** Keep `curate.ts` as the orchestration module, but deepen the synthesis quality contract in `curator-prompt.ts`, `curate.ts`, and `promotion-quality.ts`. AI produces drafts; deterministic repair inserts required structure, provenance, and relationship links before assessment; review policy remains the only route into stable `kb/`.

**Tech Stack:** TypeScript, Node test runner, Zod schemas, existing PraxisBase CLI/core modules.

---

## Files

- Modify `packages/core/src/wiki/curator-prompt.ts`: strengthen the AI contract and link/provenance instructions.
- Modify `packages/core/src/wiki/curate.ts`: add deterministic page repair for relationship links and provenance sections.
- Modify `packages/core/src/wiki/promotion-quality.ts`: require core wiki sections for promotion.
- Modify `packages/core/src/wiki/topic-planner.ts`: use stable page ids as relationship slugs.
- Modify `packages/core/src/wiki/resolver.ts` and `packages/core/src/wiki/render-site.ts`: resolve canonical slugs plus unambiguous title/path aliases and render wikilinks as clickable page links.
- Modify `tests/core/wiki-curator-ai.test.ts`: prove missing relationship links are repaired.
- Modify `tests/core/wiki-promotion-quality.test.ts`: prove missing sections block promotion and good pages pass.
- Modify `tests/core/wiki-topic-planner.test.ts`, `tests/core/wiki-resolver.test.ts`, and `tests/core/wiki-render-site.test.ts`: prove stable ids, graph aliases, and HTML wikilinks work.
- Modify `tests/cli/wiki-compiler-core-redesign-e2e.test.ts`: keep the graph-link regression as the end-to-end contract.

## Task 1: Promotion Quality Contract

- [ ] Add a failing test in `tests/core/wiki-promotion-quality.test.ts`:

```ts
it("hard-blocks bodies missing reusable lessons", () => {
  const result = assessWikiPromotionQuality(goodProposal({
    body_markdown: "# Test\n\n## Problem\nSomething broke.\n\n## Fix\nApply.\n\n## Verification\nTests pass.",
  }));
  assert.ok(result.hard_blocks.includes("body_missing_wiki_structure"));
  assert.equal(result.passed, false);
});
```

- [ ] Update `goodProposal()` in the same file so the default body includes `## Reusable Lessons`.
- [ ] Implement section checks in `packages/core/src/wiki/promotion-quality.ts`:

```ts
function hasSection(body: string, names: string[]): boolean {
  return names.some((name) => new RegExp(`^##\\s+${name}\\b`, "im").test(body));
}
```

Required groups: title, problem/context, action section, verification, reusable lessons, provenance. Reuse `body_missing_wiki_structure` rather than adding a new schema reason.

- [ ] Run:

```bash
pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-promotion-quality.test.js
```

Expected: all promotion quality tests pass.

## Task 2: Deterministic Link And Provenance Repair

- [ ] Add a failing test in `tests/core/wiki-curator-ai.test.ts` where mocked AI ignores `requiredLinks` and `suggestedLinks`. Assert the returned body contains `## Related Wiki Pages`, `[[openclaw-operational-coordination|OpenClaw operational coordination]]`, and `## Provenance`.
- [ ] Implement repair helpers in `packages/core/src/wiki/curate.ts`:

```ts
function extractBodyWikilinkSlugs(body: string): Set<string>;
function relationshipLinksFromContext(context?: SynthesisContext): StructuredLink[];
function ensureRelatedLinksSection(body: string, context?: SynthesisContext): string;
function ensureProvenanceSection(body: string, cluster: WikiEvidenceCluster): string;
function repairWikiBody(body: string, cluster: WikiEvidenceCluster, context?: SynthesisContext): string;
```

Rules:

- required links always get appended when missing;
- if there are suggested links and the body has no valid context wikilink, append up to three suggested links;
- no invented links;
- suggested/required links use canonical stable page slugs, not display-title slugs when those differ;
- provenance is generated from `cluster.source_refs` and `cluster.source_hashes`;
- do not repair private-material bodies.

- [ ] Call `repairWikiBody()` after choosing AI or rebuilt body in `proposalFromAiJson()` and in degraded synthesis.
- [ ] Run:

```bash
pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-curator-ai.test.js
```

Expected: AI curator tests pass.

## Task 3: Prompt Contract

- [ ] Update `packages/core/src/wiki/curator-prompt.ts` system instructions to require the page sections, forbid raw source copying, and explain the exact relationship link format.
- [ ] Add prompt assertions to an existing `buildWikiCuratorPrompt` test or the new repair test:

```ts
assert.match(prompt.system, /compiled wiki article/i);
assert.match(prompt.user, /required_sections/);
assert.match(prompt.user, /Related Wiki Pages/);
```

- [ ] Run the same `wiki-curator-ai` test command.

## Task 4: End-To-End Regression

- [ ] Add focused regressions for stable-page id slugs, title/path alias resolution, resolver-valid related links, and clickable rendered wikilinks.
- [ ] Implement canonical slug loading from frontmatter id or target path, graph alias resolution, strict related-page promotion checks, and inline wikilink rendering.

- [ ] Run:

```bash
pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-promotion-quality.test.js dist-tests/tests/core/wiki-curator-ai.test.js dist-tests/tests/cli/wiki-compiler-core-redesign-e2e.test.js
```

Expected: the controlled e2e still reports graph links and fewer pages than evidence items.

- [ ] Run full check:

```bash
pnpm check
```

Expected: all tests pass.

## Task 5: Commit

- [ ] Stage only source, docs, and tests. Do not stage generated `kb/`, `dist/`, or `.praxisbase` artifacts.
- [ ] Commit:

```bash
git add docs/superpowers/specs/2026-05-24-wiki-synthesis-quality-and-promotion-design.md \
  docs/superpowers/plans/2026-05-24-wiki-synthesis-quality-and-promotion-implementation-plan.md \
  docs/openspec/changes/wiki-synthesis-quality-and-promotion \
  docs/bdd/wiki-synthesis-quality-and-promotion.feature \
  packages/core/src/wiki/curator-prompt.ts \
  packages/core/src/wiki/curate.ts \
  packages/core/src/wiki/promotion-quality.ts \
  tests/core/wiki-curator-ai.test.ts \
  tests/core/wiki-promotion-quality.test.ts
git commit -m "fix: enforce wiki synthesis quality contract"
```

## Task 6: Real-Run Quality Follow-Up

- [ ] Add a failing promotion-quality test proving a single-source one-off acceptance/smoke/run report is marked `one_off_run_report` even when actionability guards pass.
- [ ] Add a failing curation test proving an existing pending proposal with the same `target_path` is removed before writing the current proposal.
- [ ] Add a failing curator repair test proving a stray leading `n` before a markdown bullet is normalized.
- [ ] Implement the smallest quality-gate and curation-writer changes needed to pass those tests:
  - add `one_off_run_report` to human-required quality reasons;
  - detect one-off run/report signatures only for single-source proposals;
  - remove stale pending `wiki_curated_proposal` files keyed by the same target path before review writes;
  - normalize the narrow `n*` / `n-` bullet artifact during deterministic repair.
- [ ] Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-promotion-quality.test.js dist-tests/tests/core/wiki-curation.test.js dist-tests/tests/core/wiki-curator-ai.test.js
pnpm check
```
