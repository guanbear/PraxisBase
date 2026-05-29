# Design: Collective Skill And Knowledge Governance

## Boundary

PraxisBase remains the governed compiler.

```text
agent evidence
  -> M22 source item ledger and skill origin
  -> PB governance
  -> stable wiki + promoted skills + catalog
  -> GBrain MCP brain
  -> optional AgentMemory cache
```

GBrain is the runtime brain. Agents use GBrain MCP for broad search, query, graph traversal, and reasoning support. PraxisBase supplies reviewed experience and stable skills to that brain. AgentMemory is an optional source/sink/retrieval sidecar and must never outrank stable PraxisBase knowledge.

## Runtime Relationship

Skills and MCP are not alternative designs.

GBrain MCP provides the runtime channel: retrieval, graph lookup, search, and tool access. Promoted PB skills provide governed operational knowledge: when to use a workflow, what steps to follow, what to verify, and what pitfalls to avoid.

The intended loop is:

```text
PB stable pages + promoted skills + catalog
  -> GBrain export
  -> agent discovers relevant context through GBrain MCP
  -> agent reads and follows the promoted skill
  -> new trajectory evidence returns to PB
```

A skill may instruct an agent to use MCP tools. MCP results may help an agent find a skill. Neither path bypasses PB review when stable knowledge or promoted skills change.

## Outcome Contract

This design is considered complete only when these outcomes are demonstrable:

- repeated failures produce reviewable knowledge or skill candidates rather than raw transcript accumulation;
- skill evolution favors existing skill update, description optimization, or support-file update before new skill creation;
- agent misuse and transient environment failures can be classified and skipped;
- stable context outranks GBrain sidecar and AgentMemory sidecar results when PB has authoritative knowledge;
- personal evidence stays personal unless explicitly imported and approved;
- team/org exports include only team-safe stable pages, promoted skills, and catalog entries;
- lifecycle analysis can propose promotion, decay, or archive without direct stable writes;
- validation evidence can block or inform promotion policy but cannot promote by itself.

## Source-Level Borrowing

This change borrows ideas, not runtimes:

- Tencent Harness knowledge article: knowledge is the durable moat; use layered storage, typed knowledge, maturity promotion, and decay.
- SkillClaw paper: real interaction trajectories are the primary signal for collective skill evolution.
- SkillClaw source:
  - `api_server.py`: capture read skills, modified skills, injected skills, tool calls, tool results, and session boundaries;
  - `summarizer.py`: keep both structured trajectory and analytical summary;
  - `aggregation.py`: group sessions by concrete skill references;
  - `execution.py`: prefer targeted edits, description optimization, new-skill creation only when distinct, and skip when evidence is weak;
  - `skill_verifier.py` and `validation_worker.py`: publish only after conservative evidence or replay validation.
- Existing PraxisBase M16-M22 work: context economy, AgentMemory sidecar, GBrain-first governance, skill synthesis governance, and M22 source item identity.

PraxisBase does not copy SkillClaw's Python runtime, proxy, shared object storage layout, or direct skill mutation authority.

## Knowledge Lifecycle

The existing `scope`, `layer`, `type`, and `maturity` fields become lifecycle inputs.

Scopes:

- `personal`: local user preference, private workflow memory, or personal agent habit.
- `project`: project-specific context and decisions.
- `team`: team convention or shared operating rule.
- `org` and `global`: explicitly reviewed higher-scope knowledge only.

Layers:

- `preference`: individual or team preferences.
- `convention`: team norms and review standards.
- `technical`: reusable technical patterns and pitfalls.
- `domain`: business or domain rules.
- `project`: local project context.

Types:

- `model`: entities, relationships, schemas, domain terms.
- `decision`: architecture or process choice with rationale.
- `guideline`: recommended or avoided practice.
- `pitfall`: known failure mode, trigger, diagnosis, and fix.
- `process`: repeatable workflow or state machine.
- Existing PB types such as `known_fix`, `procedure`, `policy`, and `note` remain supported and map to these families for catalog display.

Maturity:

- `draft`: one source, unverified, or freshly synthesized.
- `verified`: used successfully once in a governed workflow or reviewed by a trusted personal user.
- `proven`: verified across multiple source items, projects, or team runs with no active contradiction.
- `stale`: not recently used, contradicted, or dependency-sensitive and past its review window.
- `archived`: removed from active context/catalog but kept with provenance.

Lifecycle changes are proposals. Daily automation may create reports and candidate proposals, but stable writes still require the existing review/promote path.

## Knowledge Catalog

PraxisBase generates an agent-facing catalog from stable wiki pages and promoted skills.

The catalog groups stable knowledge by:

- scope;
- layer;
- type;
- maturity;
- related skills;
- source refs and hashes;
- last observed or last validated time when known.

The catalog is optimized for GBrain and agent use. It is not a human-only documentation index. It should answer "what stable experience exists and when should an agent use it?" without exposing raw evidence.

## Trajectory Envelope Extension

After M22 source item identity is available, experience envelopes may include optional trajectory metadata:

- `trajectory_steps`: bounded structured steps preserving user goal, agent action, tool use, and outcome.
- `tool_outcomes`: command/tool name, summarized arguments, result category, failure snippets, and verification markers.
- `read_skills`: stable skill ids or paths the agent actually read.
- `modified_skills`: skill ids or paths the agent attempted to change.
- `injected_context`: PB/GBrain/AgentMemory context ids injected into the task.
- `verification_events`: tests, builds, smoke checks, deploy checks, human confirmations, and hashes.
- `skill_effectiveness_hints`: evidence that a skill helped, hurt, was missing, was stale, or was ignored.

These fields are bounded and redacted. Raw transcripts and raw logs remain outside stable knowledge. Context economy may reduce trajectory content, but it must preserve provenance, failure, fix, verification, and explicit lesson signals.

## Skill Evolution Lane

Skill synthesis keeps the current governed shape:

```text
signals
  -> clusters
  -> candidate
  -> semantic review
  -> validation evidence
  -> audit
  -> promote
```

The proposer gains SkillClaw-inspired action classes:

- `skill_update`: targeted edits to an existing skill when evidence shows missing, stale, or misleading guidance.
- `skill_optimize_description`: trigger description update when the body is useful but matching is too broad or too narrow.
- `skill_support_file`: add or update references, templates, or scripts under an existing skill.
- `skill_create`: create a class-level skill only when no existing skill covers the durable pattern.
- `skip`: no candidate when the evidence is weak, one-off, caused by agent misuse, or caused by transient environment state.

The proposer must explicitly classify the cause:

- skill problem: the skill is wrong, missing guidance, outdated, or misleading.
- agent problem: the agent did not read/use correct guidance, overflowed context, or misused tools.
- environment problem: flaky dependency, missing local install, credential issue, or temporary outage.

Only skill problems and durable environment-specific fix patterns should become skill candidates.

## Skill Validation

Skill validation is a review evidence stage, not a promotion stage.

Validation modes:

- static validation: frontmatter, required sections, safe paths, support-file references, provenance, source hashes, and shape rules.
- evidence simulation: compare candidate guidance against representative trajectory summaries and explain whether it would have changed future behavior safely.
- replay validation: optional baseline vs candidate replay when a safe local or CI harness exists.

Validation outputs:

- candidate id;
- validation mode;
- representative evidence ids;
- checks and scores;
- decision: `pass`, `fail`, or `needs_human`;
- reason;
- created timestamp.

Promotion may require passing validation by policy, but validation alone never writes stable `skills/**`.

## GBrain And AgentMemory Publishing

GBrain export includes stable wiki pages and promoted skills. Skill exports are compacted into pages containing:

- skill name and target path;
- trigger and "Do Not Use When";
- procedure summary;
- verification and pitfalls;
- provenance hashes and audit id when available.

AgentMemory export remains optional. It may receive stable pages and promoted skills as cache entries, with provenance hash idempotency checks. AgentMemory failure produces warnings only.

Sidecar retrieval order stays:

1. stable PraxisBase context;
2. GBrain sidecar or configured GBrain MCP results;
3. AgentMemory sidecar hits when explicitly requested.

Sidecar hits do not count as promotion evidence unless imported into PraxisBase as source refs with hashes and privacy review.

## Personal Mode

Personal mode is the proving ground:

- local Codex, Claude Code, OpenCode, OpenClaw, GBrain, and AgentMemory sources may provide evidence;
- safe local personal evidence can enter synthesis after privacy checks;
- trajectory attribution and skill validation can run locally;
- user audit remains required before stable brand-new skill promotion;
- GBrain export is recommended after stable changes;
- AgentMemory export is optional and non-blocking.

## Team Mode

Team mode is the collective evolution lane:

- team-safe evidence from multiple agents/users/sources can increase confidence;
- personal/private material is blocked unless explicit team policy allows a safe release path;
- team/org knowledge promotion requires Git/human review metadata;
- team skills require audit and optional validation policy;
- GBrain team export requires explicit allow flag and team-safe scopes;
- AgentMemory team export requires explicit policy because the daemon may be shared by personal agents.

## Reporting And Site

Daily reports and HTML show:

- lifecycle candidates: promote, decay, archive, stale, conflict;
- catalog summary by scope/layer/type/maturity;
- trajectory attribution counts;
- skill validation queue and results;
- GBrain publish status for stable pages and promoted skills;
- optional AgentMemory import/export status;
- next commands for privacy triage, review, validation, promotion, and export.

The primary queues are reviewed proposals, validation evidence, and lifecycle proposals. Raw signals remain debug or secondary material.

## Failure Handling

- Missing GBrain: daily/review still works and prints setup guidance.
- GBrain export failure: stable PB changes remain; export is retryable.
- AgentMemory unavailable: sidecar import/export/retrieval warns and does not block PB.
- Trajectory fields missing: synthesis falls back to existing distilled summaries and stable wiki signals.
- Validation unavailable: candidate requires human review when policy requires validation.
- Replay unsafe or credential-dependent: use static validation or evidence simulation instead.
- Conflicting lifecycle signals: route to human review; do not auto-decay or auto-promote.
