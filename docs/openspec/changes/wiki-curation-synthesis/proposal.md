# Wiki Curation Synthesis Proposal

## Why

PraxisBase can now harvest agent material, run AI distill, generate wiki candidates, and build a static site. The remaining kernel gap is that humans still see too much raw backlog. A capture, session, memory row, or shallow summary can become a review item even when it is operational noise or duplicate evidence.

This does not satisfy the LLM Wiki goal. Raw material must be evidence. Wiki pages must be synthesized, deduplicated, provenance-rich, and reviewable in small numbers.

## What Changes

- Add a `wiki curate` stage between `wiki compile` and `review/promote`.
- Normalize safe raw/candidate material into a `WikiEvidenceItem` pool.
- Filter operational noise and privacy risks before review.
- Filter reference-only and metadata-only material: official docs, API references, session boot/configuration, OpenClaw reflection themes, and memory promotion bookkeeping do not directly become wiki pages.
- Require a useful-experience quality gate before AI synthesis can produce a review candidate.
- Cluster related evidence by signature, target path, title, source overlap, and distilled lesson.
- Use AI curator synthesis to produce wiki-shaped `wiki_curated_proposal` records.
- Preserve multi-source provenance: `source_refs`, `source_hashes`, `source_count`, `evidence_ids`.
- Make review UI/site counts default to curated proposals, not raw candidate backlog.
- Add policy-driven auto review and low-risk personal auto promotion.

## Goals

- Many raw evidence items become few curated wiki proposals.
- Human review defaults to wiki-shaped proposals with provenance, not raw logs or metadata.
- Personal mode is usable daily without approving every low-risk item.
- Team mode remains conservative: auto review may classify, but auto promote is off by default.
- Production curation requires AI unless degraded mode is explicit.
- Stable `kb/` and `skills/` still change only through review/promote.

## Non-Goals

- Do not add a database, vector store, daemon, or mandatory MCP server.
- Do not let AI directly write stable knowledge.
- Do not remove existing `wiki_proposal_candidate` compatibility in one step.
- Do not commit raw transcripts, raw logs, tokens, cookies, auth headers, or private keys.
- Do not auto-promote personal evidence into team/org/global knowledge.

## Acceptance

- `praxisbase wiki curate --dry-run --json` writes only a curation report.
- `praxisbase wiki curate --review --json` writes curated proposals, not stable knowledge.
- Review/dashboard pending counts match clickable curated proposals.
- Session metadata, base instructions, `openclaw:unknown`, and empty promotion logs are filtered.
- Official docs and API references are only provenance; they do not directly enter stable wiki.
- Codex/OpenClaw boot metadata and OpenClaw reflection-theme/promotion bookkeeping are filtered unless attached to a concrete user preference, verified fix, decision, pitfall, or reusable agent lesson.
- Single-source review candidates require a problem or preference, action or decision, and verification or reusable lesson.
- Weak single-source proposals require human review; high-signal single-source personal proposals can follow the low-risk personal auto-review policy.
- Repeated OpenClaw/Codex evidence can become one curated proposal with `source_count > 1`.
- Personal policy can auto review and auto promote low-risk personal `known_fix`, `procedure`, `pitfall`, or `note` proposals.
- Team policy does not auto promote by default and rejects personal/private material.
