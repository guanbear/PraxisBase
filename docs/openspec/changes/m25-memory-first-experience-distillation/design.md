# Design: M25 Memory-First Experience Distillation

## Boundary

M25 introduces a governed lesson layer between raw agent evidence and stable wiki/skill outputs.

```text
raw evidence
  -> source inventory + evidence spans
  -> deterministic and LLM lesson extraction
  -> lesson candidates + privacy abstraction + stability
  -> wiki/skill compiler inputs
  -> review/promote
  -> stable PB pages, promoted skills, catalog, GBrain export
```

The lesson layer is not stable knowledge. It is reviewable, cacheable, retrievable candidate evidence.

## Integration Contract

M25 is the production semantic path for agent experience. It must not be implemented as a second optional path beside the older distill-summary-to-wiki flow.

The contract:

- Raw evidence enters M25 as `SourceInventoryItem` records with `EvidenceSpan` citations.
- `ExperienceLesson` is the primary semantic candidate for reusable agent experience.
- Existing `DistilledExperience` records may seed lessons, support diagnostics, or power explicit degraded mode, but they must not outrank lesson clusters when M25 lesson output exists.
- Wiki curation uses `wiki_ready` lesson clusters before raw summaries.
- Skill synthesis uses `skill_ready` lesson clusters or stable procedural wiki pages, not raw logs or one-off summaries.
- Runtime context may inject personal runtime-eligible lessons (`active_personal`, `wiki_ready`, and `skill_ready`) as lower-authority personal guidance.
- Stable PB pages and promoted PB skills outrank runtime lesson hits, GBrain sidecar hits, and AgentMemory sidecar hits.
- GBrain and AgentMemory are source/sink/retrieval backends only. They do not decide PB promotion.
- Personal auto-activation is not stable promotion. Team export requires reviewed, team-safe stable PB knowledge.

This contract is required because prior pipeline iterations added useful components without forcing downstream wiki, skill, and context paths to consume the same governed semantic unit.

## Authority Matrix

| Output | M25 input | Stable authority |
| --- | --- | --- |
| Personal runtime context | stable PB pages, promoted skills, then personal runtime-eligible lessons | stable PB pages and promoted skills |
| Wiki proposal | `wiki_ready` lesson cluster | review/promote |
| Skill candidate | `skill_ready` lesson cluster or stable procedural wiki page | audited skill promotion |
| GBrain publish | stable PB page or promoted skill | PB promotion audit |
| AgentMemory export | stable PB page or promoted skill | PB promotion audit |
| Team knowledge | team-safe promoted PB artifact | team Git/human/policy review |

## OpenHuman Source-Level Borrowing

OpenHuman is used as a source-level reference only. It is GPL-3.0, so PraxisBase must not copy implementation code, prompts, or vendor rule files.

Relevant mechanisms:

- `agent_experience/capture.rs`: post-turn extraction of successful multi-tool sequences, repeated failures, and partial recovery patterns.
- `agent_experience/types.rs`: structured experience object with task summary, tools, outcome, lesson, reuse hint, avoid hint, confidence, and tags.
- `agent_experience/store.rs`: retrieval using query, tool overlap, tags, agent id, entrypoint, and dismissed state.
- `agent_experience/prompt.rs`: compact bounded runtime injection of relevant operating experience.
- `learning/transcript_ingest/*`: heuristic transcript extraction, dedupe, provenance, importance classes, and reflections.
- `learning/candidate.rs` and `stability_detector.rs`: candidate buffer, cue families, evidence refs, stability thresholds, recency, and class budgets.
- `context/session_memory.rs`: background archivist extraction into `MEMORY.md`; PB borrows the thresholded extraction idea but must not depend on it as formal input.
- `tokenjuice/*`: deterministic reduction and protected context budgeting; PB continues its independent M24 implementation.

## Core Data Flow

### 1. Source Inventory

Create source inventory before chunking/distill selection.

Each source item records:

- `source_item_id`
- `source_ref`
- `source_hash`
- `agent`
- `source_kind`
- `authority_hint`
- `scope_hint`
- `origin`
- `mtime`
- `size_bytes`
- `parser_identity`
- `content_spans`
- `privacy_precheck`

Memory files and long-term notes must be parsed into sections even when they exceed ordinary source byte limits.

### 2. Evidence Spans

Evidence spans are line/byte/heading references into raw sources.

Stable candidates and exports must cite spans. A source hash without a span is not enough for M25-generated wiki or skill candidates.

### 3. Signal Planning

The planner selects spans, not whole files.

Priority:

1. native memory files and long-term notes;
2. tool/environment memory files;
3. self-authored skills with known origin;
4. verified reports and repeated failures;
5. session transcripts with failures, fixes, verification, explicit directives, or reflections;
6. ordinary logs;
7. sidecar imports after privacy precheck.

Budget rules:

- reserve memory-file budget before log budget;
- never skip an entire long memory file only because it is large;
- keep heading context around selected spans;
- cache by source hash, span hash, parser identity, reducer identity, model id, and prompt version.

