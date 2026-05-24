# LLM Wiki Fidelity Contract Proposal

## Why

PraxisBase can now harvest real agent memory, synthesize wiki proposals, promote low-risk personal pages, and render an HTML site. That still does not prove it satisfies the original LLM Wiki idea. The product goal is not "make pages"; it is "maintain a persistent, compounding, linked wiki that agents can use instead of re-deriving knowledge from raw evidence."

The missing piece is a fidelity contract that makes the expected artifact testable.

## What Changes

- Add first-class root wiki artifacts: `purpose.md`, `schema.md`, `index.md`, `log.md`, and `overview.md`.
- Add source summaries as traceability artifacts separate from stable guidance pages.
- Strengthen canonical topic identity so repeated evidence compiles into fewer pages.
- Add lifecycle and supersession metadata to compiled proposals.
- Add typed graph edges.
- Add fidelity lint rules for raw-copy pages, missing root artifacts, missing source summaries, source-summary promotion, missing agent-use sections, stale/superseded conflicts, and unresolved typed edges.
- Ensure agent context reads compiled wiki artifacts, not raw backlog.
- Add a golden corpus smoke that proves compounding behavior.

## Goals

- Match the original LLM Wiki contract: raw sources, maintained wiki, schema, ingest, query, lint, index, and log.
- Borrow the necessary compiler structure from `atomicstrata/llm-wiki-compiler`.
- Borrow purpose/source summary/search/skill ideas from `nashsu/llm_wiki`.
- Borrow lifecycle/typed graph/privacy/automation principles from LLM Wiki v2.
- Borrow WeKnora's mature ingestion and agent-access lessons without becoming an enterprise RAG platform.

## Non-Goals

- Do not require MCP, vector DB, graph DB, daemon, or web server.
- Do not replace review/promote.
- Do not auto-promote team knowledge.
- Do not count source-summary pages as stable operational guidance.
- Do not use page count as quality success.

## Acceptance

- Golden corpus produces fewer promoted pages than useful evidence items.
- At least one page has multiple sources.
- Root wiki artifacts are generated.
- Source summaries are written for accepted useful sources.
- Stable/proposed pages expose page kind, confidence, lifecycle, and provenance.
- Graph output contains typed resolver-valid edges.
- Fidelity lint catches known bad fixtures.
- Agent context contains root artifact hints, compiled pages, graph neighbors, and provenance pointers.

