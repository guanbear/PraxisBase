# Change: Collective Skill And Knowledge Governance

## Why

PraxisBase already has a GBrain-first experience governance path and a governed skill synthesis lane, but the next phase needs to connect three ideas into one coherent product surface:

- Tencent's Harness Engineering article: harnesses and workflows are replaceable; governed team knowledge is the durable moat.
- SkillClaw paper and source: real agent sessions contain skill-use evidence, trajectory signals, and validation opportunities that can improve skills over time.
- PraxisBase runtime boundary: GBrain is the default MCP brain, AgentMemory is optional sidecar/cache, and PraxisBase remains the governed compiler and authority for stable experience.

M22 is adding incremental session source tracking and skill origin metadata. This change is intentionally after M22: it uses that source ledger and origin metadata to add lifecycle, trajectory attribution, validation, and publishing improvements without changing the M22 implementation surface.

## What Changes

- Add a first-class knowledge lifecycle model that turns `maturity` into governed behavior:
  - promotion from `draft` to `verified` to `proven`;
  - decay from `proven` or `verified` when knowledge is stale, contradicted, or unused;
  - archive proposals for persistent low-signal or stale knowledge.
- Add a generated knowledge catalog as the agent-facing map of stable PB experience.
- Extend experience envelopes with SkillClaw-inspired trajectory and skill attribution fields after M22 source item identity exists.
- Improve skill synthesis with SkillClaw-inspired diagnosis:
  - distinguish skill problem, agent problem, and environment problem;
  - support `optimize_description`, targeted update, support-file update, create, and skip outcomes;
  - preserve update-before-create and audit-before-promote rules.
- Add skill validation as a proposal/audit evidence stage, not a direct promotion path.
- Export promoted stable skills, not only stable wiki pages, to GBrain and optional AgentMemory.
- Keep GBrain as the runtime MCP brain and AgentMemory as optional session sidecar/cache.

## Goals

- Make PraxisBase's knowledge moat concrete: layered, typed, mature, decaying, and promotable knowledge.
- Use real session trajectories to improve skill quality without adopting SkillClaw's proxy/runtime or direct shared-skill mutation model.
- Improve personal mode as a local proving ground while preserving user audit for stable skills.
- Improve team mode as the collective evolution path with privacy, Git/human review, and cross-source validation.
- Make stable skills visible to GBrain and optional AgentMemory after promotion.

## Product Outcomes

When fully implemented, this change should make the following user-visible outcomes true:

- Repeated agent failures can become governed reusable knowledge with source refs, privacy status, review state, and verification evidence.
- Stable skills improve from real usage signals before new skills are created.
- Stale or contradicted knowledge leaves the active context path through reviewable lifecycle proposals.
- Personal mode can collect and validate local evidence without publishing private material to team knowledge.
- Team mode can aggregate safe evidence from multiple agents while requiring Git/human review before stable team knowledge changes.
- GBrain receives stable PB wiki pages, promoted skills, and catalog entries as runtime context.
- AgentMemory can cache or source material when configured, but missing AgentMemory never blocks PB or GBrain workflows.
- Skills and MCP remain complementary: GBrain MCP is the runtime retrieval/tool channel, while promoted skills are governed operational knowledge that can be discovered through GBrain and can instruct agents how to use MCP tools.

## Non-Goals

- Do not add a mandatory SkillClaw-compatible proxy, daemon, shared object store, or evolve server.
- Do not make AgentMemory the default long-term brain.
- Do not replace GBrain MCP with PraxisBase MCP for broad runtime lookup.
- Do not allow AI synthesis, validation, daily automation, or AgentMemory sidecar hits to write stable `kb/**` or `skills/**` directly.
- Do not change M22 source ledger or skill origin tasks in this change.
- Do not copy SkillClaw source code; borrow mechanisms and reimplement them in PraxisBase TypeScript modules.

## Acceptance

- Stable wiki pages and promoted stable skills can both be exported to GBrain with provenance hashes.
- AgentMemory remains optional; missing AgentMemory never blocks daily, review, promotion, GBrain export, or site build.
- A knowledge lifecycle report proposes promotions, decay, and archive actions without mutating stable knowledge directly.
- A generated knowledge catalog summarizes stable knowledge by scope, layer, type, maturity, and source provenance.
- Experience envelopes can carry trajectory steps, tool outcomes, read/modified skills, injected context, and verification events.
- Skill synthesis can use trajectory attribution to update existing skills, optimize triggering descriptions, create new skills only as last resort, or skip weak signals.
- The skill proposer records whether evidence indicates a skill problem, agent problem, environment problem, or weak signal.
- Skill validation writes reviewable evidence and never promotes a candidate by itself.
- Personal mode can run local trajectory-based skill validation and still require user audit for stable skill promotion.
- Team mode requires privacy-safe evidence, Git/human review, and explicit policy before team/org stable knowledge or skills are exported.
- End-to-end BDD covers at least one full loop from trajectory import to candidate proposal, validation evidence, promotion audit, catalog update, and GBrain export.
