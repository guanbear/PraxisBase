# Proposal: GBrain Backend Interop And PraxisBase Boundary Contraction

## Why

PraxisBase has grown enough adjacent capabilities that it risks becoming a second general-purpose brain runtime. GBrain already provides a mature brain layer: markdown/git brain repos, PGLite/Postgres indexing, hybrid search, graph traversal, `think` synthesis, MCP/OAuth access, multi-source team scoping, thin-client operation, capture/sync, and skillpack distribution.

PraxisBase should not duplicate that runtime. Its durable value is the agent experience compiler:

```text
raw agent evidence
  -> experience-fidelity compression
  -> AI distill
  -> wiki/skill candidate
  -> semantic review
  -> privacy gate
  -> promote
  -> stable kb/skills/site
  -> publish to agent-facing backends
```

This change makes GBrain the preferred long-term brain backend while keeping PraxisBase as the governance and synthesis layer.

## Reference Inputs

The GBrain integration is based on these source-level capabilities:

- `README.md`: `capture`, `search`, `query`, `think`, MCP, company brain, PGLite/Postgres, and brain repo as system of record.
- `docs/architecture/brains-and-sources.md`: `brain` as database and `source` as repo inside the database.
- `docs/architecture/RETRIEVAL.md`: hybrid search, graph traversal, ranking, reranking, and token budget model.
- `docs/architecture/topologies.md`: local brain, remote thin client, and split-engine deployment.
- `src/core/operations.ts` and `src/mcp/dispatch.ts`: shared operation contract, source scoping, MCP trust boundary, and remote/local caller distinction.
- `docs/GBRAIN_SKILLPACK.md` and `skills/RESOLVER.md`: skillpack as distribution and agent routing surface.

PraxisBase borrows the deployment and backend concepts, not GBrain's whole runtime or private user-specific schemas.

## What Changes

- Add a generic brain backend seam for source, sink, and retrieval roles.
- Convert the existing AgentMemory-specific interop into one backend adapter behind that seam.
- Add a GBrain adapter that supports local CLI first and remote MCP/OAuth second.
- Publish promoted PraxisBase wiki and skill knowledge into a GBrain source such as `praxisbase`.
- Let `context get` optionally merge GBrain retrieval, with stable PraxisBase `kb/skills` authority first.
- Add personal and team bootstrap guidance that prefers PB + GBrain, with AgentMemory as optional session sidecar.
- Mark PB's self-contained retrieval/MCP/team-brain ambitions as fallback or compatibility paths, not the product direction.

## What Does Not Change

- GBrain does not replace PraxisBase's distill, curation, semantic review, privacy gates, promotion audit, or stable `kb/skills`.
- AgentMemory is not deleted; it becomes an optional session memory backend.
- Raw evidence, rejected candidates, human-required material, and personal/private content are not exported to team GBrain sources.
- Stable skill creation remains proposal-only until audited promotion.
- Team mode still treats GitLab/Git as the reviewed knowledge authority; GBrain indexes or serves reviewed knowledge but does not bypass review.

## Success Criteria

- A user can run a personal daily flow that ingests Codex/OpenClaw/remote OpenClaw evidence, promotes safe stable knowledge, publishes reviewed results to local GBrain, and retrieves it through GBrain without exposing raw evidence.
- A team can publish only reviewed team-safe knowledge to a scoped GBrain source backed by GitLab-reviewed PraxisBase `kb/skills`.
- `context get --with-gbrain` shows stable PraxisBase hits before GBrain sidecar hits and marks source/provenance clearly.
- GBrain unavailability produces warnings and does not block local PraxisBase review/promote flows.
- AgentMemory remains usable through the same backend seam without privileged status.
- Documentation makes clear which PB modules are retained and which GBrain-backed capabilities should not be rebuilt in PraxisBase.
