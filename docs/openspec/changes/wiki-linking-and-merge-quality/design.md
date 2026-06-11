# Wiki Linking And Merge Quality OpenSpec Design

## Pipeline

This change extends the compiler middle:

```text
evidence -> observations -> canonical topics
         -> relationship planning
         -> page plans with create/update/merge/link requirements
         -> AI synthesis
         -> link and merge quality gate
         -> proposal queue -> review/promote -> graph/site
```

Stable `kb/` and `skills/` remain reviewed artifacts. Curation still writes proposals and reports only.

## Relationship Planning

The compiler SHALL derive relationship plans before AI synthesis.

Each `WikiRelationshipPlan` contains:

- `topic_id`;
- `target_page_id`;
- `target_path`;
- `target_title`;
- `strength`: `canonical`, `strong`, `related`, or `weak`;
- `reasons`: deterministic reason strings;
- `required_link`: boolean;
- `suggested_label`;
- optional `merge_candidate`: boolean.

Signals:

- same canonical topic key;
- exact target path;
- normalized title or slug match;
- shared source hash;
- shared signature;
- entity overlap;
- normalized problem/action overlap;
- existing wikilink relationship.

The planner MUST be deterministic and bounded. Default maximum related pages per topic is five. Sorting order is strength, reason priority, stable page title, then path.

## Page Plan Rewrites

The page planner SHALL use relationship plans to avoid duplicate creates.

Rules:

- canonical relationship to one stable page rewrites `create` to `update`;
- canonical relationship to multiple stable pages creates a `merge` plan and marks ambiguous cases human-required;
- shared source hash with a stable page prevents a second `create`;
- strong non-canonical relationship keeps `create` but produces required links;
- related relationship produces suggested links;
- weak relationship is report-only.

Scope rules:

- personal evidence must not merge into team/org/global pages without review;
- team/org/global pages must not link to personal pages unless the personal page is explicitly promoted into that scope;
- cross-scope links should be omitted rather than leaked.

## AI Synthesis Contract

AI synthesis receives:

- `existing_page` when action is `update`, `merge`, or `supersede`;
- `related_pages`;
- `required_links`;
- `suggested_links`;
- `merge_candidates`;
- `relationship_reasons`.

The prompt SHALL instruct the model:

- include required links as `[[slug|label]]` in body text;
- use a `Related` section only when a natural sentence would be awkward;
- do not invent links not provided by the planner;
- preserve existing page content during update/merge;
- explain merge/update intent in the summary or review hint.

## Quality Gate

The deterministic quality gate SHALL evaluate link and merge status.

Hard blocks:

- duplicate source hash across multiple create plans;
- create action when canonical stable page exists;
- merge/update body shrink below threshold;
- unsafe merge target path;
- raw/private/template/reference-only content.

Human-required:

- `missing_wikilinks`: required links exist but the generated body has no valid link to them;
- `ambiguous_merge_target`: multiple canonical targets and no deterministic winner;
- `cross_scope_merge`: merge would move personal content into team/org/global scope;
- `merge_requires_review`: update/merge of team/org/global stable knowledge.

Allowed isolated page:

- no canonical, strong, or related stable page exists after deterministic planning.

## Report Schema Additions

`wiki_curation_report.compiler_counts` SHALL include:

```ts
relationship_counts: {
  topics_with_related_pages: number;
  required_links: number;
  suggested_links: number;
  create_to_update_rewrites: number;
  merge_plans: number;
  ambiguous_merge_targets: number;
  isolated_topics_without_related_pages: number;
  orphan_risk_after_plan: number;
}
```

Proposal summaries in the report SHALL include target path, action, related count, required link count, and merge candidate count.

## Proposal Schema Additions

`wiki_curated_proposal` SHALL include optional:

```ts
related_pages: Array<{ title: string; path: string; slug: string; reason: string; strength: string }>;
required_links: Array<{ slug: string; label: string; path: string; reason: string }>;
suggested_links: Array<{ slug: string; label: string; path: string; reason: string }>;
merge_candidates: Array<{ title: string; path: string; reason: string }>;
relationship_reasons: string[];
```

Backwards compatibility: older proposals without these fields remain valid.

## Site And Review

The static site SHALL expose:

- curation relationship counts on dashboard/review;
- candidate required links and missing link warnings;
- merge/update target and reasons;
- orphan risk from the compiler, separate from raw evidence human-required counts.

The graph page continues to show actual graph output after site build. It must not hide orphan warnings.

## Invariants

- AI cannot invent a merge target.
- AI cannot override privacy/scope/path guards.
- Relationship planning uses redacted summaries, metadata, hashes, signatures, and stable markdown, not raw transcripts.
- Same input and same mocked AI response produce stable relationship plans and report counts.
