# Agent Knowledge Substrate Delta

## ADDED Requirements

### Requirement: Curated Wiki Proposals Must Be Compiled Articles

Curated wiki proposals MUST contain a compiled markdown article with problem/context, action guidance, verification, reusable lessons, and provenance. They MUST NOT be raw logs, raw JSON, reference-only summaries, or copied transcripts.

#### Scenario: Missing Core Sections Blocks Promotion

Given a curated wiki proposal has provenance and a safe target path
When its body lacks reusable lessons or an action section
Then promotion quality assessment MUST mark `body_missing_wiki_structure`
And the proposal MUST NOT auto-promote.

### Requirement: Relationship Links Must Survive Synthesis

When the relationship planner supplies required links, the final curated proposal body MUST include those links as `[[slug|label]]`. When suggested links exist and the body contains no wikilinks, the system SHOULD insert a bounded related section using supplied suggested links.

#### Scenario: AI Omits Required Relationship Link

Given the AI curator receives a required link to `openclaw-operational-coordination`
When the AI response omits all wikilinks
Then deterministic repair MUST add `[[openclaw-operational-coordination|OpenClaw operational coordination]]`
And promotion quality assessment MUST NOT mark `missing_wikilinks` for that required link.

### Requirement: Auto Promotion Is Policy And Quality Gated

Personal mode MAY auto-promote low-risk create proposals only when quality assessment has no hard blocks and no human-required reasons. Team mode MUST NOT auto-promote by default.

#### Scenario: Team Proposal Remains Review Only

Given a team-scoped curated wiki proposal passes content quality checks
When review policy runs with the default team policy
Then the proposal MUST be reviewed but not promoted automatically.
