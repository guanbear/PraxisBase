# M24 Design: Agent Context Juice And Personal Learning Cache

## Purpose

M24 makes PraxisBase knowledge cheap and safe for agents to consume at runtime.

M23 governs how repeated trajectory evidence becomes stable wiki pages, promoted skills, catalog entries, validation evidence, and GBrain exports. M24 does not change that authority model. It adds the runtime layer that decides:

- which stable knowledge and promoted skills enter an agent prompt or bundle;
- how much context is allowed to enter;
- which sources are trusted, untrusted, personal, team-safe, or sidecar-only;
- which personal preferences are stable enough to inject automatically;
- how token savings are measured without losing failure, fix, verification, and provenance signals.

The result should be closer to OpenHuman's TokenJuice product behavior, but implemented independently inside PraxisBase's file-first compiler.

## Boundary With Earlier Milestones

M16/M16.1 owns deterministic pre-AI context economy: canonical source items, reducer rules, byte savings, and experience-fidelity compression.

M22 owns incremental source identity: source item ledger, parser/model/reducer identity, and source-specific Codex/Claude Code/OpenCode/OpenClaw rules.

M23 owns collective governance: lifecycle reports, catalog, trajectory attribution, skill validation evidence, and GBrain export of stable pages and promoted skills.

M24 owns runtime consumption and local personalization:

```text
stable PB pages + promoted PB skills + M23 catalog
  -> M24 trust classification
  -> M24 context/skill matching
  -> M24 byte/token budgets
  -> agent bundle / MCP response / CLI context
  -> agent task execution
  -> new evidence returns to M22/M23
```

M24 must not promote wiki pages, mutate stable skills, or treat GBrain or AgentMemory sidecar hits as PB authority. It can cache, rank, wrap, summarize, and inject only according to stable-review state.

## OpenHuman Source-Level Borrowing

PraxisBase borrows mechanisms from OpenHuman source, not GPL code or exact rule files.

| OpenHuman source | Mechanism | PraxisBase M24 adoption | Boundary |
| --- | --- | --- | --- |
| `src/openhuman/context/tool_result_budget.rs` | Apply a per-tool-result byte cap before raw bytes enter conversation history; use UTF-8 safe truncation and explicit dropped-byte marker. | Add `context_juice.source_item_budget` for source/tool payloads that are about to enter AI distill, review prompts, agent bundles, or sidecar exports. | PB keeps raw provenance pointers and hashes; stable wiki never stores truncated raw logs as knowledge. |
| `src/openhuman/context/microcompact.rs` | Clear old `ToolResults` bodies while preserving tool-call/result envelope invariants and recent results. | Add trajectory microcompaction for session-like sources and agent bundles: preserve step envelopes, source refs, command ids, failures, fixes, verification, and recent tool payloads; replace old low-signal bodies with stable placeholders. | PB applies this to evidence packets and agent bundles, not live provider chat history. |
| `src/openhuman/agent/harness/payload_summarizer.rs` | Optional summarizer sub-agent for oversized tool results with lower/upper thresholds and a session failure breaker. | Add bounded AI payload pre-summary for oversized payloads after deterministic budget checks. It is disabled by default for stable writes and enabled only for review/distill inputs under explicit model budget. | Summary is a candidate evidence surrogate, never a stable fact without provenance and review. |
| `src/openhuman/agent/harness/token_budget.rs` | Estimate tokens, reserve output space, and trim oldest non-system messages while preserving relative order. | Add bundle token accounting for `context get`, GBrain export preview, MCP responses, and agent-access bundles. Preserve system/safety headers and newest task-relevant context. | PB budgets retrieval bundles, not arbitrary live chat messages. |
| `src/openhuman/skills/inject.rs` | Match skills by explicit mention, description, tag, and name; deterministic order; max 8 KiB; per-skill decision logs. | Add promoted-skill injection bundles with explicit `@skill`/query match, stable ordering, byte cap, truncation markers, and skip reasons. | Only promoted PB skills can be injected by default. Candidate skills stay review-only. |
| `src/openhuman/learning/stability_detector.rs` and `docs/AGENT_SELF_LEARNING.md` | Candidate buffer, cue families, recency decay, pinned/forgotten user overrides, class budgets, managed profile rendering. | Add personal learning facets for style, tooling, vetoes, goals, channel, and local identity. Use stability scoring and user override states before injecting into personal agent bundles. | Facets are personal runtime hints, not team knowledge or stable wiki pages. Team export requires explicit review. |
| `src/openhuman/agent/harness/memory_context_safety.rs` | Default-deny trust classification and `<untrusted-source>` wrapping for recalled memory. | Add trust wrappers for GBrain sidecar, AgentMemory sidecar, remote OpenClaw, external logs, and imported connector content. | Trusted PB stable pages and promoted skills keep higher authority; wrappers prevent recalled text from acting as instructions. |

