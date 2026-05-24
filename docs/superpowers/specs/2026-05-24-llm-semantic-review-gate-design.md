# LLM Semantic Review Gate Design

## Problem

PraxisBase now has a working personal loop:

```text
raw evidence -> AI distill -> wiki curate -> review/promote -> kb/site/context
```

The current gates are mostly deterministic. They catch unsafe paths, private material, raw JSON, missing provenance, broken links, bad titles, and obviously generic bodies. A real run produced eight stable pages that passed `kb audit` and site quality lint, but human review still found mixed semantic quality:

- good reusable agent guidance: ACK timing, dispatch routing, Slack replay stability, gateway restart;
- merge-worthy fragments: missing replay data, model identification checks;
- run-report-shaped pages: post-deploy smoke failure;
- malformed synthesis: task runner presence checks with repeated text, a dangling sentence, an empty failed-attempts section, and a JSON-shaped lesson.

This shows that deterministic gates are necessary but insufficient. The missing layer is semantic editorial judgment: whether a candidate is durable knowledge, should be merged, should be rejected, or needs a rewrite.

## Goal

Add an LLM semantic review gate before wiki proposals become review/promote candidates.

The reviewer must answer:

- Is this long-term reusable agent knowledge?
- Is it more than a cleaned-up run report?
- Does it have concrete triggers, actions, and verification?
- Is it supported by the provided evidence?
- Should it merge into an existing stable page instead of creating a new page?
- Does the body contain synthesis artifacts such as dangling fragments, repeated sections, or raw JSON-shaped bullets?

The gate should reduce bad stable pages without blocking useful personal-mode automation.

## Non-Goals

- Do not let the LLM override security, privacy, path, or provenance rules.
- Do not require team-mode auto-promotion.
- Do not add a database, vector store, or server dependency.
- Do not replace deterministic promotion guards.
- Do not require manual review for every personal page when confidence is high.

## Design Principle

Use separate roles:

```text
synthesizer writes candidates
semantic reviewer judges candidates
deterministic policy arbitrates final action
```

The LLM reviewer is an expert editor, not the final authority. It may recommend `promote`, `revise`, `merge`, `reject`, or `needs_human`, but deterministic policy decides what the system actually does.

## Pipeline

New flow:

```text
evidence
  -> AI distill
  -> topic planning / relationship planning
  -> AI synthesis
  -> deterministic hard gates
  -> LLM semantic review
  -> deterministic policy arbitration
  -> write proposal / retry synthesis / reject / human-required
  -> review/promote
```

### Stage 1: Deterministic Hard Gates

Existing hard gates stay first because they are cheap and non-negotiable:

- unsafe target path;
- missing provenance;
- private material;
- raw JSON or raw transcript;
- template fallback text;
- missing H1/wiki shape;
- non-reusable title patterns;
- generic applicability;
- non-specific actions;
- create-with-existing-page conflicts;
- duplicate source hashes.

If these fail, the LLM reviewer is skipped unless debug mode explicitly asks for diagnosis. This saves tokens and avoids asking the model to judge known-bad candidates.

### Stage 2: LLM Semantic Review

The reviewer receives:

- candidate title, target path, page kind, scope, confidence, source count;
- candidate markdown;
- source summaries and provenance excerpts, not raw transcripts;
- related stable pages and proposed relationship reasons;
- existing page content when the plan is update or merge;
- deterministic gate output.

The reviewer must return strict JSON:

```json
{
  "decision": "promote",
  "quality_score": 0.91,
  "long_term_agent_value": true,
  "is_run_report_summary": false,
  "is_raw_or_near_raw_copy": false,
  "is_actionable": true,
  "is_reusable": true,
  "evidence_support": "strong",
  "should_merge_with": null,
  "revision_required": false,
  "fatal_issues": [],
  "missing_requirements": [],
  "reason": "Reusable procedure with concrete trigger, action, verification, and multi-source provenance."
}
```

Allowed decisions:

- `promote`: candidate is good enough for personal auto-review/promotion when policy allows.
- `revise`: candidate is useful but needs one synthesis retry.
- `merge`: candidate is useful but should update an existing page.
- `reject`: candidate should not become stable wiki knowledge.
- `needs_human`: safe but uncertain; requires human decision.

### Stage 3: Deterministic Policy Arbitration

Arbitration rules:

- deterministic hard block always wins and produces rejection or human-required according to existing semantics;
- `reject` from reviewer rejects the candidate;
- `merge` requires a resolvable existing target; otherwise `needs_human`;
- `revise` gets at most one synthesis retry, then a second review;
- personal `promote` requires `quality_score >= 0.82`, `is_reusable=true`, `is_actionable=true`, `long_term_agent_value=true`, and no fatal issues;
- team/org/global scope remains human-required even if the reviewer says promote;
- single-source create proposals with run/report/smoke-test framing default to `merge` or `reject`, not `promote`;
- reviewer/policy disagreement defaults to `needs_human`;
- production AI failure falls back to deterministic gates and marks semantic review as unavailable, not passed.

## Prompt Contract

The prompt should explicitly tell the reviewer:

- Do not rewrite the page.
- Do not invent missing evidence.
- Judge long-term utility for future agents.
- Prefer merge/update over creating near-duplicate pages.
- Reject pages that are run reports, status updates, or cleaned evidence summaries.
- Reject or revise pages with dangling fragments, empty sections, repeated headings, JSON-shaped bullets, or generic advice.
- Return only JSON matching the schema.

