# LLMHTML Agent Knowledge Substrate Design

Date: 2026-05-17

## Purpose

LLMHTML should become an agent-native shared knowledge substrate, not only a self-updating wiki. Its first production scenario is OpenClaw sandbox repair: many temporary or persistent agents must retrieve the latest repair knowledge, apply it inside a sandbox, and feed new experience back into the shared substrate. The same protocol should also support a future K8s incident analysis system, Feishu bots, Hermes-like persistent agents, and other temporary agents.

The core product promise is:

> Any agent can enter a workspace, retrieve the right knowledge and skills, do useful work, and leave behind structured experience that can be reviewed, promoted, and redistributed to the next agent.

## Design Principles

- Agents are peers. Temporary repair agents, persistent OpenClaw bots, Feishu bots, Hermes runners, and K8s analysis systems all use the same read/write protocol.
- Human review is by exception. AI reviewer agents handle routine review and automatic promotion; people see only risky, uncertain, or failed items.
- Git is the authority layer, not the whole runtime. It stores stable knowledge, audit history, reviews, and release artifacts, while raw logs and high-volume sources can remain in external systems.
- The MVP uses static generated indexes and bundles. External search services, vector databases, queues, and daemons are later scaling options.
- Large raw logs do not belong in Git. Store summaries, source URIs, hashes, and provenance in Git; keep raw logs in the existing log platform or object storage.
- OpenClaw repair is the first proof. K8s incident analysis reuses the same object model and interface.

## Architecture

LLMHTML uses a federated Git-backed architecture:

```text
Sources and Events
  OpenClaw sandbox logs, repair triggers, Feishu messages, tickets,
  K8s events, docs, postmortems
        |
        v
Agent Peers
  temporary repair agents, persistent OpenClaw bots, Feishu bots,
  Hermes curator, K8s incident system
        |
        v
LLMHTML Protocol
  file protocol + CLI + future MCP wrapper
        |
        v
Git-backed Authority Layer
  stable notes, procedures, known fixes, skills, policies, reviews
        |
        v
Generated Retrieval Layer
  kb-index.json, search-index.json, repair bundles, HTML, llms.txt
```

This is not a blockchain design. Git already provides the important properties needed here: version history, signed commits if desired, review trail, diffability, and rollback. A blockchain would add operational complexity without solving the main trust problem, because these agents run inside one organization or a trusted personal environment.

The topology is also not a single central agent brain. It is a shared substrate: the Git repository is authoritative, but agents remain peer clients. A persistent OpenClaw bot may run more often than a temporary agent, but it does not own the knowledge graph.

## Knowledge Carrier

Use different storage surfaces for different data lifecycles:

| Layer | Carrier | Contents |
| --- | --- | --- |
| Authority | GitLab for teams, GitHub for personal repos | Stable notes, procedures, known fixes, skills, decisions, policies, reviewed memories, AI reviews |
| Raw experience | Existing log platform, object storage, or ticket systems | Full OpenClaw logs, K8s logs, large traces, Feishu message exports |
| Protocol state | Files under `.llmhtml/` | Inbox episodes, proposals, reviews, policies, schedules, generated indexes |
| Retrieval artifacts | Generated JSON and HTML | Repair bundles, search indexes, HTML site, `llms.txt` |
| Edge cache | Local checkout or downloaded bundle | Compact context for temporary repair agents |

Team deployments should default to GitLab self-managed because it fits scheduled pipelines, Pages, merge requests, and internal access control. Personal deployments can use GitHub Actions and GitHub Pages.

## Directory Protocol

The repository should expose a stable file protocol:

```text
.llmhtml/
  config.yaml
  schedules.yaml
  policies/
    autonomy.yaml
    risk-rules.yaml
  inbox/
    episodes/
    proposals/
    reviews/
  indexes/
    kb-index.json
    search-index.json
  bundles/
    openclaw-sandbox.json
    k8s-incident.json

kb/
  notes/
  procedures/
  known-fixes/
  decisions/
  memory/
  sources/

skills/
  openclaw/
    auth-repair/SKILL.md
    workspace-repair/SKILL.md
  k8s/
    incident-triage/SKILL.md

dist/
  index.html
  llms.txt
  kb-index.json
  repair-bundles/
```

`.llmhtml/` is the agent protocol layer. Temporary agents should be able to use this without understanding the whole wiki.

