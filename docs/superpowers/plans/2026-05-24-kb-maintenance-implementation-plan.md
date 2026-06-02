# KB Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe local `kb audit`, `kb prune`, and `kb rebuild` commands for cleaning historical bad stable wiki pages.

**Architecture:** Core owns scanning/deletion and reuses `promotionTimeGuard` as the single quality oracle. CLI owns argument parsing and delegates rebuild to the existing daily flow so raw evidence still goes through synthesis, review, and promotion gates.

**Tech Stack:** TypeScript, Node test runner, existing `@praxisbase/core` and `@praxisbase/cli` packages.

---

### Task 1: Core Audit And Prune

**Files:**
- Create: `packages/core/src/kb/maintenance.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Test: `tests/core/kb-maintenance.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests that write one valid page, one invalid page, one `skills/**` invalid file, and one non-markdown file. Assert audit flags only the invalid `kb/**/*.md`; dry-run prune does not delete; confirmed prune deletes only the invalid `kb/**/*.md`.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/kb-maintenance.test.js`

Expected: compile or runtime failure because the module does not exist yet.

- [ ] **Step 3: Implement core module**

Implement `auditKb(root)`, `pruneKb(root, { yes })`, report types, recursive `kb/` scan, `safePath` usage, and `promotionTimeGuard` integration.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/kb-maintenance.test.js`

Expected: PASS.

### Task 2: CLI Command

**Files:**
- Create: `packages/cli/src/commands/kb.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/package.json`
- Test: `tests/cli/kb-command.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Assert `kbCommand(root, "audit", { json: true })`, `kbCommand(root, "prune", { json: true })`, and `kbCommand(root, "prune", { yes: true, json: true })` return parseable JSON with expected counts and deletion behavior.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/kb-command.test.js`

Expected: compile or runtime failure because the CLI module does not exist yet.

- [ ] **Step 3: Implement CLI module and parser registration**

Add `kbCommand`, parser options `--yes`, `--build-site`, `--mode`, and daily rebuild options needed for the first version.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/kb-command.test.js`

Expected: PASS.

### Task 3: Rebuild Wrapper And Verification

**Files:**
- Modify: `packages/cli/src/commands/kb.ts`
- Test: `tests/cli/kb-command.test.ts`

- [ ] **Step 1: Write rebuild test**

Use a degraded daily run with a temporary local source and one bad `kb/` page. Assert `kb rebuild --yes --degraded --build-site --json` prunes bad stable pages and returns a daily report.

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/kb-command.test.js`

Expected: FAIL until rebuild delegates to `runDailyExperience`.

- [ ] **Step 3: Implement rebuild delegation**

Call `pruneKb` first, then `runDailyExperience(root, { authorityMode, mode: "write", buildSite, degraded, ... })`. Do not write new stable wiki files directly.

- [ ] **Step 4: Full verification**

Run:

```bash
pnpm check
node packages/cli/dist/index.js kb audit --json
node packages/cli/dist/index.js kb prune --dry-run --json
```

Expected: all tests pass; local real smoke is non-destructive.
