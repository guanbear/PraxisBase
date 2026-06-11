# Proposal: Wiki Linking And Merge Quality

## Why

PraxisBase can now harvest experience, curate wiki proposals, run quality gates, and render a static site. The remaining quality failure is structural: a real generated wiki can contain many pages that are all graph orphans. Those pages may be readable, but agents cannot use them as a connected knowledge substrate.

The LLM Wiki target requires synthesized, canonical, provenance-rich pages with relationships. Raw evidence should compile into a small knowledge graph. Repeated experiences such as ACK timing and stdin-closed failures should update or merge into canonical pages instead of producing many isolated summaries.

## What Changes

- Add deterministic relationship planning between topics and stable pages.
- Enrich page planning so existing related/canonical pages drive `update`, `merge`, or required links.
- Pass required and suggested links to AI synthesis.
- Extend promotion quality gates for missing wikilinks, ambiguous merge targets, duplicate create plans, and orphan risk.
- Extend curation reports, proposal records, and HTML review/site output with linking and merge explanations.
- Add BDD and regression tests proving repeated evidence produces connected canonical output.

## Scope

In scope:

- `packages/core/src/wiki/topic-planner.ts`
- new wiki relationship helper if needed
- `packages/core/src/wiki/curator-prompt.ts`
- `packages/core/src/wiki/curate.ts`
- `packages/core/src/wiki/curation-model.ts`
- `packages/core/src/wiki/promotion-quality.ts`
- `packages/core/src/wiki/render-site.ts`
- focused core and CLI tests

Out of scope:

- vector search or embeddings;
- hosted search service;
- direct stable writes from curation;
- automatic deletion/archive of stable pages;
- MCP protocol expansion;
- visual redesign beyond showing the new review facts.

## Acceptance

- Curation report includes relationship counts and merge/link status.
- Curated proposals include related pages, required links, suggested links, merge candidates, and relationship reasons.
- AI prompt includes required and suggested links.
- Quality gate marks proposals human-required when related pages exist but required links are missing.
- Existing canonical stable pages cause update/merge plans instead of duplicate create plans.
- Site/review HTML exposes link and merge explanations.
- Focused tests and `pnpm check` pass.
