# Wiki Curation Synthesis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curation/synthesis layer that turns raw agent evidence into a small set of provenance-rich wiki proposals, with policy-driven auto review for personal mode.

**Architecture:** Add focused `packages/core/src/wiki/curate.ts` and `packages/core/src/wiki/curation-model.ts` modules between `wiki compile` and `review/promote`. Deterministic code owns evidence filtering, clustering, path guards, privacy gates, source hashes, reports, and policy decisions; AI owns page synthesis from safe evidence clusters. CLI commands expose `praxisbase wiki curate` and review policy initialization while keeping stable `kb/` and `skills/` mutations inside existing review/promote paths.

**Tech Stack:** TypeScript, Node.js, Commander CLI, Zod schemas, existing PraxisBase protocol/file-store helpers, existing AI client/distill modules, node:test, mocked AI clients.

---

## File Structure

- Create `packages/core/src/wiki/curation-model.ts`: `WikiEvidenceItem`, `WikiEvidenceCluster`, `CuratedWikiProposal`, `WikiCurationReport`, Zod schemas and converters.
- Create `packages/core/src/wiki/curate.ts`: evidence pool builder, noise/privacy filters, clustering, AI synthesis orchestration, proposal writer and report writer.
- Create `packages/core/src/wiki/curator-prompt.ts`: prompt and AI JSON schema for cluster-to-page synthesis.
- Modify `packages/core/src/wiki/proposal-candidates.ts`: recognize `wiki_curated_proposal` records and expose curated proposal metadata before raw candidates.
- Modify `packages/core/src/wiki/render-site.ts` and `packages/core/src/wiki/site-model.ts`: dashboard counts should use curated proposals as the primary pending queue.
- Modify `packages/core/src/experience/daily.ts` and `packages/core/src/experience/harvest.ts`: run curate after compile when AI is configured, with degraded behavior explicit.
- Create `packages/core/src/review/policy.ts`: review policy schema and decision helper for personal/team defaults.
- Modify `packages/cli/src/commands/wiki.ts`: add `wiki curate --dry-run|--review --json --degraded`.
- Modify `packages/cli/src/commands/review.ts`: add policy init and promote-approved path over approved low-risk curated proposals.
- Modify `packages/cli/src/index.ts`: wire new review policy subcommands if needed.
- Modify `packages/core/src/index.ts`: export curation and review policy APIs.
- Test `tests/core/wiki-curation.test.ts`, `tests/core/wiki-curator-ai.test.ts`, `tests/core/review-policy.test.ts`, `tests/cli/wiki-curate-command.test.ts`, `tests/cli/review-policy-command.test.ts`, and update `tests/core/wiki-render-site.test.ts`, `tests/cli/review-promote.test.ts`, `tests/cli/daily-command.test.ts`.

## Task 1: Curation Model And Schema

**Files:**
- Create: `packages/core/src/wiki/curation-model.ts`
- Modify: `packages/core/src/index.ts`
- Test: `tests/core/wiki-curation.test.ts`

- [ ] **Step 1: Write failing schema tests**

Add tests for strict parsing, source provenance arrays, and curated proposal conversion to a reviewable proposal.

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { CuratedWikiProposalSchema, curatedWikiProposalToKnowledgeProposal } from "@praxisbase/core";

test("curated proposal requires multi-source provenance fields", () => {
  const proposal = CuratedWikiProposalSchema.parse({
    id: "wiki_curated_openclaw_auth",
    protocol_version: "0.1",
    type: "wiki_curated_proposal",
    target_path: "kb/known-fixes/openclaw-auth-expired.md",
    action: "create",
    page_kind: "known_fix",
    scope: "personal",
    title: "OpenClaw auth expired recovery",
    summary: "Refresh OpenClaw login before retrying memory sync.",
    body_markdown: "# OpenClaw auth expired recovery\n\n## Problem\nOpenClaw memory sync fails after auth expiry.",
    source_refs: ["codex:session:1", "openclaw:memory:2"],
    source_hashes: ["sha256:a", "sha256:b"],
    source_count: 2,
    evidence_ids: ["ev_1", "ev_2"],
    confidence: 0.9,
    maturity: "draft",
    provenance: [
      { source_ref: "codex:session:1", source_hash: "sha256:a" },
      { source_ref: "openclaw:memory:2", source_hash: "sha256:b" }
    ],
    review_hint: { why_review: "Repeated successful repair", suggested_decision: "approve", risk_notes: [] },
    guards: [{ id: "path", ok: true, message: "allowed" }],
    created_at: "2026-05-21T00:00:00.000Z"
  });

  assert.equal(proposal.source_count, 2);
  assert.deepEqual(proposal.source_hashes, ["sha256:a", "sha256:b"]);
});

