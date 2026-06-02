# Agent Skill Synthesis Governance Proposal

## Why

PraxisBase has a working evidence-to-wiki pipeline, but stable agent-facing skills are not yet governed enough. The current skill draft generator can create a `skills/synthesized/**/SKILL.md` proposal from repeated distilled experiences, but it does not have a full daily lane, stability scoring, existing-skill update preference, semantic skill review, site visibility, or personal/team audit policy.

Skills change future agent behavior, so they need a stricter gate than wiki notes.

## What Changes

- Finish the remaining M19.1 wiki semantic-review gate tasks that protect personal auto-promotion.
- Add M19.2 skill synthesis as a default proposal-only lane.
- Generate skill candidates from repeated distilled experiences, promoted wiki procedures, and verified agent lessons.
- Borrow Hermes' skill-worthiness rubric and update-before-create ladder.
- Borrow OpenHuman's candidate/stability/budget idea with an independent file-first implementation.
- Add stable skill inventory matching before new skill creation.
- Add explicit skill promotion audit records with candidate/source/path matching.
- Add a skill semantic reviewer distinct from the wiki semantic reviewer.
- Allow personal and team modes to generate skill candidates.
- Require audit review before any candidate becomes stable `skills/**`.
- Keep team stable skill promotion behind human/Git review.
- Show skill candidates, review decisions, and next actions in the generated site.

## Goals

- Stronger agent-facing procedural memory without letting AI mutate stable skills directly.
- Fewer, class-level, provenance-backed skill candidates instead of many one-off micro-skills.
- Personal mode remains usable while still requiring stable skill audit.
- Team mode remains conservative and Git-reviewable.
- Skill synthesis builds on the llm-wiki flow: raw evidence is evidence, AI synthesizes candidates, review/promote controls stable knowledge.

## Non-Goals

- Do not add a mandatory daemon, MCP server, database, or vector store.
- Do not copy OpenHuman GPL source or TokenJuice vendor rules.
- Do not implement Hermes-style direct background mutation of stable skill files.
- Do not auto-promote brand-new personal skills by default.
- Do not allow personal/private material into team skills by default.

## Acceptance

- `praxisbase skill synthesize --mode personal --review --json` writes reviewed skill candidates, not stable skills.
- `praxisbase skill synthesize --mode team --review --json` writes team-safe candidates that require Git/human review.
- `praxisbase daily run --mode personal --build-site --json` can include skill synthesis counts and site cards.
- Existing stable skill updates are preferred over new skill creation.
- Skill candidates include `When To Use`, `Procedure`, `Verification`, `Pitfalls`, `Do Not Use When`, `Related Wiki Pages`, and `Provenance`.
- Semantic skill review rejects one-off reports, exact run ids, environment failures, raw copies, and unsafe future-agent instructions.
- Stable `skills/**` writes require a review record and promotion path.
- Real smoke acceptance checks candidate quality, provenance, privacy, and unchanged stable skills before audited promotion.
