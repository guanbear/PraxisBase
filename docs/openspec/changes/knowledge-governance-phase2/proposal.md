# OpenSpec Change: Knowledge Governance Phase 2

## Why

PraxisBase Phase 1 added the metadata needed for knowledge governance: maturity, knowledge type, references, exception queues, run records, and pitfall objects. Those fields are useful only if Phase 2 defines deterministic governance rules before implementation starts.

This change turns the current direction-level roadmap into an executable contract for:

1. linting knowledge quality,
2. detecting duplicate or contradictory knowledge,
3. proposing maturity promotions from references,
4. proposing stale/decay changes without silently mutating stable knowledge,
5. importing legacy knowledge as proposals,
6. producing stage-aware compact retrieval bundles under query budgets.

The goal is to make knowledge governance auditable and reviewable, not a hidden self-modifying black box.

## What Changes

- Add `praxisbase lint` with deterministic P2-A rules.
- Add deterministic duplicate and contradiction detection.
- Add reference aggregation and maturity proposal generation.
- Add stale/decay proposal generation and exception routing.
- Add `praxisbase import` for cold-start inputs that creates proposals, not direct stable knowledge.
- Add stage-aware compact retrieval and query budget rules.
- Add BDD acceptance for P2-A through P2-E batches.

## Non-Goals

- Do not directly mutate `kb/` or `skills/` from governance commands.
- Do not add a vector database, external search service, or semantic embedding dependency.
- Do not make lint decisions require an online AI model.
- Do not import raw logs into Git.
- Do not auto-promote `proven` knowledge without review/promotion.
- Do not replace the existing proposal/review/promote lane.

## Acceptance Summary

- `praxisbase lint` emits machine-readable errors and warnings for invalid, unsafe, stale, duplicate, and contradictory knowledge.
- Maturity governance emits proposals for `draft -> verified` and `verified -> proven`; it does not edit stable objects directly.
- Decay governance emits stale/decay proposals or exceptions; it does not silently demote stable objects.
- Cold-start import supports Markdown, Feishu export, JSONL, Git repo docs, and wiki dump inputs through a normalized import manifest.
- Imported knowledge lands as proposals or draft inbox objects with source refs, hashes, and redacted summaries.
- Stage-aware retrieval enforces per-stage budgets and deterministic ranking.

## Guardrails For Implementing Agents

- Keep Phase 2 deterministic by default.
- Every governance write must be append-only or proposal-based.
- Human exception queues are for uncertainty and risk, not routine work.
- Raw evidence stays external; Git stores refs, hashes, and redacted summaries.
- Prefer small batch commands over one monolithic `govern` command.
