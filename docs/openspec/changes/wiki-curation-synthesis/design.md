# Wiki Curation Synthesis OpenSpec Design

## Overview

This change adds a curation layer after source collection, AI distill, and wiki compile:

```text
raw evidence
  -> evidence pool
  -> deterministic filter
  -> cluster / dedupe
  -> AI curator synthesis
  -> deterministic guards
  -> curated proposal queue
  -> review / promote
  -> stable kb / skills
```

`wiki compile` remains a lower-level compiler stage that can emit raw candidates and reports. `wiki curate` is the default human-facing synthesis stage.

## Evidence Pool

`WikiEvidenceItem` normalizes safe inputs from captures, episodes, native memory, external refs, distilled experience, and raw wiki candidates.

Required properties:

- `id`
- `kind`
- `source_ref`
- `source_hash`
- `scope`
- `title`
- `summary`
- `actions`
- `failed_attempts`
- `verification`
- `reusable_lessons`
- `signatures`
- `privacy_verdict`

The pool must filter or route away:

- `session_meta`;
- base instructions or system prompts;
- `openclaw:unknown`;
- empty promotion logs;
- material with secret or credential patterns;
- team-mode personal/private material.

## Clustering

`WikiEvidenceCluster` groups evidence before synthesis.

Cluster keys are deterministic:

1. exact non-source-specific signature;
2. normalized target path hint;
3. normalized title;
4. wiki kind plus reusable lesson signature.

Clusters preserve all source refs and hashes. Scope conflicts do not merge unless the scopes are compatible. Personal evidence cannot merge into team/org/global clusters.

## Curated Proposal

`CuratedWikiProposal` is the default review object.

It must include:

- `type: "wiki_curated_proposal"`;
- `target_path`;
- `action`;
- `page_kind`;
- `scope`;
- `title`, `summary`, `body_markdown`;
- `source_refs`, `source_hashes`, `source_count`;
- `evidence_ids`;
- `confidence`, `maturity`;
- `provenance`;
- `review_hint`;
- deterministic `guards`.

The body must be wiki-shaped: problem/context, applicability, steps or decision, failed attempts where useful, verification, risks, and provenance. It must not copy raw transcripts.

## Command Behavior

```bash
praxisbase wiki curate --dry-run --json
praxisbase wiki curate --review --json
praxisbase wiki curate --review --degraded --json
```

Rules:

- Dry-run writes `.praxisbase/reports/wiki-curation/<id>.json` only.
- Review mode writes `.praxisbase/inbox/proposals/<id>.json`.
- Neither mode writes `kb/`, `skills/`, or `dist/`.
- Production mode requires configured AI.
- Degraded mode must mark output as not production-ready.

## Auto Review Policy

Review policy lives at `.praxisbase/review-policy.json`.

Personal default:

- `auto_review: true`;
- `auto_promote: "low_risk_personal_only"`;
- low-risk personal/project `known_fix`, `procedure`, `pitfall`, and `note` can be auto-promoted;
- privacy risk, scope escalation, team/org/global target, low confidence, conflicting evidence, skill/policy target, update existing page, archive, and supersede require human.

Team default:

- `auto_review: true`;
- `auto_promote: "off"`;
- team/org/global promotion requires explicit configuration and Git/CI gate;
- personal/private evidence is rejected before proposal generation.

## Site And Review UI

Review and static site dashboards must count curated proposals as the primary pending queue. Raw candidates and evidence pool statistics may appear as debug or secondary sections, but they must not inflate the main human-required count.

## Invariants

- Stable writes still require existing review/promote paths.
- AI cannot overrule deterministic privacy or path guards.
- Reports must explain input counts, filtered noise, human-required, clusters, proposals, and written proposals.
- Same input and mocked AI response must produce stable proposal ids and sorted output.
