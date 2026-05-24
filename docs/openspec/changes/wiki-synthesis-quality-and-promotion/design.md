# Wiki Synthesis Quality And Promotion OpenSpec Design

## Synthesis Contract

The wiki curator must request a compiled wiki article, not a summary. A valid body contains:

- `# Title`
- `## Problem` or `## Context`
- `## Fix`, `## Procedure`, `## Decision`, or `## Operating Rule`
- `## Verification`
- `## Reusable Lessons`
- `## Provenance`
- `## Related Wiki Pages` when relationship links are supplied.

The model may write concise prose, but must not copy raw transcripts, raw JSON, session boot metadata, source hashes as titles, or official reference pages as stable wiki content.

For agent-facing stable pages, the preferred body shape is:

- `## When to Use`
- `## Symptoms` or `## Context`
- `## What To Do`, `## Procedure`, `## Fix`, `## Decision`, or `## Operating Rule`
- `## Verify`
- `## Reusable Lessons`
- `## Provenance`
- `## Related Wiki Pages` when links are supplied.

The canonical shape is intentionally operational. It should tell a future agent when the page applies, what to do next, and how to verify the outcome. The body must avoid report-style narration, long machine signature lists, and repeated source boilerplate in the main guidance sections.

## Evidence Selection And Clustering

PraxisBase must treat stable wiki pages as context, not as fresh evidence that creates another page by itself. New wiki synthesis starts from harvested redacted experience, native memory, captures, or external refs. Existing stable pages are loaded for update planning, relationship planning, and merge context.

Experience fragments that only describe agent startup, system prompt loading, base instructions, installed skills, CI success listings, or task status fragments with no concrete action/outcome are operational noise. They may remain in raw-vault refs for audit, but they must not become wiki proposal inputs.

Topic clustering must prefer stable semantic identity over source identity. The cluster key should use, in order:

1. explicit non-source signatures or suggested tags;
2. normalized problem/action families such as ACK timing, stdin closed, task runner missing, Slack replay missing, dispatch routing, and gateway restart;
3. normalized title only as a fallback.

This keeps repeated evidence from Codex and OpenClaw as one compiled page with multiple provenance entries instead of many single-source pages.

Page kind selection must prefer the action a future agent can take. Evidence whose reusable action is "verify/check runner status", "inspect dispatch chain", or "run a health check" should become a `procedure` unless it also has a concrete repaired defect and fix. Repeated failures with a known workaround or repair remain `known_fix`; one-off observations without a reusable action remain `note`.

Within one curation run, multiple synthesized proposals MUST NOT be written for the same stable `target_path`. The curation stage must keep the highest quality candidate for that path, using source count, confidence, page-kind usefulness, and guard quality as tie breakers. Dropped duplicates remain represented by provenance in future merge/update runs rather than becoming competing review items.

## Deterministic Repair

After AI synthesis and before quality assessment, PraxisBase runs deterministic repair:

1. Reject private material without repair.
2. Replace malformed or duplicated heading bodies with evidence-shaped body.
3. Insert missing required wikilinks exactly as `[[slug|label]]`.
4. If no valid context wikilink exists and suggested links are available, insert up to three suggested wikilinks using resolver slugs from stable page ids or from planned pages that are likely to enter stable knowledge in the same run.
5. Insert missing provenance from source refs and hashes.

Repair is deterministic and auditable. It may make a good proposal easier to promote, but it may not invent evidence or links.

Relationship slugs are canonicalized from stable page identity, not from display title alone. For promoted pages this means the frontmatter `id` or target-path id is the canonical resolver slug. The graph and HTML renderer may accept title-slug and path-leaf aliases for older content, but new repair output must use canonical slugs so links are clickable and unambiguous.

Planned-page links are conservative. A candidate page may be used as a suggested link target only when it is low-risk, has repeated evidence, and is above the personal confidence threshold. Single-source notes, low-confidence candidates, preferences, skills, and other human-gated planned pages must not be inserted into pages that may auto-promote, because they would become broken stable wiki links when the target remains in review.

If an AI response is safe but fails non-security guards such as title, body shape, actionability, or verification wording, curation falls back to a deterministic evidence-shaped synthesis and then sends that through the same quality gate. Unsafe paths and private material do not use this fallback.

## Quality Gate

`assessWikiPromotionQuality()` hard-blocks:

- missing provenance;
- unsafe target path;
- private material;
- raw JSON or raw transcript/log;
- template fallback text;
- reference-only material;
- duplicate source hash across create proposals;
- missing required wiki structure;
- create action when an existing page was found.

Missing required structure means the body lacks one of the required section groups above. The existing `body_missing_wiki_structure` reason is used to avoid schema churn.

`missing_wikilinks` means the proposal lacks a resolver-valid link to a supplied required or related stable page. A body that merely contains any `[[...]]` token does not satisfy the gate when the supplied related page slugs do not appear.

Human-required reasons remain:

- weak single source;
- low confidence;
- unresolved conflict;
- missing wikilinks;
- team/org/global scope;
- skill/policy target;
- archive/supersede;
- ambiguous merge target.

## Review And Promotion

Personal mode may auto-promote a low-risk create or update proposal with no hard blocks and no human-required quality reasons. Low-risk updates are limited to personal/project wiki pages and are expected to improve a compiled article, add provenance, or add resolver-valid related links. Skill, policy, team/org/global, archive, supersede, ambiguous merge, private, and low-confidence updates remain human-gated.

Team mode does not auto-promote by default. Team promotion requires explicit external gate such as GitLab review/CI.

## Smoke Contract

A real or controlled smoke is not successful only because it exits zero. It must report:

- evidence items;
- topics;
- written proposals;
- quality hard blocks;
- quality human-required count;
- auto-promoted pages;
- graph node/link/orphan counts after site build.

When related pages exist and proposals are promoted, graph links must be greater than zero.
Broken link count must not increase because synthesis used title-only slugs where canonical stable page ids were available.

The smoke also fails quality review when all or most promoted pages are single-source islands, when JSON-like list items survive into stable wiki bodies, or when Codex/OpenClaw initialization records become user-facing wiki pages.

Personal daily `ai_distill.human_required` is an input privacy count, not a wiki review count. In personal mode it commonly means chunks were kept out of AI and wiki synthesis because deterministic pre-AI privacy checks saw concrete secret-like material. Team mode must remain strict; any future personal relaxation must redact locally before AI rather than sending suspicious text upstream.
