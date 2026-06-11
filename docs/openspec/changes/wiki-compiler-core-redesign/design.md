# Wiki Compiler Core Redesign OpenSpec Design

## Pipeline

The wiki compiler SHALL use this conceptual flow:

```text
evidence -> observations -> canonical topics -> page plans -> AI synthesis
         -> deterministic quality gate -> proposal queue -> review/promote
```

Evidence remains immutable input and provenance. The stable wiki is the compiled artifact.

## Observation Extraction

The compiler SHALL normalize useful evidence into `WikiObservation` records. An observation represents a reusable lesson, fix, procedure, decision, preference, incident, pitfall, or note.

The compiler SHALL filter these before observation creation:

- session boot metadata;
- Codex/OpenClaw base instructions;
- provider config and sandbox/approval policy text;
- official docs or API references with no user/agent experience;
- OpenClaw unknown or empty promotion bookkeeping;
- private material rejected by the privacy layer.

The compiler SHALL preserve source refs, source hashes, scope, agent, confidence, and privacy verdict on every observation.

## Canonical Topics

The compiler SHALL cluster observations into canonical topics using deterministic keys derived from:

- normalized problem text;
- normalized action/fix/procedure text;
- entities and tools involved;
- durable signatures;
- target page kind;
- compatible scope.

The compiler MUST NOT use source id or source hash as the primary topic key.

The compiler SHALL union source refs, source hashes, observation ids, entities, and confidence signals into a `WikiTopic`.

Personal observations MUST NOT merge into team/org/global topics unless an explicit review path promotes them.

## Existing Wiki Lookup And Page Plans

Before writing a proposal, the compiler SHALL inspect stable `kb/` and `skills/`.

Lookup signals:

- exact target path;
- normalized title or slug;
- overlapping source hashes;
- frontmatter sources;
- related/wikilink overlap;
- existing deprecated or superseded metadata.

The compiler SHALL produce a `WikiPagePlan` with action:

- `create`: no matching stable page exists;
- `update`: same canonical topic already exists;
- `merge`: multiple candidate/stable pages represent the same topic;
- `supersede`: new evidence contradicts or replaces stale knowledge;
- `archive`: stale/no-longer-valid page should be removed from active use.

When a matching stable page exists, the default action MUST be `update`, not `create`.

## AI Synthesis

AI synthesis SHALL receive:

- the canonical topic;
- observations contributing to that topic;
- existing stable page content when action is `update`, `merge`, or `supersede`;
- summaries of related stable pages;
- required link targets;
- source refs and hashes.

AI output SHALL be a wiki-shaped proposal or patch:

- problem/context;
- applicability;
- procedure/fix/decision;
- failed attempts when useful;
- verification;
- confidence and maturity;
- related pages or wikilinks;
- provenance;
- supersession note when relevant.

AI output MUST NOT be accepted as stable merely because the model returned valid JSON.

## Promotion Quality Gate

The deterministic quality gate SHALL run before proposals can auto-promote and again at promote time for legacy safety.

Hard block reasons:

- unsafe path;
- missing provenance;
- private material;
- raw JSON;
- raw transcript/log body;
- known template fallback text;
- reference-only or system-prompt-only content;
- duplicate source hash creating multiple pages;
- body missing wiki structure;
- `create` action when existing wiki lookup found a canonical page.

Human-required reasons:

- weak single source;
- low confidence;
- unresolved conflict;
- missing wikilinks/related metadata when related pages exist;
- team/org/global scope;
- skill or policy target;
- destructive archive/supersede action.

Personal mode MAY auto-promote only when there are no hard blocks or human-required reasons and the review policy allows the page kind and scope.

## Reports And Site

Curation reports SHALL include:

- evidence count;
- observation count;
- topic count;
- page plan counts by action;
- duplicate source hash groups;
- hard block counts;
- human-required counts;
- written proposal count.

The HTML site SHALL make stable wiki pages primary. It MAY show queue health, but raw evidence and raw candidate counts MUST NOT be presented as the main human-required experience.

## Invariants

- Stable writes still go through existing proposal/review/promote.
- AI cannot override privacy, path, duplicate-source, or quality gates.
- Same input and same mocked AI response produce deterministic topic ids and proposal ids.
- Generated artifacts under `kb/`, `.praxisbase/`, and `dist/` are not committed during implementation unless explicitly requested.

