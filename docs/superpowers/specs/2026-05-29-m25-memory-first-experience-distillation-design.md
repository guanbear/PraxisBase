# M25 Design: Memory-First Experience Distillation

## Purpose

M25 fixes the core wiki/skill quality path.

PraxisBase already has source adapters, context economy, AI distill, review/promote, skill synthesis, GBrain export, AgentMemory sidecars, and HTML output. The weak point is earlier in the pipeline: useful long-term agent memory is still treated like ordinary chunks. When budgets are tight, newer logs and low-value run reports can crowd out `MEMORY.md`, `TOOLS.md`, long-term agent notes, and important session spans. The result is too many raw-ish candidates and too few durable, reusable experience pages.

M25 changes the center of gravity:

```text
raw memory/session/log/skill evidence
  -> deterministic source inventory and span map
  -> memory-first signal planning
  -> heuristic high-precision extraction
  -> LLM lesson extraction
  -> ExperienceLesson candidates
  -> privacy abstraction and scope classification
  -> stability/dedupe/cluster scoring
  -> personal runtime injection
  -> wiki/skill compiler and review/promote
```

The goal is not to add another reference project to the stack. The goal is to make PraxisBase a governed compiler for agent experience.

## Non-Negotiable Contract

PraxisBase must not depend on an agent first summarizing itself.

The local OpenClaw and remote OpenClaw summaries provided by the user are golden answers for validation only. They are not a new formal input type. The production input remains raw evidence:

- OpenClaw `MEMORY.md`, `TOOLS.md`, sqlite memory, reports, and session logs;
- Codex, Claude Code, and OpenCode session JSONL/logs;
- generated or externally installed skills as source material when provenance and origin are known;
- GBrain and AgentMemory sidecar entries only after they are imported as evidence with source refs, hashes, and privacy review.

PB's LLM layer must be able to read the same raw OpenClaw memory and produce comparable reusable lessons without relying on the agent's own hand-written summary.

## Boundary With Earlier Milestones

M16/M22 provide context economy, source identity, reducer identity, incremental cache keys, and source-specific session adapters.

M23/M23.1 provide stable-page governance, catalog/lifecycle, skill validation, and GBrain export.

M24 provides runtime context juice, trust-aware context bundles, promoted-skill injection, and personal facets.

M25 owns the missing memory-first extraction layer:

```text
M16/M22 raw source identity
  -> M25 source inventory, lesson extraction, privacy abstraction, stability
  -> M23 wiki/skill compiler, review, lifecycle, catalog
  -> M24 agent bundle and personal runtime injection
```

M25 may feed M23 and M24. It must not bypass stable review/promote for team knowledge or promoted skills.

## Integration Contract

M25 is a contraction of the core pipeline, not another optional side lane. After M25 is enabled, all production wiki, skill, runtime lesson, GBrain export, and AgentMemory export decisions must pass through the same source inventory, evidence span, lesson, privacy, and stability model.

Hard rules:

- `SourceInventoryItem` and `EvidenceSpan` are the only raw-evidence boundary for M25. Existing chunking and source adapters may still read files, sessions, sqlite rows, sidecars, and reports, but they must hand M25 source items and spans before semantic extraction.
- `ExperienceLesson` is the primary semantic candidate unit for agent experience. Existing `DistilledExperience` objects may be converted into lesson seeds or used as diagnostic reports, but M25 production wiki/skill compilation must not rely on raw distilled summaries as the main semantic unit.
- Wiki curation consumes `wiki_ready` lesson clusters first. Raw summaries are allowed only as degraded fallback when M25 reports no lesson output and the run is explicitly marked degraded.
- Skill synthesis consumes `skill_ready` lesson clusters or already stable procedural wiki pages. It must not synthesize promoted-skill candidates directly from raw logs, one-off reports, or unconstrained distill summaries.
- Runtime context consumes personal runtime-eligible lessons (`active_personal`, `wiki_ready`, and `skill_ready`) as lower-authority guidance. Stable PB pages and promoted PB skills always rank above runtime lessons. GBrain and AgentMemory sidecar hits always rank below stable PB context.
- GBrain and AgentMemory are source/sink/retrieval backends. They are not promotion authorities. A sidecar hit can become PB evidence only after import with source refs, source hashes, privacy review, and lesson extraction.
- Personal auto-activation is not stable promotion. `active_personal` means usable in the local user's runtime context; it does not mean the lesson can be written to `kb/`, `skills/`, team GBrain, or shared AgentMemory.
- Team mode never consumes personal runtime lessons by default. A personal lesson can enter team knowledge only through explicit import policy, privacy abstraction, review, and promotion.
- HTML output is a governance and review surface for PB experience. It must show stable pages, lesson states, privacy routing, review queues, golden validation, and backend publish status; it must not present raw sidecar retrieval as if it were stable PB knowledge.