### 4. Deterministic Extraction

The deterministic extractor emits high-precision lesson seeds:

- explicit user preference or veto;
- decision and rationale;
- unresolved task;
- explicit reflection;
- repeated same-tool failure;
- successful multi-tool sequence;
- failure followed by verified fix.

This lane can run without AI, but it is not enough for full PB quality.

### 5. LLM Lesson Extraction

When AI is configured, the LLM extractor is mandatory for M25 production mode.

It receives selected spans plus metadata and returns `ExperienceLesson[]`.

Required lesson fields:

- `claim`
- `safe_claim`
- `problem`
- `trigger`
- `action`
- `verification`
- `negative_case`
- `applies_to_agents`
- `applies_to_systems`
- `portability`
- `privacy_tier`
- `scope`
- `confidence`
- `cue_family`
- `evidence_spans`
- `source_refs`
- `source_hashes`
- `redaction_notes`

The prompt must ask for reusable lessons, not summaries. It must return no lesson for weak, one-off, or generic material.

### 6. Privacy Abstraction

The privacy layer attempts safe abstraction before rejection.

Examples:

- private host/IP/path/key/account -> abstract private endpoint or configured private route;
- raw platform user id -> platform user id format;
- concrete local command wrapper -> configured private wrapper;
- project-specific system names -> project-level entities when safe.

If abstraction cannot preserve the useful lesson, route to `personal_only` or `human_required`. True secrets route to `reject` or `human_required` depending on policy.

### 7. Portability Classification

Lessons must be classified:

- `universal`
- `agent_family`
- `project`
- `environment`
- `private_instance`

This controls routing into personal bundles, project wiki, team wiki, skills, and review queues.

### 8. Stability And Dedupe

Lesson states:

- `candidate`
- `provisional`
- `active_personal`
- `wiki_ready`
- `skill_ready`
- `forgotten`
- `rejected`

Scoring uses confidence, cue family, source count, agent count, verification strength, recency, privacy tier, semantic duplicate status, and user overrides.

### 9. Wiki Integration

Wiki curation consumes lesson clusters.

Generated wiki candidates must include:

- when to use;
- recommendation/procedure;
- verification;
- negative case;
- applies-to agents/systems;
- portability;
- privacy tier;
- related pages;
- provenance spans.

The compiler must prefer updating an existing page before creating a new one.

### 10. Skill Integration

Skill synthesis consumes `skill_ready` lesson clusters and stable procedural pages.

The proposer must:

- update existing promoted skills before creating new skills;
- repair fixable format errors and revalidate;
- reject generic runtime advice and one-off task narratives;
- keep unreviewed candidates out of normal agent injection.

### 11. Runtime Personal Injection

`active_personal`, `wiki_ready`, and `skill_ready` personal lessons can feed M24 context bundles as lower-authority runtime guidance. `wiki_ready` and `skill_ready` remain unpromoted candidates until the normal review/promote path writes stable pages or promoted skills.

Rules:

- stable PB pages and promoted skills outrank lesson hits;
- personal lessons are bounded and cited;
- forgotten/dismissed lessons are skipped;
- team mode excludes personal runtime lesson bodies by default.

## Golden Validation

Golden answers are stored as test expectations, not production input.

Local OpenClaw target lessons include:

- fail-closed delegation honesty;
- do not misreport delegation failure after completing work directly;
- `MEMORY.md` truncation and daily-log vs long-term-memory distinction;
- ACK before long/tool/network/dispatch work;
- do not proactively expose internal tool failures unless asked;
- OpenClaw dist/export mapping;
- timeout/failover behavior.

Remote OpenClaw target lessons include:

- voice delivery requirement;
- self-test after changes;
- confirm target machine;
- private route for Mac mini access;
- Slack raw user id format;
- case-insensitive database queries;
- frontend cache busting;
- model rate-limit fallback.

## Failure Handling

- Parse failures produce warnings and skip only the failing source.
- LLM unavailability produces deterministic-only degraded reports.
- Malformed LLM output retries once with a schema repair request, then quarantines.
- Ambiguous privacy becomes `human_required`.
- Duplicate or contradictory lessons become merge/update/human-required candidates.
- Too many lessons are trimmed by stability and class budgets before wiki compile.

## Migration From Existing Distill

M25 keeps the existing AI distill layer as compatibility infrastructure, but narrows its authority.

`DistilledExperience` can be used when:

- it is converted into `ExperienceLesson` seeds with evidence spans and privacy checks;
- it appears in reports explaining why a source did or did not yield lessons;
- the user explicitly runs degraded output because lesson extraction is unavailable.

`DistilledExperience` cannot be used when:

- a `wiki_ready` or `skill_ready` lesson cluster exists for the same source;
- normal production skill synthesis is deciding whether to create or update a skill;
- GBrain or AgentMemory export is deciding what stable PB knowledge to publish.

The implementation should keep compatibility tests for existing distill behavior, but add integration tests proving that lesson clusters win when both representations are present.
