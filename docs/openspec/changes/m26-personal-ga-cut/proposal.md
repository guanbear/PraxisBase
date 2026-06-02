# Proposal: M26 Personal GA Cut

## Problem

PraxisBase personal mode has crossed several useful milestones, but the acceptance line is still unstable. M25.2 proved that PB core wiki/context can work without optional sidecars, while earlier GBrain-first documents correctly define GBrain as the preferred long-term agent brain runtime. Skill synthesis also exists, but current real runs still have skill candidates rather than promoted skills.

The result is a confusing product state:

- `personal_ga.production_ready=true` can mean PB wiki/context core is usable, not that the full personal product is complete.
- GBrain is configured and healthy, but the latest real daily did not publish PB stable knowledge into GBrain.
- `skill inject-preview` can return no skill because no PB skill has been promoted.
- Small production smoke runs are being mistaken for full personal queue validation.

M26 freezes the release contract so the next implementation pass can stop patching symptoms.

## Change

Define one personal GA cut with three ordered gates:

```text
Gate 1: PB Wiki/Context GA
Gate 2A: PB Skill Compiler GA
Gate 2B: GBrain Runtime GA
```

All three gates must pass before the project claims "personal mode is truly usable".

The final personal product flow is:

```text
local OpenClaw + trusted remote OpenClaw + Codex app + codex-cliproxyapi
  -> PB source inventory, privacy abstraction, lesson extraction, stability routing
  -> stable personal wiki and active personal context
  -> promoted PB skills
  -> publish stable PB wiki/skills to GBrain source `praxisbase`
  -> agents consume via GBrain MCP or PB fallback context
```

PB remains the governance and compiler authority. GBrain is the preferred runtime brain and access layer. GBrain and AgentMemory sidecar hits never decide PB promotion.

## Scope

In scope:

- Release audit command/report that evaluates Gate 1, Gate 2A, and Gate 2B separately.
- A resumable full personal queue definition that can drain high-priority personal sources without unbounded token spend.
- Stable wiki/context verification over local OpenClaw, trusted remote OpenClaw, Codex app, and codex-cliproxyapi.
- Skill synthesis hardening so promoted skills come only from PB stable wiki, approved `skill_ready` lessons, or safe active personal lessons.
- Skill auto-repair, validation, promotion audit, and injection verification.
- GBrain publish/retrieval verification for promoted PB wiki and skills.
- HTML/report clarity for stable wiki, active lessons, promoted skills, GBrain publish status, pending queues, privacy blockers, and exact next commands.

Out of scope:

- Team mode GA.
- AgentMemory repair or making AgentMemory a required backend.
- Replacing PB promotion/review rules with GBrain retrieval scores.
- Making PB a general GBrain browser, vector database, or MCP runtime.
- Unlimited historical backfill without budget/caching/resume controls.
- Promotion of team/org/global knowledge from personal evidence.

## Success Criteria

M26 succeeds only when `praxisbase personal release-audit --json` reports:

```text
personal_ga: pass
wiki_context_ga: pass
skill_compiler_ga: pass
gbrain_runtime_ga: pass
```

Required real checks:

```bash
praxisbase context get --agent openclaw --stage diagnosis --mode personal --query "openclaw dispatch" --json
praxisbase context get --agent codex --stage diagnosis --mode personal --query "openclaw dispatch" --json
praxisbase skill inject-preview --query "openclaw dispatch routing failure" --json
praxisbase context get --agent codex --stage diagnosis --mode personal --query "openclaw dispatch" --with-gbrain --json
praxisbase personal release-audit --json
```

The final audit must prove:

- useful personal OpenClaw/Codex lessons reached stable wiki or active personal context;
- at least one real PB skill is promoted and injectable;
- promoted PB wiki/skills are published to GBrain source `praxisbase`;
- GBrain retrieval can find PB-published experience;
- raw, pending, human-required, rejected, private, and dreaming/corpus material are not exported as stable knowledge.

## Rollout

Implement M26 in order:

1. Add the release contract documents and BDD scenarios.
2. Add the release audit report and command.
3. Make Gate 1 pass on real personal sources.
4. Make Gate 2A pass by promoting validated PB skills.
5. Make Gate 2B pass through GBrain publish/retrieval.
6. Record one final real personal release audit in status docs.

Do not add new product surfaces while M26 gates are failing.