These rules are the main guard against another iteration where new extraction logic exists but downstream wiki/skill/context code still follows the older raw-summary path.

## Authority Matrix

| Surface | Primary input | Allowed fallback | Stable authority |
| --- | --- | --- | --- |
| Personal runtime context | personal runtime-eligible lessons plus stable PB pages and promoted skills | Wrapped GBrain/AgentMemory sidecar hits | Stable PB pages and promoted PB skills outrank all candidates and sidecars |
| Wiki proposals | `wiki_ready` lesson clusters | Degraded raw summaries only when M25 extraction is unavailable and marked degraded | Review/promote writes stable `kb/**` |
| Skill candidates | `skill_ready` lessons or stable procedural wiki pages | None for normal production skill synthesis | Audited skill promotion writes stable `skills/**` |
| GBrain export | Stable PB pages and promoted skills | Redacted aggregate run summaries when explicitly configured | PB promotion audit, not GBrain retrieval score |
| AgentMemory export | Stable PB pages and promoted skills | None by default | PB promotion audit, not AgentMemory memory score |
| Team knowledge | Team-safe `wiki_ready` or `skill_ready` lessons | Explicitly imported personal lessons after privacy review | Team Git/human/policy promotion |

## Migration From Existing Distill

M25 should not delete the existing AI distill layer immediately. It should narrow its role.

Existing `DistilledExperience` output becomes one of these:

- pre-M25 compatibility input converted into `ExperienceLesson` seeds when it has source refs, source hashes, actions, verification, and reusable lessons;
- diagnostics for daily reports and HTML quality accounting;
- degraded-mode output when AI lesson extraction is unavailable and the user explicitly asked for degraded output.

It must not remain a peer authority beside `ExperienceLesson`. If both a distilled summary and a lesson cluster exist for the same source, the lesson cluster wins for wiki, skill, runtime, and export decisions.

## Source-Level Borrowing

PraxisBase borrows mechanisms, not code. OpenHuman is GPL-3.0, so PB must not copy source code, exact prompts, vendor rules, or implementation text. PB implements independent TypeScript modules shaped by the observed mechanisms.

### OpenHuman Mechanisms

| OpenHuman source | Mechanism | M25 adoption | Boundary |
| --- | --- | --- | --- |
| `src/openhuman/agent_experience/capture.rs` | Post-turn hook converts tool-call trajectories into structured experiences: successful multi-tool sequence, repeated failure, and partial recovery. | Add a lesson candidate lane that can represent tool-sequence experience, repeated failure, recovery, and operational habits. | PB consumes existing raw session/log evidence; it does not require a live OpenHuman-style hook. |
| `src/openhuman/agent_experience/types.rs` | `AgentExperience` stores task summary, tools, sequence, outcome, lesson, reuse hint, avoid hint, confidence, tags, and dismissed state. | Define `ExperienceLesson` with richer PB fields: problem, trigger, action, verification, negative case, portability, privacy tier, and evidence spans. | PB lessons are candidate evidence, not stable wiki pages by themselves. |
| `src/openhuman/agent_experience/store.rs` | Retrieval scores by query, tool overlap, tags, agent id, and entrypoint; dismissed entries are skipped. | Add personal runtime lesson retrieval and injection candidates for M24 bundles. | Stable PB pages and promoted skills outrank runtime lesson cache hits. |
| `src/openhuman/agent_experience/prompt.rs` | Renders compact "Relevant Operating Experience" under a byte cap. | Render personal lesson hits as bounded, lower-authority runtime guidance with citations and source hashes. | Team mode does not inject personal runtime lessons unless reviewed/imported. |
| `src/openhuman/learning/transcript_ingest/*` | Heuristic transcript extraction, dedupe, provenance, importance classes, and reflection stream. | Add deterministic high-precision extraction before LLM calls for explicit preferences, decisions, reflections, repeated mistakes, and unresolved tasks. | Heuristics only seed candidates; LLM extraction remains responsible for non-obvious reusable lessons. |
| `src/openhuman/context/session_memory.rs` and archivist prompt | Background archivist writes dense facts to `MEMORY.md` after thresholds. | Borrow thresholded background extraction as a product idea, but PB treats OpenClaw/Codex `MEMORY.md` as raw input, not as a prerequisite summary. | PB must not require OpenClaw, Codex, or another agent to run an archivist first. |
| `src/openhuman/learning/candidate.rs` and `stability_detector.rs` | Candidate buffer, cue families, evidence refs, recency decay, pin/forget, class budgets. | Add `ExperienceLessonCandidate` stability scoring, cue families, source-count boosts, decay, and user override states. | PB's stable wiki/skill promotion still follows review/promote governance. |
| `src/openhuman/tokenjuice/*` | Deterministic reduction and rule overlays reduce prompt cost before model calls. | Continue M24 context juice and add memory-first protected spans so reducers cannot erase durable lessons. | Do not copy TokenJuice rules or GPL code. |