## Architecture

M24 adds four small layers around existing modules:

```text
source/session payload
  -> context juice budget and microcompact
  -> existing reducer/chunking/distill/review

stable PB pages + promoted skills + catalog
  -> trust classifier
  -> context bundle builder
  -> skill injector
  -> token budget packer
  -> agent CLI/MCP/GBrain-facing output

personal evidence and explicit user preference
  -> learning facet candidate
  -> stability cache
  -> managed personal profile block
  -> bounded agent bundle section
```

Core modules should stay independent:

- `context-juice`: byte budgets, UTF-8 safe truncation, placeholder markers, microcompact stats, token estimates, and reports.
- `agent-context-bundle`: ranks stable PB pages, promoted skills, catalog entries, sidecar hits, and personal facets under budget.
- `skill-injection`: matches promoted skills and renders bounded `[PB-SKILL:<id>]` blocks with reasons.
- `trust-boundary`: classifies source authority and wraps untrusted recalled content.
- `personal-learning-cache`: stores personal facets, stability scores, user overrides, and managed profile output.

## Context Juice

Context juice is not another synthesis layer. It is a budget and fidelity layer around existing evidence and agent context.

### Source Item Budget

Before any source item enters an expensive model call or an agent-facing bundle, PB applies a source-specific byte budget:

- default session/tool output cap: `16 KiB`;
- default source file cap: `64 KiB`;
- default sidecar hit cap: `8 KiB`;
- default stable PB page cap: no hard truncation unless the final bundle budget is exceeded;
- project/user config may override budgets by source kind and scope.

If a payload exceeds its cap, PB keeps a UTF-8 safe prefix and appends a marker:

```text
[... <n> bytes truncated by praxisbase_context_juice; use source_ref <ref> for full body ...]
```

Reports must include original bytes, kept bytes, truncated bytes, source ref, source hash, budget id, and whether the full body remains available in raw vault or original source.

### Trajectory Microcompact

For session-like evidence, PB parses or approximates envelopes:

- user goal;
- assistant step;
- tool call;
- tool result;
- file edit;
- failure;
- fix;
- verification;
- final answer;
- provenance.

When the session exceeds budget, PB preserves:

- the most recent `N` tool results, default `5`;
- all failures, fixes, verification events, explicit lessons, source refs, and source hashes;
- the envelope structure and ordering.

It replaces old low-signal tool result bodies with:

```text
[Old tool result content cleared by praxisbase_context_juice]
```

This placeholder is stable and idempotent. Running microcompact twice should not change output the second time.

### Optional Oversized Payload Summary

AI payload pre-summary is allowed only after deterministic budgeting determines that a payload is too large but still valuable.

Default policy:

- disabled for team stable writes unless explicitly enabled by policy;
- enabled for personal review/distill preview only when a model is configured;
- lower threshold: payload must be meaningfully above deterministic budgets;
- upper threshold: absurdly large payloads are not sent to an LLM and rely on deterministic truncation plus source pointer;
- failure breaker: three consecutive pre-summary failures disables it for the run;
- non-shrinking, empty, malformed, or provenance-free summaries are discarded.