The reviewer should see a compact rubric:

- `5`: durable, actionable, well-supported, reusable, linked/merge-aware;
- `4`: useful with minor weakness;
- `3`: plausible but needs human or merge decision;
- `2`: weak cleaned evidence or one-off report;
- `1`: malformed, unsupported, raw-ish, or not useful.

Scores map to:

- `>= 0.82`: eligible for personal promote if all flags pass;
- `0.65-0.81`: revise/needs_human/merge;
- `< 0.65`: reject unless policy explicitly asks for human triage.

## Data Model

Add a semantic review schema:

```ts
export const SemanticWikiReviewSchema = z.object({
  type: z.literal("semantic_wiki_review"),
  candidate_id: z.string(),
  target_path: z.string(),
  decision: z.enum(["promote", "revise", "merge", "reject", "needs_human"]),
  quality_score: z.number().min(0).max(1),
  long_term_agent_value: z.boolean(),
  is_run_report_summary: z.boolean(),
  is_raw_or_near_raw_copy: z.boolean(),
  is_actionable: z.boolean(),
  is_reusable: z.boolean(),
  evidence_support: z.enum(["none", "weak", "partial", "strong"]),
  should_merge_with: z.string().nullable(),
  revision_required: z.boolean(),
  fatal_issues: z.array(z.string()),
  missing_requirements: z.array(z.string()),
  reason: z.string(),
  reviewed_at: z.string(),
});
```

Persist reviews under:

```text
.praxisbase/reports/wiki-semantic-review/
```

The curation report should include:

```json
"semantic_review": {
  "enabled": true,
  "reviewed": 11,
  "promote": 4,
  "merge": 3,
  "revise": 1,
  "reject": 2,
  "needs_human": 1,
  "unavailable": 0
}
```

Each proposal written to `.praxisbase/inbox/reviews` should carry semantic review notes in `review_hint.risk_notes`, for example:

```text
semantic_review:promote:0.91
semantic_review_reason:Reusable procedure with concrete trigger and verification.
```

Rejected candidates should be counted and included in reports, but not written as stable review candidates.

## Examples

Expected decisions from the current eight-page run:

- ACK timing before long-running agent work: `promote`.
- OpenClaw dispatch routing failures: `promote`.
- OpenClaw Slack replay and post-deploy stability failures: `promote`.
- OpenClaw gateway restart after configuration changes: `promote`.
- Missing replay data compromises debugging: `merge` into Slack replay stability.
- Post-deploy stability smoke test run failure: `merge` or `reject`, because it is a one-off report-shaped page.
- Verify OpenClaw agent model identification: `merge` into gateway restart or `needs_human` as a checklist.
- OpenClaw task runner presence checks: `reject` or `revise`, because it contains repeated text, dangling fragments, empty failed-attempts content, and JSON-shaped lesson output.

## Error Handling

- If semantic review AI is not configured in production mode, curation returns a structured error unless `--degraded` or `--no-semantic-review` is set.
- If reviewer JSON parsing fails, retry once with a repair prompt.
- If the reviewer times out, mark semantic review as unavailable and require human review for candidates that would otherwise auto-promote.
- If a retry synthesis still fails review, reject or human-require according to reviewer decision.
- Never promote a candidate solely because semantic review is unavailable.

## Configuration

Use existing AI provider config and stage-specific model selection:

- `distill_model`: chunk distillation;
- `curation_model`: wiki synthesis;
- new `review_model`: semantic review, defaulting to `curation_model` when unset.

CLI options:

- `--semantic-review` default true in production curation/daily;
- `--no-semantic-review` only allowed for degraded/debug runs, and it prevents auto-promotion of newly created pages;
- `--semantic-review-timeout-ms <n>`;
- `--semantic-review-concurrency <n>`.

Personal mode can auto-promote reviewer-approved low-risk pages. Team mode can store `approved_by_ai` but still requires GitLab/MR/human policy.

## Site And Review UX

The HTML review page should show semantic review results on candidate cards:

- decision;
- score;
- reason;
- merge target if any;
- fatal issues;
- missing requirements.

The dashboard should show semantic review counts separately from privacy-required and human-required counts. Rejected candidates should appear as diagnostics, not as human work items.

## Acceptance Criteria

- A malformed page with dangling fragments and JSON-shaped lessons cannot be written as a stable review candidate.
- A one-off smoke-test failure page is rejected or merged, not created as a standalone stable page.
- A useful multi-source procedure receives a promote decision and remains eligible for personal auto-promotion.
- A useful single-source checklist is not auto-created as a new stable page when it should merge into an existing page.
- Team-scope candidates remain human-required even when semantic review approves them.
- Semantic review failures never cause auto-promotion.
- Curation and daily reports expose semantic review counts.
- The site displays semantic review reasons for candidates and rejected diagnostics.

## Test Strategy

- Unit tests for `SemanticWikiReviewSchema` and decision normalization.
- Unit tests for deterministic arbitration.
- Mocked AI tests for promote, merge, reject, revise, needs_human, malformed JSON, timeout, and unavailable reviewer.
- Curation tests using the current bad examples:
  - task runner presence checks should reject/revise;
  - post-deploy smoke failure should merge/reject;
  - Slack replay stability should promote.
- Daily tests proving auto-promotion requires semantic review success.
- Site tests proving semantic review counts and reasons are rendered.
