# Proposal: M29 Container Incident Experience

## Why

Container / K8s troubleshooting experience is one of the two real team-version scenarios (anchor line A). The integration boundary with `sre-autopilot` is already designed (`2026-05-18-sre-autopilot-k8s-incident-integration-design.md`) but unimplemented: no K8s seed pack, no incident bundle generator, no episode intake wired to review/promote.

M29 adds container/K8s as a second domain on the SAME protocol, reusing M28's object model, review/promote, and governance. It does not build a separate knowledge system.

Prerequisite: M28 team gates are fully green.

## Change

- Add a K8s signature detector and a K8s seed pack (5–10 signatures + triage skill) with production-read-only forbidden operations.
- Add a read-only `k8s-incident` bundle profile to build; add `bundle fetch k8s-incident --signature ...`.
- Wire `adapter/sre-autopilot.ts` incident episode/proposal intake through outbox → sync → team review/promote.
- Reuse M28 governance (reference tracking, maturity, decay, query budget, three-tier index) for k8s objects.
- Extend `team release-audit` with `k8s_bundle_ga`, `incident_episode_intake_ga`, `k8s_boundary_ga`.

## Scope

In scope: K8s seed pack, read-only incident bundle, episode/proposal intake, governance reuse, boundary guards, k8s release-audit gates.

Out of scope:
- sre-autopilot internals (Go analyzer, probes, MCP/HTTP, LLM loop).
- Live incident scheduling or alert-platform replacement.
- Any Kubernetes write permission.
- Production change execution.
- Storing full logs / sensitive fields in Git.

## Success Criteria

`praxisbase team release-audit --json` reports (in addition to M28 gates):
```text
k8s_bundle_ga: pass
incident_episode_intake_ga: pass
k8s_boundary_ga: pass
```

Required real checks:
```bash
praxisbase bundle fetch k8s-incident --signature k8s:pod-oomkilled --json
praxisbase episode submit incident-episode.json --json
praxisbase propose k8s-proposal.json --json
praxisbase review --auto --json
praxisbase promote --auto --json
praxisbase build --json
praxisbase team release-audit --json
```

Must prove: signature-filtered read-only bundle with forbidden operations; checksum-failure downgrade; sre-autopilot episode/proposal flowing into review/promote; k8s objects governed by the same lifecycle; no write permission and no production execution.

## Rollout

1. Freeze manifest/entry/episode/proposal fixtures against the integration contract.
2. K8s signature + seed pack.
3. Read-only incident bundle profile + fetch + downgrade.
4. Episode/proposal intake via outbox.
5. Governance reuse + boundary guards + k8s release-audit gates.
6. Real fixture validation + `docs/status/` record.

Do not implement sre-autopilot internals. Do not add production write paths.
