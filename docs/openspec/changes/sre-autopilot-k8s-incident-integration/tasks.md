# SRE-autopilot K8s Incident Integration Tasks

This change is primarily a boundary/spec change. Do not implement K8s runtime integration as part of the OpenClaw MVP.

- [ ] Update the substrate design to describe live incident peer clients.
- [ ] Add `k8s-incident` bundle profile requirements.
- [ ] Add `incident_episode` requirements.
- [ ] Add outbox/fallback requirements for live incident consumers.
- [ ] Add BDD scenarios for bundle consumption, episode output, and no production writes.
- [ ] Link the new design from README and README.zh-CN.

## Deferred Implementation Tasks

These belong to Phase 2:

- [ ] Add K8s known-fix seed pack.
- [ ] Generate `dist/repair-bundles/k8s-incident/*`.
- [ ] Implement `praxisbase bundle fetch k8s-incident --signature ...`.
- [ ] Add an sre-autopilot episode adapter example.
- [ ] Add Feishu bot summary/proposal flow.

## Required Verification

- Documentation links resolve.
- OpenSpec and BDD do not require Phase 1 K8s runtime code.
- `openclaw-repair-mvp` remains scoped to OpenClaw repair.
