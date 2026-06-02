# Wiki Linking And Merge Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the wiki compiler produce connected canonical pages by planning relationships, rewriting duplicate creates into update/merge plans, requiring wikilinks where related pages exist, and explaining link/merge quality in reports and HTML.

**Architecture:** Add a deterministic relationship planner between topic planning and AI synthesis. Feed required/suggested links and merge candidates into the curator prompt, then enforce them through promotion quality and surface them in reports/site. Keep stable writes behind review/promote.

**Tech Stack:** TypeScript, zod, Node test runner, existing `packages/core/src/wiki/*` modules, existing CLI tests.

---

## File Map

- Create `packages/core/src/wiki/relationship-planner.ts`
  - Relationship scoring between `WikiTopic` and existing wiki pages.
  - Required/suggested link derivation.
  - Merge/update target selection.
- Modify `packages/core/src/wiki/curation-model.ts`
  - Add relationship schemas and optional fields on curated proposals/report compiler counts.
- Modify `packages/core/src/wiki/topic-planner.ts`
  - Carry relationship data into page plans or expose stable page matching helpers.
- Modify `packages/core/src/wiki/curator-prompt.ts`
  - Include required links, suggested links, merge candidates, and relationship reasons.
- Modify `packages/core/src/wiki/curate.ts`
  - Call relationship planner after topics/page plans and before synthesis.
  - Add relationship counts to report.
  - Preserve relationship fields on proposals.
- Modify `packages/core/src/wiki/promotion-quality.ts`
  - Enforce missing required links and ambiguous/cross-scope merge reasons.
- Modify `packages/core/src/wiki/proposal-candidates.ts`
  - Pass relationship fields into review render candidates.
- Modify `packages/core/src/wiki/render-site.ts`
  - Show relationship counts, required links, merge targets, and orphan risk.
- Tests:
  - `tests/core/wiki-relationship-planner.test.ts`
  - `tests/core/wiki-curator-ai.test.ts`
  - `tests/core/wiki-curation.test.ts`
  - `tests/core/wiki-promotion-quality.test.ts`
  - `tests/core/wiki-render-site.test.ts`
  - `tests/cli/wiki-compiler-core-redesign-e2e.test.ts`

## Task 1: Relationship Planner Schema And Core

**Files:**
- Modify: `packages/core/src/wiki/curation-model.ts`
- Create: `packages/core/src/wiki/relationship-planner.ts`
- Test: `tests/core/wiki-relationship-planner.test.ts`

- [ ] Add failing tests for deterministic relationship scoring:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWikiRelationshipPlans } from "@praxisbase/core/wiki/relationship-planner.js";

describe("buildWikiRelationshipPlans", () => {
  it("marks same source hash as canonical and required", () => {
    const plans = buildWikiRelationshipPlans({
      topics: [{
        id: "topic_ack",
        key: "personal:known_fix:openclaw:ack:send-accepted-first",
        title: "OpenClaw ACK timing",
        page_kind: "known_fix",
        scope: "personal",
        observation_ids: ["obs_1"],
        source_refs: ["raw-vault://codex/ack"],
        source_hashes: ["sha256:ack"],
        entities: ["openclaw", "ack"],
        problem: "OpenClaw waits too long before acknowledging delegated tasks",
        action: "Send accepted ack before async processing",
        confidence: 0.91,
      }],
      existingPages: [{
        id: "openclaw-ack-timing",
        path: "kb/known-fixes/openclaw-ack-timing.md",
        title: "OpenClaw ACK timing",
        slug: "openclaw-ack-timing",
        page_kind: "known_fix",
        scope: "personal",
        source_hashes: ["sha256:ack"],
        signatures: ["openclaw:ack"],
        body_text: "Existing ACK page.",
      }],
    });

    assert.equal(plans.length, 1);
    assert.equal(plans[0].strength, "canonical");
    assert.equal(plans[0].required_link, true);
    assert.ok(plans[0].reasons.includes("shared_source_hash"));
  });
});
```

- [ ] Run the test and verify it fails:

```bash
npx tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-relationship-planner.test.js
```

Expected: module or function is missing.

- [ ] Implement exported types and planner:

```ts
export type WikiRelationshipStrength = "canonical" | "strong" | "related" | "weak";

