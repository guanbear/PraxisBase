# SRE-autopilot K8s Incident Integration Design

## Overview

This change defines how PraxisBase should serve live K8s incident systems without becoming their runtime dependency. SRE-autopilot consumes optional static repair bundles and emits incident episodes/proposals. PraxisBase remains the Git-backed knowledge authority and review/promotion lane.

## Runtime Flow

```text
PraxisBase build
  -> dist/repair-bundles/k8s-incident/manifest.json
  -> sre-autopilot fetches optional matching bundle
  -> sre-autopilot runs live rules, probes, and AI review/investigation
  -> sre-autopilot returns DirectionResult to caller
  -> sre-autopilot writes incident episode/proposal to outbox or submit endpoint
  -> PraxisBase review/promote/build updates future bundles
```

## Bundle Shape

The `k8s-incident` profile should support one manifest and per-signature entries:

```text
dist/repair-bundles/k8s-incident/
  manifest.json
  k8s-pod-oomkilled.json
  k8s-pod-crashloop-imagepull.json
```

Each entry includes:

- `protocol_version`
- `signature`
- `domain`
- `status`
- `risk`
- `known_fixes`
- `skills`
- `forbidden_operations`
- `verification_steps`
- `source_refs`

## Episode Shape

`incident_episode` differs from OpenClaw `repair_episode`:

| Field | `repair_episode` | `incident_episode` |
| --- | --- | --- |
| Result | success/failed/partial | confirmed/ruled_out/inconclusive/data_gap |
| Environment | sandbox | prod/staging/cluster |
| Action | may repair inside sandbox | diagnosis only by default |
| Evidence | sandbox logs | Prometheus/K8s events/log refs/tickets |

## Outbox

Live incident consumers may not have Git push access. They must be able to write:

```text
.praxisbase/outbox/episodes/*.json
.praxisbase/outbox/proposals/*.json
```

or call a future restricted submission gateway. Outbox write failure is a telemetry/data-gap problem, not a live incident failure.

## Safety

- PraxisBase must not grant Kubernetes permissions.
- Bundles must not include executable production remediation commands as automatic actions.
- Recommendations must include verification, rollback/escalation, and owner approval language when production changes are involved.
- High-risk proposal types remain human-required.

## Phase Boundary

OpenClaw MVP may add shared schemas and manifest fields that make this possible, but it should not implement K8s ingestion or sre-autopilot adapters in the same change.
