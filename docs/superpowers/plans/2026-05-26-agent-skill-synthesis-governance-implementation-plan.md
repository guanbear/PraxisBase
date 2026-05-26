# Agent Skill Synthesis Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Finish the wiki semantic-review gate and add an audited agent skill synthesis lane for personal and team modes.

**Architecture:** Keep stable knowledge file-first and proposal-based. M19.1 completes semantic wiki review as a prerequisite. M19.2 adds skill candidates, stability clustering, skill proposer/reviewer, CLI, daily/site integration, and audit-only stable promotion.

**Tech Stack:** TypeScript, Zod schemas, existing OpenAI-compatible JSON client, Node test runner, existing PraxisBase protocol/review/promote/wiki/site pipeline.

---

## File Map

- Modify `packages/core/src/wiki/curation-model.ts`: include semantic review details needed by daily/site and M19.2 skill related-page context.
- Modify `packages/core/src/experience/daily.ts`: add semantic review daily counts, enforce semantic-review gate before personal auto-promotion, and add skill synthesis stage counts after the M19.1 gate is stable.
- Modify `packages/core/src/wiki/render-site.ts`: show wiki semantic review results and skill candidate queue cards.
- Create `packages/core/src/synthesis/skill-model.ts`: skill candidate, semantic skill review, report schemas.
- Create `packages/core/src/synthesis/skill-signals.ts`: collect and filter skill signals from distilled experience and stable wiki pages.
- Create `packages/core/src/synthesis/skill-stability.ts`: file-first stability grouping and cluster scoring.
- Create `packages/core/src/synthesis/skill-inventory.ts`: load stable `skills/**/SKILL.md`, extract matching fields, and score update/create targets.
- Create `packages/core/src/synthesis/skill-proposer.ts`: prompt builder, strict JSON normalization, candidate shaping, Hermes-style ladder.
- Create `packages/core/src/synthesis/skill-review.ts`: semantic skill review prompt, AI runner, normalization.
- Create `packages/core/src/synthesis/skill-review-policy.ts`: deterministic arbitration and promotion eligibility.
- Create `packages/core/src/synthesis/skill-audit.ts`: validate skill promotion audit records and team/personal promotion eligibility.
- Modify `packages/core/src/synthesis/skill.ts`: keep existing APIs and delegate new candidate generation to the new modules.
- Create `packages/cli/src/commands/skill.ts`: `skill synthesize`, `skill review`, `skill promote`, `skill curate`, `skill export`.
- Modify `packages/cli/src/index.ts`: route the new skill command group.
- Modify `packages/core/src/index.ts`: export new skill synthesis APIs.
- Add tests under `tests/core/skill-*.test.ts`, update `tests/core/experience-daily.test.ts`, add CLI tests under `tests/cli/skill-command.test.ts`, and add site tests.

---

