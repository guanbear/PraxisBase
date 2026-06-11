# Multi-Agent Experience Layer OpenSpec Design

## Overview

This change adds a multi-agent experience layer on top of the existing PraxisBase file protocol. The layer is CLI-first and proposal-based:

```text
existing agent native memory / skills / preferences
  -> memory import
  -> capture/proposal candidates
  -> review / promote / build
  -> memory refresh outputs

agent task
  -> context get
  -> task execution
  -> capture finish or watch
  -> distill run
  -> episodes / proposals / reports / exceptions
  -> review / promote / build
```

`memory import` reuses existing agent-native memories, skills, sessions, and preferences as evidence sources. `context get` helps an agent start with relevant knowledge. `capture` and `watch` record what happened. `distill` converts captures into structured candidates. `memory refresh` sends reviewed PraxisBase knowledge back as context bundles, install snippets, or patch proposals. Stable `kb/` and `skills/` only change through existing review and promotion.

## Protocol Objects

### Capture Record

A capture record is the common output of hooks, manual submit, and watcher runs. It records evidence and signals, not stable knowledge.

Required fields:

- `id`
- `protocol_version`
- `type: capture_record`
- `agent`
- `workspace`
- `scope_hint`
- `result`
- `triggers`
- `signals`
- `artifacts`
- `created_at`

Artifact refs must use allowed ref schemes such as `raw-vault://`, `log://`, `artifact://`, `file-ref://`, or `ci-artifact://`. Paths under `kb/`, `skills/`, or `dist/` are rejected as raw artifact refs.

### Adapter Profile

An adapter profile describes how an agent is installed and watched. It does not define governance rules.

Required fields:

- `agent`
- `instruction_files`
- `transcript_paths` or `raw_artifact_paths`
- `workspace_markers`
- `capture.default_triggers`
- `context.default_stages`
- `privacy.redaction_profile`

Built-in profiles:

- `codex`
- `claude-code`
- `opencode`
- `openclaw`
- `hermes`
- `openhuman`
- `generic`

First implementation stores profiles as TypeScript objects and writes JSON config. YAML parsing is out of scope.

### Native Memory Source

A native memory source describes existing memory or skill material owned by an agent runtime. It is an input evidence descriptor, not stable PraxisBase knowledge.

Required fields:

- `agent`
- `kind: memory|skill_summary|session_summary|preference|instruction`
- `source_ref`
- `source_hash`
- `redacted_summary`
- `scope_hint`
- `created_at`

Allowed first-batch sources:

- Codex session summaries and instruction snippets
- Claude Code session summaries and instruction snippets
- OpenCode instruction/profile summaries
- Hermes memory summaries, agent-created skill summaries, and curator patch summaries
- OpenHuman persona/preference summaries
- OpenClaw repair episode summaries
- Generic JSON descriptors

Native memory import must preserve `source_ref` and `source_hash`, deduplicate by hash, and default personal/persona/preference sources to `scope=personal`. It must not copy raw native memory into `kb/`, `skills/`, or `dist/`.

### Context Response

`context get` returns compact, stage-aware context:

- `stage`
- `agent`
- `items`
- `citations`
- `warnings`
- `truncated`
- `budget`

Default stage budgets:

| Stage | Max Serialized Size | Priority |
| --- | --- | --- |
| `diagnosis` | 16 KB | signatures, pitfalls, known fixes |
| `repair` | 24 KB | skills, procedures, forbidden operations |
| `verification` | 12 KB | verification steps, rollback, escalation |
| `proposal` | 16 KB | similar objects, evidence contract, prior reviews |

When over budget, the system drops full object bodies before citations.

## Commands

### `praxisbase context get`

Input:

```text
--agent <agent>
--stage <diagnosis|repair|verification|proposal>
--workspace <path>
--query <text>
--max-bytes <n>
--json
```

Behavior:

- Reads generated indexes/bundles when available.
- Returns warnings instead of failing hard when context is unavailable.
- Does not modify repository content.

