# Personal Review Auto-Governance OpenSpec Design

## Overview

This change turns personal mode into an explicit loop:

```text
personal doctor
  -> personal/daily run
  -> privacy triage
  -> review queue
  -> stable wiki
  -> AgentMemory export
  -> larger smoke
```

Existing modules remain authoritative:

- daily ingestion writes reports, envelopes, exceptions, and proposals;
- privacy triage decides whether blocked evidence can re-enter the pipeline;
- wiki quality gates decide stable knowledge promotion;
- AgentMemory receives only stable wiki lessons.

## Daily Next Actions

Daily reports already contain enough raw counts. M19 adds a derived summary for users and agents:

- sources scanned;
- AI distill status;
- privacy-required count;
- review-required count;
- rejected-low-signal count;
- rejected-quality count;
- stable wiki changed;
- AgentMemory export recommendation.

The summary is derived from report fields, not maintained as separate state.

## Privacy Auto-Governance

Personal auto-release is allowed only when:

- authority mode is `personal-local`;
- `--auto-release` is explicitly set;
- AI classification is `safe_personal_experience`;
- confidence is at least the configured threshold;
- deterministic private-value checks pass;
- scope is personal or project.

Team mode returns `team_review_only` and never auto-releases personal material.

Auto-release does not write `kb/**`; it only records triage metadata and lets future processing treat the evidence as no longer blocked by privacy uncertainty.

## Site Queues

The site must stop presenting all `human_required` counts as one undifferentiated action.

Queue sections:

- `Privacy required`: blocked by privacy/scope uncertainty.
- `Review required`: safe enough to inspect, but needs quality, merge, or policy review.
- `Rejected`: intentionally dropped low-signal or quality-blocked candidates.
- `Promoted`: stable wiki pages from the latest run.

Each card includes why it is in that queue and what command to run next.

## AgentMemory Boundary

AgentMemory export is downstream of stable wiki only:

```text
kb/** or skills/** -> compact lesson payload -> POST /agentmemory/remember
```

Export excludes:

- `.praxisbase/inbox/**`;
- `.praxisbase/exceptions/**`;
- `.praxisbase/raw-vault/**`;
- `.praxisbase/reports/**`;
- generated runtime `dist/**`;
- rejected or review-only material.

If AgentMemory is down, the wiki remains usable and the export reports warnings.

## Validation Ladder

Implementation and release use increasing scope:

1. unit and CLI tests;
2. `personal doctor`;
3. small real daily with `--limit 50`;
4. privacy triage with `--limit 100`;
5. second small daily;
6. AgentMemory export;
7. medium real daily with `--limit 200`;
8. full daily only after manual inspection of medium-run wiki quality.

## Invariants

- Stable wiki pages must be fewer and better, not more numerous.
- One-off pass/fail reports remain evidence and do not become stable guidance.
- Personal convenience does not alter team privacy defaults.
- AgentMemory never outranks PraxisBase stable wiki authority.
- Generated runtime artifacts are not committed unless explicitly accepted.
