# Wiki Kernel Quality Convergence OpenSpec Design

## Overview

The wiki kernel must treat raw material as evidence and stable wiki pages as guidance. This change tightens four boundaries:

```text
evidence admission -> topic synthesis -> promotion quality -> agent retrieval
```

The goal is not to produce more pages. The goal is to produce fewer, better, provenance-backed pages that agents can use without reading raw sessions.

## Authority-Tiered Retrieval

`buildContext` must assign every candidate an authority tier:

- `stable`: `kb/**`, `skills/**`;
- `compiled`: `dist/wiki/**`, indexes, bundles;
- `evidence`: `.praxisbase/raw-vault/refs/**`;
- `report`: non-guidance operational reports.

Default `context get` includes `stable` and `compiled` only. Evidence candidates are excluded unless a future explicit debug option requests them.

Ranking must apply authority before token-match tie-breaking. A stable page with a partial match should outrank a raw-vault ref with a stronger text match. Citations may still point to raw source refs through frontmatter provenance.

## Semantic Promotion Guards

Promotion quality assessment must add these guard concepts:

- `reusable_topic`: blocks titles that are process outcomes, commit statuses, run ids, hashes, source refs, "successfully fixed" statements, or raw candidate labels.
- `applicability`: blocks bodies where `## When to Use` repeats the title, mentions source/candidate ids as the trigger, or uses generic "appears in agent work" wording.
- `action_specificity`: blocks bodies where `## What To Do` only repeats the title or contains no concrete action/decision.
- `coherence`: blocks broad clusters whose title does not cover the mixed evidence topics.

These failures are hard blocks for auto-promotion. They may still create review records with clear reasons when the material is safe.

The same checks run at promote time against the markdown content itself. This prevents old generated proposals or manually supplied proposals from bypassing the newer curation assessment. Default agent context also excludes stable `kb/` pages that fail the promote-time semantic gate, so stale local runtime artifacts cannot become guidance just because they already exist on disk.

## Topic And Title Selection

The curation layer must not promote the first evidence title by default. Title selection order:

1. deterministic known signature title;
2. topic planner title from problem/action/entities;
3. AI title if semantic title gate passes;
4. deterministic title from extracted problem/action/entities;
5. reject with `rejected_quality`.

If a title contains process-status terms such as "successfully fixed", "re-approved", "subsequent commit", raw ids, or hashes, it is not acceptable as a stable page title.

When review-mode curation has current generated wiki proposals, it removes stale auto-generated wiki proposal files from earlier runs. Manual notes or unrelated non-wiki proposal records are preserved.

## Human-Required Taxonomy

Reports distinguish:

- `privacy_required`: potentially sensitive or scope-unsafe material;
- `review_required`: safe but human decision needed;
- `rejected_low_signal`: safe but intentionally dropped;
- `rejected_quality`: failed synthesis quality;
- `auto_promoted`: promoted by policy.

The static site headline "Human required" uses `privacy_required + review_required`.

## Invariants

- Raw evidence must not become default agent guidance.
- Stable writes still require review/promote or policy-governed daily auto-promotion.
- Personal auto-promotion never bypasses semantic quality guards.
- Team mode remains stricter than personal mode.
- Reports explain why material was promoted, queued, rejected, or hidden from default context.
