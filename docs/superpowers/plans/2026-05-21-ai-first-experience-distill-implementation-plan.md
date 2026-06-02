# AI-First Experience Distill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI distillation the production path for PraxisBase daily experience synthesis while preserving deterministic privacy, review, and degraded fallback behavior.

**Architecture:** Add a narrow AI provider/config layer, a chunking and privacy gate layer, a schema-validated distill service, and integrations into daily/wiki/skill proposal flow. Tests use mocked AI clients; production commands require AI config unless degraded mode is explicit.

**Tech Stack:** TypeScript, Node.js, Commander CLI, Zod schemas, existing PraxisBase file-store/protocol paths, node:test, mocked AI clients.

---

## File Structure

- Create `packages/core/src/ai/config.ts`: read/write provider config and secret env names.
- Create `packages/core/src/ai/client.ts`: AI client interface, OpenAI-compatible adapter boundary, mockable request/response helpers.
- Create `packages/core/src/ai/distill.ts`: `DistillInput`, `DistilledExperience`, prompt builder, schema validation, report writer.
- Create `packages/core/src/experience/chunking.ts`: source-aware Codex/OpenClaw/Claude Code chunking.
- Modify `packages/core/src/experience/privacy-policy.ts`: split pre-AI, post-AI, and team gates.
- Modify `packages/core/src/experience/daily.ts`: require AI in production, add degraded mode, attach `ai_distill` report fields.
- Modify `packages/core/src/wiki/analyze.ts` and `packages/core/src/wiki/compile.ts`: prefer distilled fields for proposal generation.
- Modify `packages/core/src/synthesis/skill.ts`: support repeated distilled trigger/procedure skill candidates.
- Create `packages/cli/src/commands/ai.ts`: `ai init`, `ai doctor`, `ai distill`.
- Create `packages/cli/src/commands/bootstrap.ts`: first-run setup and skill generation.
- Modify `packages/cli/src/index.ts`: wire `ai` and `bootstrap`, add daily flags.
- Test `tests/core/ai-config.test.ts`, `tests/core/ai-distill.test.ts`, `tests/core/experience-chunking.test.ts`, `tests/core/experience-daily-ai.test.ts`, `tests/core/wiki-ai-distill.test.ts`, `tests/cli/ai-command.test.ts`, `tests/cli/bootstrap-command.test.ts`.
- Modify docs after implementation: `README.md`, personal/team usage docs if present.

## Task 1: AI Config Schema And Commands

**Files:**
- Create: `packages/core/src/ai/config.ts`
- Create: `packages/cli/src/commands/ai.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/core/ai-config.test.ts`
- Test: `tests/cli/ai-command.test.ts`

- [ ] **Step 1: Write config tests**

Add tests that create `.praxisbase/ai/config.json` with non-secret metadata, reject unsupported providers, and verify real API key values never appear in command output.

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/ai-config.test.js dist-tests/tests/cli/ai-command.test.js
```

Expected before implementation: compile or test failure because files/functions do not exist.

- [ ] **Step 2: Implement config module**

Implement:

```ts
export interface AiProviderConfig {
  protocol_version: typeof PROTOCOL_VERSION;
  type: "ai_provider_config";
  provider: "openai-compatible";
  model: string;
  base_url_env: string;
  api_key_env: string;
  default_temperature: number;
  max_input_bytes: number;
  max_output_bytes: number;
}

export async function writeAiProviderConfig(root: string, input: { provider: "openai-compatible"; model: string }): Promise<AiProviderConfig>;
export async function readAiProviderConfig(root: string): Promise<AiProviderConfig | null>;
export async function doctorAiProvider(root: string, env?: Record<string, string | undefined>): Promise<{ ok: boolean; checks: Array<{ id: string; ok: boolean; message: string }> }>;
```

Use `writeJson`, `readJson`, `protocolPaths`, and do not store secret values.

- [ ] **Step 3: Wire CLI**

Add:

```bash
praxisbase ai init --provider openai-compatible --model <model> --json
praxisbase ai doctor --json
```

`ai doctor` may support `--offline` later; this task only validates config and env presence without live calls.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm check
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ai/config.ts packages/cli/src/commands/ai.ts packages/cli/src/index.ts tests/core/ai-config.test.ts tests/cli/ai-command.test.ts
git commit -m "feat: add ai provider config"
```

## Task 2: AI Client And Distill Schema

**Files:**
- Create: `packages/core/src/ai/client.ts`
- Create: `packages/core/src/ai/distill.ts`
- Test: `tests/core/ai-distill.test.ts`

- [ ] **Step 1: Write distill tests**

Cover successful mocked response, malformed JSON, schema mismatch, timeout/error result, and privacy-looking output rejection hook.

Run:

```bash
pnpm build && pnpm exec tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/ai-distill.test.js
```

