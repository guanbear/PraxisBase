# Human Required AI Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-assisted triage for human-required privacy exceptions, with personal-mode safe auto-release and team-mode review-only decisions.

**Architecture:** Add a focused `experience/privacy-triage.ts` module that reads exception records, builds redacted AI prompts, applies deterministic release gates, writes reports, and updates exception metadata. Add CLI plumbing through a new `privacy triage` command and surface triage metadata on the existing review page.

**Tech Stack:** TypeScript, Zod schemas, Node test runner, existing AI provider config/client, existing file-store helpers, static HTML renderer.

---

### Task 1: Protocol And Core Triage

**Files:**
- Modify: `packages/core/src/protocol/paths.ts`
- Modify: `packages/core/src/protocol/schemas.ts`
- Create: `packages/core/src/experience/privacy-triage.ts`
- Modify: `packages/core/src/index.ts`
- Test: `tests/core/privacy-triage.test.ts`

- [ ] Add failing schema/path tests for `.praxisbase/reports/privacy-triage` and `PrivacyTriageReportSchema`.
- [ ] Add failing core test: AI classifies a personal exception as `safe_personal_experience`, `autoRelease` is enabled, confidence is `0.9`, and the item decision becomes `auto_released`.
- [ ] Add failing core test: AI says safe but deterministic hard-block detects concrete private value, so the item remains `keep_human_required`.
- [ ] Add failing core test: team mode writes `team_review_only` and never auto-releases.
- [ ] Implement `runPrivacyTriage(root, input)` with AI config loading, redacted prompt construction, strict AI output validation, release gate, report writing, and exception metadata update.
- [ ] Export the new module from `packages/core/src/index.ts`.
- [ ] Run focused tests.

### Task 2: CLI

**Files:**
- Create: `packages/cli/src/commands/privacy.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/cli/privacy-command.test.ts`

- [ ] Add failing CLI test for `privacy triage --mode personal --auto-release --json`.
- [ ] Add `privacyCommand(root, subcommand, options)` and call `runPrivacyTriage`.
- [ ] Register `praxisbase privacy triage` with `--mode`, `--auto-release`, `--limit`, `--ai-timeout-ms`, and `--json`.
- [ ] Ensure JSON errors follow existing CLI error shape.
- [ ] Run focused CLI tests.

### Task 3: Review Page

**Files:**
- Modify: `packages/core/src/wiki/render-site.ts`
- Test: `tests/core/wiki-render-site.test.ts`

- [ ] Add failing site test that writes a human-required exception with `details.triage` and asserts review HTML includes classification, decision, and rationale.
- [ ] Extend human-required queue collection to read triage metadata.
- [ ] Render triage metadata in `review.html#human-required`.
- [ ] Run focused render-site tests.

### Task 4: Verification And Real Queue

**Files:**
- No source edits expected after this task.

- [ ] Run `pnpm check`.
- [ ] Run real personal triage:

```bash
node packages/cli/dist/index.js privacy triage --mode personal --auto-release --limit 100 --json
```

- [ ] Rebuild the site:

```bash
node packages/cli/dist/index.js wiki build-site --json
```

- [ ] Commit and push code/docs only. Do not commit generated `kb/`, `.praxisbase`, or `dist` artifacts unless explicitly requested.
