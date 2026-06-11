# Wiki Kernel Quality Convergence Design

## Problem

PraxisBase can now run the full personal experience loop from local Codex/OpenClaw material into `kb/`, `dist/`, and `context get`. The remaining gap is kernel quality. The pipeline can still promote weak synthesis: raw-vault summaries appear in agent context, process-shaped titles become stable wiki pages, unrelated experiences merge into broad pages, and the `human_required` count mixes privacy risk with low-value or rejected material.

This is not a UI polish issue. It is a contract issue between evidence, synthesis, promotion, and retrieval.

## Goal

Make the LLM Wiki invariant executable:

```text
raw evidence -> curated synthesis -> few provenance-backed wiki pages -> review/promote -> stable agent context
```

Raw evidence remains inspectable as provenance and debug material, but it is not default guidance for agents or humans.

## Non-Goals

- Do not build a new app, database, hosted service, or semantic vector index.
- Do not require team-mode auto promotion.
- Do not import the user's real `kb/` runtime output into the source repository.
- Do not solve every HTML visual issue in this change.

## Diagnosis

The earlier implementation over-weighted chain completeness and under-weighted semantic gates.

- `buildContext` scans `kb`, `skills`, indexes, bundles, and `.praxisbase/raw-vault/refs` together. This lets raw summaries compete with stable wiki pages.
- Curation falls back to the first evidence title when topic planning is weak. That allows process statements such as "Successfully fixed and re-approved..." to become page titles.
- Promotion quality guards check structure, provenance, privacy, and some actionability, but not reusable-topic semantics.
- The daily report exposes `human_required` as one large count without separating privacy review, weak evidence, rejected synthesis, and true user decisions.

## Design

### Authority-Tiered Context

Agent context has authority tiers:

1. stable guidance: `kb/` and `skills/`;
2. compiled public artifacts: `dist/wiki/*.md`, indexes, bundles;
3. evidence: `.praxisbase/raw-vault/refs`.

`context get` defaults to tiers 1 and 2. Evidence is excluded unless explicitly requested by a future debug flag. Related raw evidence may appear only as citations from a stable page, not as a standalone context item.

When stable wiki results exist for a query, they fill the top-ranked results before any lower-authority material. The retrieval sorter should encode authority as a larger factor than text-token match.

### Semantic Promotion Gate

Stable wiki promotion requires a reusable topic, not just a well-formed markdown body. The same semantic gate is enforced twice:

1. curation/review assessment blocks bad new proposals before they are written to the review queue;
2. promote-time validation blocks stale or manually supplied proposals that predate the new assessment fields.

A proposal must pass these additional checks:

- `reusable_topic`: title names a durable problem, procedure, decision, pitfall, preference, or skill. It must not be a process outcome, commit status, run id, source hash, or generic "fixed successfully" sentence.
- `applicability`: `## When to Use` contains concrete operational triggers, not candidate ids, source ids, or the title repeated with "appears in agent work".
- `action_specificity`: `## What To Do` contains concrete actions or decisions, not only the title or generic status wording.
- `coherence`: a page cluster should not mix unrelated procedures, status checks, model changes, and delegation lessons unless the page title explicitly covers that broader procedure.

Failing one of these checks blocks auto-promotion. In personal mode, high-signal single-source proposals may still be allowed, but they must pass the semantic gate.

Stable `kb/` pages that fail the promote-time semantic gate are also hidden from default agent context. This protects agents from old local runtime artifacts until the user rebuilds or prunes the local `kb/`.

### Topic And Title Convergence

Topic planning should prefer semantic problem/action/entity signatures over evidence titles.

For clusters, the title is selected in this order:

1. known deterministic signature title;
2. planned topic title from observation grouping;
3. AI title if it passes the semantic title gate;
4. deterministic title generated from problem/action/entities;
5. reject the cluster.

The fallback may not use a raw evidence title when it looks like a process status, run artifact, commit result, or candidate id.

### Human-Required Taxonomy

Daily and curation reports must split counts:

- `privacy_required`: material that might expose secrets, private personal data, or team-inappropriate scope;
- `review_required`: safe material that is potentially useful but needs a human decision;
- `rejected_low_signal`: material intentionally dropped as noise or weak evidence;
- `rejected_quality`: AI or deterministic synthesis failed quality gates;
- `auto_promoted`: stable writes completed through policy.

The headline human review number in HTML should use `privacy_required + review_required`, not dropped or rejected counts.

### Site And Review UX

The review page should make the default queue small and decision-oriented:

- curated proposals first;
- stale auto-generated wiki candidates from previous curation runs are removed when a new curation run has current candidates;
- each card shows title, target path, scope, source count, quality failures, and action buttons/instructions;
- raw/evidence counts are visible as diagnostics, not as the main queue.

This change only adjusts counts and copy if needed to preserve the kernel contract.

## Acceptance Criteria

- A query with matching stable wiki pages returns stable `kb/` or `skills/` items first and does not include raw-vault refs by default.
- A process-status title such as "Successfully fixed and re-approved in a subsequent commit" cannot be auto-promoted to stable wiki.
- A synthesized wiki page cannot pass auto-promotion if `When to Use` or `What To Do` is generic or source-id driven.
- Old run-specific stable pages are not returned by default `context get` even if they still exist in local `kb/`.
- Re-running curation replaces stale generated wiki proposal files instead of accumulating an ever-growing review queue.
- The real personal daily smoke reports categorized review/rejection counts.
- Re-running personal daily produces fewer, more coherent stable wiki pages, with source summaries contributing to those pages.

## Test Strategy

- Unit tests for semantic title/body gate.
- Unit tests for authority-tiered retrieval.
- Curation tests using real bad examples from the current personal smoke.
- Daily report tests for categorized counts.
- A golden e2e test proving raw evidence is compiled into a small set of stable pages and agent context prefers those pages.