### `praxisbase capture finish`

Input:

```text
--agent <agent>
--result <success|failed|partial|unknown>
--source-ref <ref>
--source-hash <hash>
--summary <text>
--json
```

Behavior:

- Writes `.praxisbase/outbox/captures/<capture-id>.json`.
- Rejects raw refs under stable Git knowledge paths.
- Uses idempotency when supplied.
- Does not write `kb/` or `skills/`.

### `praxisbase install <agent>`

Behavior:

- `--dry-run --json` returns planned writes and commands without modifying files.
- Non-dry-run writes `.praxisbase/adapters/<agent>.json`.
- Instruction files may be appended inside PraxisBase marker comments.
- Existing instruction files must not be overwritten wholesale.

### `praxisbase memory import`

Input:

```text
--agent <agent>
--source <file>
--json
```

Behavior:

- Reads a JSON native memory source descriptor.
- Writes `.praxisbase/reports/memory/<run-id>.json`.
- May write capture records or proposal candidates with source refs and hashes.
- Defaults OpenHuman preferences and personal memory to `scope=personal`.
- Treats Hermes skills and memory as proposal input, not stable skills.
- Rejects source refs under `kb/`, `skills/`, or `dist/`.
- Must report `changed_stable_knowledge: false`.

### `praxisbase memory refresh`

Input:

```text
--agent <agent>
--target <context|instruction-snippet|patch-proposal>
--json
```

Behavior:

- Reads reviewed PraxisBase knowledge and adapter profile constraints.
- Emits context bundles, install snippets, or native-memory patch proposals.
- Does not overwrite agent-native memory or instruction files directly.
- Must preserve target agent, target path, source refs, and review status when producing patch proposals.

### `praxisbase watch`

Behavior:

- First implementation may support `--once`.
- Reads configured transcript/log/artifact refs.
- Emits capture records or structured warnings.
- Does not modify raw artifacts.

### `praxisbase distill run`

Behavior:

- Reads capture records and existing episodes.
- Writes reports, proposals, and exceptions.
- Defaults new memory/proposal candidates to `scope=personal`.
- May suggest `scope=project` when workspace evidence is clear.
- Must not suggest `team` or `org` without explicit marker or reviewer input.
- Must report `changed_stable_knowledge: false`.

## Scope Boundary

Personal experience can become project knowledge only when it is clearly tied to a workspace and contains no private preference or sensitive raw artifact. Project knowledge can become team knowledge only through proposal/review. Team knowledge can become org knowledge only through human-required or strong AI review.

The system may recommend scope escalation. It must not perform scope escalation silently.

## Failure Behavior

- Context unavailable: return warning and let the agent continue.
- Memory import failure: write run record and warning; do not write partial stable knowledge.
- Memory refresh failure: return a plan error; do not overwrite native memory or instruction files.
- Capture write failure: output the capture JSON to stdout or local fallback path.
- Watch failure: write run record; raw artifacts remain untouched.
- Distill failure: write run record and exception; do not write partial stable knowledge.
- Privacy uncertainty: write human-required exception.

## Output Surfaces

```text
.praxisbase/outbox/captures/
.praxisbase/inbox/episodes/
.praxisbase/inbox/proposals/
.praxisbase/reports/distill/
.praxisbase/reports/context/
.praxisbase/reports/memory/
.praxisbase/runs/capture/
.praxisbase/runs/distill/
.praxisbase/runs/memory-import/
.praxisbase/memory-refresh/
.praxisbase/exceptions/human-required/
.praxisbase/exceptions/conflicts/
.praxisbase/adapters/
.praxisbase/raw-vault/refs/
```

## Safety Boundary

Memory import, memory refresh, capture, watch, context, install, and distill are ingestion and assistance surfaces. They do not own stable knowledge. Stable knowledge remains auditable, reviewable, and reversible through proposal/review/promote.
