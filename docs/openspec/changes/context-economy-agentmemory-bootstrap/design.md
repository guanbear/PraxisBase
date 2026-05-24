# Design: Context Economy, AgentMemory Interop, And Personal Bootstrap

## Architecture

The change inserts two adapters around the existing file-first pipeline:

```text
source adapters
  -> context reducer
  -> chunking
  -> privacy precheck
  -> AI distill cache
  -> experience envelopes
  -> wiki compile/curate
  -> semantic review/promote
  -> kb/skills/dist
  -> optional agentmemory export
```

The reducer is deterministic and runs before AI. AgentMemory is an optional REST-backed adapter. The personal CLI is a wrapper over existing primitives, not a second pipeline.

## Context Economy

Rules are loaded from built-in, user, then project scope. They match source metadata and content patterns, then apply deterministic actions such as ANSI stripping, duplicate-line removal, section preservation, head/tail clipping, and bounded truncation.

The reducer must preserve:

- source ref;
- source hash;
- command/test failure signal;
- explicit lessons and verification;
- privacy and provenance fields.

Daily reports include byte accounting and rule hit summaries. Debug reports contain hashes and counters, not unredacted raw source material.

## AgentMemory Interop

AgentMemory has three roles:

- source: import latest memories, smart-search results, or session summaries into PraxisBase envelopes;
- sink: export reviewed stable wiki lessons to `POST /agentmemory/remember`;
- retrieval: optionally include smart-search hits in `context get --with-agentmemory`.

PraxisBase stable wiki authority always outranks agentmemory sidecar hits. If agentmemory is unavailable, normal PraxisBase commands continue and report warnings.

Bearer tokens may be sent only to loopback HTTP or HTTPS. Plain HTTP to non-loopback with bearer is blocked.

## Personal Bootstrap

The personal command group exposes:

```bash
praxisbase personal init
praxisbase personal connect codex
praxisbase personal connect openclaw
praxisbase personal connect agentmemory
praxisbase personal doctor
praxisbase personal run --open
praxisbase personal schedule --print
```

These commands configure sources, run daily collection, build the site, audit `kb/`, generate agent access assets, and open the generated HTML when requested.

## Privacy

Personal mode may auto-promote low-risk, semantic-review-approved pages. Team mode remains human/Git policy driven.

Personal agentmemory imports cannot enter team knowledge by default. Team export to agentmemory requires explicit policy because an agentmemory daemon may be shared by personal agents.

## Failure Modes

- Reducer rule failure: skip the failed rule for that item and record a warning.
- Empty reduction: use a bounded head/tail fallback.
- AgentMemory unavailable: source doctor fails or sidecar retrieval warns; local wiki flow continues.
- AgentMemory auth unsafe: block request before sending bearer.
- Personal bootstrap partial detection: write only confirmed sources and report candidates that need user confirmation.

## Observability

Reports expose:

- context economy byte savings and rule hits;
- agentmemory health/import/export counts;
- personal bootstrap detected sources and skipped candidates;
- warnings that distinguish source detection, reducer, privacy, AI, and agentmemory failures.
