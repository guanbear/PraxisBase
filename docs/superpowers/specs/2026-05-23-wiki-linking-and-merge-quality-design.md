# Wiki Linking And Merge Quality Design

## Problem

The wiki compiler now produces curated pages, quality reports, review explanations, and a static site. A real build can still produce many useful-looking pages that are all graph orphans. That fails the LLM Wiki goal: the output should be a connected, canonical knowledge network, not a flat pile of summaries.

This change turns page linking and merge discipline into compile-time behavior:

```text
observations
  -> canonical topics
  -> related-page discovery
  -> page plans with create/update/merge
  -> AI synthesis with required links
  -> deterministic link/merge quality gate
  -> review/promote
  -> graph/site with fewer orphan pages
```

## Goals

- Reduce duplicate pages for the same operational lesson.
- Prefer `update` or `merge` when a stable page already represents the topic.
- Require generated pages to link to relevant existing pages when related pages are known.
- Make orphan pages explainable: an isolated page is acceptable only when no deterministic related page exists.
- Surface suggested links and merge decisions in curation reports and review/site HTML.
- Keep stable writes behind proposal, review, and promote.

## Non-Goals

- No vector database, hosted search, or background service.
- No direct writes to `kb/` or `skills/` from curation.
- No silent automatic deletion or archive of stable pages.
- No UI-only fix that hides orphan warnings without improving the graph.
- No use of raw transcript text as link evidence.

## Design Choice

Use a deterministic relationship planner before AI synthesis, then ask AI to write the page with required links. This is stricter than relying on the model to discover links, and lighter than introducing embeddings now.

Alternatives considered:

- AI-only linking: simple, but unstable and hard to test.
- Embedding/vector linking: powerful later, but adds infra and privacy concerns before the file-first compiler is stable.
- Deterministic relationship planner plus AI synthesis: testable, local-first, and consistent with existing `topic-planner`, `curator-prompt`, `promotion-quality`, and `resolver` modules.

## Relationship Planner

Create a small planner that receives `WikiTopic`, stable wiki page summaries, and page plans. It emits `WikiRelationshipPlan` records.

Relationship signals:

- `same_topic_key`: normalized problem/action/entity signature matches.
- `same_target_path`: planner found a matching target path.
- `same_title_or_slug`: normalized title or slug match.
- `shared_source_hash`: stable page and topic cite the same source hash.
- `shared_signature`: frontmatter signatures overlap.
- `entity_overlap`: durable entities/tools overlap, such as `openclaw`, `octoclaw`, `ack`, `stdin`.
- `problem_action_overlap`: normalized problem and recommended action overlap.
- `existing_wikilink`: stable page already links to the candidate title/slug or vice versa.

Relationship strengths:

- `canonical`: same topic, same target path, or same source hash. Should usually create `update` or `merge`.
- `strong`: shared signature or high problem/action/entity overlap. Should usually create `update`, `merge`, or required wikilinks.
- `related`: entity/type/stage affinity. Should become suggested wikilinks but not force merge.
- `weak`: report-only context; must not force link or merge.

The planner must be deterministic, sorted, and bounded. It should keep only the top related targets per topic, with a default of five.

## Page Plan Policy

`planWikiPages` remains the page-action authority, but it needs richer relationship inputs.

Rules:

- If a stable page has the same canonical topic key, plan `update`.
- If multiple stable pages or candidate topics represent the same canonical topic, plan `merge`.
- If source hashes overlap with a stable page, do not create a second page.
- If only related pages exist, keep `create` but attach required or suggested links.
- Personal topics do not merge into team/org/global pages without human review.
- Team/org/global topics do not auto-promote even when links are good.

Merge plans must be reviewable. A merge proposal can update one target page and record superseded candidates in metadata, but it must not archive stable pages automatically.

## Required Links

AI synthesis receives `required_links` and `suggested_links`.

Required links are used when:

- the planner found canonical or strong related pages;
- the page action is `update` or `merge`;
- the proposal cites a known fix/procedure/pitfall that already exists as stable knowledge.

Suggested links are used when:

- the relation is useful context but not necessary for agent action;
- the relation comes only from weak entity/type affinity.

The generated page should include links in normal body sections, not only hidden metadata. The preferred syntax is `[[stable-slug|human label]]`. A `Related` section may be added when no natural sentence exists.

## Quality Gate

Promotion quality assessment must distinguish three cases:

- No related pages known: isolated page is allowed.
- Related pages known and body contains at least one valid link to them: allowed subject to existing gates.
- Related pages known and body has no valid link or related metadata: human-required with `missing_wikilinks`.

Hard blocks:

- `create` when a canonical stable page exists.
- duplicate source hash across multiple create proposals.
- merge body shrink below the existing threshold.

Human-required:

- missing required wikilinks;
- ambiguous merge target;
- multiple canonical candidates with incompatible scopes;
- update/merge touching team/org/global scope.

## Reports And Site

Curation reports should add a `relationship_counts` section:

- `topics_with_related_pages`;
- `required_links`;
- `suggested_links`;
- `create_to_update_rewrites`;
- `merge_plans`;
- `ambiguous_merge_targets`;
- `isolated_topics_without_related_pages`;
- `orphan_risk_after_plan`.

Curated proposal records should expose:

- `related_pages`;
- `required_links`;
- `suggested_links`;
- `merge_candidates`;
- `relationship_reasons`.

The static site and review page should show:

- candidate required links and whether the body contains them;
- merge/update target and reasons;
- orphan risk separate from raw input counts;
- graph health after build.

## Agent Behavior

Agents should consume the connected wiki through existing surfaces:

- `context get` benefits from graph expansion and connected pages.
- `llms.txt` and page JSON include linked stable pages.
- Optional MCP/Skill/CLI access remains an adapter over the same file-first core.

The agent should not need to reason from 50 isolated pages. Retrieval should return a seed page plus graph-neighbor context when links exist.

## Privacy And Scope

Relationship planning must not leak personal pages into team/org/global outputs. Personal pages may link to project/team pages, but team pages must not link to personal pages unless the personal page has been explicitly promoted into team scope.

Source hashes can be used for matching, but raw evidence text must not be written into reports or HTML.

## Success Criteria

- Repeated ACK timing evidence yields one canonical page or one update/merge proposal, not many isolated pages.
- Repeated stdin-closed evidence yields one canonical page or one update/merge proposal.
- A page with related stable pages includes valid wikilinks or is marked human-required.
- A fresh build with known related pages reduces orphan count compared with the current flat output.
- Review/site HTML explains why a page is isolated, linked, update, or merge.
- Full verification passes with no generated `kb/`, `.praxisbase/`, or `dist/` artifacts committed unless explicitly requested.
