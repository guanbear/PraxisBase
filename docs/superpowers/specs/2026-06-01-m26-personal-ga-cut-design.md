# M26 Personal GA Cut Design

## Summary

M26 is the release cut that turns PraxisBase personal mode from "PB core smoke passes" into "the personal product is usable by a human and by agents."

The final definition has three gates:

```text
Gate 1: PB Wiki/Context GA
Gate 2A: PB Skill Compiler GA
Gate 2B: GBrain Runtime GA
```

All three must pass before PraxisBase claims personal GA.

## Current State

The current implementation can pass PB core smoke:

- real personal sources are read;
- GLM-4.7 production AI distill can complete a bounded run;
- stable wiki/context exists;
- `context get` returns PB stable knowledge for OpenClaw and Codex.

It is not final personal GA:

- the latest real run was bounded smoke, not full personal queue validation;
- no PB skill is promoted, so `skill inject-preview` can return empty;
- GBrain is configured and healthy, but the latest run did not publish PB stable outputs;
- `personal_ga.production_ready=true` currently means PB core ready, not full personal product ready.

## Design

### Gate 1: PB Wiki/Context GA

PB must process high-priority personal evidence from local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi through a resumable full personal queue.

The queue is budget-aware rather than unlimited. It can pass with low-priority material remaining, but not with unprocessed high-priority memory/session evidence unless there is an explicit blocker.

Gate 1 outputs are stable personal wiki pages or active personal lessons, PB context for OpenClaw and Codex, HTML visibility, and leak-safe stable output.

### Gate 2A: PB Skill Compiler GA

PB must produce at least one promoted, injectable skill from governed PB knowledge.

Promotable skill inputs are stable wiki pages, approved or `skill_ready` lessons, and safe active personal lessons. Raw transcripts, dreaming memory, session corpus, untriaged staging files, sidecar-only hits, and legacy-distill-only signals cannot become stable skills.

The skill path must include shape validation, one repair attempt for structural defects, semantic review, final validation, promotion audit, and injection preview.

### Gate 2B: GBrain Runtime GA

PB must publish stable wiki and promoted skills to GBrain source `praxisbase` and prove retrieval.

GBrain remains the preferred runtime brain, but not a PB promotion authority. GBrain hits are sidecar recall unless imported into PB evidence and reviewed through PB.

Gate 2B requires GBrain doctor health, export filtering, publish evidence, and `context get --with-gbrain` retrieval evidence. If MCP is locally available, an MCP query smoke should also run; otherwise the audit reports setup guidance.

## Release Audit

Add:

```bash
praxisbase personal release-audit --json
```

The audit returns independent statuses:

```text
personal_ga
wiki_context_ga
skill_compiler_ga
gbrain_runtime_ga
```

It reads latest reports and stable files by default, then tells the user exact next commands. It does not silently rerun expensive AI work.

## HTML

The generated site must show the same gate model:

- stable wiki;
- active personal context;
- promoted skills;
- pending wiki candidates;
- pending skill candidates;
- privacy blockers;
- GBrain publish/retrieval state;
- release blockers and exact next commands.

Pending candidates must not look like stable knowledge.

## Non-Goals

M26 does not solve team GA, AgentMemory health, full GBrain browsing UI inside PB, general MCP replacement, or unlimited historical backfill.

## Implementation Order

1. Implement release audit schema and command.
2. Add Gate 1 full queue/audit checks and context verification.
3. Harden skill source authority and promotion path.
4. Promote at least one real personal skill and verify injection.
5. Publish stable PB wiki/skills to GBrain and verify retrieval.
6. Render gate status in HTML.
7. Run final release audit and record status evidence.

## Success

M26 is complete only when:

```text
personal_ga: pass
wiki_context_ga: pass
skill_compiler_ga: pass
gbrain_runtime_ga: pass
```

and the following commands prove real usability:

```bash
praxisbase context get --agent openclaw --stage diagnosis --mode personal --query "openclaw dispatch" --json
praxisbase context get --agent codex --stage diagnosis --mode personal --query "openclaw dispatch" --json
praxisbase skill inject-preview --query "openclaw dispatch routing failure" --json
praxisbase context get --agent codex --stage diagnosis --mode personal --query "openclaw dispatch" --with-gbrain --json
praxisbase personal release-audit --json
```
