# Agent Knowledge Substrate Delta

## ADDED Requirements

### Requirement: Curated Wiki Proposals Must Be Compiled Articles

Curated wiki proposals MUST contain a compiled markdown article with problem/context, action guidance, verification, reusable lessons, and provenance. They MUST NOT be raw logs, raw JSON, reference-only summaries, or copied transcripts.

Stable agent-facing wiki bodies SHOULD use operational sections that make the page directly reusable: `When to Use`, `Symptoms` or `Context`, `What To Do` or the page-kind action section, `Verify`, `Reusable Lessons`, and `Provenance`. The body MUST NOT rely on long machine signature lists, repeated report boilerplate, or source metadata as the primary guidance.

#### Scenario: Missing Core Sections Blocks Promotion

Given a curated wiki proposal has provenance and a safe target path
When its body lacks reusable lessons or an action section
Then promotion quality assessment MUST mark `body_missing_wiki_structure`
And the proposal MUST NOT auto-promote.

#### Scenario: Deterministic Fallback Produces Agent-Usable Sections

Given repeated evidence has actions, verification, and reusable lessons
When deterministic fallback builds a curated wiki body
Then the body SHOULD contain `When to Use`, `Symptoms`, `What To Do`, `Verify`, `Reusable Lessons`, and `Provenance`
And the body MUST NOT include a long comma-separated machine signature applicability line.

### Requirement: Wiki Evidence Must Exclude Operational Noise

The wiki curation evidence pool MUST exclude agent startup/configuration records, system prompt dumps, installed skill listings, status-only fragments, CI success listings with no repair action, and official/reference-only text. These records MAY remain in raw-vault audit storage, but MUST NOT become curated wiki proposals.

#### Scenario: Codex Initialization Is Not Wiki Evidence

Given a Codex memory chunk only describes base instructions, system prompts, sandbox mode, available skills, or session bootstrapping
When PraxisBase builds the wiki evidence pool
Then the item MUST be counted as filtered noise
And no curated wiki proposal MUST be written for that chunk.

### Requirement: Repeated Experience Must Cluster Into Compiled Pages

Repeated evidence with the same stable semantic signature or problem family MUST be clustered into one topic before AI synthesis. Source ids, source hashes, and title phrasing MUST NOT be the primary cluster identity when reusable problem/action signals match.

Page kind selection MUST prefer reusable agent action. Evidence centered on checking status, verifying runner presence, inspecting a dispatch chain, or running health checks SHOULD be planned as `procedure` unless the evidence describes a concrete defect plus repair. Evidence with repeated failures and a reusable fix SHOULD be planned as `known_fix`.

#### Scenario: ACK Timing Evidence Clusters Across Agents

Given OpenClaw and Codex evidence both describe delayed ACK behavior for long-running delegated work
When wiki topics are built
Then they MUST produce one ACK timing topic
And that topic MUST include both source refs and both source hashes.

#### Scenario: Runner Presence Checks Become Procedures

Given repeated evidence says OpenClaw task runner status may be missing
And the reusable action is to verify runner presence before dispatch debugging
When wiki topics are built
Then the topic page kind SHOULD be `procedure`
And the target path SHOULD be under `kb/procedures/`.

### Requirement: Same-Run Target Paths Must Be Deduplicated

Wiki curation MUST NOT write multiple curated proposals for the same stable `target_path` in one run. When multiple synthesized candidates share a target path, curation MUST keep the highest quality candidate and drop the others before review writes proposals.

Quality ranking MUST prefer proposals with no hard blocks, no human-required reasons, higher source count, higher confidence, more actionable page kinds, and fewer failed guards.

#### Scenario: Duplicate Target Keeps Highest Quality Candidate

Given two synthesized proposals target `kb/known-fixes/ack-timing-before-long-running-agent-work.md`
And one has higher source count and confidence
When curation prepares review proposals
Then only one proposal for that target path MUST be written
And it MUST be the higher quality candidate.

### Requirement: Relationship Links Must Survive Synthesis

When the relationship planner supplies required links, the final curated proposal body MUST include those links as `[[slug|label]]`. When suggested links exist and the body contains no wikilinks, the system SHOULD insert a bounded related section using supplied suggested links.

Suggested links to other newly planned pages MUST be limited to candidates that are likely to be promoted in the same run: low-risk page kind, repeated evidence, and confidence at or above the personal promotion threshold. The system MUST NOT insert links from auto-promotable pages to single-source notes, low-confidence candidates, skill/policy targets, or other planned pages expected to stay in human review.

If the AI response is safe but fails non-security quality guards, the system SHOULD retry with deterministic evidence-shaped synthesis and then apply the same promotion quality assessment. Unsafe paths and private material MUST remain hard failures.

#### Scenario: AI Omits Required Relationship Link

Given the AI curator receives a required link to `openclaw-operational-coordination`
When the AI response omits all wikilinks
Then deterministic repair MUST add `[[openclaw-operational-coordination|OpenClaw operational coordination]]`
And promotion quality assessment MUST NOT mark `missing_wikilinks` for that required link.

#### Scenario: Supplied Related Link Must Resolve

Given a stable page has canonical id slug `wiki-asynchronous-task-ux-and-dispatch-mapping-anomalies`
And an AI response only links to `asynchronous-task-ux-and-dispatch-mapping-anomalies`
When deterministic repair runs with the supplied related page context
Then the final proposal MUST include `[[wiki-asynchronous-task-ux-and-dispatch-mapping-anomalies|Asynchronous Task UX and Dispatch Mapping Anomalies]]`
And promotion quality assessment MUST treat unresolved related-only wikilinks as `missing_wikilinks`.

#### Scenario: Human-Gated Planned Pages Are Not Linked From Stable Pages

Given one planned wiki page is low-confidence or single-source
And another planned page is eligible for personal auto-promotion
When relationship links are prepared for synthesis
Then the auto-promotable page MUST NOT receive a suggested wikilink to the human-gated planned page.

#### Scenario: Safe But Weak AI Output Uses Deterministic Fallback

Given the AI curator returns safe markdown with missing actionable guidance
When curation validates the proposal
Then PraxisBase SHOULD rebuild the body from evidence actions, verification, reusable lessons, and provenance
And the rebuilt proposal MUST still pass the normal quality gate before review.

### Requirement: Wiki Graph And Site Must Resolve Link Aliases Safely

The graph resolver and HTML renderer MUST resolve canonical page ids, unambiguous title-slug aliases, and unambiguous path-leaf aliases to the same stable page. Ambiguous aliases MUST remain unresolved rather than linking to the wrong page.

#### Scenario: Older Title-Slug Link Resolves To Canonical Page

Given a page id is `wiki-related-page`
And another page links to `[[related-page|Related page]]`
When the graph and static site are built
Then the graph MUST contain a link to `wiki-related-page`
And the rendered HTML MUST link to `wiki-related-page.html`.

### Requirement: Auto Promotion Is Policy And Quality Gated

Personal mode MAY auto-promote low-risk create or update proposals when quality assessment has no hard blocks and no human-required reasons. Team mode MUST NOT auto-promote by default.

#### Scenario: Personal Low-Risk Update Can Promote

Given a personal curated wiki update improves an existing stable page
And the update has resolver-valid links, provenance, sufficient confidence, and no quality risk notes
When personal review policy runs with promotion enabled
Then the proposal MAY be auto-promoted.

#### Scenario: Team Proposal Remains Review Only

Given a team-scoped curated wiki proposal passes content quality checks
When review policy runs with the default team policy
Then the proposal MUST be reviewed but not promoted automatically.
