# Knowledge Governance Phase 2 Design

## Overview

Phase 2 makes PraxisBase knowledge self-governing without making it self-mutating. Governance commands inspect episodes, proposals, reviews, and stable knowledge objects, then write reports, proposals, run records, and exceptions. Stable knowledge still changes only through review and promotion.

```text
episodes + stable knowledge + source refs
        |
        v
lint / duplicate scan / reference aggregation / import / retrieval budget
        |
        v
reports + proposals + exceptions + compact bundles
        |
        v
review --auto / promote --auto / human exception queue
```

## Batch Plan

### P2-A: Lint And Deterministic Duplicate Detection

`praxisbase lint --json` scans `.praxisbase/`, `kb/`, `skills/`, and `dist/` without modifying stable knowledge.

Lint severities:

| Rule | Severity | Behavior |
| --- | --- | --- |
| missing or invalid frontmatter | error | block auto-promotion |
| missing `protocol_version`, `id`, `type`, or `knowledge_type` | error | block auto-promotion |
| duplicate object id | error | write conflict exception |
| raw log-like content under `kb/` | error | block promotion/build |
| published/proven object without evidence source/hash | error | block auto-promotion |
| deterministic contradiction in same signature | error | write human-required exception |
| active object has `superseded_by` | warning | remove from active bundle proposal |
| duplicate signature across same knowledge type | warning | duplicate proposal candidate |
| orphan draft with no references for 90 days | warning | stale proposal candidate |
| skill/procedure lacks verification or rollback | warning | safety proposal candidate |

Duplicate detection is deterministic only:

- same frontmatter `id` => duplicate error,
- same `source_hash` => duplicate warning unless ids match,
- same `signature` plus normalized title exact match => duplicate warning,
- same `signature` plus normalized title token overlap >= 0.85 => duplicate warning.

Contradiction detection is also deterministic:

- same `signature`, one object recommends an action and a `pitfall.forbidden_actions` entry normalizes to the same action => contradiction error,
- same `signature`, one object's `known_fix`/`procedure` text contains an action that another object marks as forbidden by explicit `forbidden_actions` or `forbidden_operations` metadata => contradiction error,
- same `signature`, newer proven knowledge supersedes an older object but the older object is still active in bundle output => contradiction warning,
- broad natural-language disagreement without explicit action/forbidden metadata is out of scope for P2-A and should be routed to future semantic review.

No vector search or embedding dependency is allowed in P2-A.

### P2-B: Reference Tracking And Maturity Proposals

Reference aggregation reads episode `knowledge_references`.

Positive reference outcomes:

- repair episodes: `success`
- incident episodes: `confirmed`

Negative or blocking outcomes:

- repair episodes: `failed`, `partial`
- incident episodes: `ruled_out`, `inconclusive`, `data_gap`

`reference_count` is cumulative. Windowed counts are computed into reports, for example `positive_refs_180d`.

Maturity proposal rules:

| Transition | Required Evidence |
| --- | --- |
| `draft -> verified` | at least 2 positive references within 180 days, from at least 1 environment, and no newer negative reference for the same object |
| `verified -> proven` | at least 5 positive references, at least 2 distinct environments, at least 2 distinct agent ids, references span at least 7 days, and no unresolved negative reference in the last 30 days |

Failed/partial/data-gap episodes do not directly demote knowledge. They block promotion while unresolved and may trigger P2-C stale/exception proposals.

Maturity governance writes proposal objects such as:

```json
{
  "target_type": "known_fix",
  "action": "patch",
  "patch": {
    "path": "kb/known-fixes/openclaw-auth-expired.md",
    "content": "frontmatter patch setting maturity: verified"
  }
}
```

### P2-C: Decay And Stale Proposals

Decay is proposal-based. It never silently edits stable knowledge.

Default stale thresholds:

| Current Maturity | Stale Condition | Proposed Action |
| --- | --- | --- |
| `draft` | no positive references for 90 days | archive or keep draft but remove from active bundle |
| `verified` | no positive references for 180 days | propose `maturity: draft` or stale flag |
| `proven` | no positive references for 365 days | propose `maturity: verified` and create stale warning |

Failure-driven rules:

- 2 negative references within 30 days for the same object create a stale proposal.
- 1 negative reference against `proven` knowledge creates a warning exception, not an automatic demotion.
- A negative reference newer than all positive references blocks maturity promotion.

Decay reports include cumulative `reference_count`, windowed counts, last positive reference, last negative reference, and proposed action.

### P2-D: Cold-Start Import

`praxisbase import <source>` supports these input adapters:

- Markdown directory,
- Feishu exported JSON or Markdown,
- JSONL episodes/proposals,
- Git repository documentation path,
- existing wiki dump.

Import output:

- `.praxisbase/runs/import/*.json`
- `.praxisbase/inbox/proposals/*.json`
- optional `.praxisbase/inbox/episodes/*.json` for already-structured episodes

Import must not write directly to `kb/` or `skills/`.

Each imported proposal must include:

- `source_refs`,
- deterministic `source_hash`,
- `redacted_summary`,
- original source URI,
- detected `knowledge_type`,
- `maturity: draft`,
- `scope` chosen by import profile.

Raw logs are never committed. Import stores only source refs, hashes, and redacted summaries.

### P2-E: Stage-Aware Compact Retrieval And Query Budget

`praxisbase repair-context` and future `praxisbase context` commands should support stage-aware selection.

Stages:

- `diagnosis`
- `repair`
- `verification`
- `proposal`

Default budget:

| Stage | Max Serialized Size | Selection Bias |
| --- | --- | --- |
| diagnosis | 16 KB | signatures, pitfalls, known fixes |
| repair | 24 KB | skills, procedures, forbidden operations |
| verification | 12 KB | verification steps, rollback, escalation |
| proposal | 16 KB | similar objects, evidence contract, prior reviews |

Ranking order:

1. exact problem signature match,
2. higher maturity (`proven > verified > draft`),
3. safer risk (`low > medium > high` for automatic context),
4. more recent positive reference,
5. higher positive reference count,
6. configured scope preference (`project > team > global > personal` unless profile overrides).

When over budget, the system drops lower-ranked full objects first and keeps short citations in the bundle so the agent can request full objects later.

## Output Surfaces

```text
.praxisbase/reports/lint/*.json
.praxisbase/reports/references/*.json
.praxisbase/reports/decay/*.json
.praxisbase/runs/import/*.json
.praxisbase/inbox/proposals/*.json
.praxisbase/exceptions/human-required/*.json
.praxisbase/exceptions/conflicts/*.json
```

## Safety Boundary

All governance output must be auditable. The system may propose, warn, rank, and summarize. It must not bypass review/promotion for stable knowledge changes.
