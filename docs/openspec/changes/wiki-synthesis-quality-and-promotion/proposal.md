# Wiki Synthesis Quality And Promotion Proposal

## Why

PraxisBase can harvest real Codex/OpenClaw experience and run curation, but real smoke showed that a completed run can still fail the product goal: generated pages may be too raw, isolated, weakly structured, or not eligible for promotion.

The missing piece is a hard synthesis quality contract. LLM Wiki requires compiled, interconnected wiki articles, not source excerpts with headings.

## What Changes

- Strengthen the AI curator prompt around compiled wiki article structure.
- Add deterministic repair for relationship links and provenance sections.
- Require core page sections before promotion.
- Keep privacy, raw JSON/log, template fallback, unsafe path, and reference-only blocks.
- Keep personal auto-promote narrow and team auto-promote off by default.
- Treat graph connectivity and promotable output as smoke acceptance, not optional diagnostics.

## Goals

- Good evidence becomes a small number of useful wiki proposals.
- Related proposals link to existing stable pages when relationship planning supplies links.
- Personal mode can promote low-risk creates without turning weak content into stable knowledge.
- Team mode remains review-gated.
- Quality failures are explained by deterministic reason codes.

## Non-Goals

- Do not introduce a vector database, daemon, or mandatory MCP server.
- Do not turn PraxisBase into a WeKnora-style enterprise RAG platform.
- Do not let AI bypass review/promote.
- Do not loosen quality gates just to increase page count.

## Acceptance

- AI output missing supplied relationship links is repaired before assessment.
- Bodies missing required wiki sections are blocked.
- Personal auto-promote does not promote proposals with quality hard blocks or human-required quality notes.
- Controlled e2e produces graph links when related pages exist.
- Full `pnpm check` passes.
