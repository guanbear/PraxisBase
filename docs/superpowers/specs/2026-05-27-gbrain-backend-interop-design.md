# GBrain Backend Interop Design

## Goal

Make PraxisBase useful with GBrain without turning PraxisBase into a duplicate GBrain. GBrain should become the preferred long-term brain backend for retrieval, graph, MCP, source scoping, and team access. PraxisBase should keep the governed experience pipeline that turns raw agent work into stable wiki and skills.

## Product Boundary

GBrain owns:

- long-term personal/team brain storage;
- markdown/git brain repo indexing;
- PGLite/Postgres and graph-backed retrieval;
- MCP/OAuth and source-scoped remote access;
- capture/sync/autopilot brain runtime;
- general skillpack distribution.

PraxisBase owns:

- Codex/OpenClaw/remote OpenClaw/AgentMemory evidence ingestion;
- experience-fidelity compression before AI;
- AI distill from raw agent work into reusable observations;
- wiki and skill candidate synthesis;
- semantic review, privacy gates, human-required queues, and promotion audit;
- stable `kb/**`, stable `skills/**`, and an experience governance HTML site;
- publishing reviewed knowledge to GBrain and other backends.

AgentMemory stays optional as session memory. It is useful for short-lived agent session recall, but it should not be the default long-term brain.

## Architecture

```text
source adapters
  -> backend source adapters
  -> evidence envelopes
  -> context economy
  -> AI distill
  -> wiki/skill curation
  -> semantic review + privacy gates
  -> promote
  -> stable kb/skills
  -> backend sink adapters
  -> GBrain source / AgentMemory / generated agent assets
```

The new architectural seam is a backend-neutral interface with three optional roles:

- source backend;
- sink backend;
- retrieval backend.

GBrain and AgentMemory are concrete adapters. The seam becomes legitimate because there are two adapters with different capabilities and operational models.

## GBrain Integration

The first GBrain adapter should support local CLI because it is easy to inspect:

- `gbrain doctor` for health;
- `gbrain search/query --json` for retrieval;
- `gbrain capture --json --source praxisbase` or MCP `put_page` for publication;
- explicit source id selection.

GBrain is MIT licensed, so direct code reuse is legally possible when attribution is preserved. It should not be the default architecture. GBrain's package is Bun-first, its bin points at `src/cli.ts`, its exports expose TypeScript source modules, and its runtime owns database engines, config, migrations, MCP server behavior, and many provider dependencies. Importing it as a library would make PraxisBase depend on GBrain internals and release cadence. The default should be external CLI/MCP integration.

The second adapter should support remote HTTP MCP/OAuth for team and cross-machine use:

- `issuer_url`;
- `mcp_url`;
- `oauth_client_id`;
- secret env var name;
- source id;
- timeout.

Remote secrets must never be stored directly in PB reports or committed config.

GBrain is installed once per local machine or hosted once as a remote service. PraxisBase should not reinstall it per run. PB should provide doctor/bootstrap guidance and continue core governance flows when GBrain is absent.

## Authority Rules

PraxisBase stable knowledge outranks all sidecars. GBrain can return excellent context, but it cannot decide promotion state inside PB.

Context ranking order:

1. stable PB `kb/skills`;
2. compiled PB graph/root artifacts;
3. GBrain sidecar;
4. AgentMemory sidecar;
5. raw audit-only evidence.

Sidecar results become promotion evidence only after explicit import into PB evidence envelopes with source refs and hashes.

## Publication Contract

PB publishes only reviewed stable knowledge. It does not publish raw evidence, rejected candidates, privacy-blocked material, or human-required items.

Default GBrain source: `praxisbase`.

Published page classes:

- `praxisbase/wiki/<slug>`;
- `praxisbase/skills/<slug>`;
- `praxisbase/reports/<report-id>` for redacted aggregate summaries only.

Every published page carries PB metadata: source hashes, review id, promotion id, scope, maturity, and original PB path.

## Team Mode

For teams, GitLab-reviewed PB knowledge remains the authority. GBrain is the index and agent access surface. GBrain source/OAuth scope is necessary but not sufficient: PB privacy gates must pass before export.

Personal evidence cannot enter team GBrain sources by default. Promotion must carry a team-safe privacy verdict and audit metadata.

## UI

PB HTML should show experience governance:

- stable experience pages;
- pending candidates;
- semantic review decisions;
- privacy blocks;
- backend health;
- publish status.

It should not compete with GBrain as a full brain browser.

## Non-Goals

- Replacing GBrain's graph or vector retrieval in PB.
- Building a full PB MCP/OAuth server.
- Replacing GBrain source/mount/team-brain management.
- Replacing GBrain skillpack package management.
- Removing AgentMemory support.

## Acceptance

This design is accepted when a user can run a personal PB daily flow, publish reviewed stable output to GBrain, retrieve it through `context get --with-gbrain`, and prove that raw/private material is not exported. Team mode must require PB promotion audit before GBrain publication.
