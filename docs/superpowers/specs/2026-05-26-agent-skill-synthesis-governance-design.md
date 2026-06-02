# Agent Skill Synthesis Governance Design

## Problem

PraxisBase can already collect local and remote agent experience, reduce noisy source material, run AI distill, curate wiki proposals, and build a human-readable site. It also has an early skill draft generator from repeated distilled experiences.

That is not enough for agent-facing skill generation. A skill is procedural memory that can change future agent behavior. A weak skill is more dangerous than a weak wiki note because agents may follow it without re-checking the original context. The current skill synthesis is too shallow: it groups by exact trigger/procedure, has no semantic skill-worthiness reviewer, does not prefer updating an existing umbrella skill, and is not wired into the daily lane as an audited proposal flow.

The missing design is a governed skill lane:

```text
raw evidence
  -> AI/compile synthesis
  -> few provenance-backed wiki candidates
  -> semantic review/promote
  -> repeated skill signals
  -> skill proposal synthesis
  -> skill semantic review
  -> audited review/promote
  -> stable skills/
```

## Goals

- Finish the remaining M19.1 wiki semantic-review gate items so the wiki base is stable before skill synthesis depends on it.
- Add M19.2 agent skill synthesis as a proposal-only lane by default.
- Allow both personal and team modes to generate skill candidates.
- Require an audit record before any candidate becomes a stable `skills/**/SKILL.md`.
- Keep team-mode stable skill promotion behind human/Git review.
- Reuse PraxisBase provenance, privacy, review, and promotion boundaries instead of allowing AI to mutate stable skill files directly.
- Borrow only the necessary mechanisms from Hermes and OpenHuman, not their whole runtime models.

## Non-Goals

- Do not let an LLM directly write stable `skills/**` files during distill, daily, or curation.
- Do not default personal mode to automatic new-skill promotion.
- Do not promote personal preferences or private machine details into team skills.
- Do not copy OpenHuman GPL TokenJuice rules, OpenHuman product UI, or Hermes direct skill mutation behavior.
- Do not add a mandatory database, vector store, MCP server, or background daemon for M19.2.
- Do not make generated skill count a success metric. Fewer high-quality skills are better.

## Reference Findings

Hermes has the strongest implemented automatic skill loop. Its background review fork reviews the prior conversation and is restricted to memory and skill tools. Its skill prompt strongly prefers:

1. update a currently loaded skill;
2. update an existing umbrella skill;
3. add a support file under an umbrella;
4. create a new class-level umbrella skill only when nothing fits.

Hermes also explicitly rejects environment-dependent failures, negative tool claims, transient resolved errors, and one-off task narratives as skill material. Its curator later consolidates agent-created skills into umbrella skills and archives narrow siblings.

PraxisBase should borrow Hermes' rubric and ladder, but not its authority model. Hermes writes skills directly. PraxisBase must write proposals first.

OpenHuman's implemented strength is stable self-learning and context economy. It uses `LearningCandidate` records, cue families, evidence references, bounded buffers, stability scoring, class budgets, managed profile rendering, post-turn hooks, tool-scoped memory, 8 KiB skill injection, tool-result budgeting, and microcompaction. Its own roadmap still lists curated-memory-to-candidate-skill as a future gap.

PraxisBase should borrow OpenHuman's candidate/stability/budget model and skill injection budget idea, but not claim OpenHuman already solved auto skill synthesis.

## Source-Level Reference Mapping

Hermes references read:

