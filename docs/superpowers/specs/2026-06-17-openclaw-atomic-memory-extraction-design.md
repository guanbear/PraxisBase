# OpenClaw Atomic Memory Extraction Design

## Goal

Make OpenClaw answer-bot memory extraction high-recall by treating each durable repair or reply-policy entry as its own experience item instead of treating a sqlite markdown chunk as the durable unit.

## Design

Add an OpenClaw-only atomizer in `source-adapters.ts`. It expands markdown memory items immediately after source resolution and before envelope creation. Specific `###` sections become one item. Broad `##` sections split into top-level bullets. Trigger-scenario bullets are grouped with their follow-up bullets so fixed reply policies stay coherent.

## Data Shape

The atomizer preserves the original `source_ref` and appends line ranges such as `#L20-L23`. It rewrites `id`, `summary`, `text`, and `raw_log` to the atomic excerpt, and records parent metadata on the raw item before envelope construction. The existing envelope schema remains unchanged.

## Testing

The primary regression test feeds one exported `pm-memory.jsonl` item containing two repair sections, a `/models` bullet, and a `/model` scenario. The expected behavior is four envelopes with distinct hashes and line-range refs.
