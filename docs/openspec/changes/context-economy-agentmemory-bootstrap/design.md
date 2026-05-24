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

## Milestone Order

This change is intentionally staged:

- **M16 Context Economy**: reducer protocol, built-in rules, daily integration, cache identity, and reports.
- **M17 AgentMemory Interop**: REST client, source/sink/retrieval sidecar, and authority ranking.
- **M18 Personal Bootstrap UX**: `personal ...` commands, generated first-run guidance, and site summaries.

M16 may ship before M17/M18. It must not introduce agentmemory or personal bootstrap shortcuts unless the reducer contract is already green.

## OpenHuman Borrowing Boundary

OpenHuman's useful lesson for M16 is TokenJuice's placement and safety model, not its whole memory product. PraxisBase borrows:

- normalize first: tool name, command, argv, stdout, stderr, combined text, exit code, cwd, duration, source metadata, source ref, and source hash are classified together;
- rule overlays: built-in rules are overridden by user and project rules by id;
- specificity scoring: priority, tool/argv/command/source matches decide the rule; ties are stable by id;
- pass-through safety: tiny output, non-beneficial compression, and file-content inspection commands keep original text;
- failure preservation: failed commands keep more diagnostic tail context;
- observability: byte savings, rule id, counters, and warnings are reported.

PraxisBase does not borrow OpenHuman's SQLite memory tree, background summary tree workers, OAuth auto-fetch system, desktop UI, or live harness compaction. Those solve a different problem. PraxisBase remains an auditable llm-wiki compiler.

## Context Economy

Rules are loaded from built-in, user, then project scope. They match source metadata and content patterns, then apply deterministic actions such as ANSI stripping, duplicate-line removal, section preservation, head/tail clipping, and bounded truncation.

Inputs are first normalized into a shared execution/source shape with tool name, command, argv, stdout, stderr, combined text, exit code, source metadata, source ref, and source hash. This is required so rules can preserve failure context and avoid treating every source as generic text.

The normalized item is the only reducer input shape. Source adapters may emit native records, but the reducer must see one canonical structure before classification. This prevents a later adapter from bypassing pass-through safety or cache identity.

Rules are selected by specificity scoring. Priority, exact tool/argv matches, argv include groups, command include groups, and source metadata matches increase specificity; ties break by rule id. Invalid regex patterns in user/project rules are reported and ignored instead of failing the run.

Built-in rule families are conservative:

- `codex-session`: keep user goal, final answer, commands, file edits, tests, failures, explicit lessons, and verification;
- `openclaw-log`: keep task goal, route/agent/model, error, fix, verification, and reusable lesson;
- `command-output`: strip ANSI, dedupe adjacent repeated lines, preserve summaries and failure tails;
- `test-output`: preserve failing test names, assertion/error snippets, command, exit status, and final test summary;
- `git-output`: preserve changed paths, commit ids, branch/ref, conflict/failure lines, and status summaries;
- `agentmemory-memory`: preserve title, content, concepts, files, session ids, score, and source identifiers while dropping server/viewer boilerplate;
- `json-jsonl`: parse structurally when possible and select known useful fields before falling back to text rules;
- `generic`: bounded head/tail fallback with no fabricated facts.

Reduction is pass-through safe:

- tiny inputs are skipped;
- reduced output is used only when it is meaningfully smaller than the original;
- file-content inspection commands pass through unless explicitly opted in;
- failed commands preserve more head/tail context;
- counters/facts are retained for observability and later synthesis.

The reducer must preserve:

- source ref;
- source hash;
- command/test failure signal;
- explicit lessons and verification;
- privacy and provenance fields;
- reducer version, rule-set hash, matched rule id, reduction hash, applied flag, byte counts, facts, and warnings.

Daily reports include byte accounting and rule hit summaries. Debug reports contain hashes and counters, not unredacted raw source material.

Reducer version and rule-set hash must participate in chunk/cache identity or equivalent stale-cache protection so changed reducer rules cannot silently reuse old AI distill output.

Default M16 thresholds:

- `min_reduce_input_bytes = 512`;
- `min_useful_reduction_ratio = 0.95`;
- file-content inspection commands include `cat`, `sed`, `head`, `tail`, `nl`, `bat`, `batcat`, `jq`, and `yq`.

M16 is accepted only if disabling context economy reproduces the previous chunk/distill path for debugging.

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
- Invalid rule regex: ignore the regex and record a warning.
- Empty reduction: use a bounded head/tail fallback.
- Reduction not worthwhile: pass through original text and record `applied=false`.
- AgentMemory unavailable: source doctor fails or sidecar retrieval warns; local wiki flow continues.
- AgentMemory auth unsafe: block request before sending bearer.
- Personal bootstrap partial detection: write only confirmed sources and report candidates that need user confirmation.

## Observability

Reports expose:

- context economy byte savings and rule hits;
- agentmemory health/import/export counts;
- personal bootstrap detected sources and skipped candidates;
- warnings that distinguish source detection, reducer, privacy, AI, and agentmemory failures.