| Hermes source | Mechanism | PraxisBase adoption | Boundary |
| --- | --- | --- | --- |
| `/Users/guanbear/workspace/praxisbase-reference-repos/hermes-agent/agent/background_review.py` | Forked background reviewer is restricted to memory and skill management tools; the skill prompt encodes update-before-create, support files, and anti-patterns. | M19.2 uses a dedicated skill proposer/reviewer prompt with the same ladder and anti-pattern classes. | PraxisBase writes candidates only; no direct stable skill mutation from the AI lane. |
| `/Users/guanbear/workspace/praxisbase-reference-repos/hermes-agent/tools/skill_manager_tool.py` | Skill filesystem shape, `SKILL.md` frontmatter validation, support directories, name validation, and profile-aware skill lookup. | PraxisBase validates `skills/**/SKILL.md`, allows only `references/`, `templates/`, and `scripts/` support files, and scans stable skill inventory before creation. | PraxisBase excludes `assets/` for generated support-file proposals in M19.2 to reduce unsafe payload surface. |
| `/Users/guanbear/workspace/praxisbase-reference-repos/hermes-agent/tools/skill_provenance.py` | Write-origin provenance distinguishes background-review skill writes from foreground user-directed writes. | PraxisBase records `created_by`, `reviewed_by`, `review_origin`, `proposal_id`, and source hashes in the audit record. | Stable writes require explicit review records instead of trusting background origin. |
| `/Users/guanbear/workspace/praxisbase-reference-repos/hermes-agent/tools/skill_usage.py` | Tracks agent-created skills, usage, pinned state, and lifecycle signals. | PraxisBase reads stable skills and optional usage metadata as inventory signals for update-vs-create. | Usage is a hint only; it cannot override provenance, scope, or audit requirements. |
| `/Users/guanbear/workspace/praxisbase-reference-repos/hermes-agent/agent/curator.py` | Periodic curator consolidates agent-created skills into umbrellas, archives stale skills, writes reports, and audits tool-call claims. | M19.2 adds `skill curate --dry-run` and report fields for overlap, stale candidates, and update suggestions. | No automatic archive/delete in M19.2; consolidation produces proposals or human-required actions. |

OpenHuman references read:

| OpenHuman source | Mechanism | PraxisBase adoption | Boundary |
| --- | --- | --- | --- |
| `/Users/guanbear/workspace/praxisbase-reference-repos/openhuman/docs/AGENT_SELF_LEARNING.md` | Candidate buffer, cue families, stability thresholds, conflict resolution, class budgets, and active/provisional states. | M19.2 clusters `SkillSignalCandidate` records before proposal synthesis and keeps low-signal singletons out of the primary queue. | PraxisBase does not copy OpenHuman's product profile cache; skill candidates remain proposal records. |
| `/Users/guanbear/workspace/praxisbase-reference-repos/openhuman/src/openhuman/learning/candidate.rs` and `stability_detector.rs` | Typed candidates and rebuild-time stability scoring. | PraxisBase implements a small file-first cluster scorer with source counts, confidence, cue families, and scope. | No database requirement in M19.2. |
| `/Users/guanbear/workspace/praxisbase-reference-repos/openhuman/src/openhuman/skills/inject.rs` | Matched skill bodies are injected under an 8 KiB budget with explicit match reasons and deterministic ordering. | PraxisBase exports stable skills with a bounded agent bundle and keeps unreviewed candidates out of agent prompts. | Candidate skill bodies are visible in site/CLI review, not injected automatically. |
| `/Users/guanbear/workspace/praxisbase-reference-repos/openhuman/src/openhuman/context/tool_result_budget.rs` and `microcompact.rs` | Tool-result budgeting and microcompaction reduce prompt waste while preserving recent useful state. | PraxisBase reviewer/proposer prompts use distilled summaries, source summaries, and provenance excerpts instead of raw logs. | Do not vendor TokenJuice or OpenHuman GPL code. |

## Authority Model

There are two different objects:

- `skill_candidate`: AI-generated, reviewable, non-authoritative.
- `stable skill`: promoted `skills/**/SKILL.md` with an audit trail and provenance.

Personal and team modes can both produce `skill_candidate` records. Neither mode should let AI write stable skill files without review.

Personal mode defaults:

- generate skill candidates automatically when evidence is strong enough;
- LLM-review every candidate;
- show candidates in the site and CLI review queue;
- require user approval before promotion to stable `skills/**`;
- allow future explicit policy to auto-promote only reviewed updates to already-approved personal skills, not brand-new skills.

Team mode defaults:

- generate team skill candidates when evidence is team-scoped and privacy-safe;
- LLM-review every candidate;
- require human/Git review before promotion;
- block personal/private evidence from team candidates unless explicitly re-scoped by policy;
- prefer GitLab/Git MR flow for stable team skill updates.

## M19.1: Wiki Semantic Gate Completion