## Task 1: Finish M19.1 Daily Semantic Review Counts

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/core/src/protocol/schemas.ts`
- Test: `tests/core/experience-daily.test.ts`

- [x] **Step 1: Write failing daily report test**

Add a test that runs daily with a mocked `curateWiki` result containing:

```ts
semantic_review: {
  enabled: true,
  reviewed: 2,
  promote: 1,
  merge: 0,
  revise: 0,
  reject: 1,
  needs_human: 0,
  unavailable: 0,
}
```

Assert the returned `DailyExperienceReport` includes the same semantic-review counts.

- [x] **Step 2: Run focused test**

Run:

```bash
pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/experience-daily.test.js
```

Expected: failure because the daily report schema does not expose semantic review counts.

- [x] **Step 3: Add schema field**

Add an optional `semantic_review` object to `DailyExperienceReportSchema` with the same count keys as `WikiCurationReportSchema.semantic_review`, defaulting to disabled zero counts.

- [x] **Step 4: Populate daily report**

In `runDailyExperience()`, copy `curationReport.semantic_review` into the daily report.

- [x] **Step 5: Verify**

Run the focused test again. Expected: PASS.

---

## Task 2: Enforce Semantic Review Before Personal Wiki Auto-Promotion

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Test: `tests/core/experience-daily.test.ts`

- [x] **Step 1: Write failing auto-promotion test**

Create two curated proposals in `.praxisbase/inbox/proposals/`:

- proposal A has `review_hint.risk_notes` containing `semantic_review:promote`, `semantic_score:0.91`, and `semantic_reason:Reusable procedure with concrete trigger and verification.`;
- proposal B has no passing semantic review note.

Run daily review-promote in personal mode and assert only proposal A is promoted.

- [x] **Step 2: Run focused test**

Expected: failure because daily auto-promotion currently trusts `decideAutoReview()` without requiring semantic review.

- [x] **Step 3: Add semantic note parser**

Add a helper in `daily.ts`:

```ts
function hasPassingSemanticWikiReview(curated: CuratedWikiProposal): boolean {
  const decision = curated.review_hint.risk_notes.find((note) => note === "semantic_review:promote");
  const scoreNote = curated.review_hint.risk_notes.find((note) => note.startsWith("semantic_score:"));
  const score = scoreNote ? Number.parseFloat(scoreNote.slice("semantic_score:".length)) : Number.NaN;
  return Boolean(decision) && Number.isFinite(score) && score >= 0.82;
}
```

Do not introduce a second threshold if `MIN_PROMOTE_SCORE` or an exported equivalent already exists in `semantic-review-policy.ts`; export/reuse the existing value instead.

- [x] **Step 4: Gate auto-promotion**

Before `promoteApprovedProposal()`, require `hasPassingSemanticWikiReview(curated)`. If false, write a human-required exception with reason `semantic_review_required_for_auto_promotion`.

- [x] **Step 5: Verify**

Run the focused daily test. Expected: PASS.

---

## Task 3: Render Semantic Review Results In Site

**Files:**
- Modify: `packages/core/src/wiki/render-site.ts`
- Test: existing render-site/site model test or create `tests/core/wiki-site-semantic-review.test.ts`

- [x] **Step 1: Write failing site test**

Seed a wiki curation report with semantic review counts and a proposal whose `review_hint.risk_notes` includes:

```text
semantic_review:reject
semantic_score:0.42
semantic_reason:One-off run report with weak reusable guidance.
```

Build the site and assert the HTML contains the decision, score, and reason.

- [x] **Step 2: Run focused test**

Expected: failure because site cards do not render semantic review reasons.

- [x] **Step 3: Add parser/rendering**

Parse `semantic_review:*`, `semantic_score:*`, and `semantic_reason:*` notes into card fields. Render counts in the dashboard and reasons on review cards.

- [x] **Step 4: Verify**

Run the site test. Expected: PASS.

---

## Task 4: Add Skill Candidate Schemas

**Files:**
- Create: `packages/core/src/synthesis/skill-model.ts`
- Modify: `packages/core/src/index.ts`
- Test: `tests/core/skill-model.test.ts`

- [x] **Step 1: Write failing schema tests**

Test that a valid `skill_synthesis_candidate`, `semantic_skill_review`, and `skill_synthesis_report` parse. Test that missing provenance, unsafe action, and invalid support-file path fail.

- [x] **Step 2: Run focused test**

Expected: module not found.

- [x] **Step 3: Implement schemas**

Add:

```ts
export const SkillSynthesisCandidateSchema = z.object({
  id: z.string().min(1),
  protocol_version: z.literal(PROTOCOL_VERSION),
  type: z.literal("skill_synthesis_candidate"),
  action: z.enum(["skill_create", "skill_update", "skill_support_file"]),
  scope: ScopeSchema,
  target_path: z.string().min(1),
  target_skill: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  body_markdown: z.string().min(1),
  source_refs: z.array(z.string().min(1)).min(1),
  source_hashes: z.array(z.string().min(1)).min(1),
  evidence_ids: z.array(z.string().min(1)).min(1),
  source_count: z.number().int().min(1),
  confidence: z.number().min(0).max(1),
  ladder_choice: z.enum(["skill_update_loaded", "skill_update_existing", "skill_support_file", "skill_create"]),
  existing_skill_path: z.string().nullable(),
  related_wiki_paths: z.array(z.string()).default([]),
  review_hint: z.object({
    suggested_decision: z.enum(["approve", "edit", "reject", "merge"]),
    risk_notes: z.array(z.string()).default([]),
  }),
  created_at: z.string().datetime(),
});
```

Add `SemanticSkillReviewSchema` and `SkillSynthesisReportSchema` matching the design doc.

- [x] **Step 4: Verify**

Run `pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/skill-model.test.js`. Expected: PASS.

---

## Task 5: Collect And Filter Skill Signals

**Files:**
- Create: `packages/core/src/synthesis/skill-signals.ts`
- Test: `tests/core/skill-signals.test.ts`

- [x] **Step 1: Write failing signal tests**

Cover:

- `DistilledExperience.skill_candidate.should_create=true` with success outcome becomes a signal;
- failed outcome is ignored;
- one-off run id title is rejected;
- environment failure without reusable fix is rejected;
- negative tool claim is rejected;
- personal scope is rejected for team mode.

- [x] **Step 2: Implement signal collector**

Export:

```ts
export interface SkillSignalCandidate {
  id: string;
  scope: "personal" | "project" | "team" | "org" | "global";
  trigger: string;
  procedure: string[];
  title: string;
  source_ref: string;
  source_hash: string;
  evidence_id: string;
  confidence: number;
  cue_family: "explicit_user_correction" | "verified_fix" | "repeated_success" | "workflow_preference" | "tool_pattern" | "wiki_procedure";
  related_wiki_paths: string[];
}
```

Implement `collectSkillSignalsFromDistilledExperiences(experiences, { authorityMode })`.

- [x] **Step 3: Add deterministic rejection helpers**

Reject titles/triggers matching run ids, PR-only names, exact error-string names, transient setup failures, and negative tool claims.

- [x] **Step 4: Verify**

Run focused signal tests. Expected: PASS.

---

## Task 6: Stability Cluster Skill Signals

**Files:**
- Create: `packages/core/src/synthesis/skill-stability.ts`
- Test: `tests/core/skill-stability.test.ts`

- [x] **Step 1: Write failing clustering tests**

Assert:

- two matching verified signals form one eligible cluster;
- one weak singleton is not eligible;
- explicit user correction can be eligible with lower source count but still requires audit;
- cluster key ignores source-specific run ids;
- class budget caps emitted clusters.

- [x] **Step 2: Implement clustering**

Export:

```ts
export interface SkillSignalCluster {
  id: string;
  cluster_key: string;
  title: string;
  trigger: string;
  procedure: string[];
  source_refs: string[];
  source_hashes: string[];
  evidence_ids: string[];
  source_count: number;
  confidence: number;
  scope: "personal" | "project" | "team" | "org" | "global";
  related_wiki_paths: string[];
  cue_families: string[];
}
```

Use deterministic normalized trigger/procedure hashing and confidence aggregation. Default eligibility: `source_count >= 2 && confidence >= 0.78`, or explicit user correction with `confidence >= 0.86`.

- [x] **Step 3: Verify**

Run focused clustering tests. Expected: PASS.

---

## Task 7: Add Existing Skill Inventory And Match Policy

**Files:**
- Create: `packages/core/src/synthesis/skill-inventory.ts`
- Test: `tests/core/skill-inventory.test.ts`

- [x] **Step 1: Write failing inventory tests**

Create stable skill fixtures:

```text
skills/openclaw/openclaw-memory-operations/SKILL.md
skills/codex/praxisbase-daily-operations/SKILL.md
```

Assert inventory loading extracts path, slug, frontmatter name/description, scope, headings, `When To Use`, `Procedure`, `Pitfalls`, `Provenance`, and related wiki links.

- [x] **Step 2: Write failing match tests**

Assert:

- OpenClaw memory import signal strongly matches `skills/openclaw/openclaw-memory-operations/SKILL.md`;
- PraxisBase daily run signal medium-matches `skills/codex/praxisbase-daily-operations/SKILL.md`;
- tool-name-only overlap is weak and cannot force update;
- two strong matches produce `ambiguous_existing_skill_match`;
- no match allows `skill_create`.

- [x] **Step 3: Implement inventory loader**

Export:

```ts
export interface StableSkillInventoryItem {
  path: string;
  slug: string;
  name: string;
  description: string;
  scope: "personal" | "project" | "team" | "org" | "global";
  headings: string[];
  when_to_use: string;
  procedure: string;
  pitfalls: string;
  provenance: string;
  related_wiki_paths: string[];
}

