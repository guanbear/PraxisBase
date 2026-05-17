# LLMHTML — Durable Memory for Disposable Agents

> Agent knowledge substrate · Git-backed memory · Reusable skills · Static repair bundles · AI-reviewed evolution

LLMHTML is an agent-native knowledge substrate for teams running many temporary and persistent agents. It keeps the agents disposable while making their knowledge, repair experience, reusable skills, and decisions durable.

The project started from the LLM Wiki idea, but its current direction is broader: **agents are cattle, knowledge is the herd memory**. Temporary repair agents, persistent OpenClaw bots, Feishu bots, Hermes-like curators, and future MCP clients should all be replaceable peers that read and write the same durable knowledge layer.

## Core Philosophy

Modern agent systems should not depend on one precious long-lived container or one hand-tended agent session. Inspired by Anthropic's Managed Agents architecture, LLMHTML separates:

- **Brains**: temporary or persistent agent loops that reason and decide
- **Hands**: sandboxes, tools, shells, OpenClaw environments, K8s systems
- **Memory**: durable episodes, proposals, reviews, skills, known fixes, procedures, and bundles

Anthropic decouples session, harness, and sandbox so failed harnesses or sandboxes can be replaced. LLMHTML applies the same philosophy to organizational learning: an agent can disappear after one repair run, but its useful experience can survive, be reviewed, be promoted, and become part of the next agent's context.

One important long-term capability is **skill synthesis**: repeated successful episodes should be summarized into reusable `SKILL.md` files, reviewed by AI, promoted into the shared skill registry, and loaded by later agents.

## What It Does

```text
OpenClaw / K8s / Feishu / Docs / Logs
          |
          v
  temporary and persistent agent peers
          |
          v
    LLMHTML file protocol + CLI
          |
          v
  Git-backed durable knowledge layer
          |
          v
 static repair bundles + HTML inspection
          |
          v
       next agent starts smarter
```

## Phase 1 MVP

The first MVP targets **OpenClaw sandbox auto-repair**:

- `llmhtml init` creates the agent knowledge substrate skeleton
- `llmhtml repair-context openclaw --logs ...` returns a compact repair bundle
- agents submit repair `episode` records after each run
- agents submit `proposal` records when they discover reusable knowledge
- skill improvements can enter the same proposal/review/promotion lane
- AI reviewer agents classify risk and approve routine changes
- `llmhtml promote --auto` promotes approved proposals into stable knowledge
- `llmhtml build` generates repair bundles, indexes, `llms.txt`, and HTML inspection output
- GitLab Scheduled Pipelines run review, promotion, and build jobs

MVP intentionally does **not** implement MCP server, Hermes runner, K8s runtime integration, external search, vector DB, blockchain, or a central master agent.

## Knowledge Model

LLMHTML stores different knowledge lifecycles in different places:

| Layer | Carrier | Examples |
| --- | --- | --- |
| Protocol state | `.llmhtml/` | inbox episodes, proposals, reviews, policies, schedules |
| Stable knowledge | `kb/` | known fixes, procedures, decisions, notes, reviewed memory |
| Agent skills | `skills/` | OpenClaw repair skills, K8s triage skills |
| Distribution | `dist/` | repair bundles, indexes, HTML, `llms.txt` |
| Raw evidence | external systems | full logs, tickets, Feishu exports, object storage |

Large raw logs stay outside Git. Git stores references, summaries, hashes, and redacted evidence.

## Hermes Relationship

Hermes can make the first skill-evolution prototype simpler because it already has agent-managed skills, persistent memory, and a curator that maintains agent-created skills. LLMHTML should integrate with that, not depend on it.

Recommended boundary:

- Hermes may act as a **skill synthesizer**: turn successful runs into local skills.
- Hermes may act as a **curator**: patch, consolidate, archive, or propose improvements.
- LLMHTML remains the **shared substrate**: evidence, review, promotion, Git history, repair bundles, and cross-agent distribution.
- Non-Hermes agents must still be able to use file protocol, CLI, and future MCP wrappers.

This keeps the MVP simpler without making Hermes a hard dependency.

## Why This Exists

Teams that operate many agent sandboxes have a different problem from ordinary documentation:

- a repair agent may live for minutes
- a sandbox may be deleted after use
- a persistent bot may be upgraded or replaced
- model and harness assumptions will change
- the useful repair experience must survive all of that

LLMHTML makes the durable part explicit. It is the shared memory, skill registry, review lane, skill synthesis lane, and repair bundle generator for disposable agents.

## Current Documents

- [Agent Knowledge Substrate Design](docs/superpowers/specs/2026-05-17-agent-knowledge-substrate-design.md)
- [OpenClaw Repair MVP Implementation Plan](docs/superpowers/plans/2026-05-17-openclaw-repair-mvp-implementation-plan.md)
- [OpenSpec Change](docs/openspec/changes/openclaw-repair-mvp/proposal.md)
- [BDD Acceptance Feature](docs/bdd/openclaw-repair-mvp.feature)

## Roadmap

- **Phase 0**: Reframe LLMHTML from self-updating wiki to agent knowledge substrate
- **Phase 1**: OpenClaw repair closed loop with file protocol, CLI, AI review, promotion, and static bundles
- **Phase 2**: K8s incident ingest, Feishu bot workflows, and Hermes-like automatic skill synthesis
- **Phase 3**: Thin MCP wrapper and Hermes runner/curator integration
- **Phase 4**: Multi-repo federation, external search backends, stronger provenance, and cross-team synchronization

## Naming Direction

The eventual project name should express:

- disposable agents
- durable shared memory
- self-improving repair knowledge
- reusable skill synthesis
- peer agent network
- reflex-like incident response

Good naming directions include words like `Memory`, `Reflex`, `Nexus`, `Mind`, `Synapse`, `Runbook`, `Forge`, `Mesh`, and `Substrate`. The name should not sound like a plain wiki or a single central agent.

## References

- [Anthropic: Scaling Managed Agents, Decoupling the brain from the hands](https://www.anthropic.com/engineering/managed-agents)
- [Karpathy LLM Wiki gist v1](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [LLM Wiki v2](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2)
- [The Unreasonable Effectiveness of HTML](https://x.com/trq212/status/2052809885763747935)
- [Hermes Agent](https://hermes-agent.nousresearch.com/)
- [OpenClaw](https://github.com/openclaw/openclaw)

## License

MIT
