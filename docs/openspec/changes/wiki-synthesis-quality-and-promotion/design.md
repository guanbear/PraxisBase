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

## Deterministic Repair

After AI synthesis and before quality assessment, PraxisBase runs deterministic repair:

1. Reject private material without repair.
2. Replace malformed or duplicated heading bodies with evidence-shaped body.
3. Insert missing required wikilinks exactly as `[[slug|label]]`.
4. If no wikilinks exist and suggested links are available, insert up to three suggested wikilinks.
5. Insert missing provenance from source refs and hashes.

Repair is deterministic and auditable. It may make a good proposal easier to promote, but it may not invent evidence or links.

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

Personal mode may auto-promote only a low-risk create proposal with no hard blocks and no human-required quality reasons.

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
