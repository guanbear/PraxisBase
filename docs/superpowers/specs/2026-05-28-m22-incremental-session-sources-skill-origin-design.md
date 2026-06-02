# M22 Incremental Session Sources And Skill Origin Design

## Problem

PraxisBase personal runs can already cache AI distill by chunk hash, but real agent session sources still cost too much operationally:

- repeated runs rescan the same session files before discovering cached chunks;
- wiki and skill semantic review can repeat model calls for unchanged candidates;
- Claude Code is only partially modeled as a source, and OpenCode is not modeled as a source;
- stable `skills/**/SKILL.md` files do not clearly distinguish PraxisBase-synthesized skills from externally installed skills;
- OpenHuman-style context economy exists, but it does not yet have source-specific Claude Code/OpenCode rules or a source item ledger.

M22 makes the personal pipeline more incremental and more explicit without changing promotion quality gates.

## Goals

- Avoid repeated AI work for already analyzed session data.
- Add first-class Claude Code and OpenCode experience sources.
- Mark PraxisBase-synthesized skills with stable origin/provenance metadata.
- Keep external installed skills out of raw evidence by default.
- Borrow OpenHuman TokenJuice principles at the design level: canonicalize source items, apply layered deterministic compression before LLM calls, include reducer identity in cache keys, and report savings.

## Non-Goals

- Do not lower privacy, semantic review, or promote thresholds to increase output.
- Do not make GBrain, AgentMemory, MCP, or embeddings mandatory for M22.
- Do not import GPL OpenHuman code. PraxisBase may independently implement the same architectural ideas.
- Do not treat externally installed Codex/OpenCode skills as evidence of user experience unless explicitly imported later.
- Do not commit raw session transcripts, local personal data, or generated local `dist/` output.

## Architecture

M22 adds one new governance layer and two source extensions:

```text
source adapters
  -> source item ledger check
  -> context reducer
  -> chunking
  -> AI distill cache
  -> envelope/write
  -> wiki/skill curation
  -> semantic review cache
  -> reviewed wiki/skills
```

The source item ledger is not the authority for stable knowledge. It is an optimization and audit index for whether the exact source item, parser, reducer rules, authority mode, and model have already been processed.

## Incremental Ledger

PraxisBase writes a JSON ledger under `.praxisbase/cache/source-items/`. Each entry records:

- source id, source name, source agent, source type, parser, and source ref;
- source hash and optional chunk hashes;
- reducer version, reducer rule-set hash, and reduction hash when context economy ran;
- authority mode and distill model;
- status: `distilled`, `blocked`, `failed`, or `skipped`;
- cache refs for AI distill entries and generated envelope ids;
- timestamps and warnings.

The ledger lets daily runs skip unchanged items earlier than provider calls. It must be conservative:

- if source hash changes, reprocess;
- if reducer version/rules change, reprocess;
- if model changes, reprocess distill;
- if authority mode changes, reprocess privacy and distill;
- if a previous entry failed, skip only when `--retry-failed-distill-only` is not requested and existing behavior already skips it.

AI distill cache remains the source of truth for model output reuse. The ledger is a fast index, not a replacement for cache validation.

## Semantic Review Cache

Wiki and skill semantic review calls are cached by:

- review prompt version or policy version;
- model;
- authority mode;
- candidate id and normalized candidate content hash;
- target path and source hashes.

Cached approvals may be reused only when the candidate content and source hashes are unchanged. Cached rejection/needs-human decisions may be reused to avoid repeated token spend, but the UI/report must still show the item as requiring review.

## Source Support

### Claude Code

Claude Code sources use:

- agent: `claude-code`;
- parser: `claude-code-session`;
- default candidate paths detected by bootstrap/personal connect only when they exist locally;
- source refs shaped as `logs://<source-name>/<item-id>`.

The parser should accept JSON, JSONL, Markdown, text, and log files using the existing local source adapter. The reducer preserves user goal, commands, file edits, tool failures, test output, final answer, and explicit lessons.

### OpenCode

OpenCode sources use:

- agent: `opencode`;
- parser: `opencode-session`;
- local path-based source support first;
- source refs shaped as `raw-vault://opencode/<item-id>` or `logs://<source-name>/<item-id>` consistently in source and chunk code.

OpenCode is initially a source and distill input. AgentMemory export for OpenCode can be enabled only if the AgentMemory adapter accepts the agent type and has tests.

## Skill Origin

Stable skills are classified as:

- `praxisbase_synthesized`: generated or promoted by PraxisBase from reviewed evidence;
- `external_installed`: any skill found on disk without PraxisBase provenance frontmatter;
- `unknown`: malformed or legacy skill where origin cannot be determined.

PraxisBase-synthesized `SKILL.md` content must include frontmatter or an equivalent machine-readable provenance block:

```yaml
---
origin: praxisbase_synthesized
generated_by: praxisbase
source_refs:
  - raw-vault://codex/session-1
source_hashes:
  - sha256:...
review_id: review_...
promoted_at: "2026-05-28T00:00:00.000Z"
---
```

External installed skills are not raw evidence by default. They may be listed as capability inventory and used as context for skill matching, but they do not create wiki pages or new skills unless a future explicit import command marks them as evidence.

## OpenHuman Borrowing Boundary

PraxisBase borrows these TokenJuice lessons:

- canonicalize inputs before reduction;
- layer builtin, user, and project rules;
- pass through small or file-inspection outputs;
- preserve failure tails and provenance;
- include rule identity in cache keys;
- report byte savings and rule hits.

PraxisBase does not copy OpenHuman GPL code or vendor rules. M22 only adds independent TypeScript rules and tests.

## Acceptance Criteria

- Re-running daily on unchanged local sessions should report cache/ledger reuse and avoid new distill calls.
- Adding a new session should distill only the new uncached session under `--max-ai-chunks`.
- `source add` accepts `--agent claude-code` and `--agent opencode` with the correct default parser.
- Personal/bootstrap detection can connect local Claude Code and OpenCode paths when present.
- PB-generated skill candidates and promoted skills include machine-readable origin/provenance.
- External installed skills are distinguishable and not used as raw wiki evidence.
- Focused tests cover schema, source config, daily cache behavior, reducer source rules, and skill origin.

