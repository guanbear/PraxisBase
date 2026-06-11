# Personal Review Auto-Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Keep generated runtime artifacts out of commits unless explicitly requested.

**Goal:** Make personal mode a clear daily loop: run, triage privacy, inspect queues, export stable wiki to AgentMemory, then validate with larger real data.

**Architecture:** Extend existing `daily`, `privacy`, `personal`, `agentmemory`, and site-rendering flows. Do not create a second pipeline. Daily remains the source of ingestion truth, privacy triage remains the release gate for blocked evidence, stable `kb/**` remains durable authority, and AgentMemory remains the session-memory sink/sidecar.

**Verification principle:** Small real run first, then medium. Full daily only after queue quality and export behavior are clean.

---

## Task 1: Personal Next-Action Summary

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/cli/src/commands/personal.ts`
- Modify: `packages/cli/src/commands/daily.ts`
- Test: `tests/core/experience-daily.test.ts`
- Test: `tests/cli/personal-command.test.ts`
- Test: `tests/cli/daily-command.test.ts`

- [ ] Add failing tests for a daily report summary that includes `privacy_required`, `review_required`, rejected counts, stable wiki change status, and recommended next actions.
- [ ] Add a small report helper that derives next actions from existing daily report fields.
- [ ] Surface next actions in `personal run --json` and non-JSON output.
- [ ] Keep raw paths out of normal output except for the site path and report id.
- [ ] Run focused daily and personal CLI tests.

## Task 2: Privacy Triage Flow Integration

**Files:**
- Modify: `packages/core/src/experience/privacy-triage.ts`
- Modify: `packages/cli/src/commands/privacy.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/core/privacy-triage.test.ts`
- Test: `tests/cli/privacy-command.test.ts`

- [ ] Add failing tests that triage output reports counts by `auto_released`, `keep_human_required`, and `team_review_only`.
- [ ] Add or confirm CLI support for `--limit`, `--ai-timeout-ms`, `--auto-release`, and JSON output.
- [ ] Ensure auto-release metadata is idempotent and auditable.
- [ ] Ensure concrete private values remain hard-blocked even if AI says safe.
- [ ] Run focused privacy tests.

## Task 3: Review Site Queue UX

**Files:**
- Modify: `packages/core/src/wiki/render-site.ts`
- Modify as needed: `packages/core/src/wiki/site-html.ts`
- Test: `tests/core/wiki-render-site.test.ts`

- [ ] Add failing render-site tests for separate sections: Privacy required, Review required, Rejected, Promoted.
- [ ] Show triage classification, confidence, decision, and rationale when available.
- [ ] Show recommended command text for each queue class.
- [ ] Ensure homepage headline no longer implies every `human_required` item requires manual clicking.
- [ ] Run focused render-site tests.

## Task 4: AgentMemory Export As A First-Class Step

**Files:**
- Modify: `packages/cli/src/commands/agentmemory.ts`
- Modify: `packages/core/src/experience/agentmemory-export.ts`
- Modify: `packages/core/src/agent-access/skill.ts`
- Test: `tests/cli/agentmemory-command.test.ts`
- Test: `tests/core/agentmemory-export.test.ts`
- Test: `tests/core/agent-access.test.ts`

- [ ] Add tests that export skips review candidates, human-required exceptions, rejected material, raw vault refs, and runtime reports.
- [ ] Add a concise non-JSON export summary: pages, payloads, exported, skipped, warnings.
- [ ] Update generated agent Skill to describe stable wiki as authority and AgentMemory export as optional sharing.
- [ ] Run focused AgentMemory tests.

## Task 5: Real Validation Ladder

**Files:**
- Modify if needed: `docs/ai-first-daily-usage.md`
- Test or script as needed: `tests/cli/real-smoke.test.ts`

- [ ] Run `pnpm check`.
- [ ] Run `node packages/cli/dist/index.js personal doctor --json`.
- [ ] Run small daily:

```bash
node packages/cli/dist/index.js daily run \
  --mode personal \
  --limit 50 \
  --max-ai-chunks 20 \
  --max-curation-proposals 8 \
  --build-site \
  --progress \
  --ai-concurrency 4 \
  --json
```

- [ ] Run privacy triage:

```bash
node packages/cli/dist/index.js privacy triage \
  --mode personal \
  --auto-release \
  --limit 100 \
  --json
```

- [ ] Re-run small daily and confirm no one-off run report enters stable `kb/**`.
- [ ] Export stable wiki to AgentMemory:

```bash
node packages/cli/dist/index.js agentmemory export \
  --mode personal \
  --write \
  --json
```

- [ ] Run medium daily with `--limit 200`.
- [ ] Inspect generated/changed `kb/**` pages before committing any stable knowledge.
- [ ] Commit source/docs/tests only unless generated KB pages are explicitly inspected and accepted.