export interface WikiRelationshipPlan {
  topic_id: string;
  target_page_id: string;
  target_path: string;
  target_title: string;
  target_slug: string;
  strength: WikiRelationshipStrength;
  reasons: string[];
  required_link: boolean;
  suggested_label: string;
  merge_candidate: boolean;
}

export function buildWikiRelationshipPlans(input: {
  topics: WikiTopic[];
  existingPages: ExistingWikiPage[];
  maxRelatedPerTopic?: number;
}): WikiRelationshipPlan[] {
  const limit = input.maxRelatedPerTopic ?? 5;
  const plans: WikiRelationshipPlan[] = [];
  for (const topic of input.topics) {
    const scored = input.existingPages.flatMap((page) => {
      const reasons: string[] = [];
      if (intersects(topic.source_hashes, page.source_hashes)) reasons.push("shared_source_hash");
      if (intersects(topic.signatures ?? [], page.signatures)) reasons.push("shared_signature");
      if (normalize(topic.title) === normalize(page.title) || normalize(topic.title) === page.slug) reasons.push("same_title_or_slug");
      if (intersects(topic.entities, page.entities ?? [])) reasons.push("entity_overlap");
      if (overlaps(topic.problem, page.body_text) && overlaps(topic.action, page.body_text)) reasons.push("problem_action_overlap");
      if (reasons.length === 0) return [];
      const strength = relationshipStrength(reasons);
      return [{
        topic_id: topic.id,
        target_page_id: page.id,
        target_path: page.path,
        target_title: page.title,
        target_slug: page.slug,
        strength,
        reasons,
        required_link: strength === "canonical" || strength === "strong",
        suggested_label: page.title,
        merge_candidate: strength === "canonical",
      }];
    });
    plans.push(...scored.sort(compareRelationshipPlans).slice(0, limit));
  }
  return plans.sort(compareRelationshipPlans);
}

function relationshipStrength(reasons: string[]): WikiRelationshipStrength {
  if (reasons.includes("shared_source_hash") || reasons.includes("same_title_or_slug")) return "canonical";
  if (reasons.includes("shared_signature") || reasons.includes("problem_action_overlap")) return "strong";
  if (reasons.includes("entity_overlap")) return "related";
  return "weak";
}

function compareRelationshipPlans(a: WikiRelationshipPlan, b: WikiRelationshipPlan): number {
  const rank: Record<WikiRelationshipStrength, number> = { canonical: 0, strong: 1, related: 2, weak: 3 };
  return rank[a.strength] - rank[b.strength]
    || a.target_title.localeCompare(b.target_title)
    || a.target_path.localeCompare(b.target_path)
    || a.topic_id.localeCompare(b.topic_id);
}

function intersects(left: string[] = [], right: string[] = []): boolean {
  const normalized = new Set(left.map(normalize).filter(Boolean));
  return right.some((item) => normalized.has(normalize(item)));
}

function normalize(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim().replace(/\s+/g, " ");
}

function overlaps(left: string | undefined, right: string | undefined): boolean {
  const leftTokens = normalize(left).split(" ").filter((item) => item.length >= 3);
  const rightText = normalize(right);
  return leftTokens.length > 0 && leftTokens.some((token) => rightText.includes(token));
}
```

- [ ] Re-run:

```bash
npx tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-relationship-planner.test.js
```

Expected: relationship planner tests pass.

- [ ] Commit:

```bash
git add packages/core/src/wiki/curation-model.ts packages/core/src/wiki/relationship-planner.ts tests/core/wiki-relationship-planner.test.ts
git commit -m "feat: add wiki relationship planner"
```

## Task 2: Page Plan Link/Merge Decisions

**Files:**
- Modify: `packages/core/src/wiki/topic-planner.ts`
- Modify: `packages/core/src/wiki/curate.ts`
- Test: `tests/core/wiki-curation.test.ts`

- [ ] Add failing tests:

```ts
it("rewrites create to update when a canonical stable page exists", async () => {
  // Create a stable kb page with matching title/source hash.
  // Run curate dry-run against new ACK evidence.
  // Assert compiler_counts.page_plans_by_action.update === 1.
  // Assert create count is 0 for that topic.
});

