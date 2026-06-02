# M29 Container Incident Experience Tasks

## 1. K8s Signature + Seed Pack

- [x] Add K8s signature detector (`k8s:*`) in `repair/signature.ts`.
- [x] Add seed pack: 5–10 known_fixes with production-read-only forbidden_operations + `skills/k8s/incident-triage/SKILL.md`.
- [x] Tests: signature detection; seed safety fields present.

## 2. Read-Only Incident Bundle

- [x] Add `k8s-incident` profile to build; emit `dist/repair-bundles/k8s-incident/{manifest.json,<signature>.json}`.
- [x] Implement `bundle fetch k8s-incident --signature <sig>` returning a compact signature-filtered bundle.
- [x] Manifest per-entry checksum + risk; checksum mismatch rejects entry; missing bundle downgrades to cache/empty + warning.
- [x] Tests: signature filter; checksum reject; downgrade.

## 3. Episode/Proposal Intake

- [x] Wire `adaptDirectionResult` output through outbox → sync → inbox.
- [x] Support incident result confirmed/ruled_out/inconclusive/data_gap.
- [x] Tests: adapter emits valid IncidentEpisode/Proposal; outbox idempotency.

## 4. Governance Reuse + Boundary + Gates

- [x] Ensure k8s objects flow through M28 reference tracking, maturity, decay, query budget, three-tier index.
- [x] Extend `team release-audit` with `k8s_bundle_ga`, `incident_episode_intake_ga`, `k8s_boundary_ga`.
- [x] Boundary: no K8s write permission; bundle recommendation-only; new default skill human-required; forbidden_operations mandatory.
- [x] Tests: shared governance over k8s; boundary guards; gate classification.

## 5. Real Validation + Status

- [x] Run full fixture chain: bundle fetch → episode → propose → review → promote → build → audit.
- [x] k8s gates + `team_ga` green.
- [x] Write `docs/status/m29-container-incident-experience-<date>.md`.
- [x] `pnpm check` passes.
