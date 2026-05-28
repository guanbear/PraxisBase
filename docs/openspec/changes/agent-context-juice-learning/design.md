# Design: Agent Context Juice And Personal Learning

## Boundary

M24 is a runtime consumption layer.

```text
M16/M22 evidence economy and ledger
  -> M23 governed stable pages, promoted skills, and catalog
  -> M24 trust, budget, skill injection, and personal facets
  -> agent bundle / MCP response / CLI context
```

M24 does not change stable authority. Stable PB pages and promoted PB skills remain the highest-authority source. GBrain and AgentMemory sidecars remain useful runtime channels but do not become PB truth unless imported, privacy-checked, synthesized, reviewed, and promoted through existing PB flows.

## Source-Level Borrowing From OpenHuman

This change borrows these source-level mechanisms:

- `context/tool_result_budget.rs`: per-result pre-history byte budgets, UTF-8 safe truncation, and explicit dropped-byte marker.
- `context/microcompact.rs`: preserve tool-call/result envelopes while clearing old payload bodies and keeping recent results.
- `agent/harness/payload_summarizer.rs`: optional summarizer with lower/upper thresholds, non-shrinking rejection, and failure breaker.
- `agent/harness/token_budget.rs`: approximate token estimation, output reserve, and oldest-first trimming without moving system messages.
- `skills/inject.rs`: explicit mention and heuristic skill matching, stable ordering, 8 KiB total injection cap, truncation marker, and per-skill decisions.
- `learning/stability_detector.rs` and `docs/AGENT_SELF_LEARNING.md`: candidate facets, cue weights, recency decay, user pin/forget overrides, class budgets, and managed profile output.
- `agent/harness/memory_context_safety.rs`: default-deny untrusted memory classification and wrapper markers.

PraxisBase implements the same categories independently. It must not vendor OpenHuman code or copy GPL implementation details.

## Context Juice

Context juice is applied before expensive model calls and before agent-facing bundles. It is also observable in daily and site reports.

Default budgets:

- session/tool output: `16 KiB`;
- source file: `64 KiB`;
- sidecar hit: `8 KiB`;
- total agent bundle: `24 KiB`;
- promoted skill section: `8 KiB`;
- personal facet section: `2 KiB`;
- sidecar section: `4 KiB`;
- catalog section: `4 KiB`.

Budgeting is UTF-8 safe and records original bytes, kept bytes, saved bytes, budget id, source ref, source hash, and warnings.

Trajectory microcompact preserves envelope order and clears old low-signal payload bodies only when over budget. It always protects:

- task goal;
- commands and tool names;
- failures and diagnostics;
- fixes and configuration changes;
- verification events;
- explicit lessons;
- source refs and hashes;
- most recent tool results.

Microcompact output is idempotent.

## Optional Payload Pre-Summary

Oversized payload pre-summary is optional and budgeted. It is designed for cases where deterministic truncation would hide high-value material and the user has configured an AI model.

Rules:

- below threshold: pass through deterministic budget only;
- above maximum: do not send to LLM, keep deterministic marker and source pointer;
- failure breaker: disable after three consecutive failures in one run;
- reject empty, malformed, non-shrinking, privacy-unsafe, or provenance-free summaries;
- team stable-write paths require explicit policy before using AI pre-summary.

Pre-summary output is an evidence surrogate and never a stable fact.

## Trust Boundary

Trust tiers:

- `pb_stable`;
- `pb_personal_facet`;
- `pb_candidate`;
- `gbrain_sidecar`;
- `agentmemory_sidecar`;
- `remote_personal_agent`;
- `external_untrusted`.

Unknown content defaults to `external_untrusted`. Sidecar and external content is wrapped before agent use:

```xml
<untrusted-source source="gbrain_sidecar" authority="sidecar">
...
</untrusted-source>
```

Wrapper rendering escapes marker-breaking characters and caps source hints. Candidates are review-only and non-injectable by default.

## Agent Context Bundle

The bundle builder ranks and packs:

1. safety/trust note;
2. personal facets when mode allows them;
3. exact stable PB page matches;
4. matched promoted skills;
5. catalog entries;
6. stable graph neighbors;
7. wrapped GBrain and AgentMemory sidecar hits;
8. citations and omitted-item summary.

When the budget is exceeded, lower-authority full bodies are dropped before citations. Stable PB context outranks sidecars. Promoted skills outrank sidecar advice. Personal facets apply only in personal mode by default.

## Promoted Skill Injection

Only promoted PB skills can be injected by default. Matching order:

1. explicit `@skill` or skill id;
2. exact task/query match against trigger and `When To Use`;
3. tag or related wiki match;
4. catalog match;
5. optional semantic rerank.

Rendering uses bounded `[PB-SKILL:<id>]` blocks and records decisions for every candidate considered:

- matched/skipped;
- reason;
- injected bytes;
- truncation;
- scope;
- authority;
- promotion or audit id.

## Personal Learning Cache

The personal learning cache stores runtime preferences, not team knowledge.

Facet classes:

- `style`;
- `tooling`;
- `veto`;
- `goal`;
- `identity`;
- `channel`.

States:

- `active`;
- `provisional`;
- `candidate`;
- `dropped`;
- `pinned`;
- `forgotten`.

Scoring uses cue family, recency decay, evidence count, explicit-evidence multiplier, and user override. Pinned entries are active regardless of score. Forgotten entries do not re-promote automatically.

PB renders managed blocks to `.praxisbase/personal/profile.md` and preserves user-authored text outside managed markers. Team export excludes personal facets unless explicitly reviewed and imported.

## CLI And Site

New or extended commands:

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

The generated site shows context juice savings, bundle budget use, trust-tier counts, skill injection decisions, personal facet counts, and next commands. It does not render raw private facet evidence or raw sidecar bodies by default.

## Failure Handling

- Budget failure: use bounded fallback and report warning.
- Microcompact parse failure: use line-based fallback and report warning.
- LLM pre-summary unavailable: skip it and keep deterministic flow.
- Unknown trust source: wrap as untrusted.
- Personal cache corruption: quarantine bad records and keep retrieval working.
- Pin/forget conflict: explicit user override wins.
