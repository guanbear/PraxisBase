# M22 Incremental Session Sources And Skill Origin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make personal session ingestion incremental, add Claude Code/OpenCode sources, and mark PraxisBase-generated skills with durable provenance.

**Architecture:** Add a small source item ledger beside the existing AI distill cache, extend source schemas/parsers for Claude Code and OpenCode, and add skill origin classification/provenance without changing promotion gates.

**Tech Stack:** TypeScript, Node.js, zod schemas, existing file-store/cache paths, pnpm tests.

---

## Files

- Modify `packages/core/src/protocol/schemas.ts` for source agents/parsers and optional source item ledger schema.
- Modify `packages/core/src/protocol/paths.ts` for `.praxisbase/cache/source-items`.
- Modify `packages/core/src/experience/source-config.ts` for parser inference.
- Modify `packages/core/src/experience/source-adapters.ts` and `packages/core/src/experience/chunking.ts` for OpenCode refs and Claude/OpenCode summaries.
- Create or modify `packages/core/src/experience/source-item-ledger.ts` for deterministic ledger read/write.
- Modify `packages/core/src/experience/daily.ts` to consult and update the ledger around distill cache checks.
- Modify `packages/core/src/experience/context-reducer-rules.ts` for Claude Code/OpenCode reducer defaults.
- Modify `packages/core/src/synthesis/skill.ts`, `packages/core/src/synthesis/skill-model.ts`, and/or `packages/core/src/synthesis/skill-inventory.ts` for skill provenance.
- Modify `packages/core/src/agent-access/skill.ts` to document Claude/OpenCode source commands and skill origin behavior.
- Modify `packages/cli/src/index.ts`, `packages/cli/src/commands/source.ts`, `packages/cli/src/commands/bootstrap.ts`, and `packages/cli/src/commands/personal.ts` for CLI support.
- Add tests in `tests/core/experience-daily.test.ts`, `tests/core/experience-source-adapters.test.ts`, `tests/core/context-reducer.test.ts`, `tests/core/skill-synthesis.test.ts`, and `tests/cli/source-command.test.ts`.

## Task 1: Schema And Source Config

- [x] Add `opencode` to `ExperienceSourceAgentSchema`.
- [x] Add `claude-code-session` and `opencode-session` to `ExperienceSourceParserSchema`.
- [x] Update `inferExperienceSourceParser()`:
  - `codex` -> `codex-session`;
  - `claude-code` -> `claude-code-session`;
  - `opencode` -> `opencode-session`;
  - `agentmemory` -> `agentmemory-memory`;
  - `gbrain` source type -> `gbrain-memory`;
  - local `openclaw` -> `openclaw-log`;
  - fallback -> `openclaw-export`.
- [x] Update CLI option typings so `source add --agent opencode` and `--parser opencode-session` parse.
- [x] Add focused tests for source add/infer parser.

Run:

```bash
pnpm test tests/cli/source-command.test.ts tests/core/protocol-schemas.test.ts
```

## Task 2: Source Adapter And Reducer Rules

- [x] Update `sourceRefForItem()` and `sourceRefForFile()` so OpenCode gets stable non-OpenClaw refs.
- [x] Update `summaryForItem()` / `meaningfulText()` so Claude Code and OpenCode keep user goals, commands, changed files, failures, tests, final answers, and explicit lessons.
- [x] Add `claude-code-session-default` and `opencode-session-default` builtin reducer rules using `preserve_experience_fidelity`.
- [x] Keep file inspection pass-through behavior.
- [x] Add tests that OpenCode refs do not become `log://openclaw/...` and reducer rules match the right agent.

Run:

```bash
pnpm test tests/core/experience-source-adapters.test.ts tests/core/context-reducer.test.ts
```

## Task 3: Incremental Source Item Ledger

- [x] Add `protocolPaths.cacheSourceItems = ".praxisbase/cache/source-items"`.
- [x] Implement ledger helpers keyed by a stable hash of source id, source ref, source hash, authority mode, model, reducer identity, and parser.
- [x] Record status, chunk hashes, distill cache refs, envelope ids, and warnings.
- [x] In production daily, consult the ledger before uncached distill calls only after validating the AI distill cache entry still exists and parses.
- [x] Update ledger after distilled, human-required, failed, and budget-skipped paths.
- [x] Report ledger reuse in daily warnings or report counters without changing existing `cache_hits` semantics.
- [x] Add tests: warm run distills two sessions; second run on same sessions makes zero provider calls; adding one file distills only one new item.

Run:

```bash
pnpm test tests/core/experience-daily.test.ts
```

## Task 4: Skill Origin And Provenance

- [x] Add a classifier for stable skill origin:
  - frontmatter `origin: praxisbase_synthesized` or `generated_by: praxisbase` -> PB synthesized;
  - missing provenance -> external installed;
  - malformed frontmatter -> unknown.
- [x] Update PB-generated skill candidates to include origin/provenance frontmatter with source refs and source hashes.
- [x] Ensure promoted stable skills preserve the frontmatter.
- [x] Ensure wiki source collection continues to treat external installed skills as stable context or inventory, not raw evidence.
- [x] Add tests for PB-generated candidate frontmatter and external skill classification.

Run:

```bash
pnpm test tests/core/skill-synthesis.test.ts
```

## Task 5: Personal Bootstrap UX

- [x] Add or extend local detection for Claude Code and OpenCode source paths. Only auto-add paths that exist.
- [x] Add `personal connect claude-code` and `personal connect opencode` if the command dispatcher supports agent-specific connect.
- [x] Update generated PraxisBase agent skill with simple source commands for Codex, Claude Code, OpenCode, and OpenClaw.
- [x] Keep personal bootstrap non-destructive: it writes source configs and agent access assets only.
- [x] Add CLI tests for connect/source add behavior.

Run:

```bash
pnpm test tests/cli/bootstrap-command.test.ts tests/cli/personal-command.test.ts tests/cli/source-command.test.ts
```

## Task 6: Verification

- [x] Run focused tests from Tasks 1-5.
- [x] Run typecheck.
- [x] Run `git diff --check`.
- [x] Inspect `git diff --stat` and verify no raw personal session data or generated `dist/` files are committed.

Run:

```bash
pnpm typecheck
git diff --check
```
