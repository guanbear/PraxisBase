# OpenSpec Change: SRE-autopilot K8s Incident Integration Boundary

## Why

PraxisBase Phase 1 focuses on OpenClaw sandbox repair, but the project explicitly intends to support K8s incident systems such as sre-autopilot. Without a written boundary, future implementations may accidentally turn PraxisBase into:

- a synchronous online dependency for live incidents,
- an internal database owned by sre-autopilot,
- or a production remediation executor.

This change defines the K8s incident integration contract early while keeping execution out of the OpenClaw MVP.

## What Changes

- Add a `k8s-incident` bundle profile contract.
- Define minimal manifest and per-signature bundle entry requirements.
- Define `incident_episode` expectations for live diagnosis systems.
- Define async episode/proposal outbox behavior.
- Clarify that missing PraxisBase context must not block live diagnosis.
- Clarify that production write operations are out of scope.

## Non-Goals

- Do not implement K8s runtime integration in Phase 1.
- Do not implement a long-running PraxisBase online service.
- Do not add Kubernetes write/remediation tools.
- Do not make sre-autopilot depend on PraxisBase availability.
- Do not replace sre-autopilot's RCA orchestration or alert ingestion.

## Acceptance Summary

- Design docs state that sre-autopilot is a peer client and PraxisBase is optional knowledge input.
- OpenSpec requires bundle fetch fallback and async outbox.
- BDD covers bundle-present, bundle-missing, episode outbox, proposal review, and no production writes.
- README links the integration design so future agents can discover it.

## Guardrails For Implementing Agents

- Keep OpenClaw MVP scoped; add protocol/schema affordances only when touching Phase 1.
- Treat K8s incident bundle as generated static context, not a live query API.
- Store source refs, hashes, and summaries; do not store raw production logs in Git.
- Require proposal/review/promotion for stable knowledge changes.
- Do not edit sre-autopilot implementation code from this change; define contracts, schemas, fixtures, and generated bundle behavior only.