`kb/` is the stable knowledge layer. It stores reviewed Markdown/YAML objects.

`skills/` is the executable knowledge layer. It should remain compatible with `SKILL.md`-style ecosystems so OpenClaw, Hermes, Codex, and other agents can consume it.

`dist/` is the published inspection layer for humans and agents.

## Object Model

### Episode

An episode records one agent run. For OpenClaw repair, each repair attempt should create one episode.

```json
{
  "id": "episode_20260517_abc",
  "type": "repair_episode",
  "scope": "team",
  "agent_id": "openclaw-temp-xyz",
  "problem_signature": "openclaw:claude-auth-expired",
  "result": "success",
  "used_skills": ["skills/openclaw/auth-repair/SKILL.md"],
  "used_objects": ["kb/known-fixes/openclaw-auth-expired.md"],
  "source_refs": ["log://openclaw/sandbox-123/run-456"],
  "summary": "Refreshed Claude auth state and restarted the agent session.",
  "created_at": "2026-05-17T10:00:00Z"
}
```

Episodes are append-only input to the learning system. They can be summarized or superseded, but the original episode record should remain auditable.

### Problem Signature

A problem signature is a normalized fault label used for retrieval and clustering:

```text
openclaw:claude-auth-expired
openclaw:workspace-lock-stuck
openclaw:node-runtime-missing
k8s:pod-crashloop-imagepull
k8s:ingress-5xx-upstream-timeout
```

Signatures do not need to be perfect on first detection. They can be merged or aliased by curator proposals later.

### Known Fix

A known fix is a short, stable repair unit:

```markdown
---
id: openclaw-auth-expired
type: known_fix
scope: team
risk: medium
status: published
signatures:
  - openclaw:claude-auth-expired
skills:
  - skills/openclaw/auth-repair/SKILL.md
sources:
  - uri: log://openclaw/sandbox-123/run-456
    hash: sha256:example
confidence: 0.84
updated_at: 2026-05-17T10:00:00Z
---

## Symptoms

Claude Code reports that authentication expired or the OpenClaw session cannot call the model.

## Diagnosis

Check the local auth state, recent OpenClaw logs, and whether the sandbox can reach the configured model gateway.

## Fix

Refresh auth state, restart the agent session, and retry a minimal model call.

## Verification

Run a minimal agent command and confirm it can complete without auth errors.

## Rollback

Restore the previous auth state snapshot if the refresh makes the session worse.
```

### Procedure

A procedure is a longer diagnostic or remediation workflow. It can reference known fixes and skills.

### Skill

A skill is an agent-facing instruction document. It should include when to use it, required context, commands, verification, and rollback guidance.

### Proposal

A proposal is an agent's suggested update to stable knowledge. It can create, patch, archive, or link objects.

### Review

A review records the independent reviewer agent's decision, confidence, risk classification, and merge result.

### Repair Bundle

A repair bundle is a generated context package for temporary agents. It is not the source of truth. It contains the compact subset of procedures, skills, known fixes, forbidden operations, diagnostic commands, verification steps, and source references relevant to a scenario or problem signature.

## OpenClaw Repair Flow

1. A sandbox repair is triggered by a health check, monitor, Feishu command, manual button, or webhook.
2. A repair agent starts in the sandbox. It can be temporary or persistent.
3. The agent gathers local signals: log excerpts, OpenClaw status, Claude Code status, recent commands, environment version, and error stack.
4. The agent calls:

   ```bash
   llmhtml repair-context openclaw --logs /path/to/logs --json
   ```

5. LLMHTML returns a compact repair bundle: likely problem signature, relevant known fixes, skills, procedures, diagnostic commands, verification steps, and forbidden operations.
6. The agent repairs the sandbox and verifies the outcome.
7. The agent submits an episode:

   ```bash
   llmhtml episode submit episode.json
   ```

8. If the run produced reusable learning, the agent submits a proposal:

   ```bash
   llmhtml propose proposal.json
   ```

9. Reviewer agents process proposals. Routine updates auto-merge; risky or uncertain changes enter the human exception queue.
10. Build regenerates indexes, repair bundles, HTML, and `llms.txt`.

The important property is that every repair is a learning opportunity, but stable shared knowledge changes only through the proposal and review path.

## K8s Incident Flow