test("curated proposal can become existing knowledge proposal", () => {
  const knowledge = curatedWikiProposalToKnowledgeProposal({
    id: "wiki_curated_openclaw_auth",
    protocol_version: "0.1",
    type: "wiki_curated_proposal",
    target_path: "kb/known-fixes/openclaw-auth-expired.md",
    action: "create",
    page_kind: "known_fix",
    scope: "personal",
    title: "OpenClaw auth expired recovery",
    summary: "Refresh OpenClaw login before retrying memory sync.",
    body_markdown: "# OpenClaw auth expired recovery\n",
    source_refs: ["codex:session:1"],
    source_hashes: ["sha256:a"],
    source_count: 1,
    evidence_ids: ["ev_1"],
    confidence: 0.92,
    maturity: "draft",
    provenance: [{ source_ref: "codex:session:1", source_hash: "sha256:a" }],
    review_hint: { why_review: "Low risk personal fix", suggested_decision: "approve", risk_notes: [] },
    guards: [{ id: "path", ok: true, message: "allowed" }],
    created_at: "2026-05-21T00:00:00.000Z"
  });

  assert.equal(knowledge.type, "knowledge_proposal");
  assert.equal(knowledge.target_type, "known_fix");
  assert.equal(knowledge.patch.path, "kb/known-fixes/openclaw-auth-expired.md");
});
```

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-curation.test.js
```

Expected before implementation: compile failure because curation exports do not exist.

- [ ] **Step 2: Implement model and converter**

Define strict Zod schemas for:

```ts
export const WikiEvidenceItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["capture", "episode", "native_memory", "distilled_experience", "proposal_candidate", "external_ref"]),
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  agent: z.enum(["codex", "openclaw", "claude-code", "opencode", "generic"]).optional(),
  scope: z.enum(["personal", "project", "team", "org", "global"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  problem: z.string().optional(),
  context: z.string().optional(),
  actions: z.array(z.string()).default([]),
  failed_attempts: z.array(z.string()).default([]),
  outcome: z.enum(["success", "failed", "partial", "unknown"]).optional(),
  verification: z.array(z.string()).default([]),
  reusable_lessons: z.array(z.string()).default([]),
  signatures: z.array(z.string()).default([]),
  suggested_wiki_kind: z.enum(["known_fix", "procedure", "decision", "pitfall", "preference", "incident", "note", "skill"]).optional(),
  privacy_verdict: z.enum(["safe", "personal_only", "team_allowed", "human_required", "reject"]),
  created_at: z.string().optional()
});
```

The converter must map `page_kind` to existing `target_type`, build a `knowledge_proposal`, and keep `source_refs` as evidence refs.

- [ ] **Step 3: Export APIs**

Add exports in `packages/core/src/index.ts`:

```ts
export * from "./wiki/curation-model.js";
```

- [ ] **Step 4: Verify**

Run:

```bash
pnpm check
```

Expected: all tests pass.

## Task 2: Evidence Pool And Noise Filtering

**Files:**
- Create: `packages/core/src/wiki/curate.ts`
- Modify: `packages/core/src/wiki/compile.ts` only if shared helpers should move
- Test: `tests/core/wiki-curation.test.ts`

- [ ] **Step 1: Add failing evidence pool tests**

Add fixtures that include a good distilled OpenClaw auth experience, `session_meta`, `base_instructions`, `openclaw:unknown`, and an empty Deep Sleep promotion log.

```ts
import { buildWikiEvidencePool } from "@praxisbase/core";

test("evidence pool suppresses operational noise", async () => {
  const pool = await buildWikiEvidencePool([
    source("good", "OpenClaw auth expired", "Refresh login fixed memory sync."),
    source("meta", "meta", "{\"type\":\"session_meta\"}"),
    source("instructions", "instructions", "{\"base_instructions\":\"never include\"}"),
    source("unknown", "unknown", "openclaw:unknown"),
    source("sleep", "Deep Sleep", "# Deep Sleep\nPromoted 0 candidate(s)")
  ]);

  assert.deepEqual(pool.items.map((item) => item.id), ["good"]);
  assert.equal(pool.filtered_noise, 4);
});
```

Run the targeted test and confirm failure before implementation.

- [ ] **Step 2: Implement `buildWikiEvidencePool`**

