# Proposal: M25.2 Personal GA Release Contract

## Problem

M25.1 connected the personal pipeline, but the release gate still treats optional sidecars, degraded no-AI smoke, and historical privacy backlog as if they were the same kind of blocker. That makes the product feel unfinished even when the PB core path can already learn from Codex and OpenClaw evidence.

The repeated failure mode is not another missing backend. It is an unfrozen acceptance contract.

## Change

Freeze the personal GA contract:

```text
local/remote personal agent evidence
  -> PB lesson extraction with production AI or valid AI cache
  -> privacy abstraction
  -> auto-promoted low-risk personal wiki/context knowledge
  -> HTML visibility
  -> agent context consumption
```

GBrain and AgentMemory remain useful retrieval/export sidecars, but they are not required for PB core personal GA. Their failure is a warning unless the user explicitly marks them required.

## Scope

In scope:

- Personal GA readiness rules and blocker taxonomy.
- Sidecar downgrade from blocker to warning by default.
- Production AI daily acceptance with GLM-4.7 or valid AI cache.
- Latest-run privacy gating that ignores historical backlog and auto-abstracts personal private references.
- Personal auto-promotion of low-risk high-confidence wiki/context lessons.
- HTML and report language that answers what PB learned and how agents can use it.
- Real local validation over Codex app, codex-cliproxyapi, local OpenClaw, and trusted remote OpenClaw.

Out of scope:

- Replacing PB with GBrain or AgentMemory.
- Making sidecars promotion authorities.
- Team-mode auto-promotion from personal sources.
- Broad UI redesign beyond readiness and learned-knowledge visibility.
- Full historical cleanup of old `.praxisbase/exceptions/human-required` records.

## Success Criteria

- A non-degraded personal daily run can set `personal_ga.production_ready=true` when PB core succeeds.
- If production readiness is false, the remaining blockers are concrete external or hard-risk issues: AI unavailable, configured required source unavailable, SSH unavailable, or true secret/credential review.
- AgentMemory/GBrain failures do not fail personal GA unless explicitly configured as required.
- Latest-run privacy blockers are based on current hard risks, not the historical exception directory size.
- Safe personal lessons from local/remote OpenClaw and Codex sources are promoted to stable PB wiki or active personal context without manual review.
- HTML shows learned knowledge, usable agent context status, and any remaining blockers without exposing raw private values.
- `context get` returns PB stable knowledge and active personal lessons even when sidecars are down.

## Rollout

Implement as M25.2 on top of M25.1. Keep degraded no-AI smoke useful but explicitly non-GA. Record one final real-source validation report and treat subsequent work as enhancement unless a hard gate regresses.