The output is an evidence surrogate with original source refs, hashes, model id, prompt id, byte savings, and warnings. It cannot become stable knowledge by itself.

## Agent Context Bundle

M24 introduces a first-class bundle builder used by:

- `praxisbase context get`;
- agent-access files;
- GBrain export preview;
- optional MCP response handlers;
- personal bootstrap guidance.

The bundle has ordered sections:

1. safety and trust note;
2. active personal facets when allowed;
3. exact stable PB matches;
4. promoted skills matched to the query/task;
5. related catalog entries;
6. graph neighbors and supporting stable pages;
7. sidecar hits from GBrain or AgentMemory, wrapped as untrusted unless imported and reviewed;
8. citations and omitted-item summary.

Default budget:

- total bundle: `24 KiB`;
- promoted skills: `8 KiB`;
- personal facets: `2 KiB`;
- sidecar hits: `4 KiB`;
- catalog: `4 KiB`;
- citations and provenance are protected before full bodies.

When over budget, PB drops lower-authority full bodies before citations. Stable PB pages outrank sidecars. Promoted skills outrank sidecar advice. Personal facets apply only to personal mode unless explicitly exported.

## Skill Injection

Promoted PB skills are injected as bounded instruction blocks.

Matching order:

1. explicit `@skill-name` or explicit skill id;
2. exact task/query match against trigger and `When To Use`;
3. tag and related wiki match;
4. stable catalog match;
5. semantic rerank only when enabled and budgeted.

Ordering is deterministic:

- explicit mentions first in user message order;
- exact stable skill matches next;
- then score descending;
- then skill id as tie-breaker.

Each decision records:

- matched or skipped;
- match reason;
- injected bytes;
- truncation state;
- authority;
- scope;
- source audit id or promotion id when present.

Unreviewed candidates are never injected by default. They can appear only in review commands and review site pages.

## Trust Boundary

Every context item receives a trust tier:

- `pb_stable`: reviewed stable wiki page or promoted skill.
- `pb_personal_facet`: local personal learning cache entry.
- `pb_candidate`: review-only candidate, never runtime injection by default.
- `gbrain_sidecar`: runtime sidecar result; useful but not PB authority.
- `agentmemory_sidecar`: optional cache hit; never outranks PB.
- `remote_personal_agent`: trusted personal remote OpenClaw/Codex if configured.
- `external_untrusted`: logs, connector content, copied docs, or unknown source.

Items not classified as trusted are wrapped before agent injection:

```xml
<untrusted-source source="<source-kind>" authority="<authority>">
...
</untrusted-source>
```

The wrapper escapes literal marker-breaking characters and limits the source hint length. This is prompt-injection mitigation, not a privacy control. Privacy controls still run before team export or stable promotion.

## Personal Learning Cache

M24 adds a lightweight personal cache inspired by OpenHuman's self-learning cache. It is for runtime preference injection, not durable team knowledge.

Facet classes:

- `style`: verbosity, language, formatting, emoji, preamble.
- `tooling`: package manager, runtime, preferred commands, local tools.
- `veto`: banned tools, banned formats, forbidden workflows.
- `goal`: durable personal/project goals.
- `identity`: local user name, timezone, role, local-only identity hints.
- `channel`: Codex/OpenClaw/OpenCode/Claude Code interaction preference.

Candidate producers:

- explicit user instruction captured from local agent sessions;
- repeated personal behavior from Codex/OpenClaw/Claude/OpenCode summaries;
- model-extracted facets from already-budgeted distilled summaries;
- manual CLI entry;
- imported OpenHuman profile or AgentMemory memory only as personal candidates.

Scoring uses:

```text
stability = sum(cue_weight * recency_decay * log(1 + evidence_count)) * explicit_multiplier * user_override
```

Cue weights:

- explicit: `1.0`;
- structural: `0.9`;
- behavioral: `0.7`;
- recurrence: `0.6`.