Implement:

```ts
export async function buildWikiEvidencePoolFromRoot(root: string): Promise<WikiEvidencePool>;
export function buildWikiEvidencePool(sources: WikiSource[]): WikiEvidencePool;
```

Rules:

- call `collectWikiSources(root)` and `analyzeWikiSource(source)`;
- include safe `capture`, `episode`, `native_memory`, `external_ref`, and existing `wiki_proposal_candidate` records;
- prefer `DistilledExperience` fields when present in source body or summary JSON;
- preserve real `source_ref` and `source_hash`;
- route private material to `human_required`;
- route operational noise to `filtered_noise`;
- do not write files in this task.

- [ ] **Step 3: Verify**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-curation.test.js
```

Expected: evidence pool tests pass.

## Task 3: Cluster And Dedupe

**Files:**
- Modify: `packages/core/src/wiki/curate.ts`
- Test: `tests/core/wiki-curation.test.ts`

- [ ] **Step 1: Add failing cluster tests**

```ts
import { clusterWikiEvidence } from "@praxisbase/core";

test("similar successful evidence becomes one cluster", () => {
  const clusters = clusterWikiEvidence([
    evidence("ev1", { title: "OpenClaw auth expired", signatures: ["openclaw:auth-expired"], source_ref: "codex:1" }),
    evidence("ev2", { title: "OpenClaw login expired", signatures: ["openclaw:auth-expired"], source_ref: "openclaw:2" })
  ]);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].source_count, 2);
  assert.deepEqual(clusters[0].source_refs.sort(), ["codex:1", "openclaw:2"]);
});
```

- [ ] **Step 2: Implement clustering**

Cluster key order:

1. exact non-source-specific signature;
2. normalized target path hint;
3. normalized title;
4. `suggested_wiki_kind + first reusable lesson hash`.

Use deterministic stable sort by cluster key and source refs. Conflicting scopes must not merge unless both are `personal` or both are `project`; team/org clusters require exact scope match.

- [ ] **Step 3: Verify**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-curation.test.js
```

Expected: pool and cluster tests pass.

## Task 4: AI Curator Synthesis

**Files:**
- Create: `packages/core/src/wiki/curator-prompt.ts`
- Modify: `packages/core/src/wiki/curate.ts`
- Test: `tests/core/wiki-curator-ai.test.ts`

- [ ] **Step 1: Write mocked AI tests**

```ts
import { synthesizeCuratedWikiProposal } from "@praxisbase/core";

test("AI curator creates wiki-shaped proposal from evidence cluster", async () => {
  const result = await synthesizeCuratedWikiProposal(clusterFixture, {
    now: "2026-05-21T00:00:00.000Z",
    client: {
      async generateJson() {
        return {
          ok: true,
          json: {
            title: "OpenClaw auth expired recovery",
            summary: "Refresh login before retrying memory sync.",
            page_kind: "known_fix",
            target_path: "kb/known-fixes/openclaw-auth-expired.md",
            body_markdown: "# OpenClaw auth expired recovery\n\n## Problem\nMemory sync fails after auth expiry.\n\n## Fix\nRefresh login and retry sync.\n\n## Verification\nRun memory sync again.",
            confidence: 0.91,
            risk_notes: []
          }
        };
      }
    }
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.proposal.source_count, 2);
    assert.match(result.proposal.body_markdown, /## Verification/);
  }
});
```

Add failure cases for invalid JSON, unsafe target path, missing provenance, body containing private material, and low confidence.

- [ ] **Step 2: Implement prompt builder**

Prompt rules:

- input is only the cluster summary and safe evidence fields;
- output JSON only;
- body must be wiki article shaped;
- include problem, applicability, steps, failed attempts when present, verification, risks, and provenance section;
- never copy raw transcript;
- never include secrets or auth material.

- [ ] **Step 3: Implement synthesis**

`synthesizeCuratedWikiProposal(cluster, options)` returns:

```ts
type CuratedProposalResult =
  | { ok: true; proposal: CuratedWikiProposal }
  | { ok: false; category: "ai_error" | "schema_error" | "guard_error" | "privacy_error"; error: string };
```

Deterministic guards:

