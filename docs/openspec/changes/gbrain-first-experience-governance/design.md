# Design: GBrain-First Experience Governance

## Boundary

PraxisBase is not the agent brain. GBrain is.

PraxisBase is the governed compiler that prepares a small amount of durable agent experience for that brain.

```text
agent evidence -> PB governance -> stable experience -> GBrain brain runtime
```

## Agent Access Model

Agents use:

- GBrain MCP for `search`, `query`, `think`, `get_page`, graph traversal, and broad memory;
- PB CLI for `daily run`, `privacy triage`, `review`, `promote`, `wiki build-site`, and stable export;
- PB context only for governed PB experience context or fallback debugging.

The generated PB skill must not imply PB MCP is the general brain surface when GBrain is configured.

## Privacy Triage

Privacy triage has two decisions:

- can this redacted evidence become synthesis input?
- can any stable result derived from it leave personal scope?

Personal mode can auto-release safe local evidence. Team mode cannot use personal auto-release.

Personal remote OpenClaw sources can opt into the same release path only when the source is explicitly marked `privacy_trust: trusted_personal_remote`, has `scope_default: personal`, and matches the exception source id or source ref. The flag removes only the remote-source blocker; AI safety classification and deterministic secret/private checks still apply.

Daily report and HTML must show separate categories:

- `privacy_required`;
- `review_required`;
- `quality_rejected`;
- `low_signal`;
- `stale_or_duplicate`.

Privacy queue items show redacted summaries and reason codes. They never show raw evidence bodies.

## Quality Yield

Promotion gates stay strict. Yield improves through better routing:

- `reject`: no stable candidate, but retain redacted evidence summary if useful;
- `merge`: create an update/merge proposal when there is one target;
- `revise`: run one rewrite/retry when the failure is structural and safe;
- `needs_human`: show precise reason and command/UI path;
- `promote`: only personal low-risk candidates with all deterministic and LLM conditions satisfied can proceed automatically.

Skill candidates require:

- complete procedure steps;
- concrete trigger;
- verification section;
- safe future-agent wording;
- provenance.

Incomplete procedure steps are structural failures, not human taste issues.

## GBrain Publish Contract

Only stable PB pages and promoted skills are exported.

Export excludes:

- `.praxisbase/inbox/**`;
- `.praxisbase/exceptions/**`;
- rejected material;
- raw evidence;
- untriaged material.

Export includes PB metadata and source hashes so GBrain users can trace stable knowledge back to PB.

## HTML Contract

PB HTML is a governance dashboard:

- current stable experience pages;
- privacy queue;
- review queue;
- rejected/low-signal explanations;
- GBrain configuration and publish status;
- exact next commands.

It is not a general GBrain browser.

## Failure Handling

- Missing GBrain: PB daily/review still works and prints setup guidance.
- GBrain publish failure: stable PB changes remain; publish is retryable.
- Privacy triage unavailable: evidence stays blocked.
- Semantic review unavailable: no auto-promotion.
- Merge target ambiguous: human review.