M19.1 is a prerequisite for M19.2 because stable skill synthesis should depend on a wiki kernel that already distinguishes durable agent guidance from run reports and raw summaries.

Finish these gaps:

- daily reports include semantic review counts;
- personal auto-promotion of new wiki pages requires a passing semantic review;
- reviewer inputs stay context-economy compatible by using distilled summaries, source summaries, candidate bodies, and provenance excerpts, not raw transcripts;
- AgentMemory sidecar hits remain non-authoritative unless ingested into PraxisBase provenance;
- generated site shows semantic review decisions and reasons;
- bad-example regressions cover task-runner fragments, one-off smoke reports, merge-worthy replay fragments, and raw-ish summaries.

The acceptance bar is: personal daily cannot promote a new wiki page unless the deterministic promotion gate and LLM semantic review both pass.

## M19.2: Agent Skill Synthesis Lane

### Pipeline

```text
distilled experiences
  -> skill signal extraction
  -> deterministic signal gate
  -> stability clustering
  -> existing skill/umbrella lookup
  -> LLM skill proposer
  -> deterministic skill shape gate
  -> LLM skill semantic reviewer
  -> skill_candidate proposal queue
  -> audit review/promote
  -> stable skills/
```

The lane consumes:

- `DistilledExperience.skill_candidate`;
- promoted wiki pages with procedural patterns;
- repeated successful known fixes, procedures, pitfalls, or preferences;
- existing stable skills for update/merge decisions.

The lane does not consume raw transcripts directly. Raw material must already have passed distill and provenance capture.

### Skill Signal Gate

A signal can enter skill synthesis only when it has:

- successful or partially successful outcome with a reusable pattern;
- concrete trigger, procedure, and verification or reusable lesson;
- provenance refs and hashes;
- scope compatible with the target authority mode;
- no private/team-boundary violation;
- no raw transcript or raw log copy.

Reject or route to human:

- one-off task narratives;
- exact PR/run/error-string micro-skills;
- environment setup failures unless the reusable fix pattern is the lesson;
- negative claims such as "tool X is broken";
- transient errors that resolved without a reusable retry/fallback pattern;
- unsupported general advice;
- raw transcript copies;
- source material with secrets, private paths, or personal identity leakage.

### Stability And Clustering

Use a small independent PraxisBase implementation inspired by OpenHuman's candidate scoring:

- `SkillSignalCandidate` stores class, key, value, cue family, confidence, evidence refs, scope, and observed time.
- cue families: `explicit_user_correction`, `verified_fix`, `repeated_success`, `workflow_preference`, `tool_pattern`, `wiki_procedure`.
- repeated evidence increases stability; stale singletons decay or stay below proposal threshold.
- class budgets prevent one noisy domain from generating many skills.

The first implementation can be file-first JSON reports and proposals, not a database.

### Existing Skill Inventory And Matching

Before the proposer may create a new skill, PraxisBase must load stable skill inventory from `skills/**/SKILL.md` and any configured exported agent skill bundles. The inventory item includes:

- path;
- slug and parent directory;
- frontmatter `name`, `description`, `scope`, and status when present;
- first-level headings;
- `## When To Use`, `## Procedure`, `## Pitfalls`, and `## Provenance` excerpts;
- related wiki links;
- optional usage metadata if PraxisBase has captured it.

Matching uses deterministic scoring before the LLM proposer:

- strong match: same normalized domain and overlapping trigger/procedure entities;
- medium match: description or `When To Use` covers the signal class but procedure differs;
- weak match: same tool/product name only;
- no match: no shared domain, trigger, or procedure.

The proposer receives strong and medium matches as candidate update targets. Weak matches are context only. If more than one strong match exists, the proposer must return `merge_or_update_existing` or `needs_human`; it must not create a sibling skill to avoid the conflict.

### Hermes-Style Decision Ladder

The proposer must choose the earliest fitting action:

1. `skill_update_loaded`: update a stable skill known to have been used or referenced.
2. `skill_update_existing`: update an existing class-level umbrella skill.
3. `skill_support_file`: add `references/`, `templates/`, or `scripts/` under an existing skill.
4. `skill_create`: create a new class-level umbrella skill.

