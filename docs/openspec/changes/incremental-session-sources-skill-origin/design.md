# Design: Incremental Session Sources And Skill Origin

## Pipeline

```text
source resolve/chunk
  -> source item ledger lookup
  -> context economy
  -> AI distill cache lookup
  -> provider call only for uncached valid chunks
  -> envelope/write
  -> wiki/skill curation
  -> semantic review cache
```

The source item ledger is a cache index. It cannot promote knowledge and cannot replace privacy or semantic review.

## Source Item Ledger

Ledger entries live under `.praxisbase/cache/source-items/` and are keyed by a stable hash of:

- source id;
- parser;
- source ref;
- source hash;
- authority mode;
- distill model;
- reducer version/rule-set hash/reduction hash when available.

An entry records processing status, chunk hashes, AI distill cache refs, envelope ids, warnings, and timestamps.

Daily may use a ledger hit only when the referenced distill cache entry exists and parses. Otherwise the item is treated as uncached.

## Source Extensions

`claude-code` uses `claude-code-session`. `opencode` uses `opencode-session`.

Both sources use the local/file adapter first. The implementation must avoid OpenClaw fallback refs for non-OpenClaw agents.

## Skill Origin

PraxisBase-generated skill candidates include YAML frontmatter:

```yaml
---
origin: praxisbase_synthesized
generated_by: praxisbase
source_refs: []
source_hashes: []
---
```

Stable skills without this provenance are classified as external installed skills and are not raw evidence by default.

## OpenHuman Reference Boundary

M22 independently borrows OpenHuman TokenJuice ideas: canonical input shape, builtin/user/project rule overlays, file-inspection pass-through, failure preservation, reducer provenance, and byte-savings reports. It must not copy OpenHuman GPL code.