Expected before implementation: failure because module does not exist.

- [ ] **Step 2: Implement client interface**

Define:

```ts
export interface AiJsonClient {
  generateJson(input: {
    system: string;
    user: string;
    schemaName: string;
    maxOutputBytes: number;
  }): Promise<{ ok: true; json: unknown } | { ok: false; error: string }>;
}
```

Keep provider-specific HTTP code behind this interface so tests can inject mocks.

- [ ] **Step 3: Implement distill schemas and prompt builder**

Define strict Zod schemas for `DistillInput` and `DistilledExperience`. The prompt must instruct the model to return only JSON and to avoid secrets, raw logs, and unrelated narrative.

- [ ] **Step 4: Implement `distillExperience`**

Return a structured result:

```ts
type DistillResult =
  | { ok: true; experience: DistilledExperience }
  | { ok: false; error: string; category: "ai_error" | "schema_error" | "privacy_error" };
```

Run privacy postcheck on the generated summary and all text fields before success.

- [ ] **Step 5: Verify and commit**

```bash
pnpm check
git add packages/core/src/ai/client.ts packages/core/src/ai/distill.ts tests/core/ai-distill.test.ts
git commit -m "feat: add ai experience distill contract"
```

## Task 3: Source Chunking And Privacy Gates

**Files:**
- Create: `packages/core/src/experience/chunking.ts`
- Modify: `packages/core/src/experience/privacy-policy.ts`
- Test: `tests/core/experience-chunking.test.ts`

- [ ] **Step 1: Write chunking and privacy tests**

Cover Codex session chunking, OpenClaw sqlite/export chunk metadata, Claude Code repair log chunking, max byte caps, personal safe transcript, personal secret transcript, and team personal-scope rejection.

- [ ] **Step 2: Implement chunk model**

Add:

```ts
export interface ExperienceChunk {
  source_id: string;
  agent: AgentProfile;
  channel: string;
  source_ref: string;
  source_hash: string;
  scope_hint: ExperienceScopeHint;
  chunk_id: string;
  chunk_hash: string;
  text: string;
}
```

- [ ] **Step 3: Implement chunkers**

Chunkers should use existing source parsing where possible and avoid sweeping home directories. Codex chunks should prefer final assistant messages, changed files, command/test lines, and outcome hints.

- [ ] **Step 4: Split privacy gates**

Add deterministic functions:

```ts
export function evaluatePreAiPrivacy(input): { verdict: "allow_for_ai" | "local_only" | "human_required" | "reject"; reasons: string[] };
export function evaluatePostAiPrivacy(input): ExperiencePrivacyResult;
export function evaluateTeamGate(input): ExperiencePrivacyResult;
```

Team gate must reject personal scope before AI distill.

- [ ] **Step 5: Verify and commit**

```bash
pnpm check
git add packages/core/src/experience/chunking.ts packages/core/src/experience/privacy-policy.ts tests/core/experience-chunking.test.ts
git commit -m "feat: add experience chunking privacy gates"
```

## Task 4: Daily AI Integration

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/cli/src/commands/daily.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/core/experience-daily-ai.test.ts`
- Test: `tests/cli/daily-command.test.ts`

- [ ] **Step 1: Write daily AI tests**

Cover:

- production daily without AI config fails with `AI_DISTILL_NOT_CONFIGURED`;
- degraded daily succeeds with `production_ready: false`;
- mocked AI daily succeeds with `ai_distill.mode = "production"`;
- personal safe transcript is distilled and does not become human-required solely because it is a transcript;
- team personal source rejects before AI client call.

- [ ] **Step 2: Add daily options**

Add `degraded?: boolean`, `noAi?: boolean`, and injectable `aiClient?: AiJsonClient` to daily core input.

- [ ] **Step 3: Require AI by default**

At the start of production daily, read AI config and fail if missing. `--degraded` bypasses AI but marks the report not production-ready.

- [ ] **Step 4: Distill before envelope ingest**

For allowed chunks, call `distillExperience`, convert successful outputs into envelopes/raw refs/captures, and route failures to ai-distill report counts.

- [ ] **Step 5: Extend reports**

Add `ai_distill` object with configured/mode/production_ready/provider/model/chunks/distilled/failed/human_required/warnings.

- [ ] **Step 6: Verify and commit**

```bash
pnpm check
git add packages/core/src/experience/daily.ts packages/cli/src/commands/daily.ts packages/cli/src/index.ts tests/core/experience-daily-ai.test.ts tests/cli/daily-command.test.ts
git commit -m "feat: require ai distill for production daily"
```

## Task 5: Wiki And Skill Proposal Quality

**Files:**
- Modify: `packages/core/src/wiki/analyze.ts`
- Modify: `packages/core/src/wiki/compile.ts`
- Modify: `packages/core/src/synthesis/skill.ts`
- Test: `tests/core/wiki-ai-distill.test.ts`
- Test: `tests/core/skill-synthesis.test.ts`

- [ ] **Step 1: Write proposal tests**

Create fixtures with distilled known-fix, procedure, pitfall, decision, preference, and skill-candidate records. Assert proposal body includes problem, actions, failed attempts, verification, reusable lessons, and citations.

- [ ] **Step 2: Prefer distilled fields**

Update analysis to use `suggested_wiki_kind`, tags, confidence, and structured sections before falling back to regex classification.

- [ ] **Step 3: Generate richer proposal bodies**

Proposal body should include:

```markdown
## Problem
## Context
## Actions
## Failed Attempts
## Verification
## Reusable Lessons
## Risks
## Sources
```

Omit empty sections. Do not include raw transcript text.

- [ ] **Step 4: Skill candidate synthesis**

Group repeated successful skill candidates by trigger/procedure hash. Generate proposal candidates only when minimum evidence threshold is met.

- [ ] **Step 5: Verify and commit**

```bash
pnpm check
git add packages/core/src/wiki/analyze.ts packages/core/src/wiki/compile.ts packages/core/src/synthesis/skill.ts tests/core/wiki-ai-distill.test.ts tests/core/skill-synthesis.test.ts
git commit -m "feat: generate wiki proposals from distilled experience"
```

## Task 6: First-Run Bootstrap Skill

**Files:**
- Create: `packages/cli/src/commands/bootstrap.ts`
- Modify: `packages/core/src/agent-access/skill.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `tests/cli/bootstrap-command.test.ts`
- Test: `tests/core/experience-install.test.ts`

