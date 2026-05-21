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
- Codex/OpenClaw session boot or initialization metadata with no user-authored preference, repair action, decision, or verified outcome;
- `openclaw:unknown`;
- empty promotion logs;
- OpenClaw reflection-theme artifacts such as "Theme: assistant/user kept surfacing" and memory promotion bookkeeping;
- official documentation, API references, and vendor docs when they are only reference material rather than user or agent-authored experience;
- material with secret or credential patterns;
- team-mode personal/private material.

Official docs may remain as provenance for a synthesized page, but they must not become stable wiki pages by themselves.

## Useful Experience Gate

An evidence item is useful enough for synthesis only when it has at least one durable lesson signal:

- a concrete user preference or operating policy authored by the user;
- a verified fix, workaround, or failed attempt with a reusable trigger;
- a repeated agent behavior lesson that changes future execution;
- a project-specific decision, procedure, or pitfall with provenance.

The curator must not treat generic session configuration, tool availability, model metadata, raw memory promotion records, or official reference docs as useful experience. These records may increase `filtered_noise`, or they may be retained only as provenance if attached to a stronger user/agent experience item.

Single-source evidence can become a review candidate only if it is high-signal: it must include a problem or preference, an action or decision, and either verification or a reusable lesson. Multi-source evidence is preferred and should rank higher. A proposal with weak single-source evidence must stay out of auto-promotion even in personal mode. A single-source proposal is not weak when it passes the deterministic `experience_signal`, `actionability`, `verification_or_lesson`, and `not_reference_only` guards; in personal mode it may then follow the same low-risk auto-review policy as multi-source proposals.

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

Every curated proposal must pass deterministic quality guards:

- `experience_signal`: evidence contains a durable lesson signal;
- `actionability`: body explains when an agent should use the page and what to do differently;
- `verification_or_lesson`: body includes verification evidence or a reusable lesson;
- `not_reference_only`: proposal is not merely official docs, session boot/configuration, or bookkeeping.

AI output that misses wiki structure should be repaired once using deterministic fallback shaping or rejected with a guard error. Rejected clusters must be counted separately from privacy/human-required items so the user can see whether the issue is source quality or model output quality.

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
- privacy risk, scope escalation, team/org/global target, low confidence, weak single-source evidence, conflicting evidence, skill/policy target, update existing page, archive, and supersede require human.

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
