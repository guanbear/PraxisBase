# SRE-autopilot K8s Incident Integration Tasks

This change is primarily a boundary/spec change. Do not implement K8s runtime integration as part of the OpenClaw MVP.

- [x] Update the substrate design to describe live incident peer clients.
- [x] Add `k8s-incident` bundle profile requirements.
- [x] Add `incident_episode` requirements.
- [x] Add outbox/fallback requirements for live incident consumers.
- [x] Add BDD scenarios for bundle consumption, episode output, and no production writes.
- [x] Link the new design from README and README.zh-CN.

## Deferred Implementation Tasks

These belong to Phase 2:

- [x] Add K8s known-fix seed pack.
- [x] Generate `dist/repair-bundles/k8s-incident/*`.
- [x] Implement `praxisbase bundle fetch k8s-incident --signature ...`.
- [x] Add an sre-autopilot episode adapter example.
- [x] Add Feishu bot summary/proposal flow.
- [x] Add skill synthesis from confirmed episodes.
- [x] All Phase 2 tests passing (96/96).
- [x] Smoke flow verified (init, build, k8s fetch, episode submit, feishu summary, skill synthesis).

## Required Verification

- [x] Documentation links resolve.
- [x] OpenSpec and BDD do not require Phase 1 K8s runtime code.
- [x] `openclaw-repair-mvp` remains scoped to OpenClaw repair.