export interface StableSkillMatch {
  skill: StableSkillInventoryItem;
  strength: "strong" | "medium" | "weak";
  score: number;
  reasons: string[];
}
```

Implement `loadStableSkillInventory(root)` and `matchStableSkills(cluster, inventory)`.

- [x] **Step 4: Verify**

Run `pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/skill-inventory.test.js`. Expected: PASS.

---

## Task 8: Add Skill Proposer

**Files:**
- Create: `packages/core/src/synthesis/skill-proposer.ts`
- Test: `tests/core/skill-proposer.test.ts`

- [x] **Step 1: Write failing proposer tests**

Use mocked AI output to cover:

- update existing umbrella preferred over create;
- ambiguous existing umbrella match returns merge/update or human-required, not create;
- support-file path allowed only under `references/`, `templates/`, or `scripts/`;
- created skill includes required sections;
- missing provenance is rejected;
- raw transcript copy is rejected.

- [x] **Step 2: Implement prompt builder**

The system prompt must include Hermes-inspired ladder and anti-patterns:

- update loaded/existing skill before create;
- use inventory matches as authoritative context for update-vs-create;
- create only class-level umbrella skills;
- reject one-off narratives, environment failures, negative tool claims, and transient errors;
- write synthesized instructions, not raw transcript.

- [x] **Step 3: Implement candidate normalizer**

Normalize AI JSON into `SkillSynthesisCandidateSchema`. Repair missing required sections once by appending empty headings with clear `needs_human` risk notes, then let the reviewer decide.

- [x] **Step 4: Verify**

Run focused proposer tests. Expected: PASS.

---

## Task 9: Add Semantic Skill Reviewer And Policy

**Files:**
- Create: `packages/core/src/synthesis/skill-review.ts`
- Create: `packages/core/src/synthesis/skill-review-policy.ts`
- Test: `tests/core/skill-review.test.ts`
- Test: `tests/core/skill-review-policy.test.ts`

- [x] **Step 1: Write failing reviewer tests**

Mock approve, revise, merge/update, reject, needs-human, timeout, and malformed JSON.

- [x] **Step 2: Implement reviewer**

The prompt judges class-level usefulness, trigger quality, actionability, verification, related wiki pages, evidence support, privacy/scope safety, and future-agent safety. Return strict JSON matching `SemanticSkillReviewSchema`.

- [x] **Step 3: Write failing policy tests**

Assert:

- deterministic privacy/path hard block wins;
- score below `0.86` cannot approve;
- non-class-level candidate rejects;
- reviewer suggests existing skill update;
- ambiguous existing skill match cannot approve new create;
- team scope always needs Git/human review;
- approval does not auto-promote stable skill.

- [x] **Step 4: Implement policy**

Export `decideSemanticSkillAction(candidate, review)` returning:

```ts
{
  action: "write_candidate" | "retry_synthesis" | "reject" | "needs_human" | "rewrite_as_update";
  promotion_eligible: boolean;
  reason: string;
  review_notes: string[];
}
```

- [x] **Step 5: Verify**

Run focused reviewer and policy tests. Expected: PASS.

---

## Task 10: Integrate New Skill Synthesis API

**Files:**
- Modify: `packages/core/src/synthesis/skill.ts`
- Modify: `packages/core/src/index.ts`
- Test: `tests/core/skill-synthesis.test.ts`

- [x] **Step 1: Add failing API test**

Call a new function:

```ts
await synthesizeSkillCandidates(root, {
  mode: "review",
  authorityMode: "personal-local",
  experiences,
  aiClient,
  now: "2026-05-26T00:00:00.000Z",
});
```

Assert it writes candidate records and a report, not stable skill files.

- [x] **Step 2: Implement API**

The function should collect signals, cluster them, load stable skill inventory, match existing skills, propose candidates, review candidates, write accepted/review-required candidates to `.praxisbase/inbox/proposals/`, and write a report under `.praxisbase/reports/skill-synthesis/`.

- [x] **Step 3: Preserve old function**

Keep `generateSkillDraftsFromDistilledExperiences()` working for existing tests by delegating only where safe or leaving it as compatibility wrapper.

- [x] **Step 4: Verify**

Run `tests/core/skill-synthesis.test.ts`. Expected: PASS.

---

## Task 11: Add Skill CLI Commands

**Files:**
- Create: `packages/cli/src/commands/skill.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/cli/skill-command.test.ts`

- [x] **Step 1: Write failing CLI tests**

Cover:

- `skill synthesize --mode personal --review --json`;
- `skill synthesize --mode team --review --json`;
- `skill curate --dry-run --json`;
- `skill review --json`;
- `skill promote --proposal <id> --json` fails without approved review;
- command does not write stable `skills/**` during synthesize.
- `skill review --json` shows audit status, semantic review decision, and next command.

- [x] **Step 2: Implement command parser**

Add a `skill` command group with subcommands and options:

```bash
praxisbase skill synthesize --mode personal --review --json
praxisbase skill review --json
praxisbase skill promote --proposal <id> --json
praxisbase skill curate --dry-run --json
praxisbase skill export --agent codex --json
```

- [x] **Step 3: Verify**

Run CLI focused tests. Expected: PASS.

---

## Task 12: Integrate Daily And Site

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/core/src/protocol/schemas.ts`
- Modify: `packages/core/src/wiki/render-site.ts`
- Test: `tests/core/experience-daily.test.ts`
- Test: site render tests

- [x] **Step 1: Write failing daily skill synthesis test**

Run a personal daily with mocked AI returning repeated skill signals. Assert:

- daily report has `skill_synthesis.candidates > 0`;
- outputs include a skill synthesis report;
- stable `skills/**` is unchanged.

- [x] **Step 2: Add daily option**

Add `skillSynthesis?: boolean` or equivalent input option. Default can be enabled for personal once tests are stable, or guarded behind CLI flag for first implementation.

- [x] **Step 3: Add report fields**

Add daily `skill_synthesis` summary with enabled, signals, rejected_signals, clusters, candidates, reviewed, approved, rejected, needs_human, promoted.

- [x] **Step 4: Render site cards**

Show candidate action, scope, review decision, score, reason, source count, related wiki pages, and next command.

- [x] **Step 5: Verify**

Run daily and site tests. Expected: PASS.

---

## Task 13: Promotion Audit Guard

**Files:**
- Modify: `packages/core/src/promote/promote.ts`
- Modify: `packages/cli/src/commands/skill.ts`
- Create: `packages/core/src/synthesis/skill-audit.ts`
- Test: `tests/core/skill-promotion-audit.test.ts`
- Test: `tests/cli/skill-command.test.ts`

- [x] **Step 1: Write failing guard test**

Attempt to promote a skill candidate without an approved review. Assert promotion fails and no stable skill file is written.

- [x] **Step 2: Write failing audit schema tests**

Test a valid audit record:

```ts
{
  id: "audit_1",
  protocol_version: PROTOCOL_VERSION,
  type: "skill_promotion_audit",
  proposal_id: "proposal_1",
  candidate_id: "skill_candidate_1",
  target_path: "skills/openclaw/openclaw-memory-operations/SKILL.md",
  scope: "personal",
  decision: "approved",
  reviewer: { kind: "user", id: "local-user" },
  semantic_review_id: "semantic_skill_review_1",
  source_hashes: ["sha256:abc"],
  created_at: "2026-05-26T00:00:00.000Z"
}
```

Assert invalid records fail when target path differs, source hashes are missing, decision is not approved, or team scope lacks Git/MR review metadata.

- [x] **Step 3: Implement audit schema and guard**

When target path starts with `skills/`, require an approved review record whose proposal id matches the candidate id. Team mode must also require the configured Git/human review policy.

- [x] **Step 4: Add approved personal path test**

Seed an approved review record for a personal candidate and assert promotion writes the target skill with provenance.

- [x] **Step 5: Verify**

Run promotion audit tests. Expected: PASS.

---

## Task 14: Final Verification

**Files:**
- No new files unless test fixes reveal gaps.

- [x] **Step 1: Typecheck and build**

Run:

```bash
pnpm build
pnpm exec tsc -p tsconfig.tests.json
```

Expected: both pass.

- [x] **Step 2: Focused tests**

Run:

```bash
node --test dist-tests/tests/core/skill-model.test.js \
  dist-tests/tests/core/skill-signals.test.js \
  dist-tests/tests/core/skill-stability.test.js \
  dist-tests/tests/core/skill-inventory.test.js \
  dist-tests/tests/core/skill-proposer.test.js \
  dist-tests/tests/core/skill-review.test.js \
  dist-tests/tests/core/skill-review-policy.test.js \
  dist-tests/tests/core/skill-synthesis.test.js \
  dist-tests/tests/core/experience-daily.test.js \
  dist-tests/tests/cli/skill-command.test.js
```

Expected: all pass.

- [x] **Step 3: Small real personal smoke**

Run:

```bash
praxisbase personal run --json --build-site
praxisbase skill synthesize --mode personal --review --json
praxisbase wiki build-site --json
```

Expected: reports are written, site shows skill candidates when signals exist, and stable `skills/**` changes only after explicit promotion.

- [x] **Step 4: Real smoke quality audit**

Inspect the generated skill synthesis report and site output. Expected:

- raw signals, rejected or low-stability signals, clusters, reviewed candidates, rejected candidates, human-required candidates, and promoted stable skills are counted separately;
- raw signals are not the primary review queue;
- reviewed candidates are few enough to inspect manually;
- every candidate has source refs, source hashes, reviewer reason, and related wiki paths when available;
- team-scope output contains no personal-only source material;
- no raw transcript or private path appears in candidate bodies;
- stable `skills/**` remains unchanged before explicit audited promotion.

- [x] **Step 5: Diff audit**

Run:

```bash
git diff --stat
git diff --check
```

Expected: no whitespace errors, no generated junk, no raw private data.

---

## OpenCode Work Packet Guidance

Use one OpenCode task per implementation task. Every packet must restate:

- stable `skills/**` writes require audit;
- team skill promotion requires human/Git review;
- raw transcripts are not skill synthesis input;
- new skill creation is last in the Hermes-style ladder;
- OpenHuman is inspiration for candidate/stability/context economy only, not copied code.

Codex reviews every diff before accepting it.
