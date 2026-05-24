# Design: LLM Semantic Review Gate

## Pipeline

The wiki pipeline becomes:

```text
evidence -> distill -> topic plan -> synthesis -> deterministic hard gates -> LLM semantic review -> deterministic arbitration -> review/promote
```

The synthesizer and reviewer are separate roles. The synthesizer writes a candidate page. The semantic reviewer judges the candidate. Deterministic policy decides whether to write, reject, revise, merge, or require human review.

## Semantic Review

The reviewer receives candidate markdown, source summaries, provenance excerpts, related pages, existing target page content when relevant, and deterministic gate results.

It returns strict JSON with:

- decision;
- quality score;
- long-term agent value flag;
- reusable/actionable flags;
- run-report-summary flag;
- raw-or-near-raw-copy flag;
- evidence support level;
- optional merge target;
- fatal issues and missing requirements;
- concise reason.

## Arbitration

Rules:

- deterministic hard blocks always win;
- reviewer reject rejects;
- reviewer merge requires a resolvable existing target;
- reviewer revise allows one synthesis retry;
- personal promote requires high score and positive utility/actionability/reusability flags;
- team/org/global scope remains human-required;
- semantic review unavailable never permits auto-promotion;
- single-source run/report/smoke-test create proposals default to merge/reject.

## Reports

Add semantic review counts to curation and daily reports:

```json
{
  "semantic_review": {
    "enabled": true,
    "reviewed": 0,
    "promote": 0,
    "merge": 0,
    "revise": 0,
    "reject": 0,
    "needs_human": 0,
    "unavailable": 0
  }
}
```

Persist detailed semantic reviews under `.praxisbase/reports/wiki-semantic-review/`.

## UX

The review/site UI should show semantic decision, score, reason, merge target, and fatal issues. Rejected candidates are diagnostics, not human work items.

## Safety

The LLM reviewer never receives raw transcripts when redacted source summaries are available. It cannot override privacy or path gates. Team mode may store an AI approval hint but still requires human/GitLab policy.
