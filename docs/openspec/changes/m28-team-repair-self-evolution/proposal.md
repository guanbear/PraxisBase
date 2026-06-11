# Proposal: M28 Team Repair Self-Evolution

## Why

The team version is the project's original promise (OpenClaw repair loop + shared team experience), but it has zero real validation. The personal version (M27) proved the object model, bundle, and skill synthesis. M28 moves that proven loop onto the team GitLab authority so multiple OpenClaw repair agents (Claude Code) can accumulate, review, promote, and re-use repair experience — and self-evolve skills.

This is the team-version main line (anchor line B). It must come before container/K8s (line A, M29) because B reuses already-validated machinery.

M28 also lands the first batch of governance substrate G (reference tracking, maturity promotion, decay, query budget, three-tier index), without which a team knowledge base bloats and misleads agents.

Prerequisite: M27 personal GA is fully green.

## Change

- Make `repair-context openclaw` read real `kb/` + `skills/` by signature with a query budget, instead of hardcoded contexts.
- Wire team `episode submit` / `propose` through outbox with idempotency and restricted write channels.
- Add team risk-tiered `review --auto` / `promote --auto`; high risk goes to `exceptions/human-required` via GitLab MR.
- Add skill self-evolution: `skill synthesize --mode team --review`, cross-agent dedupe/merge, mandatory human/Git review before promotion, then auto-load via repair-context.
- Land governance G batch 1: reference tracking, automatic maturity promotion, automatic decay, query budget, three-tier progressive index.
- Add `praxisbase team release-audit --json` with gates `team_repair_loop_ga`, `skill_self_evolution_ga`, `governance_ga`, `privacy_boundary_ga`, `team_ga`.
- Team GitLab scheduled pipeline (review/promote/build) with `resource_group: praxisbase-write`.

## Scope

In scope: repair loop on team authority, skill self-evolution, governance batch 1, team release audit, privacy boundary, team-git pipeline.

Out of scope:
- Container/K8s incident (M29).
- Multi-repo federation, external vector/search backends.
- Auto-promotion of team skills (must be human/Git reviewed).
- Production changes beyond sandbox permissions.
- Central master agent.

## Success Criteria

`praxisbase team release-audit --json` reports:
```text
team_repair_loop_ga: pass
skill_self_evolution_ga: pass
governance_ga: pass
privacy_boundary_ga: pass
team_ga: pass
```

Required real checks:
```bash
praxisbase repair-context openclaw --logs <fixture> --json
praxisbase episode submit episode.json --json
praxisbase propose proposal.json --json
praxisbase review --auto --json
praxisbase promote --auto --json
praxisbase skill synthesize --mode team --review --json
praxisbase build --json
praxisbase team release-audit --json
```

Must prove: a full repair→episode→propose→review→promote loop on team authority; >=1 team skill promoted via human review and loaded by repair-context; reference tracking + maturity promotion + decay + query budget actually take effect; personal scope and credentials never enter team stable knowledge.

## Rollout

1. Freeze spec delta + BDD fixtures.
2. repair-context real knowledge + budget.
3. episode/proposal outbox channel.
4. team risk-tiered review/promote + conflict.
5. governance batch 1.
6. skill team self-evolution.
7. team release-audit + privacy boundary.
8. Real validation + `docs/status/` record.

Do not add new product surfaces while M28 gates are failing.
