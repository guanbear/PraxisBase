# Daily Agent Experience Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build M14 so PraxisBase can run a daily personal or team agent experience loop from configured sources into the existing wiki, static site, and agent context surfaces.

**Architecture:** Add a user-facing source registry and daily orchestrator above the existing harvest pipeline. Normalize Codex, OpenClaw, and Claude Code inputs into `ExperienceEnvelope` records, enforce mode-specific privacy before proposal generation, then reuse wiki compile, review, promote, build-site, Git, generated Skill, and optional MCP paths.

**Tech Stack:** TypeScript, Node.js, Commander CLI, Zod schemas, file-protocol storage, Git CLI, GitLab CI YAML templates, Node's built-in `node:test` through the existing `pnpm check` pipeline, Playwright e2e for static HTML smoke.

---

## Scope And File Map

Create:

- `packages/core/src/experience/source-config.ts`: read/write/list/remove source configs and validate no credentials are stored.
- `packages/core/src/experience/source-adapters.ts`: resolve configured sources into redacted `ExperienceEnvelope` records.
- `packages/core/src/experience/privacy-policy.ts`: mode-specific privacy verdicts for personal and team runs.
- `packages/core/src/experience/daily.ts`: daily orchestrator over sources, envelopes, ingest, wiki compile, build-site, context smoke, Git action, and report writing.
- `packages/cli/src/commands/source.ts`: `praxisbase source add/list/remove/doctor`.
- `packages/cli/src/commands/daily.ts`: `praxisbase daily init/run/doctor/schedule`.
- `tests/core/experience-source-config.test.ts`
- `tests/core/experience-source-adapters.test.ts`
- `tests/core/experience-privacy-policy.test.ts`
- `tests/core/experience-daily.test.ts`
- `tests/cli/source-command.test.ts`
- `tests/cli/daily-command.test.ts`
- `tests/ci/gitlab-daily-ci.test.ts`

Modify:

- `packages/core/src/protocol/paths.ts`: add sources, staging envelopes, daily reports, daily runs.
- `packages/core/src/protocol/schemas.ts`: add source, envelope, privacy, daily report schemas; extend agent memory agent/kind for Claude Code.
- `packages/core/src/protocol/types.ts`: ensure agent profile exports stay consistent.
- `packages/core/package.json`: export new core modules for tests and CLI usage.
- `packages/core/src/experience/agent-memory.ts`: ingest `ExperienceEnvelope` sources and support Claude Code repair-log kind.
- `packages/core/src/experience/harvest.ts`: allow source registry discovery through the daily orchestrator without breaking `remote`.
- `packages/core/src/wiki/site-model.ts` and `packages/core/src/wiki/render-site.ts`: add homepage recent knowledge updates from daily reports.
- `packages/core/src/agent-access/skill.ts`: document `daily run` and `source` setup for generated Skills.
- `packages/cli/src/index.ts`: wire `source` and `daily`.
- `packages/cli/package.json`: export new CLI command modules for tests.
- `templates/gitlab/knowledge-repo.gitlab-ci.yml`: add scheduled daily harvest job and variables.
- `README.md`, `README.zh-CN.md`, and `docs/deployment.md`: document personal and team daily flows.
- `docs/openspec/changes/daily-agent-experience-loop/tasks.md`: mark tasks as implementation lands.

Do not create `dist/experience.html`. The summarized experience is the wiki.

## Task 1: Protocol Contracts

**Files:**

- Modify: `packages/core/src/protocol/paths.ts`
- Modify: `packages/core/src/protocol/schemas.ts`
- Test: `tests/core/experience-source-config.test.ts`

- [ ] **Step 1: Add failing schema tests**

Add tests that parse:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DailyExperienceReportSchema,
  ExperienceEnvelopeSchema,
  ExperienceSourceConfigSchema,
} from "@praxisbase/core/protocol/schemas.js";