it("records merge plan when multiple canonical stable pages match", async () => {
  // Create two stable pages matching the same topic key.
  // Run curate dry-run.
  // Assert compiler_counts.relationship_counts.merge_plans === 1.
  // Assert human-required quality count increments.
});
```

- [ ] Run targeted test and verify failure:

```bash
npx tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-curation.test.js
```

- [ ] Wire relationship plans into page planning:

```ts
const relationshipPlans = buildWikiRelationshipPlans({ topics, existingPages });
const pagePlans = planWikiPages(root, topics, { relationships: relationshipPlans });
```

Implementation rules:

- one canonical target -> `update`;
- multiple canonical targets -> `merge` and `ambiguous_merge_target`;
- strong targets -> `create` with `required_links`;
- related targets -> `create` with `suggested_links`.

- [ ] Re-run wiki curation tests.

- [ ] Commit:

```bash
git add packages/core/src/wiki/topic-planner.ts packages/core/src/wiki/curate.ts tests/core/wiki-curation.test.ts
git commit -m "feat: plan wiki links and merges"
```

## Task 3: AI Prompt Receives Required Links

**Files:**
- Modify: `packages/core/src/wiki/curator-prompt.ts`
- Modify: `packages/core/src/wiki/curate.ts`
- Test: `tests/core/wiki-curator-ai.test.ts`

- [ ] Add failing test with fake AI client:

```ts
it("passes required links and merge candidates into the curator prompt", async () => {
  // Fake AI client captures prompt.user.
  // Plan contains required link openclaw-auth-expired.
  // Assert prompt.user includes required_links, slug, label, path, and merge_candidates.
});
```

- [ ] Run:

```bash
npx tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-curator-ai.test.js
```

- [ ] Extend synthesis context:

```ts
interface SynthesisContext {
  existingPage?: ExistingWikiPage;
  relatedPages: ExistingWikiPage[];
  requiredLinks?: Array<{ slug: string; label: string; path: string; reason: string }>;
  suggestedLinks?: Array<{ slug: string; label: string; path: string; reason: string }>;
  mergeCandidates?: Array<{ title: string; path: string; reason: string }>;
  relationshipReasons?: string[];
}
```

- [ ] Update prompt text to require `[[slug|label]]` for required links and forbid invented links.

- [ ] Re-run tests and commit:

```bash
git add packages/core/src/wiki/curator-prompt.ts packages/core/src/wiki/curate.ts tests/core/wiki-curator-ai.test.ts
git commit -m "feat: pass wiki link requirements to curator"
```

## Task 4: Proposal Schema And Quality Gate

**Files:**
- Modify: `packages/core/src/wiki/curation-model.ts`
- Modify: `packages/core/src/wiki/promotion-quality.ts`
- Test: `tests/core/wiki-promotion-quality.test.ts`

- [ ] Add failing tests:

```ts
it("requires human review when required wikilinks are missing", () => {
  const result = assessWikiPromotionQuality(proposalWithoutRequiredLinks, {
    relatedPages: [{ slug: "openclaw-auth-expired", path: "kb/known-fixes/openclaw-auth-expired.md" }],
    requiredLinks: [{ slug: "openclaw-auth-expired", label: "OpenClaw auth expired", path: "kb/known-fixes/openclaw-auth-expired.md", reason: "shared_signature" }],
  });
  assert.ok(result.human_required.includes("missing_wikilinks"));
});

