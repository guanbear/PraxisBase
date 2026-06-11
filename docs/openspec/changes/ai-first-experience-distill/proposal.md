# AI-First Experience Distill Proposal

## Why

PraxisBase is an agent-native knowledge substrate. Its release goal is not just to collect logs or build a deterministic static wiki; it must help agents and humans turn daily work into durable, reusable experience.

M12-M14 proved the safe pipeline:

- configured Codex/OpenClaw/Claude Code sources;
- redacted experience envelopes;
- daily reports;
- wiki compile/build;
- agent context retrieval;
- privacy gates and human-required exceptions.

The remaining product gap is that experience extraction is still mostly rule-based. This causes two failures:

1. large or raw-looking sessions are often routed to `human_required`, even in personal mode where local-only summarization could be safe;
2. wiki proposals are too shallow because deterministic keyword extraction cannot reliably identify lessons, failed attempts, reusable procedures, preferences, or skill candidates.

AI distillation is therefore not an optional enhancement. It is a core PraxisBase capability. Deterministic code remains the safety kernel and degraded fallback, but production-quality daily knowledge generation requires an AI distill layer.

## What Changes

- Add an AI provider configuration and doctor flow.
- Add an AI distill service that converts source chunks and redacted envelopes into structured experience summaries.
- Make production daily runs require AI distill by default.
- Keep an explicit degraded mode for bootstrap, offline smoke, CI fixtures, and environments without model credentials.
- Add personal-mode privacy behavior that allows local raw material to be summarized by AI without committing raw content.
- Keep team-mode privacy stricter: personal/private material cannot enter team proposals without explicit review.
- Generate richer wiki and skill proposal candidates from AI-distilled experience.
- Add an agent-first bootstrap skill/instruction path so a first-run Codex/OpenClaw agent knows how to initialize PraxisBase.

## Goals

- A first-time user can ask an agent to set up PraxisBase, and the agent can follow a generated skill/instruction document.
- `daily run` in production mode fails fast or reports degraded mode when AI is not configured.
- AI output is structured, bounded, cited, and privacy-checked before downstream use.
- Personal mode reduces unnecessary `human_required` cases by distilling local-only source chunks into safe summaries.
- Team mode prevents personal or private content from entering team Git knowledge.
- Generated wiki proposals are useful enough to review, promote, and serve to agents as context.

## Non-Goals

- Do not let AI directly mutate stable `kb/` or `skills/`.
- Do not store raw transcripts, raw logs, credentials, cookies, tokens, auth headers, or private keys in Git.
- Do not require a vector database.
- Do not require MCP; Skill+CLI remains the default agent integration.
- Do not make deterministic tests depend on network model calls.
- Do not hard-code one model vendor into the core protocol.

## Product Principle

AI distill is core. Deterministic collection, hashing, redaction, linting, graphing, rendering, and retrieval are the safety kernel.

If AI is unavailable, PraxisBase must say so clearly:

```text
AI distill: not configured
mode: degraded
allowed outputs: source discovery, raw-vault refs, bounded rule summaries, smoke, site skeleton
blocked outputs: production daily knowledge synthesis, auto skill proposal synthesis
```

## Acceptance

- A configured AI provider is required for normal `daily run` unless `--degraded` or `--no-ai` is explicit.
- AI calls receive only bounded chunks with privacy prechecks and return schema-validated JSON.
- AI-distilled summaries are rechecked by privacy policy before envelope ingest, wiki proposal generation, site build, or context exposure.
- Personal mode can import safe AI summaries from local raw sessions without storing raw content in Git.
- Team mode rejects personal scope and private-chat content before proposal generation.
- First-run agent skill generation documents the bootstrap flow, AI config checks, source discovery, daily run, HTML output, context usage, and human-required review.
