# Proposal: M25.1 Personal GA Stabilization

## Problem

PraxisBase personal mode has the right components, but it is not yet a reliable daily product loop.

The latest M25 smoke showed that raw OpenClaw memory can produce useful lessons, but it also exposed the remaining gap:

- ready lessons can be extracted without all of them having a visible destination;
- Codex and codex-cliproxyapi sessions remain weak because long sessions are not pre-summarized as session streams;
- trusted remote OpenClaw still produces repeated source-level privacy blockers;
- generated HTML does not yet provide a complete experience-centric operator workflow;
- agent consumption paths exist, but their authority contract is not explicit enough for daily use;
- success is still judged by counts rather than golden end-to-end quality.

## Change

Add a Personal GA stabilization layer that makes personal daily runs prove the whole loop:

```text
raw local/remote agent evidence
  -> normalized inventory
  -> memory-first and session-aware selection
  -> deterministic + production AI lesson extraction
  -> privacy abstraction
  -> complete lesson disposition
  -> wiki/skill/runtime/backend outputs
  -> HTML review surface
  -> agent consumption
  -> golden validation
```

## Scope

In scope:

- source normalization reports for local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi;
- session-aware pre-summary for Codex-style JSONL sessions;
- production AI mode semantics for M25.1 personal daily;
- lesson disposition records and reports;
- wiki completeness guarantees for `wiki_ready` lessons;
- privacy abstraction and triage reuse for trusted personal remote sources;
- HTML experience view;
- authority-labeled agent consumption status;
- Personal GA CLI/report gate;
- golden validation and real smoke documentation.

Out of scope:

- rewriting GBrain, AgentMemory, or MCP;
- making GBrain or AgentMemory promotion authorities;
- automatic team promotion from personal sources;
- copying OpenHuman, SkillClaw, or llm-wiki implementation code or prompts;
- optimizing for maximum page count.

## Success Criteria

- A personal daily run can report whether personal mode is production-ready and why.
- The run covers local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi when configured.
- Golden OpenClaw target lessons are recovered from raw evidence with span provenance.
- Codex sessions either produce useful lessons or source-specific no-signal reasons without repeated token spend.
- Every lesson has a disposition and no `wiki_ready` lesson silently disappears behind proposal limits.
- Private machine/account/path/token/user-id details do not leak into stable wiki, skills, generated HTML, GBrain export, or AgentMemory export.
- The HTML site makes review and agent-use status understandable without reading raw reports.
- Agent context and backend publish paths label authority and never treat sidecar hits as stable PB promotion evidence.

## Rollout

Implement behind existing personal daily and lesson pipeline surfaces. Keep degraded no-AI behavior for bounded smoke, but mark it not production-ready. Do not remove existing M25 behavior until M25.1 tests and real smoke pass.
