# Tasks

## M20.1 Boundary And Backend Seam

- [x] Add a backend-neutral source/sink/retrieval interface in core.
- [x] Move AgentMemory adapter behind the backend interface without changing current CLI behavior.
- [x] Add backend registry, source config validation, and diagnostics report shape.
- [x] Add docs that mark PB general retrieval/MCP/team-brain features as compatibility paths when GBrain is configured.
- [x] Add tests proving AgentMemory still works through the new seam.

## M20.2 GBrain Local Backend

- [x] Add local GBrain config schema with persisted CLI path, source id, timeout, and publish mode.
- [x] Add `praxisbase gbrain doctor` for local `gbrain doctor --fast --json` diagnostics and missing-binary setup guidance.
- [x] Extend `praxisbase gbrain doctor` with version, source availability, and publish readiness.
- [x] Add local retrieval adapter using bounded `gbrain search/query` output with JSON-when-available and text-row fallback.
- [x] Add local sink skeleton that exports only stable PB wiki/skill pages and can call `gbrain capture`.
- [x] Add source-aware GBrain publishing to a configured `praxisbase` source.
- [x] Add local source adapter that can ingest selected GBrain pages/search results as PB evidence when explicitly requested.
- [x] Add tests with mocked GBrain CLI output and failures.

## M20.3 Remote GBrain Backend

- [x] Add remote MCP/OAuth config with issuer URL, MCP URL, client id, secret env var, source id, and timeout.
- [x] Add bearer safety checks for remote HTTP and secret redaction in reports.
- [x] Add remote retrieval adapter using MCP `search/query/think` operations.
- [x] Add remote sink adapter using MCP `put_page` or equivalent operation.
- [x] Add source scope diagnostics for team mode.
- [x] Add tests for unsafe auth, timeout, and source mismatch failures.

## M20.4 Context And Daily Integration

- [x] Add `context get --with-backend <name>` plus `--with-gbrain` alias.
- [x] Preserve PB stable authority ranking above GBrain and AgentMemory sidecars.
- [x] Add daily publish step after stable PB promotion.
- [x] Add daily report fields for backend health, imported counts, published counts, skipped counts, and warnings.
- [x] Add site cards for GBrain connection and publication status.
- [x] Add real personal smoke with GBrain mocked or local if installed.

## M20.5 Team Mode And GitLab Authority

- [x] Add team policy flag for publishing promoted team-safe PB knowledge to GBrain.
- [x] Require promotion audit and team-safe privacy verdict before team GBrain publish.
- [x] Block personal evidence export into team GBrain sources by default.
- [x] Add GitLab-oriented docs that treat GitLab-reviewed PB repo as authority and GBrain as index/access layer.
- [x] Add tests proving source/OAuth scope alone cannot bypass PB privacy gates.

## M20.6 Agent Guidance And Migration

- [x] Update generated PB agent skill to prefer GBrain MCP for broad brain lookup and PB CLI for governed experience operations.
- [x] Add first-run personal bootstrap docs for PB + GBrain.
- [x] Add migration docs for current AgentMemory users.
- [x] Add deprecation notes for PB-only general brain workflows when GBrain is configured.
- [x] Add final verification checklist and run focused tests.