The K8s incident system reuses the same protocol:

1. Scheduled ingest pulls tickets, Feishu messages, docs, postmortems, alerts, and K8s event summaries.
2. The incident system, whether implemented with Agent SDK or a procedural AI workflow, retrieves context through LLMHTML.
3. It produces a root-cause hypothesis, evidence summary, suggested runbook, and response text for the Feishu bot.
4. The run submits an episode.
5. New patterns or runbook improvements become proposals.
6. AI review and promotion update shared K8s knowledge and bundles.

The design does not force a choice between Agent SDK and procedural AI orchestration. Both are peer clients of LLMHTML.

## Interfaces

### File Protocol

Any agent can read stable knowledge and generated bundles from the repository. Temporary repair agents can write only inbox objects by default:

```text
.llmhtml/inbox/episodes/*.json
.llmhtml/inbox/proposals/*.json
```

Stable objects under `kb/` and `skills/` are written only by reviewer, promoter, or curator roles.

### CLI

The CLI is the first implementation surface:

```bash
llmhtml init
llmhtml search "claude auth expired" --scope openclaw --json
llmhtml read known_fix openclaw-auth-expired
llmhtml repair-context openclaw --logs /path/to/logs --json
llmhtml episode submit episode.json
llmhtml propose proposal.json
llmhtml review --auto
llmhtml promote --auto
llmhtml curate --profile openclaw
llmhtml build
llmhtml check
```

### MCP

MCP should be a thin wrapper over the same core and can be added after the CLI and file protocol are stable:

- `search_knowledge`
- `read_object`
- `get_repair_context`
- `submit_episode`
- `propose_update`
- `review_proposals`
- `list_skills`
- `get_skill`

### Agent Environment

Agents should receive these environment variables:

```text
LLMHTML_ROOT=/path/to/repo-or-bundle
LLMHTML_AGENT_ID=openclaw-temp-xyz
LLMHTML_MODE=episode_writer
LLMHTML_SCOPE=team
```

Suggested modes:

- `read_only`
- `episode_writer`
- `proposal_writer`
- `reviewer`
- `curator`

## Autonomy And Review

LLMHTML uses D-lite autonomy: simple rules classify risk, an independent reviewer agent checks proposals, and humans intervene only for exceptions.

The default mode is:

```yaml
autonomy:
  mode: ai_automerge_with_human_exceptions
  reviewer:
    min_confidence: 0.75
    require_independent_context: true
  auto_merge:
    low: true
    medium: true
    high: false
  human_required_for:
    - delete
    - rewrite_policy
    - enable_new_default_skill
    - modify_permissions
    - reduce_safety_checks
```

Low-risk changes can auto-merge:

- episode summaries
- source reference additions
- typo, tag, and link fixes
- personal memory
- new known fixes kept in `draft` status

Medium-risk changes can auto-merge after AI reviewer approval:

- new team notes
- known fixes promoted to `published`
- small procedure patches
- skill documentation additions
- additional successful cases for an existing fault signature

High-risk changes enter the human exception queue:

- deleting or rewriting decisions, procedures, or skills
- enabling a new default repair skill
- changing security policy, permissions, runners, or connectors
- reducing verification requirements
- touching credentials or production-change rules
- reviewer confidence below threshold
- conflict between generator and reviewer
- failed `llmhtml check` or build

Automatic merge requires:

1. provenance: episode id, source URI, log hash, ticket id, or document reference
2. independent reviewer approval
3. reviewer confidence above threshold
4. successful `llmhtml check`
5. no `manual_required` rule hit
6. verification and rollback sections for skill or procedure changes

MRs and commits are audit units, not default human approval units. Medium-risk MRs can be created, reviewed by AI, and merged automatically. Humans see only the exception queue with the reason, reviewer judgment, risk rule, and recommended action.

## Scheduling And Triggering

LLMHTML separates event-triggered repair from scheduled knowledge maintenance.

### Event Triggers

OpenClaw repair should not wait for cron. It is triggered by:

- sandbox health checks
- monitoring alerts
- Feishu bot commands
- manual repair buttons
- webhooks
- a polling repair launcher if no event system exists yet

The event starts a repair agent, which retrieves context, repairs, submits an episode, and optionally submits a proposal.

### Scheduled Tasks

Scheduled maintenance is declarative:

```yaml
# .llmhtml/schedules.yaml
schedules:
  - id: ingest-openclaw-logs
    task: ingest
    profile: openclaw
    cron: "*/30 * * * *"
    runner: gitlab-ci

  - id: review-proposals
    task: review
    mode: auto
    cron: "*/15 * * * *"
    runner: gitlab-ci

  - id: promote-approved
    task: promote
    mode: auto
    cron: "*/15 * * * *"
    runner: gitlab-ci

  - id: curate-knowledge
    task: curate
    profile: openclaw
    cron: "0 3 * * *"
    runner: gitlab-ci

  - id: ingest-k8s-sources
    task: ingest
    profile: k8s
    cron: "0 */2 * * *"
    runner: gitlab-ci
```

The runner executes CLI tasks:

```bash
llmhtml run ingest --profile openclaw
llmhtml run review --auto
llmhtml run promote --auto
llmhtml run curate --profile openclaw
llmhtml build
```

Team MVP should use GitLab Scheduled Pipelines. Personal deployments can use GitHub Actions or local cron. A Hermes runner or `llmhtml-daemon` can be added later for persistent scheduling.

To avoid write conflicts, write jobs should use a single write lock, such as GitLab `resource_group: llmhtml-write`. Episodes and proposals are independent files, so many agents can submit without editing the same stable object.

## Retrieval And Indexing

The retrieval interface is required, but the MVP implementation should be static generated artifacts:

- `.llmhtml/indexes/kb-index.json`
- `.llmhtml/indexes/search-index.json`
- `.llmhtml/bundles/openclaw-sandbox.json`
- `dist/repair-bundles/openclaw-sandbox.json`

This is enough for dozens of repair runs per day and a growing number of sandboxes, as long as repair concurrency remains moderate. External search services become useful only when:

- objects or episodes grow to very large scale
- many sandboxes query simultaneously
- near-real-time search after write is required
- cross-repository search is needed
- semantic or vector retrieval becomes important

External Meilisearch, Typesense, SQLite service, ClickHouse, or vector search should remain Phase 2+ options.

## Hermes Integration

Hermes should be a first-class peer client, not the LLMHTML core.

Hermes can act as:

- persistent curator: consolidate duplicate proposals, detect stale skills, suggest cleanup
- skill consumer: load `skills/**/*.md`
- memory peer: export relevant Hermes memory changes into LLMHTML episodes or proposals
- runner: periodically trigger review, promote, curate, and build tasks

This keeps LLMHTML agent-neutral while still allowing Hermes-like self-learning behavior.

## MVP Scope

MVP must include:

- file protocol under `.llmhtml/`, `kb/`, and `skills/`
- core object schemas for episode, proposal, review, known fix, procedure, skill, and policy
- CLI for search, read, repair-context, episode submit, propose, review, promote, build, and check
- OpenClaw repair bundle generation
- D-lite AI review and automatic promotion
- static indexes and bundles
- GitLab scheduled pipeline template
- HTML inspection output

## MVP Readiness Additions

The architecture above is not enough by itself. To make the MVP operational for real OpenClaw sandboxes, the first version also needs the following practical pieces.

### Agent Identity And Trust

Every submitted episode or proposal must include:

- `agent_id`
- `agent_type`: temporary repair agent, persistent bot, reviewer, curator, or system ingest
- `environment_id`: sandbox id, cluster id, or source system id
- `scope`: personal, project, team, or global
- `run_id`
- `submitted_at`

Temporary sandbox agents should not need broad Git credentials. The MVP should support at least one low-friction submission path:

- local file drop when the agent runs in a checkout
- Git branch or MR submission with a restricted bot token
- HTTP webhook submission gateway as an optional adapter

The gateway can be small, but the protocol must not assume that every sandbox can push directly to the authority repository.

### Bundle Distribution

Repair agents need a reliable way to fetch the latest context before repair:

```bash
llmhtml bundle fetch openclaw --signature openclaw:claude-auth-expired
```

MVP distribution can use GitLab Pages or CI artifacts:

- `dist/repair-bundles/openclaw-sandbox.json`
- `dist/repair-bundles/openclaw/<signature>.json`
- `dist/repair-bundles/manifest.json`

The manifest should include bundle version, commit SHA, generated time, compatible CLI version, and checksum. Agents should cache the last known good bundle and fall back to it if the latest bundle cannot be fetched.

