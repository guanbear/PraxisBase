# Wiki Synthesis Quality And Promotion Design

## Problem

PraxisBase already has the intended pipeline shape:

```text
raw evidence -> AI distill -> topic clustering -> relationship planning -> wiki curate -> review/promote -> stable kb/site
```

The real smoke runs showed a different product outcome: many raw-ish candidates, weak or missing wikilinks, almost no graph connectivity, and few proposals eligible for personal auto-promotion. The issue is not only model quality. The system allowed an AI draft to be "wiki-shaped enough" when it had headings, even if it was still close to a transcript, lacked reusable lessons, or ignored relationship planning.

The original LLM Wiki idea treats raw sources as immutable inputs, the LLM as a compiler, and the wiki as the compiled artifact. The compiled artifact must accumulate, link, and become easier for future agents to use. Reference projects reinforce this:

- `nvk-llm-wiki` preserves the protocol: raw material is immutable, articles are synthesized rather than copied, indexes and wikilinks are first-class, and agents maintain the wiki.
- `nashsu/llm_wiki` adds a two-step analysis/generation flow, source traceability, graph insights, async review, and an agent skill/API for access.
- `atomicstrata/llm-wiki-compiler` separates extraction from page generation, merges shared concepts, passes related pages into generation, writes review candidates, and lints provenance/citations before approval.
- WeKnora is useful for mature ingestion, task queues, MCP/skill access, observability, source sync, and graph UI. Its enterprise RAG/Agent platform is not PraxisBase's core. PraxisBase should stay a local/team agent-experience compiler, not become a WeKnora clone.

## Design Goal

Make wiki synthesis deterministic around the AI rather than trusting the AI to stay aligned:

```text
evidence contract
  -> AI synthesis request with explicit output contract
  -> deterministic normalizer/repair
  -> deterministic quality assessment
  -> policy review/promote
  -> graph/site verification
```

The AI may choose wording and synthesis, but deterministic code owns structure, provenance, privacy, link requirements, update/create safety, and promotion eligibility.

## Page Contract

A curated wiki proposal is promotable only when the body is a useful agent-facing page. It must contain:

- `# Title`
- `## Problem` or `## Context`
- one action section: `## Fix`, `## Procedure`, `## Decision`, or `## Operating Rule`
- `## Verification`
- `## Reusable Lessons`
- `## Provenance`
- if relationship planning found related pages, `## Related Wiki Pages` with exact resolver-valid `[[slug|label]]` links.

The body must not contain:

- raw JSON/log/transcript blocks outside fenced examples;
- copied session boot/configuration metadata;
- template fallback sentences;
- official docs/reference pages as the page itself;
- source hashes or capture ids as the human title;
- invented wikilinks not supplied by the relationship planner or already present stable pages.

## Deterministic Repair

The system may repair AI output once before assessment:

- replace machine-generated titles and paths with title-derived wiki paths;
- rebuild malformed bodies from evidence summaries when headings are missing or duplicated;
- append a `## Related Wiki Pages` section for missing required/suggested relationship links;
- append/normalize `## Provenance` from `source_refs` and `source_hashes`;
- keep privacy failures as failures, not repairs.

Repair exists to make good evidence usable. It must not hide weak evidence: if there is no concrete action, verification, or reusable lesson, the proposal remains blocked or human-required.

Relationship slugs are canonicalized from stable page identity. A promoted page's frontmatter `id`, or the deterministic id derived from its target path, is the slug new synthesis should use. Title-derived and path-leaf slugs are compatibility aliases for graph/site resolution, not the preferred output. This keeps newly generated pages clickable and prevents a graph with many syntactic wikilinks but almost no resolved edges.

## Promotion Policy

Personal mode can auto-promote only low-risk create proposals:

- scope is `personal` or `project`;
- action is `create`;
- page kind is `known_fix`, `procedure`, `pitfall`, `preference`, `decision`, or `note`;
- confidence is at least `0.82`;
- no hard blocks and no quality human-required reasons;
- strong single-source evidence is allowed only when it has action plus verification or reusable lesson;
- update, merge, archive, supersede, skill, policy, team/org/global, private, ambiguous merge, or missing required links require human review.

Team mode remains review-only by default. GitLab/CI approval is the team promotion gate.

## Why We Drifted

The repeated drift came from accepting implementation-level milestones as product-level correctness:

- "pipeline completed" did not mean "wiki page is useful";
- "proposal count is nonzero" did not mean "review queue is small and promotable";
- "site built" did not mean "graph is connected";
- "AI produced JSON" did not mean "compiled wiki article";
- documents described the desired flow but did not define enough deterministic contracts and smoke acceptance.
- link checks counted `[[...]]` tokens rather than resolver-valid page edges.

The fix is to make the expected wiki artifact testable. Every smoke must report evidence count, topic count, written proposals, promotable proposals, promoted pages, graph links, orphan ratio, and quality failures by reason.

## Acceptance

- A mocked AI response that omits relationship links is repaired to include supplied links before quality assessment.
- A proposal missing core page sections is blocked from promotion.
- Raw JSON/log/template/reference-only content is hard-blocked.
- Personal auto-promote succeeds for a strong, linked, low-risk create proposal.
- Team mode never auto-promotes by default.
- A controlled end-to-end wiki run produces fewer pages than evidence items and graph links greater than zero when related pages exist.
- Resolved link count and rendered HTML links are part of the acceptance signal; broken title-only slugs must not be treated as successful related links.