- `isAllowedWikiPatchPath(target_path)`;
- `containsPrivateMaterial(body_markdown) === false`;
- source refs/hashes equal cluster refs/hashes;
- confidence between 0 and 1;
- body contains at least a heading and one actionable section;
- team proposal cannot include personal evidence.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-curator-ai.test.js
```

Expected: mocked AI tests pass without network calls.

## Task 5: Curation Runner And CLI

**Files:**
- Modify: `packages/core/src/wiki/curate.ts`
- Modify: `packages/cli/src/commands/wiki.ts`
- Modify: `packages/core/src/index.ts`
- Test: `tests/cli/wiki-curate-command.test.ts`

- [ ] **Step 1: Write CLI tests**

```ts
test("wiki curate dry-run writes report only", async () => {
  const root = await fixtureWorkspace();
  await writeGoodEvidence(root);
  const result = await runCli(root, ["wiki", "curate", "--dry-run", "--degraded", "--json"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /wiki_curation_report/);
  assert.equal(await countFiles(root, ".praxisbase/inbox/proposals"), 0);
  assert.equal(await countFiles(root, ".praxisbase/reports/wiki-curation"), 1);
});

test("wiki curate review writes curated proposals", async () => {
  const root = await fixtureWorkspace();
  await writeGoodEvidence(root);
  const result = await runCli(root, ["wiki", "curate", "--review", "--degraded", "--json"]);

  assert.equal(result.status, 0);
  assert.equal(await countJsonByType(root, ".praxisbase/inbox/proposals", "wiki_curated_proposal"), 1);
});
```

- [ ] **Step 2: Implement runner**

`curateWiki(root, options)` should:

1. build evidence pool;
2. cluster evidence;
3. synthesize proposals with AI client or degraded deterministic body builder;
4. write report under `.praxisbase/reports/wiki-curation/`;
5. in review mode write `.praxisbase/inbox/proposals/<id>.json`;
6. never write `kb/`, `skills/`, or `dist/`.

- [ ] **Step 3: Wire CLI**

Add:

```bash
praxisbase wiki curate --dry-run --json
praxisbase wiki curate --review --json
praxisbase wiki curate --review --degraded --json
```

If AI config is missing and `--degraded` is not set, fail with:

```json
{ "ok": false, "code": "AI_CURATOR_NOT_CONFIGURED" }
```

- [ ] **Step 4: Verify**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/wiki-curate-command.test.js
```

Expected: CLI tests pass.

## Task 6: Review Policy And Personal Auto Review

**Files:**
- Create: `packages/core/src/review/policy.ts`
- Modify: `packages/cli/src/commands/review.ts`
- Modify: `packages/cli/src/commands/promote.ts` only if approved promotion needs a reusable helper
- Test: `tests/core/review-policy.test.ts`
- Test: `tests/cli/review-policy-command.test.ts`
- Test: `tests/cli/review-promote.test.ts`

- [ ] **Step 1: Write policy tests**

```ts
import { defaultReviewPolicy, decideAutoReview } from "@praxisbase/core";

test("personal low-risk known fix can auto promote", () => {
  const decision = decideAutoReview(curatedProposal({ scope: "personal", page_kind: "known_fix", confidence: 0.9 }), defaultReviewPolicy("personal"));
  assert.equal(decision.auto_review, true);
  assert.equal(decision.auto_promote, true);
});

test("team proposal is not auto promoted by default", () => {
  const decision = decideAutoReview(curatedProposal({ scope: "team", page_kind: "known_fix", confidence: 0.95 }), defaultReviewPolicy("team"));
  assert.equal(decision.auto_review, true);
  assert.equal(decision.auto_promote, false);
  assert.match(decision.reason, /team/i);
});

test("skill target requires human in personal mode", () => {
  const decision = decideAutoReview(curatedProposal({ scope: "personal", page_kind: "skill", confidence: 0.95 }), defaultReviewPolicy("personal"));
  assert.equal(decision.auto_promote, false);
  assert.equal(decision.human_required, true);
});
```

- [ ] **Step 2: Implement policy schema**

Create:

```ts
export interface ReviewPolicy {
  mode: "personal" | "team";
  auto_review: boolean;
  auto_promote: "off" | "low_risk_personal_only" | "low_risk_team_with_gate";
  require_human_for: string[];
  min_confidence: number;
  min_source_count_for_auto_promote: number;
}

export function defaultReviewPolicy(mode: "personal" | "team"): ReviewPolicy;
export async function writeReviewPolicy(root: string, mode: "personal" | "team"): Promise<ReviewPolicy>;
export async function readReviewPolicy(root: string): Promise<ReviewPolicy>;
export function decideAutoReview(proposal: CuratedWikiProposal, policy: ReviewPolicy): AutoReviewDecision;
```

Decision rules:

- secrets/privacy guard failure always human-required;
- scope escalation always human-required;
- team/org/global target never auto-promotes under personal policy;
- `skill`, `policy`, `archive`, `supersede`, and update existing stable page require human by default;
- confidence below policy threshold requires human;
- personal `known_fix`, `procedure`, `pitfall`, `note` may auto-promote if all guards pass.

- [ ] **Step 3: Wire CLI**

Add:

```bash
praxisbase review policy init --mode personal --json
praxisbase review policy init --mode team --json
praxisbase review auto --json
praxisbase review auto --promote-approved --json
```

`review auto` should convert curated proposals through existing reviewer, write review records, and route human-required decisions to exceptions. `--promote-approved` should call the existing promotion helper only for policy-approved low-risk proposals.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/review-policy.test.js dist-tests/tests/cli/review-policy-command.test.js dist-tests/tests/cli/review-promote.test.js
```

Expected: personal auto-review tests pass and team defaults do not auto-promote.

## Task 7: Daily, Harvest, Review Page, And Site Integration

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/core/src/experience/harvest.ts`
- Modify: `packages/core/src/wiki/proposal-candidates.ts`
- Modify: `packages/core/src/wiki/site-model.ts`
- Modify: `packages/core/src/wiki/render-site.ts`
- Modify: `packages/core/src/wiki/site-assets.ts`
- Test: `tests/cli/daily-command.test.ts`
- Test: `tests/core/wiki-render-site.test.ts`

- [ ] **Step 1: Write integration tests**

Add tests proving:

- daily personal with AI configured runs curate after compile;
- daily degraded marks curation as degraded and production_ready false;
- review/dashboard counts curated proposals as primary pending count;
- raw candidates are available only as secondary/debug counts;
- `dist/index.html` contains actionable curated proposal links.

- [ ] **Step 2: Integrate daily and harvest**

Daily flow:

```text
source discovery -> harvest -> ai distill -> wiki compile -> wiki curate -> optional review auto -> build-site
```

Production without AI should fail unless `--degraded` or `--no-ai` is explicit.

- [ ] **Step 3: Update proposal collection**

`collectPendingWikiProposalCandidates` should return curated proposals first. Keep raw `wiki_proposal_candidate` compatibility, but mark them as `debug_raw_candidate` in site data.

- [ ] **Step 4: Update site**

Dashboard should show:

- curated proposals;
- human-required exceptions;
- conflicts;
- raw evidence/candidate debug count;
- curation report status.

The primary pending number must equal the curated proposals the user can click and act on.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/daily-command.test.js dist-tests/tests/core/wiki-render-site.test.js
```

Expected: dashboard/review counts are consistent.

## Task 8: End-To-End Smoke And Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/deployment.md`
- Modify: `docs/bdd/wiki-curation-synthesis.feature` if implementation reveals wording drift
- Test: `tests/cli/real-smoke.test.ts`

- [ ] **Step 1: Add smoke coverage**

Add a mocked local personal smoke:

```bash
praxisbase init --mode personal
praxisbase ai init --provider openai-compatible --model glm-5.1 --json
praxisbase wiki compile --review --json
praxisbase wiki curate --review --degraded --json
praxisbase review policy init --mode personal --json
praxisbase review auto --promote-approved --json
praxisbase wiki build-site --json
praxisbase context get --agent codex --stage repair --query "openclaw auth expired" --json
```

Expected:

- curated proposal count is small;
- promoted personal known fix exists in `kb/known-fixes/`;
- site shows the promoted page;
- context returns citations;
- no raw transcript or secret is written to Git paths.

- [ ] **Step 2: Update usage docs**

Document personal defaults:

```bash
praxisbase review policy init --mode personal --json
praxisbase daily run --mode personal --build-site --json
```

Document team defaults:

```bash
praxisbase review policy init --mode team --json
praxisbase daily run --mode team-git --build-site --json
```

Explain that personal can auto-promote low-risk personal knowledge, while team defaults to auto-review only.

- [ ] **Step 3: Full verification**

Run:

```bash
git diff --check
pnpm check
```

Expected: no whitespace errors and all tests pass.

## Self-Review Checklist

- Every stable knowledge mutation still goes through existing review/promote.
- Raw evidence is not the default human review queue.
- Personal mode can avoid excessive manual review through policy-driven auto review/promote.
- Team mode cannot silently promote personal/private material.
- Curation reports are machine-readable and explain filtered, clustered, written, and human-required counts.
- Tests mock AI; deterministic CI does not require network model calls.