- [ ] **Step 1: Write bootstrap tests**

Assert `praxisbase bootstrap personal --agent codex --install-skill --json` generates an agent-readable file containing `ai doctor`, `ai init`, source discovery, `daily run`, HTML path, `context get`, and human-required review guidance.

- [ ] **Step 2: Implement source discovery**

Discover only specific safe paths:

- `~/.codex/sessions`
- `~/.codex/archived_sessions`
- `~/.codex-cli-cliproxyapi/sessions`
- `~/.openclaw/memory/main.sqlite`
- `~/.openclaw/reports`

Do not add whole `~/.codex`, `~/.openclaw`, or home directories.

- [ ] **Step 3: Generate skill/instructions**

Update generated skill text so a new agent can bootstrap without prior PraxisBase context and without printing private content.

- [ ] **Step 4: Wire CLI**

Add:

```bash
praxisbase bootstrap personal --agent codex --install-skill --json
```

Return paths written, sources discovered, and next commands.

- [ ] **Step 5: Verify and commit**

```bash
pnpm check
git add packages/cli/src/commands/bootstrap.ts packages/core/src/agent-access/skill.ts packages/cli/src/index.ts tests/cli/bootstrap-command.test.ts tests/core/experience-install.test.ts
git commit -m "feat: add personal bootstrap skill"
```

## Task 7: Documentation And Release Verification

**Files:**
- Modify: `README.md`
- Modify or create user docs under `docs/`
- Modify: `docs/status/m12-m12.1-acceptance.md` only if status needs a forward-looking note

- [ ] **Step 1: Update quickstart**

Show AI-first flow:

```bash
praxisbase bootstrap personal --agent codex --install-skill --json
praxisbase ai init --provider openai-compatible --model <model> --json
praxisbase ai doctor --json
praxisbase daily run --mode personal --build-site --json
open dist/index.html
```

- [ ] **Step 2: Document degraded mode**

Explain that degraded mode is for bootstrap/offline smoke only and is not production-ready.

- [ ] **Step 3: Document team privacy**

Explain team-git rejects personal scope and private chat before AI distill.

- [ ] **Step 4: Full verification**

Run:

```bash
pnpm check
praxisbase daily run --mode personal --degraded --build-site --json
praxisbase context get --agent codex --stage repair --query openclaw --json
```

Expected:

- tests pass;
- degraded daily succeeds and marks non-production;
- context returns safe items without raw secrets.

- [ ] **Step 5: Commit docs**

```bash
git add README.md docs
git commit -m "docs: document ai-first experience distill"
```

## Self-Review Checklist

- [ ] Every production path that claims high-quality experience synthesis requires AI config.
- [ ] Degraded mode is explicit and visibly non-production.
- [ ] AI cannot write stable `kb/` or `skills/` directly.
- [ ] Raw transcripts/logs/secrets are never written into Git-tracked outputs.
- [ ] Tests use mocked AI clients, not live network calls.
- [ ] Team privacy gates run before AI proposal generation.
- [ ] Generated bootstrap skill is usable by a first-run agent.
