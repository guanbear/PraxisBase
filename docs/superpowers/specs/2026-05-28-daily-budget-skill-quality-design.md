# Daily Budget And Skill Quality Design

## Goal

Make real daily runs predictable and reviewable:

- `--max-ai-chunks` must read as an uncached model-call budget, not as total observed chunks.
- generated `SKILL.md` candidates must be shaped for agent use before they enter the review queue.

## Daily AI Budget Semantics

The existing flag remains `--max-ai-chunks` for compatibility, but its user-facing meaning is:

> maximum uncached production AI distill calls for this run.

Cached distill results do not consume the budget. Reports and progress must expose both counters:

- total chunks observed by the distill lane;
- cache hits;
- uncached chunks submitted to the provider;
- configured uncached budget;
- chunks skipped because the uncached budget was exhausted.

When the budget is reached, the report keeps the existing warning `max_ai_chunks_reached:<n>` and also writes `max_uncached_ai_chunks_reached:<n>` so existing scripts remain compatible while new readers get the precise meaning.

`--max-ai-chunks` only governs the distill lane. Wiki proposal synthesis remains bounded by `--max-curation-proposals`. Skill synthesis remains bounded by `--max-skill-candidates`, which limits skill signal clusters/candidates and keeps small validation runs from spending proposer and reviewer calls for every eligible cluster.

## Skill Candidate Quality

Skill synthesis may use LLM output, but every candidate must pass deterministic shape checks before it is treated as review-ready.

Required `SKILL.md` sections:

- `## When To Use`
- `## Procedure`
- `## Verification`
- `## Pitfalls`
- `## Do Not Use When`
- `## Related Wiki Pages`
- `## Provenance`

The normalizer repairs common markdown defects:

- frontmatter string fields are quoted when needed;
- missing sections are appended with reviewer-visible placeholders;
- heading fragments embedded in numbered list items are split back into headings;
- procedure steps are normalized into a readable numbered list.

The validator marks candidates as needing edit when:

- required sections are missing after repair;
- procedure has fewer than three concrete steps;
- malformed embedded headings remain in list items;
- content looks like a raw wiki/report copy rather than synthesized future-agent instructions.

Invalid candidates may still be written to `.praxisbase/inbox/proposals/`, but their review hint must be `edit`, with risk notes such as `skill_shape_invalid:*`, and they must not become promotion eligible.

## Acceptance

- A run with cached chunks and `--max-ai-chunks 1` reports cache hits separately and uses only one uncached provider call.
- Progress output includes uncached budget counters.
- Cached chunks in an earlier source do not consume uncached budget for a later source.
- A daily run can bound skill synthesis with `--max-skill-candidates`.
- A malformed LLM skill candidate is normalized or marked `edit`.
- Semantic skill review cannot approve a shape-invalid candidate.
- A small real daily run completes and produces reviewable site output.
