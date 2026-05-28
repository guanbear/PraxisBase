# Design: GBrain Backend Interop And Boundary Contraction

## Positioning

PraxisBase becomes the agent experience compiler. GBrain becomes the preferred long-term brain runtime. AgentMemory becomes an optional session-memory sidecar.

```text
Codex/OpenClaw/remote OpenClaw/AgentMemory/GBrain sources
  -> PraxisBase evidence ingestion
  -> context economy
  -> AI distill
  -> wiki/skill candidate synthesis
  -> semantic review + privacy gates
  -> promotion audit
  -> stable kb/skills
  -> GBrain source publication + optional AgentMemory export
  -> agents consume via GBrain MCP, PB CLI, or generated skills
```

The design intentionally avoids making PraxisBase a second GBrain. PraxisBase owns the lifecycle from raw agent work to governed reusable knowledge. GBrain owns mature brain storage, graph retrieval, MCP/OAuth, source scoping, and team-facing access.

## Backend Roles

A backend may implement any subset of three roles:

- **source**: import memories/pages/search results into PraxisBase evidence envelopes;
- **sink**: receive reviewed stable PraxisBase lessons, wiki pages, and promoted skills;
- **retrieval**: provide optional sidecar context for `context get`.

The backend seam is real only when both AgentMemory and GBrain use it. Existing AgentMemory code should be adapted, not discarded.

Initial backend types:

- `agentmemory`: REST session memory backend already present;
- `gbrain-local`: local `gbrain` CLI and local MCP stdio;
- `gbrain-remote`: HTTP MCP/OAuth GBrain server;
- future `none`: explicit no-sidecar backend for locked-down deployments.

## Authority Model

PraxisBase stable files remain authoritative for experience knowledge:

- `kb/**` for stable wiki pages;
- `skills/**` for promoted skills;
- `.praxisbase/inbox/proposals/**` for candidates;
- `.praxisbase/reports/**` for audit and observability.

GBrain may be an authority for general personal/team brain content, but not for whether an agent work lesson is promoted inside PraxisBase. When PB publishes to GBrain, GBrain receives a mirror or consumer-facing page with PB provenance and promotion metadata.

Retrieval order:

1. stable PB `kb/skills`;
2. compiled PB root artifacts and graph neighbors;
3. GBrain retrieval sidecar hits;
4. AgentMemory sidecar hits;
5. raw evidence only when explicitly requested for audit.

Sidecar hits cannot count as promotion evidence unless ingested into PraxisBase with source refs and hashes.

## GBrain Local Adapter

The local adapter shells out to the `gbrain` CLI or uses stdio MCP where available. The first implementation should prefer CLI because it is easier to inspect and diagnose.

GBrain is MIT licensed, so PraxisBase may legally reference, adapt, or vendor compatible code with proper license attribution. The integration should still treat GBrain as an external runtime rather than importing its core modules directly. Its package is Bun-first, exposes TypeScript source exports, owns database configuration and migrations, and carries a large runtime dependency set. Direct library imports would couple PraxisBase to GBrain's engine lifecycle, config resolution, and release cadence. CLI/MCP adapters keep the seam explicit and let users upgrade GBrain independently.

Supported operations:

- doctor: `gbrain doctor` and version detection;
- source import: `gbrain search/query` with JSON parsing when the command returns JSON and text-row parsing for the current local `query` output;
- sink publish: `gbrain capture --json --source praxisbase --slug <slug>` or MCP `put_page`;
- retrieval: `gbrain search/query` with a bounded limit, timeout, and explicit source selection when supported by the configured GBrain runtime;
- setup hints: explain how to initialize GBrain and create or select a `praxisbase` source.

The adapter must not require GBrain for PB core commands. If the CLI is missing, PB reports `gbrain_unavailable` and continues locally.

Users do not install GBrain on every PraxisBase run. They either install and initialize GBrain once for local use, or configure a remote GBrain HTTP MCP endpoint. PraxisBase should detect the configured path, run diagnostics, and print exact setup commands when GBrain is absent.

## GBrain Remote Adapter

The remote adapter uses GBrain HTTP MCP/OAuth for team and cross-machine setups.