### Other Reference Mechanisms

- Tencent knowledge article: knowledge is the durable asset; use personal/team/common layers, lifecycle, maturity, and privacy boundaries.
- SkillClaw: real session trajectories are valuable; use judge/verifier, update-before-create, skip weak/generic/runtime noise.
- `atomicstrata/llm-wiki-compiler`: compiled wiki pages should come from evidence-backed concepts, not raw chunks; claim/span provenance is mandatory.
- `nashsu/llm_wiki`: durable ingest queue, review queue, dedupe/merge, and wiki health/lint matter for long-running quality.

## Current Failure Analysis

The existing implementation has useful plumbing, but the core extraction is not memory-first.

- `packages/core/src/experience/chunking.ts` sorts candidate files newest-first and limits file/chunk budgets. This can miss older but higher-value `MEMORY.md` sections.
- Large non-sqlite files can be skipped by byte limit, so long OpenClaw memory files risk being ignored.
- OpenClaw sqlite extraction currently limits the newest rows, which may miss older stable memory.
- Codex/Claude/OpenCode `meaningfulText()` applies keyword filters that can drop implicit lessons.
- `packages/core/src/wiki/curate.ts` infers actions, verification, and reusable lessons mostly from existing summaries and regex-like signals instead of running a dedicated lesson extractor.
- `packages/core/src/wiki/topic-planner.ts` has hard-coded semantic families for a small set of known topics. It cannot reliably discover the user's real OpenClaw lessons such as `MEMORY.md` truncation, fail-closed honesty, target-machine confirmation, Slack raw user id, `COLLATE NOCASE`, frontend cache busting, or model failover.
- `WikiObservationSchema` lacks fields needed to keep lessons portable and safe: trigger, negative case, applies-to, portability, privacy abstraction, and exact evidence spans.

M25 fixes the root path rather than adding more topic-family patches.

## Product Outcome Target

M25 is expected to make personal mode usable as an agent knowledge substrate and team mode ready for governed rollout.

Personal mode should demonstrate:

- local Codex, OpenClaw, Claude Code, OpenCode, and trusted personal remote OpenClaw sources can feed raw memory/session/log evidence into one lesson pipeline;
- PB's LLM lesson extractor can recover useful agent experience without an agent-generated summary;
- safe high-confidence personal lessons become available to agents through context bundles before wiki promotion;
- durable lessons become synthesized wiki candidates with span provenance;
- procedural lessons become skill candidates that prefer updating existing promoted skills;
- generated HTML shows useful lessons, candidate states, review actions, privacy routing, and provenance;
- stable PB knowledge can be published to GBrain for MCP-based agent retrieval.

Team mode should demonstrate:

- team-safe agent evidence can produce reviewable wiki and skill candidates;
- personal/private material is blocked, abstracted, or routed to human-required before team output;
- stable team pages and promoted skills can be published to team GBrain or exported to AgentMemory only after promotion;
- GitLab/human/policy review remains the stable authority.

M25 alone does not promise fully tuned team policy. It establishes the stable kernel needed for real team smoke, promotion policy tuning, and yield improvements.

