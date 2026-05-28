# GBrain-First Experience Governance Implementation Plan

## Scope

Implement the GBrain-first product path without rewriting PB's existing ingestion, curation, or GBrain adapter. This plan changes defaults, guidance, diagnostics, privacy flow visibility, and quality-yield behavior.

## Phase 1: Agent Guidance And Bootstrap

- Update generated PB skill to say:
  - use GBrain MCP for broad brain lookup;
  - use PB CLI for governed experience capture, privacy, review, promote, and publish;
  - PB `context get --with-gbrain` is a compatibility/debug path.
- Add GBrain setup commands to first-run output:
  - local stdio MCP: `gbrain serve`;
  - generic MCP config: `{"command":"gbrain","args":["serve"]}`;
  - remote MCP: `gbrain serve --http` plus bearer/OAuth guidance.
- Extend `personal doctor` with GBrain config/readiness:
  - not configured;
  - configured but unavailable;
  - configured and publish-ready;
  - remote MCP configured.
- Tests:
  - generated skill includes GBrain MCP default wording;
  - personal init output includes GBrain-first commands;
  - doctor reports GBrain warning without failing PB.

## Phase 2: Privacy Triage UX

- Keep existing privacy command semantics.
- Improve daily/site next actions:
  - show `privacy_required` separately from review/quality counts;
  - show exact `praxisbase privacy triage --mode personal --auto-release --progress --json`;
  - include short redacted item summaries on the review page.
- Tune personal auto-release:
  - allow local personal Codex/OpenClaw evidence when AI/deterministic triage is safe;
  - continue blocking credentials, paths with team/customer hints, tokens, cookies, third-party private content, and ambiguous remote material.
  - allow explicitly trusted personal remote OpenClaw sources to skip only the remote-source blocker when source matching, AI safety, and deterministic checks all pass.
- Tests:
  - personal safe local evidence auto-releases;
  - trusted personal remote OpenClaw evidence auto-releases only when safe;
  - team mode stays review-only;
  - HTML distinguishes privacy from review and quality blocks.

## Phase 3: Quality Yield

- Preserve current hard promotion gates.
- Add merge materialization:
  - when semantic review returns `merge` with a target, write an update/merge candidate instead of dropping the useful content;
  - keep human review for ambiguous merge targets.
- Add skill completeness retry:
  - detect truncated/incomplete procedure steps;
  - run one rewrite pass or mark `revise` with a precise reason;
  - never promote incomplete skills.
- Add evidence-to-draft mode:
  - rejected single-run reports can be retained as evidence summaries or source notes;
  - they should not become stable pages.
- Tests:
  - single-source run report does not promote;
  - semantic merge creates a merge/update proposal;
  - incomplete skill step is revised or blocked with `missing_requirements`.

## Phase 4: GBrain Publish As Default Sink

- Make personal `next_actions` prefer GBrain export over AgentMemory export when GBrain is configured.
- Keep `--publish-gbrain` explicit for mutating daily writes unless user config later opts in.
- Ensure export payload uses stable PB metadata and excludes pending/rejected/human-required content.
- Tests:
  - no raw evidence in GBrain export payload;
  - personal stable page publishes to local GBrain source;
  - team export requires `--allow-team-gbrain-export`.

## Phase 5: Real Smoke

Run a bounded real smoke:

```bash
praxisbase privacy triage --mode personal --auto-release --progress --json
praxisbase daily run --mode personal --limit 20 --max-ai-chunks 2 --max-curation-proposals 1 --max-skill-candidates 1 --semantic-review --skill-synthesis --build-site --progress --json
praxisbase gbrain export --mode personal --write --json
```

Verify:

- `invalid_response` does not recur;
- privacy count drops or explains why not;
- rejected candidates have actionable reasons;
- any stable changes are published to GBrain only after promotion;
- `dist/index.html` and `dist/review.html` show GBrain-first next actions.

## Non-Goals

- Do not build a general PB vector database.
- Do not replace GBrain MCP.
- Do not import GBrain core modules directly.
- Do not loosen stable promotion thresholds to increase output volume.
- Do not export personal/private raw material to team GBrain.