Required config:

- `issuer_url`;
- `mcp_url`;
- `oauth_client_id`;
- secret env var name, not inline secret;
- optional `source_id`;
- optional `federated_read` list for diagnostics only.

Security rules:

- bearer/client secrets are never written into reports;
- HTTP without TLS is allowed only for loopback;
- remote write requires an explicit configured GBrain source;
- team export requires `mode=team`, team policy enabled, and team-safe promotion metadata;
- personal evidence cannot be exported to team GBrain sources by default.

## Publication Shape

Published GBrain pages should be class-level and auditable, not raw transcript dumps.

Default GBrain source: `praxisbase`.

Default slug conventions:

- `praxisbase/wiki/<page-slug>` for stable wiki pages;
- `praxisbase/skills/<skill-slug>` for promoted skill summaries;
- `praxisbase/reports/<report-id>` only for redacted aggregate run summaries.

Published frontmatter includes:

- `generated_by: praxisbase`;
- `praxisbase_kind: wiki|skill|run_summary`;
- `praxisbase_path`;
- `promotion_id`;
- `review_id`;
- `source_hashes`;
- `scope`;
- `maturity`;
- `published_at`.

Published body includes summary, reusable procedure or lesson, verification, related PB pages, and provenance pointers. It must not include raw evidence bodies, secrets, rejected candidates, or human-required material.

## Context Retrieval

`praxisbase context get` gains backend-neutral options:

```bash
praxisbase context get --query "openclaw ack timing" --with-backend gbrain
praxisbase context get --query "openclaw ack timing" --with-gbrain
praxisbase context get --query "openclaw ack timing" --with-agentmemory
```

`--with-gbrain` is a compatibility alias for `--with-backend gbrain`.

The response marks item authority:

- `stable_praxisbase`;
- `compiled_praxisbase`;
- `gbrain_sidecar`;
- `agentmemory_sidecar`;
- `raw_audit`.

PB stable results always outrank sidecar results even when GBrain search scores are higher. This protects the governed experience layer.

## Daily Flow

Personal daily can:

1. ingest local Codex/OpenClaw/remote OpenClaw and optional backend sources;
2. reduce and distill evidence;
3. synthesize and review wiki/skill candidates;
4. auto-promote only configured low-risk personal knowledge;
5. publish changed stable PB knowledge to local GBrain;
6. build the PB site;
7. report backend health and publish counts.

Team daily can:

1. ingest team-safe sources only;
2. block personal/private uncertainty before synthesis;
3. create candidates and reports;
4. require GitLab/human promotion;
5. publish only promoted team-safe pages to team GBrain source;
6. never use GBrain source scoping as a substitute for PB privacy review.

## UI And Site

PraxisBase HTML should not become a general brain browser. It should show:

- stable experience pages;
- review/promotion state;
- privacy blocks;
- backend publication status;
- GBrain/AgentMemory health;
- exact commands for failed backend setup.

GBrain remains the better browsing and MCP surface for general brain search.

## De-Duplication Of Product Surface

Capabilities PB should stop expanding as primary surfaces:

- general vector/graph retrieval;
- full MCP/OAuth server;
- general team brain source/mount management;
- general capture/sync/autopilot runtime;
- general skillpack package management.

PB keeps narrow compatibility implementations only where they are needed to run without GBrain.

## Failure Modes

- GBrain CLI missing: continue local flow; report setup command.
- GBrain remote auth failure: block remote operations and redact auth material.
- GBrain publish rejected: keep PB stable changes; write retryable publish report.
- Sidecar retrieval timeout: return stable PB context plus warning.
- Source scope mismatch: block team export and require config correction.
- Published page drift: republish idempotently based on PB promotion id and source hashes.

## Testing Strategy

- Unit tests for backend registry, ranking authority, publish payload shape, and secret redaction.
- CLI tests for local GBrain doctor/import/export/retrieval commands with mocked process execution.
- MCP tests for remote adapter request shape and unsafe bearer blocking.
- Daily tests proving GBrain failure does not block PB promotion.
- BDD scenarios for personal publishing, team privacy blocking, and AgentMemory coexistence.