## Core Objects

### Source Inventory

`SourceInventoryItem` is the immutable source-of-truth descriptor for one raw file, sqlite row group, session, report, skill, or sidecar import.

Required fields:

- `source_item_id`
- `source_ref`
- `source_hash`
- `agent`
- `source_kind`: `memory_file | tools_file | session | report | sqlite_memory | skill | sidecar_import | generic_file`
- `authority_hint`: `agent_native_memory | user_authored | generated_report | session_transcript | external_sidecar`
- `scope_hint`: `personal | project | team | org | global`
- `origin`: `local | trusted_personal_remote | team_git | external`
- `mtime`
- `size_bytes`
- `parser_identity`
- `content_spans`
- `privacy_precheck`

`MEMORY.md`, `TOOLS.md`, known agent memory files, and self-authored skill files receive higher source priority than ordinary logs.

### Evidence Span

`EvidenceSpan` points to exact source material.

Required fields:

- `source_item_id`
- `source_ref`
- `source_hash`
- `span_id`
- `line_start`
- `line_end`
- `byte_start`
- `byte_end`
- `heading_path`
- `excerpt`
- `excerpt_hash`
- `span_kind`: `heading | bullet | paragraph | json_message | tool_call | tool_result | sqlite_row | skill_section`

Stable wiki pages and skills must cite spans, not just source files.

### ExperienceLesson

`ExperienceLesson` is the M25 candidate unit. It is more specific than a generic distilled summary and less authoritative than a stable wiki page.

Required fields:

- `lesson_id`
- `claim`
- `problem`
- `trigger`
- `action`
- `verification`
- `negative_case`
- `applies_to_agents`
- `applies_to_systems`
- `portability`: `universal | agent_family | project | environment | private_instance`
- `privacy_tier`: `safe | personal_only | team_allowed | human_required | reject`
- `scope`: `personal | project | team | org | global`
- `confidence`
- `cue_family`: `explicit_user | native_memory | repeated_failure | verified_fix | tool_sequence | reflection | llm_inferred`
- `source_refs`
- `source_hashes`
- `evidence_spans`
- `safe_claim`
- `redaction_notes`
- `created_at`

The `safe_claim` is the privacy-abstracted lesson text. It may differ from the raw claim when concrete hostnames, account ids, user ids, paths, or private machine names are present.

## Source Inventory And Signal Planning

The signal planner decides which spans enter the LLM lesson extractor.

Priority order:

1. memory files: `MEMORY.md`, OpenClaw memory files, Codex persistent memory, long-term user-authored notes;
2. tools/configuration files that encode durable environment rules, such as `TOOLS.md`;
3. self-generated or local skills with known origin;
4. reports with repeated failures or verified fixes;
5. session transcripts with explicit corrections, failures, fixes, verification, or user directives;
6. ordinary logs;
7. sidecar imports from GBrain/AgentMemory after provenance and privacy precheck.

Scoring signals:

- heading contains memory, lesson, pitfall, preference, tools, infra, deploy, verification, or known agent names;
- text contains explicit lesson phrases such as "remember", "next time", "do not", "must", "always", "avoid", "fix", "verified";
- span mentions a failure plus a later successful verification;
- span appears in multiple sources or repeats across sessions;
- span is user-authored or native long-term memory;
- span contains concrete private values that can be abstracted safely.

Budgeting rules:

- do not choose newest-first by default;
- reserve a fixed minimum budget for memory files before session logs;
- split long memory files by headings and bullets instead of skipping the file;
- keep neighboring heading context around selected spans;
- keep provenance spans even when the body is context-juiced;
- cache by source hash, parser identity, span hash, model id, and prompt version.

## Extraction Lanes

### Deterministic High-Precision Lane

This lane borrows OpenHuman's transcript-ingest idea.

It extracts only obvious signals:

- explicit user preference or veto;
- explicit decision and rationale;
- explicit unresolved task;
- explicit reflection or repeated-pattern phrase;
- visible failure followed by verification;
- tool sequence with successful outcome;
- repeated same-tool failure in a single trajectory.

It must not fabricate lessons. Its output is low-cost seed material for the LLM lane and for personal runtime injection.

### LLM Lesson Extraction Lane

This lane is mandatory when AI is configured. M25 assumes PB is an AI-assisted project; deterministic extraction alone is fallback/degraded mode.

