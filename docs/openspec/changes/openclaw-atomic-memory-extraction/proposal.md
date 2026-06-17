# OpenClaw Atomic Memory Extraction

## Why

OpenClaw answer-bot memory exports often store several repair or reply-policy lessons inside one sqlite markdown chunk. PraxisBase currently treats each chunk as one source item, so downstream privacy triage, AI distillation, coverage, and wiki curation may surface only one lesson while other useful guidance remains hidden in the same chunk.

## What Changes

- Split OpenClaw markdown memory/export chunks into atomic experience items before creating experience envelopes.
- Preserve source provenance with original chunk refs plus line ranges.
- Keep broad headings as context while splitting independent bullets and scenario groups.
- Keep non-OpenClaw and non-markdown sources unchanged.
- Let existing privacy triage, AI distill, coverage, proposal, and stable-KB flows operate on the smaller atomic items.

## Non-Goals

- Do not auto-promote team knowledge directly into stable KB.
- Do not expose raw private Feishu transcripts in generated pages.
- Do not change OpenClaw exporter runtime behavior or sandbox cron behavior.

## Acceptance

- A single exported OpenClaw markdown memory chunk containing multiple repair/policy entries produces multiple experience envelopes.
- Atomic envelopes have distinct source hashes and source refs ending with stable line ranges.
- Existing SQLite, Git, HTTP, Codex, Claude Code, and OpenCode source adapter behavior remains compatible.
