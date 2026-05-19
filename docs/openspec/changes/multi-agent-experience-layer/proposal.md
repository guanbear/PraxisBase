# OpenSpec Change: Multi-Agent Experience Layer

## Why

PraxisBase started with OpenClaw repair and K8s incident workflows, but the stronger product shape is broader: a shared experience layer for personal and team agents. Codex, Claude Code, OpenCode, Hermes, OpenClaw bots, CI jobs, and generic agents should be able to retrieve context, capture useful experience, and submit proposal-based knowledge updates through the same protocol.

Without a written contract, future implementations are likely to drift into one of two bad shapes:

1. a deep plugin per agent that duplicates behavior and makes PraxisBase hard to adopt, or
2. an unsafe self-mutating memory system that stores raw transcripts/logs in Git and directly edits stable knowledge.

This change defines a CLI-first, file-first, proposal-based multi-agent experience layer.

## What Changes

- Add a common `context get` command for stage-aware agent context retrieval.
- Add capture records and `capture finish` / `capture submit` commands.
- Add built-in adapter profiles for `codex`, `claude-code`, `opencode`, `openclaw`, `hermes`, and `generic`.
- Add `install <agent>` with dry-run output and bounded writes to instruction snippets or adapter config.
- Add `watch` as a compatibility path for agents without stable hooks.
- Add `distill run` to convert captures into episodes, proposals, reports, and exceptions.
- Add raw artifact rules: raw transcripts/logs/chats stay in raw vault or external storage; Git stores refs, hashes, redacted summaries, and short excerpts only.
- Add BDD scenarios covering M0 through M4 behavior.

## Non-Goals

- Do not implement GUI, IDE plugin, browser extension, or MCP server in this change.
- Do not add vector database, external search backend, message queue, or long-running database service.
- Do not make agent-specific deep plugins the primary integration surface.
- Do not allow capture, watch, or distill commands to directly mutate stable `kb/` or `skills/`.
- Do not commit raw transcripts, full logs, Feishu chat exports, tokens, cookies, or secrets to Git.
- Do not automatically promote `personal` experience to `team` or `org`.
- Do not replace the existing proposal/review/promote lane.

## Acceptance Summary

- `praxisbase context get --agent <agent> --stage <stage> --json` returns bounded context with citations and warnings.
- `praxisbase capture finish ... --json` writes a capture record under `.praxisbase/outbox/captures/`.
- Capture rejects raw artifact refs that point into `kb/`, `skills/`, or `dist/`.
- `praxisbase install codex --dry-run --json` describes planned writes without modifying files.
- Non-dry-run install writes only documented instruction snippets and `.praxisbase/adapters/<agent>.json`.
- `praxisbase distill run --json` writes reports/proposals/exceptions and reports `changed_stable_knowledge: false`.
- `praxisbase watch --agent <agent> --workspace <path> --once --json` either emits a capture or a structured warning without mutating raw artifacts.
- `pnpm check` and the documented smoke flow pass.

## Guardrails For Implementing Agents

- Use the existing TypeScript/Zod/Commander stack; do not add new runtime dependencies for adapter profile parsing.
- Adapter profiles are built-in TypeScript/JSON objects in the first implementation.
- Keep CLI command wrappers thin; core behavior belongs in `@praxisbase/core`.
- All writes must be idempotent or append-only unless explicitly writing a safe install snippet.
- Any privacy uncertainty goes to `.praxisbase/exceptions/human-required/`.
- Any stable knowledge change must be represented as a proposal.