The extractor receives:

- prioritized spans;
- surrounding headings and limited neighboring context;
- source metadata and authority hints;
- privacy precheck hints;
- existing stable pages and related lessons for update-vs-create decisions.

The extractor returns strict JSON matching `ExperienceLesson[]`. It must:

- produce reusable lessons, not summaries;
- cite evidence spans for each lesson;
- classify portability and applies-to systems;
- separate universal lesson from project/environment-specific details;
- produce a `safe_claim` when abstraction is possible;
- return no lesson when evidence is weak, generic, or only a one-off run report.

## Privacy Abstraction

M25 introduces privacy abstraction before wiki/skill promotion.

The privacy layer has two jobs:

1. block true secrets and unsafe private values;
2. preserve the reusable lesson when concrete private details can be abstracted.

Examples:

- concrete remote host, IP, username, key path -> "trusted personal remote host" or "configured private remote";
- concrete Slack user id -> "raw platform user id format";
- concrete local wrapper command -> "configured private wrapper command";
- concrete database name with account details -> "target database" unless the name is team-approved.

If abstraction would destroy the lesson, the lesson becomes `personal_only` or `human_required`.

Team mode is stricter:

- personal source scope cannot enter team knowledge without explicit import policy;
- private host/IP/path/account/key/user id must not appear in `kb/`, `skills/`, `dist/`, GBrain export, or AgentMemory export;
- team `team_allowed` requires a safe claim, evidence spans, and no private excerpt leakage.

## Portability Classification

Each lesson must say where it applies.

- `universal`: independent of tool, host, account, or project. Example: acknowledge long-running work before tool/network/dispatch operations.
- `agent_family`: applies to a family of agents or orchestration systems. Example: fail-closed delegation guard must not pretend success.
- `project`: applies to a named project/system such as OpenClaw or OctoClaw. Example: OpenClaw hash-suffixed dist files require export mapping.
- `environment`: applies to a trusted local/remote environment. Example: a private Mac mini should be reached through its configured private network route.
- `private_instance`: concrete secret, account, private host, private path, or personal workflow detail. It stays personal or human-required unless abstracted.

Portability affects routing:

- `universal` and safe `agent_family` may feed cross-agent personal bundles and team wiki if scope allows;
- `project` feeds project wiki and project skills;
- `environment` feeds personal runtime context and possibly an abstracted wiki pitfall;
- `private_instance` is never exported as stable team knowledge.

## Stability And Candidate Cache

M25 adds a lesson cache inspired by OpenHuman's candidate/stability pattern.

States:

- `candidate`: one weak or fresh signal;
- `provisional`: useful but not stable enough for auto-promotion;
- `active_personal`: personal-mode safe, high confidence, available for runtime injection;
- `wiki_ready`: ready for wiki compile candidate;
- `skill_ready`: stable enough and procedural enough for skill synthesis;
- `forgotten`: explicitly suppressed by user;
- `rejected`: failed safety or quality gates.

Scoring inputs:

- confidence from extractor;
- cue-family weight;
- number of distinct source items;
- number of distinct agents;
- verification strength;
- recency decay by portability class;
- privacy tier;
- user pin/forget override;
- semantic duplicate/contradiction status.

Personal mode may auto-activate safe high-confidence lessons for runtime injection. It still does not auto-promote brand-new stable skills without the configured review policy.

## Wiki Compiler Integration

The wiki compiler should consume lesson clusters, not raw evidence summaries.

A stable wiki candidate must render:

- title;
- applicability;
- when to use;
- procedure or recommendation;
- verification;
- pitfalls / negative case;
- applies-to agents/systems;
- portability and privacy tier;
- related wiki links;
- provenance with source refs, source hashes, and span excerpts.

The compiler should update existing pages before creating new pages. It should link related pages and avoid isolated one-off run pages.

## Skill Synthesis Integration

Skills should be generated from:

- stable wiki pages with procedural patterns;
- `skill_ready` lesson clusters;
- repeated verified fixes;
- explicit user/project operating policies.

The skill proposer must follow the existing governance ladder:

1. update a promoted skill that already covers the lesson;
2. update an umbrella skill;
3. add support files under an existing skill;
4. create a new class-level skill only when no existing skill fits;
5. skip weak, generic, or unsafe material.

