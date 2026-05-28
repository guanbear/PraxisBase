# Agent Context Juice And Personal Learning Proposal

## Why

PraxisBase has a governed path for compiling experience into stable wiki pages and promoted skills, and M23 defines catalog, lifecycle, validation, and GBrain publishing. The missing layer is runtime consumption: agents need a bounded, trust-aware, cheap context bundle that uses stable PB knowledge without flooding prompts or treating sidecar memory as authority.

OpenHuman has mature implementation ideas in TokenJuice, skill injection, token budgeting, memory trust wrapping, and self-learning facets. PraxisBase should borrow those mechanisms at the design level and implement them independently in TypeScript.

## What Changes

- Add context juice byte budgets and trajectory microcompaction around source items, review inputs, and agent bundles.
- Add optional oversized payload pre-summary with strict thresholds, model budget, and failure breaker.
- Add a trust boundary for PB stable knowledge, personal facets, sidecars, remote personal agents, candidates, and external content.
- Add bounded promoted-skill injection with deterministic matching and per-skill decisions.
- Add an agent context bundle builder for CLI, agent-access files, GBrain/MCP-facing responses, and personal bootstrap.
- Add a personal learning cache for local style/tooling/veto/goal/identity/channel facets with stability scoring, pin, forget, and class budgets.
- Show context juice, trust, skill injection, and personal facet summaries in reports and HTML.

## Goals

- Reduce token spend in real personal daily and agent context retrieval without losing experience fidelity.
- Make agent-facing context deterministic, explainable, and budgeted.
- Keep PB stable knowledge above GBrain and AgentMemory sidecars.
- Keep untrusted sidecar/external content visibly wrapped before agent use.
- Let personal mode learn stable runtime preferences without leaking them into team knowledge.
- Preserve M23 governance: no direct stable wiki or skill mutation.

## Non-Goals

- Do not copy OpenHuman GPL source code, prompts, or vendor rules.
- Do not build OpenHuman's desktop UI, OAuth connector system, or full memory tree.
- Do not replace GBrain MCP or AgentMemory.
- Do not auto-promote wiki pages, stable skills, or team knowledge.
- Do not inject review candidates into normal agent runtime.

## Acceptance

- `praxisbase context bundle --query <q> --mode personal --json` returns a bounded bundle with stable PB context ranked before sidecars.
- `praxisbase skill inject-preview --query <q> --json` explains matched/skipped promoted skills under an 8 KiB default skill budget.
- Long session-like sources can be microcompacted idempotently while preserving failures, fixes, verification, explicit lessons, source refs, and source hashes.
- Untrusted sidecar content is wrapped and cannot appear as authoritative instructions.
- Personal facets can be listed, pinned, forgotten, rebuilt, and injected only in personal mode by default.
- Team mode excludes personal facets and personal remote evidence unless explicit review/import policy allows it.
- Reports and the generated site show byte savings, budget usage, trust tiers, injected/skipped skill decisions, and personal facet counts without raw private evidence.