describe("daily experience protocol schemas", () => {
  it("accepts an OpenClaw Feishu-channel source as OpenClaw memory", () => {
    const parsed = ExperienceSourceConfigSchema.parse({
      id: "source_openclaw_bot",
      protocol_version: "0.1",
      type: "experience_source_config",
      name: "openclaw-bot",
      agent: "openclaw",
      source_type: "openclaw-api",
      channel: "feishu",
      parser: "openclaw-export",
      scope_default: "team",
      remote: "bot-prod",
      created_at: "2026-05-21T00:00:00.000Z",
      updated_at: "2026-05-21T00:00:00.000Z",
    });
    assert.equal(parsed.agent, "openclaw");
    assert.equal(parsed.channel, "feishu");
  });

  it("accepts a redacted Claude Code repair envelope", () => {
    const parsed = ExperienceEnvelopeSchema.parse({
      id: "experience_claude_repair_1",
      protocol_version: "0.1",
      type: "experience_envelope",
      source_id: "source_claude_repair",
      agent: "claude-code",
      channel: "log-system",
      source_ref: "logs://openclaw-repairs/1",
      source_hash: "sha256:abc",
      scope_hint: "team",
      signature: "openclaw:auth-expired",
      problem_signature: "openclaw:auth-expired",
      outcome: "success",
      redacted_summary: "Claude Code repaired OpenClaw by refreshing expired auth and rerunning checks.",
      fetched_at: "2026-05-21T00:00:00.000Z",
      privacy: { mode: "team-git", verdict: "allow", reasons: [] },
      warnings: [],
    });
    assert.equal(parsed.agent, "claude-code");
  });

  it("accepts a daily report with no stable knowledge mutation", () => {
    const parsed = DailyExperienceReportSchema.parse({
      id: "daily_2026_05_21",
      protocol_version: "0.1",
      type: "daily_experience_report",
      authority_mode: "team-git",
      mode: "write",
      sources: [],
      proposal_candidates: 0,
      quality_findings: 0,
      site_pages: 0,
      changed_stable_knowledge: false,
      outputs: [],
      warnings: [],
      created_at: "2026-05-21T00:00:00.000Z",
    });
    assert.equal(parsed.changed_stable_knowledge, false);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/experience-source-config.test.js
```

Expected: fail because the new schemas do not exist.

- [ ] **Step 3: Add protocol paths**

Add these paths:

```ts
sources: ".praxisbase/sources",
stagingExperienceEnvelopes: ".praxisbase/staging/experience-envelopes",
reportsDaily: ".praxisbase/reports/daily",
runsDaily: ".praxisbase/runs/daily",
```

- [ ] **Step 4: Add schemas**

Add Zod schemas equivalent to the design contracts:

```ts
export const ExperienceSourceChannelSchema = z.enum([
  "local", "terminal", "feishu", "ci", "gitlab", "log-system", "unknown",
]);

export const ExperienceSourceParserSchema = z.enum([
  "codex-session", "openclaw-export", "openclaw-log", "claude-code-repair-log",
]);

export const ExperienceSourceConfigSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("experience_source_config"),
  name: z.string().min(1),
  agent: z.enum(["codex", "openclaw", "claude-code"]),
  source_type: z.enum(["local", "file", "git", "ssh", "http", "openclaw-api"]),
  channel: ExperienceSourceChannelSchema,
  parser: ExperienceSourceParserSchema,
  scope_default: z.enum(["personal", "project", "team", "org"]),
  path: z.string().optional(),
  repo: z.string().optional(),
  ref: z.string().optional(),
  host: z.string().optional(),
  url: z.string().optional(),
  remote: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
```

Also add `ExperienceEnvelopeSchema`, `DailyExperienceReportSchema`, and inferred TypeScript exports.

- [ ] **Step 5: Extend agent memory schemas for Claude Code**

Update:

```ts
export const AgentMemoryAgentSchema = z.enum(["codex", "openclaw", "claude-code"]);
export const AgentMemoryKindSchema = z.enum([
  "codex_session",
  "openclaw_log",
  "openclaw_episode",
  "claude_code_repair_log",
]);
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/experience-source-config.test.js
```

Expected: pass.

## Task 2: Source Registry

**Files:**

- Create: `packages/core/src/experience/source-config.ts`
- Create: `packages/cli/src/commands/source.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/cli/package.json`
- Test: `tests/cli/source-command.test.ts`

- [ ] **Step 1: Add failing CLI tests**

Cover these cases:

```ts
it("adds and lists an OpenClaw Feishu-channel source", async () => {
  const output = await sourceCommand(root, "add", {
    name: "openclaw-bot",
    agent: "openclaw",
    type: "openclaw-api",
    channel: "feishu",
    parser: "openclaw-export",
    remote: "bot-prod",
    scope: "team",
    json: true,
  });
  assert.match(output, /openclaw-bot/);

  const list = await sourceCommand(root, "list", { json: true });
  assert.match(list, /"channel": "feishu"/);
});

it("rejects credentials in source config fields", async () => {
  await assert.rejects(
    sourceCommand(root, "add", {
      name: "bad",
      agent: "openclaw",
      type: "http",
      channel: "unknown",
      parser: "openclaw-export",
      url: "https://token:secret@example.com/export.json",
      scope: "team",
      json: true,
    }),
    /SOURCE_CONFIG_CONTAINS_CREDENTIAL/
  );
});
```

- [ ] **Step 2: Implement core source config helpers**

Export:

```ts
export async function addExperienceSource(root: string, input: AddExperienceSourceInput): Promise<ExperienceSourceConfig>;
export async function listExperienceSources(root: string): Promise<ExperienceSourceConfig[]>;
export async function readExperienceSource(root: string, name: string): Promise<ExperienceSourceConfig>;
export async function removeExperienceSource(root: string, name: string): Promise<void>;
```

Reuse `readJson`, `writeJson`, `safePath`, `makeId`, and the existing credential rejection style from remote configs.

- [ ] **Step 3: Implement CLI wrapper**

Add:

```bash
praxisbase source add <name> --agent <agent> --type <type> --channel <channel> --parser <parser> --scope <scope>
praxisbase source list --json
praxisbase source remove <name>
praxisbase source doctor <name> --json
```

For user ergonomics, infer parser when safe:

```text
codex + local -> codex-session
openclaw + openclaw-api/file/ssh/git/http -> openclaw-export
claude-code + http/file/git -> claude-code-repair-log
```

- [ ] **Step 4: Keep remote compatibility**

Do not remove `praxisbase remote`. `daily run --all` should read `.praxisbase/sources` and existing `.praxisbase/remotes`.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/source-command.test.js
```

Expected: pass.

## Task 3: Experience Envelopes And Adapters

**Files:**

- Create: `packages/core/src/experience/source-adapters.ts`
- Modify: `packages/core/src/experience/agent-memory.ts`
- Test: `tests/core/experience-source-adapters.test.ts`

- [ ] **Step 1: Add failing adapter tests**

Add tests for:

- local Codex file becomes a `codex` envelope;
- OpenClaw API source with `channel=feishu` becomes an `openclaw` envelope;
- Claude Code repair log JSON becomes a `claude-code` envelope with `claude_code_repair_log`;
- raw private content is not copied into the envelope summary.

- [ ] **Step 2: Implement adapter interface**

Use one resolver:

```ts
export async function resolveExperienceSource(
  root: string,
  config: ExperienceSourceConfig,
  input: ResolveExperienceSourceInput
): Promise<ResolveExperienceSourceResult>;
```

The result should include:

```ts
{
  source: ExperienceSourceConfig;
  envelopes: ExperienceEnvelope[];
  scanned: number;
  fetched: number;
  skipped: number;
  warnings: string[];
}
```

- [ ] **Step 3: Implement parser behavior**

Parser rules:

- `codex-session`: reuse Codex summary extraction from `agent-memory.ts`;
- `openclaw-export`: reuse M12.1 exported JSON/OpenClaw API staging behavior;
- `openclaw-log`: use `detectOpenClawProblemSignature`;
- `claude-code-repair-log`: parse JSON/JSONL/text logs into a repair summary, source hash, optional signature, and outcome.

- [ ] **Step 4: Teach ingest to consume envelopes**

Add an ingest path where `ingestAgentMemory` can read `ExperienceEnvelope` JSON files and create `raw_vault_ref` and `capture_record` objects using:

```text
agent
source_ref
source_hash
redacted_summary
scope_hint
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/experience-source-adapters.test.js
```

Expected: pass.

## Task 4: Privacy Policy

**Files:**

- Create: `packages/core/src/experience/privacy-policy.ts`
- Modify: `packages/core/src/experience/source-adapters.ts`
- Test: `tests/core/experience-privacy-policy.test.ts`

- [ ] **Step 1: Add failing privacy tests**

Add tests proving:

```ts
assert.equal(evaluateExperiencePrivacy({ mode: "team-git", scopeHint: "personal", text: "safe" }).verdict, "reject");
assert.equal(evaluateExperiencePrivacy({ mode: "personal-local", scopeHint: "personal", text: "safe" }).verdict, "allow");
assert.equal(evaluateExperiencePrivacy({ mode: "team-git", scopeHint: "team", text: "OPENCLAW_TOKEN=secret" }).verdict, "human_required");
```

- [ ] **Step 2: Implement privacy function**

Implement:

```ts
export function evaluateExperiencePrivacy(input: {
  mode: "personal-local" | "team-git";
  scopeHint: "personal" | "project" | "team" | "org";
  text: string;
  channel?: string;
}): { verdict: "allow" | "reject" | "human_required"; reasons: string[] };
```

Rules:

- team mode rejects personal scope;
- team mode rejects private chat/DM hints;
- both modes route secrets/private material to `human_required`;
- allowed text must still be summarized, not copied raw.

- [ ] **Step 3: Write exceptions for human-required cases**

When adapter output has `human_required`, write an `ExceptionRecord` under `.praxisbase/exceptions/human-required/` in write mode and do not import that envelope into wiki proposals.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/experience-privacy-policy.test.js
```

Expected: pass.

## Task 5: Daily Orchestrator

**Files:**

- Create: `packages/core/src/experience/daily.ts`
- Create: `packages/cli/src/commands/daily.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/cli/package.json`
- Test: `tests/core/experience-daily.test.ts`
- Test: `tests/cli/daily-command.test.ts`

- [ ] **Step 1: Add failing daily tests**

Cover:

- personal mode runs configured local Codex, local OpenClaw, and one remote OpenClaw source;
- team mode requires branch for commit on protected branch;
- team mode writes daily report and Git metadata;
- `changed_stable_knowledge` remains false without explicit review/promote;
- `daily doctor` reports missing source credentials without printing secret values.

- [ ] **Step 2: Implement `runDailyExperienceLoop`**

Signature:

```ts
export async function runDailyExperienceLoop(
  root: string,
  input: RunDailyExperienceLoopInput
): Promise<DailyExperienceReport>;
```

It should:

1. load source configs and legacy remote configs;
2. resolve sources into experience envelopes;
3. write allowed envelopes to staging;
4. ingest allowed envelopes;
5. run `compileWiki`;
6. run `buildWikiSite` when requested;
7. run optional context smoke;
8. write daily report and run record;
9. run team Git action when requested.

- [ ] **Step 3: Implement CLI**

Wire:

```bash
praxisbase daily init --mode personal --json
praxisbase daily init --mode team-git --provider gitlab --json
praxisbase daily run --mode personal --build-site --json
praxisbase daily run --mode personal --build-site --auto-review --auto-promote --json
praxisbase daily run --mode team-git --branch harvest/daily --commit --push --build-site --json
praxisbase daily doctor --mode team-git --json
praxisbase daily schedule --mode personal --runner launchd --print
praxisbase daily schedule --mode personal --runner cron --print
```

- [ ] **Step 4: Preserve low-level harvest**

Do not remove or change the existing `harvest` examples. `daily` is the recommended release path; `harvest` remains the lower-level workflow.

Default agent context should only include fresh daily experience after explicit review/promote turns it into stable knowledge or reviewed bundles. Daily reports and proposal candidates are human inspection artifacts, not a bypass around review.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/experience-daily.test.js dist-tests/tests/cli/daily-command.test.js
```

Expected: pass.

## Task 6: Wiki Homepage Updates

**Files:**

- Modify: `packages/core/src/wiki/site-model.ts`
- Modify: `packages/core/src/wiki/render-site.ts`
- Test: `tests/core/wiki-site-model.test.ts`
- Test: `tests/e2e/wiki-static-site.spec.ts`

- [ ] **Step 1: Add failing site model test**

Assert that latest daily reports appear in the existing homepage model as recent knowledge updates and that no `experience.html` output is required.

- [ ] **Step 2: Load latest daily reports**

Add a bounded loader:

```ts
export async function collectRecentDailyUpdates(root: string, limit = 10): Promise<RecentDailyUpdate[]>;
```

It should read `.praxisbase/reports/daily/*.json`, sort by `created_at` descending, and expose only summarized counts and output links.

- [ ] **Step 3: Render on `dist/index.html`**

Add a "Recent knowledge updates" section to the homepage. It should show:

- date;
- source count;
- imported count;
- proposal candidate count;
- human-required count;
- link to issues when human-required count is nonzero.

- [ ] **Step 4: Do not generate a separate experience page**

Update site tests to assert:

```ts
assert.equal(existsSync(join(root, "dist/experience.html")), false);
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-site-model.test.js
pnpm test:e2e
```

Expected: pass.

## Task 7: GitLab Daily Schedule

**Files:**

- Modify: `templates/gitlab/knowledge-repo.gitlab-ci.yml`
- Test: `tests/ci/gitlab-daily-ci.test.ts`

- [ ] **Step 1: Add failing CI template test**

Assert the template contains:

```text
praxisbase:daily-harvest
PRAXISBASE_TASK == "daily-harvest"
resource_group: praxisbase-write
daily run --mode team-git
```

- [ ] **Step 2: Add daily harvest job**

Add a job before review:

```yaml
praxisbase:daily-harvest:
  extends:
    - .praxisbase-knowledge
    - .praxisbase-writeback
  stage: harvest
  resource_group: praxisbase-write
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule" && $PRAXISBASE_TASK == "daily-harvest"
  script:
    - node /tmp/PraxisBase/packages/cli/dist/index.js daily run --mode team-git --branch "harvest/daily-${CI_PIPELINE_ID}" --commit --build-site --json
```

If `PRAXISBASE_WRITEBACK=true`, the existing writeback helper pushes generated artifacts.

- [ ] **Step 3: Document required variables**

Template comments or deployment docs should mention:

- `OPENCLAW_TOKEN`
- `OPENCLAW_BASE_URL`
- log-system token variables used by configured sources
- `PRAXISBASE_PUSH_TOKEN`

- [ ] **Step 4: Run CI template tests**

Run:

```bash
pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/ci/gitlab-daily-ci.test.js
```

Expected: pass.

## Task 8: Agent Skill And Docs

**Files:**

- Modify: `packages/core/src/agent-access/skill.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/deployment.md`
- Test: `tests/core/agent-access.test.ts`

- [ ] **Step 1: Add failing generated Skill test**

Assert generated Skill includes:

```text
praxisbase source add
praxisbase daily run
praxisbase context get
team mode rejects personal scope
```

- [ ] **Step 2: Update Skill content**

Keep Skill concise. Add sections:

- configure sources;
- run daily personal;
- run daily team;
- query context before repair;
- privacy rules for team mode.

- [ ] **Step 3: Update docs**

Add user flows:

Personal:

```bash
praxisbase source add local-codex --agent codex --type local --path ~/.codex/archived_sessions --scope personal
praxisbase source add local-openclaw --agent openclaw --type local --path ~/.openclaw/exports/latest.json --scope project
praxisbase daily run --mode personal --build-site --json
```

Team:

```bash
praxisbase source add openclaw-bot --agent openclaw --channel feishu --type openclaw-api --remote bot-prod --scope team
praxisbase source add claude-repair-log --agent claude-code --type http --url "$LOG_API" --scope team
praxisbase daily run --mode team-git --branch harvest/daily --commit --push --build-site --json
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/agent-access.test.js
```

Expected: pass.

## Task 9: End-To-End Verification

**Files:**

- Modify: `docs/openspec/changes/daily-agent-experience-loop/tasks.md`

- [ ] **Step 1: Run focused checks**

Run:

```bash
pnpm build && tsc -p tsconfig.tests.json && node --test \
  dist-tests/tests/core/experience-source-config.test.js \
  dist-tests/tests/core/experience-source-adapters.test.js \
  dist-tests/tests/core/experience-privacy-policy.test.js \
  dist-tests/tests/core/experience-daily.test.js \
  dist-tests/tests/cli/source-command.test.js \
  dist-tests/tests/cli/daily-command.test.js
```

Expected: all pass.

- [ ] **Step 2: Run full project checks**

Run:

```bash
pnpm check
pnpm test:e2e
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Run personal smoke**

Create temporary safe Codex/OpenClaw fixture sources and run:

```bash
node packages/cli/dist/index.js daily run --mode personal --build-site --context-query "openclaw auth expired" --json
```

Expected:

- daily report written;
- wiki compile report written;
- static site built;
- `changed_stable_knowledge` is false;
- no `dist/experience.html` is created.

- [ ] **Step 4: Run team smoke with local Git fixture**

Use a local Git repo fixture and run:

```bash
node packages/cli/dist/index.js daily run --mode team-git --branch harvest/daily-smoke --commit --build-site --json
```

Expected:

- branch is created;
- commit is created;
- personal scope fixture is rejected;
- daily report records the rejection;
- raw private material is absent from committed files.

- [ ] **Step 5: Update OpenSpec task checkboxes**

Mark completed M14 tasks in `docs/openspec/changes/daily-agent-experience-loop/tasks.md`.

- [ ] **Step 6: Commit**

Use one or more focused commits. Suggested final commit after implementation:

```bash
git add packages tests templates docs README.md README.zh-CN.md
git commit -m "feat: add daily agent experience loop"
```

## Traceability

- Design: `docs/superpowers/specs/2026-05-21-daily-agent-experience-loop-design.md`
- OpenSpec: `docs/openspec/changes/daily-agent-experience-loop/`
- BDD: `docs/bdd/daily-agent-experience-loop.feature`
- Implementation plan: this file