it("allows isolated high-signal page when no related pages exist", () => {
  const result = assessWikiPromotionQuality(isolatedHighSignalProposal, { relatedPages: [], requiredLinks: [] });
  assert.equal(result.human_required.includes("missing_wikilinks"), false);
});
```

- [ ] Run:

```bash
npx tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-promotion-quality.test.js
```

- [ ] Add optional proposal fields:

```ts
related_pages: z.array(RelatedWikiPageSchema).default([]).optional(),
required_links: z.array(WikiRequiredLinkSchema).default([]).optional(),
suggested_links: z.array(WikiRequiredLinkSchema).default([]).optional(),
merge_candidates: z.array(WikiMergeCandidateSchema).default([]).optional(),
relationship_reasons: z.array(z.string()).default([]).optional(),
```

- [ ] Implement required link validation by parsing body wikilinks and matching required slugs.

- [ ] Re-run tests and commit:

```bash
git add packages/core/src/wiki/curation-model.ts packages/core/src/wiki/promotion-quality.ts tests/core/wiki-promotion-quality.test.ts
git commit -m "feat: gate wiki proposals on required links"
```

## Task 5: Reports And HTML Explainability

**Files:**
- Modify: `packages/core/src/wiki/curate.ts`
- Modify: `packages/core/src/wiki/proposal-candidates.ts`
- Modify: `packages/core/src/wiki/render-site.ts`
- Test: `tests/core/wiki-render-site.test.ts`
- Test: `tests/cli/wiki-curate-command.test.ts`

- [ ] Add failing report test:

```ts
assert.equal(report.compiler_counts.relationship_counts.required_links, 2);
assert.equal(report.compiler_counts.relationship_counts.merge_plans, 1);
assert.equal(report.compiler_counts.relationship_counts.orphan_risk_after_plan, 0);
```

- [ ] Add failing site test:

```ts
assert.ok(review.includes("Required links"));
assert.ok(review.includes("Merge candidates"));
assert.ok(review.includes("Relationship reasons"));
assert.ok(index.includes("Orphan risk after plan"));
```

- [ ] Implement report count aggregation in `curate.ts`.

- [ ] Pass proposal relationship fields through `proposal-candidates.ts`.

- [ ] Render fields in `render-site.ts` candidate cards and Wiki Compiler section.

- [ ] Run:

```bash
pnpm --filter @praxisbase/core build
npx tsc -p tsconfig.tests.json
node --test dist-tests/tests/core/wiki-render-site.test.js dist-tests/tests/cli/wiki-curate-command.test.js
```

- [ ] Commit:

```bash
git add packages/core/src/wiki/curate.ts packages/core/src/wiki/proposal-candidates.ts packages/core/src/wiki/render-site.ts tests/core/wiki-render-site.test.ts tests/cli/wiki-curate-command.test.ts
git commit -m "feat: explain wiki links and merges in reports"
```

## Task 6: End-To-End Orphan Reduction Regression

**Files:**
- Modify: `tests/cli/wiki-compiler-core-redesign-e2e.test.ts`

- [ ] Add fixture:

```ts
// 6 ACK timing captures, 4 stdin-closed captures, 2 existing stable pages.
// Run wiki curate --review with fake AI output that includes required links.
// Run review auto/promote where policy permits personal low-risk proposals.
// Run wiki build-site.
// Assert pages < evidence count and orphans < pages.
```

- [ ] Run:

```bash
npx tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/wiki-compiler-core-redesign-e2e.test.js
```

- [ ] Run full verification:

```bash
pnpm check
```

- [ ] Do not commit generated `kb/`, `.praxisbase/`, or `dist/` unless explicitly requested.

- [ ] Commit:

```bash
git add tests/cli/wiki-compiler-core-redesign-e2e.test.ts
git commit -m "test: prove wiki linking reduces orphan pages"
```

## Final Verification

- [ ] Run focused wiki suite:

```bash
node --test \
  dist-tests/tests/core/wiki-relationship-planner.test.js \
  dist-tests/tests/core/wiki-curation.test.js \
  dist-tests/tests/core/wiki-curator-ai.test.js \
  dist-tests/tests/core/wiki-promotion-quality.test.js \
  dist-tests/tests/core/wiki-render-site.test.js \
  dist-tests/tests/cli/wiki-curate-command.test.js \
  dist-tests/tests/cli/wiki-compiler-core-redesign-e2e.test.js
```

- [ ] Run full check:

```bash
pnpm check
```

- [ ] Optional local smoke, artifacts uncommitted:

```bash
node packages/cli/dist/index.js wiki curate --review --json
node packages/cli/dist/index.js wiki build-site --json
```

- [ ] Inspect status:

```bash
git status --short
```

Expected: only intended source/test/docs changes are committed; generated `kb/`, `.praxisbase/`, and `dist/` are uncommitted unless explicitly approved.
