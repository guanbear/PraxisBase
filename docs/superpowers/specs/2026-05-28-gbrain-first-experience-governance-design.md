# GBrain-First Experience Governance Design

## Purpose

PraxisBase must stop competing with GBrain as a general brain runtime. GBrain already owns the durable brain surface: markdown brain repo, PGLite/Postgres index, hybrid search, graph traversal, `think` synthesis, MCP/OAuth, source scoping, schema packs, skillpacks, and daily enrichment.

PraxisBase remains useful only if it owns a narrower job that GBrain does not make explicit as a governed release lane:

```text
raw agent work
  -> privacy triage
  -> experience-fidelity compression
  -> wiki/skill candidate synthesis
  -> deterministic + LLM semantic review
  -> review/promote audit
  -> stable experience knowledge
  -> publish to GBrain
```

This means PB is the experience refinery. GBrain is the agent brain.

## Why GBrain Alone Is Not Enough

GBrain can capture pages, search them, synthesize answers, maintain graph links, expose MCP tools, run schema mutation, and serve as the system of record for a brain. It can store raw evidence and it can let agents write pages.

That is not the same as a release pipeline for agent repair experience. The missing PB-shaped concerns are:

- raw Codex/OpenClaw traces are noisy and often private;
- a repair log is not automatically reusable guidance;
- team knowledge must not receive personal material just because a GBrain source scope allows writes;
- generated skills need stricter actionability and safety review than ordinary notes;
- low-quality run reports should become evidence or merge proposals, not stable pages;
- humans need an audit page showing what was blocked, why, and what command fixes the queue.

GBrain should be the backend and MCP access layer. PB should decide what is safe and valuable enough to publish there.

## Product Boundary

### GBrain Owns

- Agent-facing MCP for Codex, OpenClaw, Claude Code, Cursor, and remote agents.
- Long-term retrieval, embeddings, graph search, schema packs, and brain repo sync.
- General capture of ideas, pages, people, companies, meetings, and compiled truth.
- Team brain access through GBrain OAuth/source scoping.
- Brain browsing and broad knowledge answer synthesis.

### PraxisBase Owns

- Agent repair/operation evidence ingestion from Codex, OpenClaw, remote OpenClaw, logs, and explicit GBrain imports.
- Privacy triage before evidence can become synthesis input.
- Experience-fidelity compression: preserve the fix, trigger, verification, and provenance while removing raw transcript noise.
- Wiki/skill candidate generation for reusable agent experience.
- Deterministic gates plus LLM semantic review.
- Review/promote audit and HTML governance UI.
- Publishing only stable reviewed pages/skills into GBrain.

### PraxisBase Keeps As Compatibility

- `praxisbase context get` for governed PB context and debugging.
- PB MCP bridge for governance operations only, not general brain search.
- AgentMemory as session-level sidecar, not a long-term brain replacement.

## Default Agent Flow

Agents should use GBrain first for broad knowledge:

```text
agent starts task
  -> GBrain MCP search/query/think for broad brain context
  -> PB context get only for governed PB experience context when needed
  -> agent completes task
  -> PB captures or harvests evidence
  -> PB daily distills/reviews/promotes
  -> PB publishes stable knowledge back to GBrain
```

Generated PB skills should say this directly. PB should not tell agents to treat PB MCP as the primary brain when GBrain is configured.

## Privacy Triage Improvement

The current `privacy_required: 28` is a useful safety signal but a poor product state. Personal mode should be able to release safe local evidence without requiring the user to inspect dozens of items manually.

Required behavior:

- Personal mode auto-release should be aggressive for local personal agent evidence that contains no credentials, no third-party private identifiers, no team/customer scope, and no raw secret-like content.
- Personal mode may also auto-release explicitly trusted personal remote OpenClaw sources with `privacy_trust: trusted_personal_remote`, but only when the source default scope is personal, the evidence matches the configured source, AI classifies it as high-confidence `safe_personal_experience`, and deterministic secret/private hard blocks pass.
- Team mode remains review-first; no personal evidence crosses into team stable knowledge without explicit team-safe classification.
- HTML must separate counts:
  - `privacy_required`;
  - `review_required`;
  - `quality_rejected`;
  - `low_signal`;
  - `stale_or_duplicate`.
- Each privacy item shown in HTML must include source, redacted summary, blocking reason, and next command.

## Quality Yield Improvement

The current quality gate is correctly conservative, but it wastes high-value evidence when it only rejects instead of turning material into merge/update/retry work.

Required behavior:

- Single run reports default to evidence, not new stable pages.
- If a candidate overlaps an existing page, the LLM semantic review should prefer `merge`; PB should materialize a merge/update proposal rather than dropping the useful part.
- If skill synthesis produces incomplete procedure steps, the candidate must be revised automatically once before it becomes human-required.
- A high-signal personal cluster can produce a private draft candidate without auto-promoting to stable knowledge.
- Promote thresholds should not be lowered. Improve evidence selection, clustering, rewrite, and merge handling instead.

## Trusted Personal Remote Sources

Remote sources are not trusted by default. A source such as a personal SSH OpenClaw memory export can opt into reduced review friction by setting:

```json
{
  "agent": "openclaw",
  "source_type": "ssh",
  "scope_default": "personal",
  "privacy_trust": "trusted_personal_remote"
}
```

This flag only removes the deterministic `remote_source_requires_review` blocker. It does not bypass AI privacy classification, secret detection, concrete private value detection, team-mode review-only behavior, or scope checks. Team and org sources cannot use this as an auto-release shortcut.

## GBrain Publication

PB publishes only stable reviewed knowledge to GBrain.

Published pages must include:

- `generated_by: praxisbase`;
- `praxisbase_kind: wiki|skill`;
- `praxisbase_path`;
- `promotion_id` or review id when available;
- `source_hashes`;
- `scope`;
- `maturity`;
- `published_at`.

Published pages must not include:

- raw transcript bodies;
- pending proposals;
- rejected candidates;
- human-required material;
- secrets or untriaged private content.

## HTML Governance UI

PB HTML should not become a GBrain browser. It should show:

- GBrain MCP/publish status and setup commands;
- privacy triage queue with safe auto-release command;
- review queue with semantic review decision and reason;
- rejected/low-signal queue for observability;
- stable experience pages that were published to GBrain.

The main user question on the PB page is: "What experience is blocked, reviewable, promoted, or published?"

## Acceptance Criteria

- `personal init` and generated agent skill state that GBrain MCP is the default agent brain when configured.
- `personal doctor` reports GBrain readiness and exact MCP setup guidance.
- `daily run --publish-gbrain` publishes only stable reviewed PB knowledge.
- Privacy triage can reduce safe personal local evidence without exposing raw bodies.
- A real small daily run can show why candidates were rejected, merged, revised, or held for privacy.
- PB docs clearly say GBrain can be used directly by OpenClaw/Codex for retrieval, while PB is retained for governed experience distillation.
