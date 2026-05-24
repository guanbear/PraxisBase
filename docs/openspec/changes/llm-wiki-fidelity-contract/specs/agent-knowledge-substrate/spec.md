# Agent Knowledge Substrate Delta

## ADDED Requirements

### Requirement: Wiki Must Expose Root Artifacts

PraxisBase MUST generate or maintain root wiki artifacts for `purpose`, `schema`, `index`, `log`, and `overview`. These artifacts MUST be accessible to the static site and agent context.

#### Scenario: Root artifacts are generated

Given PraxisBase has at least one stable compiled wiki page
When the wiki site is built
Then `dist/wiki/index.md` MUST exist
And `dist/wiki/log.md` MUST exist
And `dist/wiki/purpose.md` MUST exist
And `dist/wiki/schema.md` MUST exist
And `dist/wiki/overview.md` MUST exist.

### Requirement: Source Summaries Are Traceability, Not Guidance

PraxisBase MUST write source summary records for useful privacy-accepted sources. Source summary records MUST NOT auto-promote as operational guidance pages.

#### Scenario: Useful source writes a source summary

Given a Codex memory contains a reusable verified agent lesson
When wiki curation runs
Then a `wiki_source_summary` record MUST be written with source ref and source hash
And the source summary MUST reference any produced observation ids or topic keys.

#### Scenario: Source summary does not become a known fix

Given a source summary exists for a raw source
When review policy evaluates promotable wiki candidates
Then the source summary MUST NOT be promoted as a `known_fix` or `procedure`.

### Requirement: Canonical Topics Must Be Semantic

Canonical topic identity MUST be based on entities, problem/action/outcome signatures, page kind, scope, and validated explicit signatures. Source id, source hash, run id, and title phrasing MUST NOT be primary topic identity.

#### Scenario: Same lesson from different agents becomes one topic

Given Codex and OpenClaw evidence describe the same reusable ACK timing lesson with different titles
When PraxisBase builds canonical topics
Then one topic MUST be produced
And that topic MUST include both source refs and both source hashes.

### Requirement: Compiled Pages Must Carry Lifecycle Metadata

Compiled wiki proposals SHOULD carry page kind, confidence, source count, maturity, lifecycle, last confirmation, supersession, provenance, and relationship metadata.

#### Scenario: Proposal includes lifecycle fields

Given a curated wiki proposal is created from useful evidence
When the proposal is validated
Then it SHOULD include `lifecycle`
And it SHOULD include `last_confirmed_at`
And it SHOULD include `confidence`
And it MUST include provenance.

### Requirement: Graph Edges Should Be Typed

PraxisBase SHOULD emit typed graph edges for wikilinks, source overlap, supersession, contradiction, verification, and dependency relationships.

#### Scenario: Wikilink edge has type

Given page A links to page B using a resolver-valid wikilink
When the wiki graph is built
Then the edge from A to B SHOULD have type `related`.

#### Scenario: Shared provenance creates source overlap edge

Given page A and page B share a source hash
When the wiki graph is built
Then the graph SHOULD include a `source_overlap` edge between them.

### Requirement: Fidelity Lint Must Detect Wiki Drift

PraxisBase MUST provide machine-readable fidelity lint findings for root artifact coverage, source summary coverage, raw-copy pages, source-summary promotion, missing provenance, unresolved links, orphan pages, stale or superseded conflicts, and missing agent-use sections.

#### Scenario: Raw-copy page is linted

Given a stable wiki page body is mostly raw JSON or transcript text
When fidelity lint runs
Then it MUST report `raw-copy-page`.

#### Scenario: Superseded active page is linted

Given a page has `superseded_by` set
And its lifecycle is still `active`
When fidelity lint runs
Then it MUST report `stale-or-superseded-conflict`.

### Requirement: Agent Context Must Prefer Compiled Wiki

Agent context retrieval MUST prefer compiled stable pages, root artifact snippets, graph neighbors, and provenance pointers. Raw-vault bodies MUST NOT be returned by default.

#### Scenario: Agent gets compiled context

Given the wiki contains a compiled ACK timing procedure
And raw evidence exists for that procedure
When an agent requests context for "ACK timing"
Then the context MUST include the compiled procedure
And it SHOULD include root artifact hints
And it SHOULD include provenance pointers
And it MUST NOT include raw transcript bodies by default.

### Requirement: Golden Corpus Must Prove Compounding

PraxisBase MUST have a controlled smoke corpus that proves repeated evidence compiles into fewer durable pages, produces source summaries, builds root artifacts, emits typed graph edges, and catches fidelity lint failures.

#### Scenario: Golden corpus compiles repeated evidence

Given the golden corpus has multiple evidence items about the same agent lesson
When curation, review, promotion, graph, site, and lint run
Then the number of useful evidence items MUST be greater than the number of stable wiki pages produced for that lesson
And at least one wiki page SHOULD have more than one source.

