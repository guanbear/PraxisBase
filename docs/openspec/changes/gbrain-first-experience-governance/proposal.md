# Proposal: GBrain-First Experience Governance

## Why

GBrain is already the stronger brain runtime for agents. It provides MCP, long-term retrieval, graph, embeddings, schema packs, source scoping, and team access. PraxisBase should not rebuild those surfaces.

PraxisBase still has value as the governed experience compiler for agent repair and operational traces. It turns noisy Codex/OpenClaw/remote agent evidence into reviewed, provenance-backed wiki and skill assets before publishing them to GBrain.

This change makes that boundary explicit and improves the two current personal-mode blockers:

- too many privacy triage items remain opaque to the user;
- quality gates are safe but too often produce no useful merge/update/retry output.

## What Changes

- Make GBrain MCP the recommended agent brain for Codex/OpenClaw when configured.
- Update PB bootstrap, doctor, generated skill, and HTML to describe PB as governance/refinery, not primary brain runtime.
- Improve privacy triage UX and personal auto-release for safe local evidence.
- Improve quality yield without lowering promotion gates:
  - merge/update proposals for semantic merge decisions;
  - revision retry for incomplete skill candidates;
  - clearer low-signal/rejected evidence reporting.
- Keep GBrain publishing limited to stable reviewed PB knowledge.

## What Does Not Change

- PB still owns distill, privacy, semantic review, proposal, promote, and audit.
- GBrain sidecar hits do not become PB promotion evidence unless explicitly imported with source refs and hashes.
- Team mode still requires Git/GitLab or human promotion authority.
- PB MCP remains optional and governance-focused.
- AgentMemory remains a session sidecar, not the long-term brain default.

## Success Criteria

- A generated PB agent skill tells Codex/OpenClaw to use GBrain MCP for broad lookup and PB for governed experience operations.
- Personal doctor reports GBrain readiness or setup guidance.
- Privacy triage counts are separated from review and quality blocks in daily reports/site.
- A safe personal auto-release path exists for local Codex/OpenClaw evidence.
- Semantic merge decisions create reviewable merge/update candidates.
- Incomplete skills do not promote and get precise revision reasons.
- Stable reviewed PB knowledge can be published to GBrain without raw evidence leakage.
