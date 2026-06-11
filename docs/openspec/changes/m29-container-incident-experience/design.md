# M29 Container Incident Experience — OpenSpec Design

Full rationale: `docs/superpowers/specs/2026-06-04-m29-container-incident-experience-design.md` and the integration contract `docs/superpowers/specs/2026-05-18-sre-autopilot-k8s-incident-integration-design.md`. This file records implementation-facing decisions.

## Decisions

### D1. Same protocol, second domain

K8s objects reuse `IncidentEpisode` and `Proposal` from `protocol/schemas.ts`. Domain is `k8s`, signatures use the `k8s:*` namespace, scope is `team`. No parallel object types.

### D2. Read-only bundle

`bundle fetch k8s-incident --signature <sig>` returns a compact, signature-filtered bundle: matching known_fixes/procedures/skills + forbidden_operations + verification_steps + rollback/escalation + source_refs. Manifest carries protocol_version/bundle_id/generated_at/commit_sha/compatible_cli and per-entry checksum + risk. Checksum mismatch rejects the entry; missing bundle returns last-known-good cache or an empty bundle with a warning. Consumers must continue diagnosing from rules + live evidence when the bundle is absent.

### D3. Intake via existing adapter

`adapter/sre-autopilot.ts::adaptDirectionResult` already emits `IncidentEpisode` (+ optional `Proposal`). M29 wires its output through `.praxisbase/outbox/{episodes,proposals}` → sync → inbox → M28 team review/promote.

### D4. Governance reuse

K8s objects flow through M28 reference tracking, maturity promotion/decay, query budget, and three-tier index unchanged. No domain-specific governance is written.

### D5. Boundary guards

PB grants no Kubernetes permissions. Bundles are recommendation-only. New default k8s skills require human approval. Forbidden operations are mandatory on every k8s known_fix. No full logs / sensitive fields enter Git; evidence is redacted with source URI + hash.

## Affected Modules

- `repair/signature.ts` (k8s detector)
- `templates/seed.ts` (k8s seed pack)
- `bundles/fetch.ts`, `build/build.ts` (k8s-incident profile)
- `adapter/sre-autopilot.ts` (intake wiring), `store/file-store.ts`
- `experience/team-release-audit.ts` (k8s gates)
- reuse M28 `review/*`, `promote/*`, governance engine

## Test Matrix

k8s signature detection; seed safety fields; signature-filtered bundle; checksum-fail downgrade; adapter emits valid objects; outbox idempotency; k8s objects governed by shared lifecycle; boundary guards; k8s release-audit gates.
