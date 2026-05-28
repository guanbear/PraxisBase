# Change: Incremental Session Sources And Skill Origin

## Why

PraxisBase personal daily runs need to be cheaper and more reliable. The existing AI distill cache prevents repeated provider calls for unchanged chunks, but the pipeline still lacks a source item ledger, semantic review cache boundaries, first-class OpenCode source support, complete Claude Code source UX, and durable skill origin metadata.

## What Changes

- Add first-class `opencode` source support and complete Claude Code session parser naming.
- Add a conservative source item ledger that indexes already processed session items and validates existing AI distill cache entries before reuse.
- Add Claude Code/OpenCode reducer rules based on existing experience-fidelity compression.
- Add machine-readable origin/provenance metadata to PraxisBase-synthesized skills.
- Keep externally installed skills out of raw evidence by default.

## Impact

- Personal runs spend fewer tokens on unchanged sessions.
- Agents can share reviewed PB-generated skills without confusing them with external installed skills.
- Claude Code and OpenCode can become personal source feeds alongside Codex and OpenClaw.
- Existing privacy, semantic review, and promote gates remain unchanged.

