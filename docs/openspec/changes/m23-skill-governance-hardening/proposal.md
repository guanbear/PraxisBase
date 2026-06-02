# Change: M23.1 Skill Governance Hardening

## Why

M23 delivered the first governed loop for lifecycle reports, catalog generation, skill validation evidence, skill synthesis cause classification, and GBrain export of promoted skills. The remaining work is not a replacement for M23. It hardens the loop so the product behavior matches the intended long-term contract:

- stable PraxisBase context remains the authority over GBrain and AgentMemory sidecar hits;
- skill promotion can be blocked by validation policy, not only by audit presence;
- daily and site surfaces show lifecycle and validation queues clearly;
- real source adapters populate bounded trajectory fields instead of leaving them schema-only;
- AgentMemory remains optional and warning-only.

This change keeps PB as governed compiler/source of truth, GBrain as runtime MCP brain, and AgentMemory as optional sidecar/cache.

## What Changes

- Require passing skill validation evidence before stable skill promotion when policy enables the gate.
- Add daily and HTML review surfaces for lifecycle proposals and skill validation reports.
- Add context ranking tests and behavior so stable PB knowledge outranks GBrain/AgentMemory sidecar hits.
- Populate trajectory metadata from supported source adapters where available:
  - Codex session summaries;
  - Claude Code session summaries;
  - OpenCode session summaries;
  - OpenClaw daily/staged envelopes.
- Keep AgentMemory import/export/search failures warning-only across daily, site build, review, promotion, and GBrain export.
- Add exact next actions for lifecycle review, skill validation, skill promotion audit, GBrain export, and optional AgentMemory export.

## Goals

- Turn M23 from a working MVP into an operational governance loop that is hard to bypass accidentally.
- Make validation evidence meaningful in promotion policy.
- Give users a clear review queue for lifecycle and validation work.
- Ensure sidecar retrieval improves recall without weakening PB authority.
- Use real trajectory fields from local sources while preserving bounded, redacted evidence.

## Non-Goals

- Do not replace GBrain MCP with PraxisBase MCP as the runtime brain.
- Do not make AgentMemory mandatory.
- Do not write stable `kb/**` or `skills/**` from daily, validation, sidecar retrieval, or AI synthesis.
- Do not copy SkillClaw runtime/proxy/server code.
- Do not change M24 agent context juice learning docs or implementation.
- Do not expand replay validation to destructive or credentialed workflows.

## Acceptance

- A stable skill promotion can be rejected when no passing validation report exists and policy requires validation.
- Daily reports and HTML show lifecycle proposal counts, validation report counts, and next commands.
- Context retrieval ranks stable PB context before GBrain and AgentMemory sidecar hits.
- AgentMemory absence or failure never blocks daily, review, promotion, site rendering, or GBrain export.
- Supported source adapters preserve bounded trajectory fields when present and continue to reject raw transcripts/logs.
- Team mode excludes personal AgentMemory sidecar material unless it was explicitly imported, privacy-reviewed, and approved as PB evidence.
- Tests cover promotion gating, daily/site queues, ranking, optional AgentMemory failure, and trajectory adapter mapping.