Creating a new skill is the last option. A candidate name must be class-level, not a PR number, run id, error string, feature codename, or "fix-X-today" artifact.

### Skill Proposal Shape

Every generated skill candidate must produce a `knowledge_proposal` or `skill_candidate`-compatible object with:

- target path under `skills/<domain>/<slug>/SKILL.md`;
- target action: create, patch, or support-file write;
- title and class-level slug;
- summary of why the candidate exists;
- source refs, source hashes, and evidence ids;
- audit metadata.

`SKILL.md` body must include:

- YAML frontmatter with `name`, `description`, `scope`, `status: draft`, `source_count`, and provenance summary;
- `## When To Use`;
- `## Procedure`;
- `## Verification`;
- `## Pitfalls`;
- `## Do Not Use When`;
- `## Related Wiki Pages`;
- `## Provenance`.

Support files must be limited to:

- `references/<topic>.md` for condensed evidence detail;
- `templates/<name>.<ext>` for starter files;
- `scripts/<name>.<ext>` for deterministic helper scripts.

Support file proposals must include a pointer update in `SKILL.md` so future agents can discover the file.

### Skill Semantic Review

Skill review is separate from wiki review. It asks:

- Is this a durable class-level skill?
- Should this update an existing skill instead?
- Is the trigger concrete without being one-off?
- Is the procedure actionable and verified?
- Is the body synthesized rather than copied?
- Does the skill create unsafe future behavior?
- Does the proposed scope match the evidence?

Reviewer decisions:

- `approve_candidate`;
- `revise`;
- `merge_or_update_existing`;
- `reject`;
- `needs_human`.

Promotion eligibility requires:

- quality score at least `0.86`;
- `class_level=true`;
- `actionable=true`;
- `reusable=true`;
- `evidence_support` is `strong` or `partial` with human review;
- no fatal issues;
- no privacy/scope violations.

Even when the reviewer approves, stable promotion still goes through the audit lane.

## Audit Record Contract

Stable skill promotion requires a review record separate from the candidate. The first implementation writes review records under `.praxisbase/inbox/reviews/` or the existing review path used by `promoteApprovedProposal()`.

Minimum review record fields:

```ts
export const SkillPromotionAuditSchema = z.object({
  id: z.string().min(1),
  protocol_version: z.literal(PROTOCOL_VERSION),
  type: z.literal("skill_promotion_audit"),
  proposal_id: z.string().min(1),
  candidate_id: z.string().min(1),
  target_path: z.string().regex(/^skills\/[^/]+\/[^/]+\/(SKILL\.md|references\/[^/]+\.md|templates\/[^/]+\.[A-Za-z0-9._-]+|scripts\/[^/]+\.[A-Za-z0-9._-]+)$/),
  scope: ScopeSchema,
  decision: z.enum(["approved", "rejected", "needs_changes"]),
  reviewer: z.object({
    kind: z.enum(["user", "team_git", "automation"]),
    id: z.string().min(1)
  }),
  semantic_review_id: z.string().min(1),
  source_hashes: z.array(z.string().min(1)).min(1),
  git: z.object({
    remote: z.string().optional(),
    branch: z.string().optional(),
    merge_request: z.string().optional(),
    commit: z.string().optional()
  }).optional(),
  created_at: z.string().datetime()
});
```

Promotion guard rules:

- `decision` must be `approved`;
- `proposal_id` and `candidate_id` must match the candidate being promoted;
- `target_path` must match the candidate target;
- `source_hashes` must cover the candidate source hashes;
- personal promotion accepts `reviewer.kind=user`;
- team promotion requires `reviewer.kind=team_git` and Git/MR metadata or an explicitly configured team review policy;
- `reviewer.kind=automation` can mark a candidate reviewed but cannot promote a brand-new stable skill by default.

## CLI And UX

Add commands that make the lane visible:

```bash
praxisbase skill synthesize --mode personal --review --json
praxisbase skill review --json
praxisbase skill promote --proposal <id> --json
praxisbase skill curate --dry-run --json
praxisbase skill export --agent codex --json
```

Daily can run skill synthesis after wiki curation:

```text
daily source/ai/wiki stages
  -> review-promote wiki
  -> skill synthesize candidates
  -> site-build
```

The generated site should show:

- skill candidates;
- reviewer decision, score, and reason;
- proposed action: create, update, support file, or reject;
- source count and provenance;
- whether the candidate is personal-only or team-review-required;
- exact next command.

The site must not present raw skill signals as primary work. The primary queue is the small set of reviewed skill candidates.

## Data Model

Add a candidate model:

```ts
export const SkillSynthesisCandidateSchema = z.object({
  id: z.string(),
  type: z.literal("skill_synthesis_candidate"),
  protocol_version: z.literal(PROTOCOL_VERSION),
  action: z.enum(["skill_create", "skill_update", "skill_support_file"]),
  scope: ScopeSchema,
  target_path: z.string(),
  target_skill: z.string(),
  title: z.string(),
  summary: z.string(),
  body_markdown: z.string(),
  source_refs: z.array(z.string()).min(1),
  source_hashes: z.array(z.string()).min(1),
  evidence_ids: z.array(z.string()).min(1),
  source_count: z.number().int().min(1),
  confidence: z.number().min(0).max(1),
  ladder_choice: z.enum([
    "skill_update_loaded",
    "skill_update_existing",
    "skill_support_file",
    "skill_create"
  ]),
  existing_skill_path: z.string().nullable(),
  related_wiki_paths: z.array(z.string()).default([]),
  review_hint: z.object({
    suggested_decision: z.enum(["approve", "edit", "reject", "merge"]),
    risk_notes: z.array(z.string()).default([])
  }),
  created_at: z.string().datetime()
});
```

Add a semantic review model:

```ts
export const SemanticSkillReviewSchema = z.object({
  type: z.literal("semantic_skill_review"),
  candidate_id: z.string(),
  target_path: z.string(),
  decision: z.enum([
    "approve_candidate",
    "revise",
    "merge_or_update_existing",
    "reject",
    "needs_human"
  ]),
  quality_score: z.number().min(0).max(1),
  class_level: z.boolean(),
  actionable: z.boolean(),
  reusable: z.boolean(),
  safe_for_future_agents: z.boolean(),
  evidence_support: z.enum(["none", "weak", "partial", "strong"]),
  should_update_existing: z.string().nullable(),
  fatal_issues: z.array(z.string()),
  missing_requirements: z.array(z.string()),
  reason: z.string(),
  reviewed_at: z.string().datetime()
});
```

Reports:

```json
{
  "skill_synthesis": {
    "enabled": true,
    "signals": 12,
    "rejected_signals": 8,
    "clusters": 4,
    "candidates": 2,
    "reviewed": 2,
    "approved": 1,
    "rejected": 1,
    "needs_human": 0,
    "promoted": 0
  }
}
```

## Privacy And Scope

Personal evidence can produce personal skill candidates. Team skill candidates require team-safe evidence.

Team mode must block:

- personal-only source scope;
- user identity/preferences not explicitly shared with team;
- local file paths or machine-specific setup unless normalized into a team-safe procedure;
- raw chat/log content;
- secrets and credentials;
- private AgentMemory sidecar hits not ingested into PraxisBase provenance.

Personal mode is more permissive for candidate generation, but stable skill promotion still needs an audit record.

## Agent Consumption

Stable skills are consumed by agents through the existing PraxisBase generated agent skill and future export commands. The first implementation should not require MCP.

Recommended order:

1. `skill + CLI` first: works for Codex, OpenClaw, OpenCode, Claude Code, Hermes, and OpenHuman without a server.
2. MCP later as a convenience bridge for agents that prefer tool calls.
3. ACP only if a specific agent runtime needs it.

M19.2 should export stable PraxisBase skills as agent-readable bundles, but should not inject unreviewed candidates into agent prompts.

## Observability

Reports must distinguish:

- raw signals;
- rejected or low-stability signals;
- clusters;
- candidates;
- LLM-reviewed candidates;
- rejected candidates;
- human-required candidates;
- promoted stable skills.

`human_required` must be small and actionable. It should not count raw low-signal material as review work.

## Quality Examples

Good candidate: update existing skill