### Submission Queue And Retry

Event repair and scheduled promotion are decoupled. A repair run should never fail just because the knowledge repo is temporarily unavailable.

MVP should allow agents to write a local outbox:

```text
.llmhtml/outbox/
  episodes/
  proposals/
```

A later sync step can submit these objects. Each object needs an idempotency key so retrying does not create duplicate learning records.

### Evidence Contract

Auto-promotion depends on evidence. Proposals should be rejected or kept in draft when they lack evidence.

Minimum evidence fields:

- source URI or log reference
- hash of the referenced source excerpt or raw object
- short quoted or summarized evidence excerpt
- repair result: success, failed, partial, or unknown
- verification command or verification observation

For privacy, the evidence excerpt should be redacted before entering Git.

### Evaluation And Success Metrics

The MVP needs basic metrics to know whether self-learning is helping:

- repair success rate by problem signature
- number of repeated failures before and after a known fix
- average repair duration
- proposal approval rate
- reviewer auto-merge rate
- human exception rate
- stale or unverified skill count

These can be generated as JSON and rendered in the HTML inspection output. A full dashboard is not required.

### Cold Start Knowledge

The system needs seed content before it can help repair agents. MVP should include a small seed pack:

- 5 to 10 common OpenClaw sandbox problem signatures
- baseline diagnostic procedure
- sandbox safety policy
- one or two example repair skills
- one example episode and proposal

This makes the first `repair-context` useful and gives future agents examples of the expected object shape.

### Conflict Handling

Multiple proposals may touch the same known fix or skill. MVP can use simple conflict rules:

- episodes never conflict because they are append-only
- proposals are independent files
- promotion locks writes through GitLab `resource_group`
- if two approved proposals patch the same object and the patch fails, the later one returns to the review queue with `conflict`

### Reviewer Configuration

Reviewer behavior must be configurable:

- model provider and fallback
- confidence threshold
- max proposals per run
- allowed auto-merge risk levels
- required checks
- prompt template version

The review result should record the reviewer model, prompt version, confidence, risk level, and reason.

### Safety Boundary For Repair Agents

LLMHTML provides repair knowledge; it should not silently grant execution authority. Each repair bundle must include:

- allowed action class
- forbidden operations
- verification steps
- rollback steps
- escalation condition

For OpenClaw sandboxes, the MVP can allow repair actions inside the sandbox but should mark production-impacting actions as high risk or out of scope.

### Compatibility And Versioning

The file protocol needs a version field from the start:

```yaml
protocol_version: 0.1
```

Bundles, episodes, proposals, reviews, and skills should record the protocol version they target. This prevents older temporary agents from misreading newer bundle formats.

MVP should not include:

- blockchain
- external search service
- mandatory vector database
- complex multi-tenant permissions
- full MCP server implementation
- full Hermes runner implementation
- storing all raw logs in Git
- fully automatic production-changing actions outside the repair agent's own sandbox authority

## Phasing

### Phase 0: Reframe Documentation

Update project docs from "self-updating wiki" to "agent knowledge substrate". Keep the existing Markdown-to-HTML idea as the publishing layer.

### Phase 1: OpenClaw Repair Closed Loop

Implement file protocol, CLI, OpenClaw repair context retrieval, episode submission, proposal submission, AI review, promotion, generated bundles, and HTML inspection.

### Phase 2: K8s Incident System

Add K8s ingest profiles, incident bundles, Feishu bot response workflow, and runbook proposal flow.

### Phase 3: Thin MCP Server And Hermes Runner

Wrap the stable core with MCP tools and add Hermes as a persistent curator or scheduler.

### Phase 4: Federation And Scaling

Support multiple repositories, external search backends, stronger access policies, signed provenance, and cross-team synchronization.

## Implementation Planning Inputs

The following decisions are intentionally fixed for the MVP:

- Use GitLab as the default team authority layer and GitHub as the default personal authority layer.
- Use static generated search and bundle artifacts before introducing external indexes.
- Use AI-reviewed auto-merge with human exceptions.
- Treat OpenClaw sandbox repair as the first production scenario.
- Keep K8s incident analysis on the same protocol instead of building a separate knowledge system.

The implementation plan should decide concrete schemas, CLI package boundaries, reviewer prompt templates, and the exact GitLab CI template.
