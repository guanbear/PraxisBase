---
change: knowledge-base-filter-rules
design-doc: docs/superpowers/specs/2026-06-17-knowledge-base-filter-rules-design.md
base-ref: b842e14
---

# Implementation Plan

1. Extend project config types and parsing for object-form knowledge bases.
2. Add per-KB filter evaluation helpers with OpenClaw, K8s, container, verification/escalation, and greeting-only built-ins.
3. Wire per-KB filtering into `buildWikiEvidencePoolFromRoot` while preserving `.praxisbase/filter-rules.yaml`.
4. Render rule summaries on the dashboard and write `dist/knowledge-config.json`.
5. Update `.praxisbase/config.yaml` to object-form OpenClaw and K8s bases.
6. Add/adjust tests, then run focused TypeScript build and test commands.