Default half-lives:

- identity: `90 days`;
- veto: `60 days`;
- tooling: `30 days`;
- goal: `30 days`;
- style: `14 days`;
- channel: `7 days`.

States:

- `active`: injected in personal bundles;
- `provisional`: stored and visible, not injected by default;
- `candidate`: queued evidence only;
- `dropped`: removed from active cache;
- `pinned`: user override that locks active;
- `forgotten`: user override that blocks re-promotion.

Default class budgets:

- style `4`;
- identity `4`;
- tooling `5`;
- veto `3`;
- goal `3`;
- channel `1`;
- overflow provisional `5`.

PB writes a managed Markdown profile block under `.praxisbase/personal/profile.md`. User-authored content outside managed markers is preserved. Team export must not read this file unless the user explicitly imports selected facets through review.

## CLI And Site UX

New commands should be small wrappers around core modules:

```bash
praxisbase context bundle --query "..." --mode personal --json
praxisbase context juice --source <id> --json
praxisbase personal profile add "prefer pnpm for tests" --json
praxisbase personal profile list --json
praxisbase personal profile pin <class>/<key>
praxisbase personal profile forget <class>/<key>
praxisbase personal profile rebuild --json
praxisbase skill inject-preview --query "..." --json
praxisbase daily run --no-context-juice --json
```

The HTML site should show:

- context juice savings;
- top matched promoted skills;
- skipped skill injection reasons;
- personal facet active/provisional counts;
- trust-tier summary;
- untrusted sidecar count;
- next commands for pin/forget/rebuild/profile review.

The site must not render raw private facet evidence or raw sidecar bodies by default.

## Data And Reports

M24 writes only generated support data and reports:

- `.praxisbase/reports/context-juice/*.json`;
- `.praxisbase/reports/agent-bundles/*.json`;
- `.praxisbase/personal/profile.md`;
- `.praxisbase/personal/facets.jsonl` or equivalent file-first state;
- optional cache indexes under `.praxisbase/cache/`.

Stable `kb/**` and `skills/**` remain governed by existing review/promote paths.

## Error Handling

- Budget rule failure: pass through bounded text and report warning.
- Invalid UTF-8 boundary: floor to valid character boundary.
- Microcompact parser failure: use line-based fallback and report `trajectory_parse_failed`.
- Pre-summary LLM unavailable: skip AI pre-summary, use deterministic budget, and keep the run green.
- Pre-summary grows payload: discard summary and report `summary_not_smaller`.
- Trust classifier unknown: default to `external_untrusted`.
- Personal cache corruption: quarantine bad records, preserve readable profile, and continue context retrieval.
- Pin/forget conflict: explicit user override wins over automatic scoring.

## Acceptance Criteria

- A long real local Codex/OpenClaw/OpenCode/Claude Code session can be reduced before AI/review without losing failure, fix, verification, explicit lesson, source ref, or source hash.
- Re-running unchanged sources does not spend new AI budget because reducer/context-juice identity participates in cache identity.
- `context bundle` returns a bounded bundle where stable PB context outranks GBrain and AgentMemory sidecars.
- Promoted skill injection is bounded, deterministic, and explainable; candidates are not injected.
- Untrusted sidecar or remote content is wrapped and cannot appear as top-authority instructions.
- Personal facets can be listed, pinned, forgotten, rebuilt, and injected only under personal mode.
- Team mode excludes personal profile facets unless explicitly reviewed and imported.
- Reports show original bytes, kept bytes, saved bytes, skipped/injected skills, trust tiers, and warnings.

## Non-Goals

- Do not copy OpenHuman GPL source code or vendor rule files.
- Do not build a desktop UI, OAuth connector system, or OpenHuman memory tree clone.
- Do not replace GBrain MCP.
- Do not replace AgentMemory.
- Do not auto-promote wiki pages or stable skills.
- Do not inject review candidates into agent runtime by default.