If the LLM returns a valuable skill with a fixable shape error, PB should run deterministic repair and revalidate before sending it to human review.

## Runtime Personal Injection

OpenHuman's `agent_experience` shows that some experience should be useful before it becomes stable wiki.

M25 therefore adds a lower-authority runtime lane:

```text
active_personal/wiki_ready/skill_ready personal lessons
  -> M24 context bundle
  -> "Relevant PB Experience" section
  -> agent task prompt
```

Rules:

- stable PB pages and promoted skills outrank runtime lesson hits;
- runtime hits are bounded and citation-bearing;
- unreviewed team candidates are not injected;
- personal `wiki_ready` and `skill_ready` lesson hits are still lower-authority runtime guidance until review/promote creates stable pages or promoted skills;
- personal runtime lessons are excluded from team mode by default;
- dismissed/forgotten lessons are skipped.

## Golden Validation

The user-provided local and remote OpenClaw summaries are golden answers.

Local OpenClaw acceptance examples:

- delegation fail-closed honesty;
- do not claim delegation failed if the main session already completed the work;
- `MEMORY.md` truncation around 12000 characters and daily-log vs long-term-memory distinction;
- brief ACK before long/tool/network/dispatch work;
- internal tool failures should not be proactively exposed unless asked;
- OpenClaw hash-suffixed dist/export mapping;
- model timeout/failover behavior.

Remote OpenClaw acceptance examples:

- voice is primary delivery for daily reports;
- self-test after changes;
- confirm target machine before restarting or executing;
- private Mac mini access should use configured private routing;
- Slack audio upload needs raw platform user id format;
- database queries need case-insensitive collation when appropriate;
- frontend cache busting with timestamp query;
- model rate-limit fallback route.

Validation requires raw evidence input. The golden answer itself must not be imported as production evidence.

Minimum acceptance:

- local fixture extracts at least 5 of 8 target lessons;
- remote fixture extracts at least 6 of 8 target lessons;
- every extracted target lesson has evidence spans;
- private host/IP/path/account/key details do not appear in stable wiki, skills, site, GBrain export, or AgentMemory export;
- output pages are synthesized experience pages, not raw copied summaries;
- personal runtime injection can retrieve relevant lessons for an OpenClaw/Codex query.

## Failure Handling

- Source parse failure: record warning, keep other sources processing.
- Oversized memory file: section-map and prioritize; do not skip the entire file.
- LLM unavailable: write deterministic extraction report and mark wiki/skill compile degraded.
- LLM malformed output: retry once with schema repair prompt, then quarantine.
- Privacy abstraction ambiguous: mark `human_required`, preserve private raw evidence only in local vault.
- Duplicate or contradictory lessons: cluster and route to update/merge/human review.
- Too many candidate lessons: apply stability and class budgets before wiki compile.

## Implementation Boundaries

M25 should be implemented as small modules rather than adding more logic to existing large files:

- `source-inventory`: file/sqlite/session discovery, section map, span ids.
- `lesson-schema`: zod schemas and shared types.
- `lesson-planner`: score and select spans under budget.
- `lesson-extractor`: deterministic and LLM extraction.
- `privacy-abstraction`: safe claim generation and privacy tier routing.
- `lesson-cache`: stability, dedupe, state transitions, user overrides.
- `lesson-compiler`: convert stable lesson clusters into wiki/skill inputs.
- CLI/site integration: reports, review queue, and personal runtime preview.

Existing modules should consume these outputs instead of continuing to infer topics from raw summaries.

## Done Definition

M25 is done only when:

- docs, OpenSpec, BDD, and implementation tests exist;
- raw OpenClaw/Codex memory/session fixtures can produce useful lessons without agent-generated summaries;
- daily run uses memory-first planning by default when AI is configured;
- daily run routes wiki, skill, runtime, GBrain, and AgentMemory decisions through `ExperienceLesson` state when lesson output exists;
- personal mode can auto-activate safe lessons for runtime context;
- wiki candidates are fewer, better, span-cited, linked, and privacy-safe;
- skill candidates derive from stable procedural lessons and pass validation/semantic review;
- GBrain and AgentMemory are verified as source/sink/retrieval sidecars with no promotion authority;
- generated HTML shows lessons, candidate states, provenance, and privacy routing without leaking raw private details.
