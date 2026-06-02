# M28 Team Repair Self-Evolution — OpenSpec Design

Full rationale: `docs/superpowers/specs/2026-06-03-m28-team-repair-self-evolution-design.md`. This file records implementation-facing decisions.

## Decisions

### D1. repair-context reads real knowledge with a budget

`buildOpenClawRepairContext` resolves the signature, then loads matching objects from `kb/known-fixes|procedures|pitfalls` and `skills/openclaw`. Injection is bounded by a byte budget from `policies/`. Ordering: maturity (proven > verified > draft), then `reference_count` desc. Over-budget content is truncated with a `truncated` marker. Missing/invalid bundle falls back to last-known-good cache.

### D2. Team write channel

Sandbox repair agents have no broad Git write. They write `.praxisbase/outbox/{episodes,proposals}` or use a restricted bot token / submission gateway. A sync step ingests outbox into inbox. Idempotency key dedupes retries.

### D3. Team risk tiers

Reuse `review/risk.ts` + `review/policy.ts`. Low/medium auto-merge after independent reviewer approve + confidence threshold + `check` pass + provenance present + (for skill/procedure) verification+rollback present. High risk → `exceptions/human-required` via GitLab MR. Two approved proposals patching one object: later patch fails, returns to review queue as `conflict`.

### D4. Governance batch 1

- Reference tracking: at promote/build, read each episode's `knowledge_references`, increment `reference_count` and set `last_referenced_at` on referenced objects.
- Maturity promotion: draft→verified after >=N distinct environment/run validations; verified→proven after >=2 distinct environments. Thresholds in `policies/`.
- Decay: proven idle 12mo→verified; verified idle 6mo→draft; draft idle + lint flag→archive (removed from active index, content retained). A later reference restores maturity.
- Query budget: enforced in repair-context and `context get`.
- Three-tier index: build produces Layer A catalog (~50 lines), Layer B per-category lists (one line per object), Layer C full objects.

### D5. Team skill governance

`skill synthesize --mode team --review` writes candidates only. Cross-agent dedupe prefers patching an existing umbrella skill (Skill Decision Ladder). Team skills require human/Git review before promotion. One automatic structural repair before human-required.

### D6. Privacy boundary

Personal-scope objects and personal-only lessons are excluded from team stable knowledge. Credentials, private hosts/accounts, private chat are hard-blocked before proposal generation; uncertain items route to `exceptions/human-required`.

## Affected Modules

- `repair/context.ts`, `repair/signature.ts`, `wiki/retrieval.ts`, `wiki/catalog.ts`
- `store/file-store.ts`, `experience/git-workflow.ts`
- `review/{policy,risk,reviewer}.ts`, `promote/promote.ts`
- `wiki/lifecycle.ts`, `kb/maintenance.ts`, `lint/index.ts` + new reference-tracker
- `synthesis/skill-*.ts`
- new `experience/team-release-audit.ts`
- `policies/` (thresholds, budget)
- CLI: `repair-context.ts`, `episode.ts`, `propose.ts`, `review.ts`, `promote.ts`, `skill.ts`, `build.ts`, new team audit command

## Test Matrix

repair-context real+budget; outbox idempotency; risk routing+conflict; reference write; promotion thresholds; decay+restore; three-tier index; team skill no auto-promote + dedupe; team audit gates; privacy isolation.
