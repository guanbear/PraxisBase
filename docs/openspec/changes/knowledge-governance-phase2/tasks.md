# Knowledge Governance Phase 2 Tasks

## P2-A: Lint And Deterministic Duplicate Detection

- [x] Implement `praxisbase lint --json`.
- [x] Add lint report schema and tests.
- [x] Detect missing/invalid frontmatter.
- [x] Detect missing required governance metadata.
- [x] Detect raw log-like content under `kb/`.
- [x] Detect duplicate ids, duplicate source hashes, and duplicate signatures.
- [x] Detect deterministic contradictions between recommended and forbidden actions for the same signature.
- [x] Emit errors vs warnings according to the design table.
- [x] Write lint run records and reports.

## P2-B: Reference Tracking And Maturity Proposals

- [ ] Aggregate `knowledge_references` from repair and incident episodes.
- [ ] Compute cumulative and windowed reference counts.
- [ ] Apply `draft -> verified` proposal rule.
- [ ] Apply `verified -> proven` proposal rule.
- [ ] Block maturity proposals when newer negative references exist.
- [ ] Write maturity proposals to `.praxisbase/inbox/proposals`.
- [ ] Write reference reports to `.praxisbase/reports/references`.

## P2-C: Decay And Stale Proposals

- [ ] Implement stale threshold evaluation for draft, verified, and proven objects.
- [ ] Generate proposal-based decay or stale flag changes.
- [ ] Emit warning exception for negative references against proven knowledge.
- [ ] Ensure decay does not directly edit `kb/` or `skills/`.
- [ ] Write decay reports to `.praxisbase/reports/decay`.

## P2-D: Cold-Start Import

- [ ] Add import manifest schema.
- [ ] Support Markdown directory input.
- [ ] Support Feishu export input.
- [ ] Support JSONL episode/proposal input.
- [ ] Support Git repository documentation path input.
- [ ] Support existing wiki dump input.
- [ ] Generate proposals or draft episodes only.
- [ ] Generate deterministic source hashes and redacted summaries.
- [ ] Reject raw log commits.

## P2-E: Stage-Aware Compact Retrieval And Query Budget

- [ ] Add stage-aware context options for diagnosis, repair, verification, and proposal.
- [ ] Enforce default serialized-size budgets.
- [ ] Rank objects by signature, maturity, risk, recency, reference count, and scope.
- [ ] Drop lower-ranked full objects first when over budget.
- [ ] Preserve citations for dropped objects.
- [ ] Add BDD-backed tests for budget and ranking behavior.

## Required Verification

```bash
pnpm check
```

Additional smoke flow:

```bash
tmpdir=$(mktemp -d)
pnpm exec praxisbase init --profile all
pnpm exec praxisbase lint --json
pnpm exec praxisbase build
```

## Out Of Scope

- Vector database or embedding similarity.
- Online AI-required linting.
- Direct stable knowledge mutation from governance commands.
- Raw log import into Git.
- Full remote approval UI.
