# LLM Wiki Fidelity Contract OpenSpec Design

## Contract

PraxisBase MUST treat the stable wiki as a compiled artifact, not as a list of evidence summaries. The artifact includes stable pages, root wiki files, source summaries, graph/index outputs, lint reports, and agent context bundles.

## Root Artifacts

The compiler MUST materialize:

- `purpose.md`: wiki goals, audience, scope, and privacy stance.
- `schema.md`: page kinds, frontmatter fields, relationship types, quality gates, and source rules.
- `index.md`: content catalog grouped by page kind/scope/maturity.
- `log.md`: parseable chronological operations.
- `overview.md`: synthesized current map of major clusters and recent changes.

Root artifacts MAY live under `dist/wiki/` initially. They SHOULD be exposed in the HTML site and agent context. They MUST NOT be confused with raw evidence.

## Source Summaries

For each useful, privacy-accepted source, PraxisBase MUST write a source summary record. The source summary MUST include source ref/hash, source kind, scope, summary, entities, topics, observation ids, topic keys, privacy verdict, and contributed stable pages when known.

Source summaries are diagnostic artifacts. They MUST NOT auto-promote as `known_fix`, `procedure`, or other operational guidance.

## Canonical Topics

Canonical topic keys MUST use semantic identity:

1. entities;
2. problem/action/outcome terms;
3. page kind;
4. scope;
5. explicit non-source signatures;
6. AI-proposed merge key only after deterministic validation.

Source id, source hash, run id, and title phrasing MUST NOT be primary topic identity. Hard-coded families MAY remain as boosters, but they are not enough for the long-term compiler.

## Lifecycle

Compiled pages and proposals SHOULD carry:

- `page_kind`;
- `confidence`;
- `source_count`;
- `maturity`;
- `lifecycle`;
- `last_confirmed_at`;
- `supersedes`;
- `superseded_by`;
- `sources`;
- `relationship_types`.

`lifecycle` values are `active`, `stale`, `superseded`, and `archived`.

## Typed Graph

Graph edges SHOULD carry one of:

- `related`;
- `uses`;
- `depends_on`;
- `fixes`;
- `caused_by`;
- `verified_by`;
- `contradicts`;
- `supersedes`;
- `same_topic_as`;
- `source_overlap`.

The graph remains JSON and static-site friendly. No graph database is required.

## Query Crystallization

When a query answer contains durable synthesis, PraxisBase SHOULD be able to save it as a `synthesis` proposal. It MUST go through normal source summary, topic planning, quality gate, review, and promote flow.

## Fidelity Lint

Fidelity lint MUST produce machine-readable findings for:

- missing root artifacts;
- missing source summaries;
- raw-copy pages;
- source-summary pages promoted as guidance;
- missing provenance;
- unresolved wikilinks;
- unresolved typed edges;
- orphan pages;
- duplicate topics;
- stale pages;
- superseded pages still marked active;
- contradiction conflicts;
- missing agent-use section.

CI and daily smoke SHOULD be able to fail on selected fidelity lint severities.

## Agent Access

Default agent access remains Skill plus CLI. Optional MCP MAY expose the same compiled wiki. Agent context MUST prefer:

1. relevant compiled stable pages;
2. root artifact snippets;
3. graph neighbors;
4. provenance pointers;
5. source summaries only for audit or ambiguity.

Raw-vault bodies MUST NOT be returned by default.

## Golden Corpus Smoke

The golden smoke MUST verify compounding:

- useful evidence count is greater than promoted page count;
- at least one promoted/proposed page has more than one source;
- source summaries exist;
- root artifacts exist;
- typed graph edges exist when pages are related;
- agent context can answer from compiled pages;
- fidelity lint catches seeded failures.