```markdown
target_path: skills/openclaw/openclaw-memory-operations/SKILL.md
action: skill_update
reason: Two verified personal runs show that remote OpenClaw memory import should verify raw export hash before sync.
When To Use: When importing remote OpenClaw memory into PraxisBase or AgentMemory.
Procedure: Export memory, verify hash, ingest as provenance-backed evidence, run daily synthesis, then export stable knowledge.
Verification: `praxisbase daily run --mode personal --build-site --json` writes a skill report and no stable skill changes before promotion.
```

Good candidate: support file

```markdown
target_path: skills/codex/praxisbase-daily-operations/references/openclaw-remote-import.md
action: skill_support_file
reason: Repeated evidence contains detailed provider-specific commands that are useful but too long for SKILL.md.
```

Bad candidate: one-off run report

```markdown
title: M19 smoke 2026-05-26 run-abc123
reject: The topic is a single run artifact. It belongs in provenance or a report, not a stable skill.
```

Bad candidate: environment failure

```markdown
title: opencode command not found
reject: Missing local binary is not durable guidance. Capture the setup fix only if repeated evidence proves a reusable setup procedure.
```

Bad candidate: negative tool claim

```markdown
title: browser tool is broken
reject: Negative tool claims become stale refusals. If retry or fallback is verified, encode the retry/fallback pattern instead.
```

Bad candidate: raw transcript copy

```markdown
body: "User: ... Assistant: ..."
reject: Skill bodies must synthesize procedure and verification, not copy chat logs.
```

## Real Smoke Acceptance

The real personal smoke uses local OpenClaw, local Codex variants, and one remote OpenClaw export when available. It passes only if:

- source collection writes provenance-backed raw artifacts and distilled experiences;
- semantic wiki review blocks low-value wiki pages from personal auto-promotion;
- skill synthesis reports raw signal count, cluster count, reviewed candidate count, and rejected count separately;
- the primary site queue shows reviewed skill candidates, not raw signals;
- reviewed skill candidates are few enough to inspect manually;
- every candidate has source refs, source hashes, related wiki paths when available, and a reviewer reason;
- no raw transcript, secret, private path, or personal-only item appears in team-scope output;
- stable `skills/**` remains unchanged until `skill promote` receives a valid audit record;
- at least one candidate, if produced, describes a reusable future-agent procedure rather than a session summary.

## Traceability Matrix

| Goal | Design section | Implementation tasks | BDD/OpenSpec coverage |
| --- | --- | --- | --- |
| Wiki kernel is semantically stable before skills depend on it | M19.1: Wiki Semantic Gate Completion | Tasks 1-3 | M19.1 tasks and semantic review site scenarios |
| Skill candidates are generated from durable experience, not raw logs | Pipeline, Skill Signal Gate, Stability And Clustering | Tasks 4-6 and 10 | Governed Skill Candidates, Real Skill Smoke Quality |
| Existing umbrella skills are preferred over new siblings | Existing Skill Inventory And Matching, Hermes-Style Decision Ladder | Tasks 7-8 | Skill Decision Ladder, ambiguous umbrella BDD scenario |
| Skill review is stricter than wiki review | Skill Semantic Review | Task 9 | Skill Semantic Review scenarios |
| Stable skills require audit | Audit Record Contract | Task 13 | Stable Skill Audit scenarios |
| Team mode blocks personal material and requires Git/human review | Authority Model, Privacy And Scope, Audit Record Contract | Tasks 11-13 | Team Skill Review Boundary |
| Site shows useful work, not raw noise | CLI And UX, Observability, Real Smoke Acceptance | Tasks 12 and 14 | Skill Candidate Site Visibility |
| Reference implementations are borrowed deliberately | Source-Level Reference Mapping | Tasks 7-9 and 13-14 | OpenSpec source-level borrowing section |

## Acceptance

- Both personal and team daily runs can generate skill candidates.
- No stable skill is written without an audit record.
- Team stable skill promotion requires human/Git review.
- New skill creation is last in the Hermes-style ladder.
- One-off run reports, environment failures, exact run ids, and negative tool claims are rejected or routed to human.
- Generated skill candidates are class-level, synthesized, provenance-backed, and linked to related wiki pages.
- The site shows skill candidates and next actions.
- Existing stable wiki authority remains higher than raw skill signals and AgentMemory sidecar hits.
