# OpenClaw Repair MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 PraxisBase MVP: a Git-backed agent knowledge substrate that lets OpenClaw repair agents fetch repair context, submit episodes, propose knowledge updates, run AI-reviewed promotion, and generate static bundles.

**Architecture:** Implement a TypeScript pnpm monorepo with `@praxisbase/core` for schemas and domain logic, `@praxisbase/cli` for agent and CI entrypoints, and templates/seed data for the file protocol. The MVP is file-first and CLI-first; MCP, external search services, Hermes runner, and K8s runtime integration stay outside this implementation plan.

**Tech Stack:** Node.js 20+, TypeScript 5.x, pnpm workspaces, Vitest, Zod, Commander, gray-matter, lightweight generated JSON indexes, GitLab CI templates.

---

## Execution Guardrails

- Keep the product identity as **agent knowledge substrate**, not a generic wiki builder.
- OpenClaw sandbox repair is the only runtime scenario implemented in this plan.
- Treat all agents as peer clients. Do not introduce a central OpenClaw master agent.
- Store stable reviewed knowledge in Git; store only references, hashes, summaries, and redacted excerpts for large logs.
- Use static generated JSON bundles and indexes. Do not add external search services, vector databases, queues, or daemons.
- Human review is by exception. Routine low/medium-risk proposals should be reviewable and promotable by AI.
- Keep MCP as a future wrapper around the core. Do not implement MCP in this plan.
- Every object written by an agent must include `protocol_version`, identity, scope, provenance, and an idempotency key where retry is possible.

## Planned File Structure

Create these paths:

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json
vitest.config.ts
.gitignore

packages/core/package.json
packages/core/tsconfig.json
packages/core/src/index.ts
packages/core/src/protocol/types.ts
packages/core/src/protocol/schemas.ts
packages/core/src/protocol/paths.ts
packages/core/src/protocol/id.ts
packages/core/src/protocol/redact.ts
packages/core/src/store/file-store.ts
packages/core/src/search/search-index.ts
packages/core/src/repair/signature.ts
packages/core/src/repair/context.ts
packages/core/src/review/risk.ts
packages/core/src/review/reviewer.ts
packages/core/src/promote/promote.ts
packages/core/src/build/build.ts
packages/core/src/build/html.ts
packages/core/src/templates/seed.ts

packages/cli/package.json
packages/cli/tsconfig.json
packages/cli/src/index.ts
packages/cli/src/commands/init.ts
packages/cli/src/commands/repair-context.ts
packages/cli/src/commands/bundle-fetch.ts
packages/cli/src/commands/episode.ts
packages/cli/src/commands/propose.ts
packages/cli/src/commands/review.ts
packages/cli/src/commands/promote.ts
packages/cli/src/commands/build.ts
packages/cli/src/commands/check.ts

templates/gitlab/.gitlab-ci.yml
templates/praxisbase/config.yaml
templates/praxisbase/schedules.yaml
templates/praxisbase/policies/autonomy.yaml
templates/praxisbase/policies/risk-rules.yaml
templates/skills/openclaw/baseline-diagnostics/SKILL.md
templates/skills/openclaw/auth-repair/SKILL.md

tests/fixtures/openclaw/logs/claude-auth-expired.log
tests/fixtures/openclaw/episodes/success.json
tests/fixtures/openclaw/proposals/known-fix.json
tests/core/protocol-schemas.test.ts
tests/core/repair-context.test.ts
tests/core/review-risk.test.ts
tests/core/promote.test.ts
tests/core/build.test.ts
tests/cli/init.test.ts
tests/cli/repair-context.test.ts
tests/cli/bundle-fetch.test.ts
tests/cli/review-promote.test.ts
```

Responsibilities:

- `protocol/*`: object schemas, path conventions, ids, redaction helpers.
- `store/file-store.ts`: read/write `.praxisbase/`, `kb/`, `skills/`, `dist/` using the protocol.
- `repair/*`: classify OpenClaw logs and construct compact repair context.
- `review/*`: classify risk and run deterministic MVP review logic with a mockable reviewer provider.
- `promote/*`: convert approved proposals into stable known-fix/procedure/skill objects.
- `build/*`: generate static indexes, repair bundles, manifest, and HTML inspection output.
- `templates/*`: seed protocol files, baseline OpenClaw skills, and GitLab scheduled pipeline.
- `cli/*`: thin command wrappers over `@praxisbase/core`.

## Milestones

### Milestone 1: Monorepo And Protocol Schemas

**Acceptance:** `pnpm test` passes schema tests; `praxisbase init` can create the protocol skeleton in a temp directory.

### Milestone 2: OpenClaw Repair Context

**Acceptance:** Given an auth-expired fixture log, `praxisbase repair-context openclaw --logs <file> --json` returns a bundle with the expected signature, skill refs, diagnostics, verification, rollback, and forbidden operations.

### Milestone 3: Episode And Proposal Intake

**Acceptance:** Agents can submit valid episodes/proposals to inbox or outbox; invalid identity/provenance/evidence is rejected with machine-readable errors.

### Milestone 4: AI-Reviewed Promotion

**Acceptance:** Low/medium-risk proposals can be reviewed and promoted automatically; high-risk proposals are left in the exception queue with reasons.

### Milestone 5: Static Build And Distribution

**Acceptance:** `praxisbase build` generates `dist/repair-bundles/manifest.json`, scenario bundles, `kb-index.json`, `search-index.json`, `llms.txt`, and an HTML inspection page.

**Acceptance:** `praxisbase bundle fetch openclaw --signature <signature>` returns the latest generated bundle when available and falls back to last-known-good cache with a warning when the latest bundle is unavailable.

### Milestone 6: GitLab Scheduled Automation

**Acceptance:** Generated GitLab CI template includes scheduled ingest/review/promote/build jobs and a `resource_group: praxisbase-write` lock for write jobs.

## Task 1: Create Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`

- [ ] **Step 1: Create root package files**

Write `package.json`:

```json
{
  "name": "praxisbase",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "typecheck": "pnpm -r typecheck",
    "check": "pnpm typecheck && pnpm test"
  },
  "devDependencies": {
    "@types/node": "^20.17.10",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Write `pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
```

Write `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  }
}
```

Write `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node"
  }
});
```

Write `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.env
.env.*
*.secret.*
kb/.cache/
kb/.logs/
.praxisbase/outbox/
```

- [ ] **Step 2: Create core package**

Write `packages/core/package.json`:

```json
{
  "name": "@praxisbase/core",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "gray-matter": "^4.0.3",
    "zod": "^3.24.1"
  },
  "devDependencies": {}
}
```

Write `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

Write `packages/core/src/index.ts`:

```ts
export * from "./protocol/types.js";
export * from "./protocol/schemas.js";
```

- [ ] **Step 3: Create CLI package**

Write `packages/cli/package.json`:

```json
{
  "name": "@praxisbase/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "praxisbase": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@praxisbase/core": "workspace:*",
    "commander": "^12.1.0"
  }
}
```

Write `packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

Write `packages/cli/src/index.ts`:

```ts
#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("praxisbase")
  .description("Agent-native knowledge substrate for OpenClaw repair workflows")
  .version("0.1.0");

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` is created and installation exits with code 0.

- [ ] **Step 5: Verify scaffold**

Run:

```bash
pnpm check
```

Expected: typecheck and tests complete successfully. If there are no tests yet, Vitest exits with no failed tests.

- [ ] **Step 6: Commit scaffold**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts .gitignore packages
git commit -m "Establish PraxisBase TypeScript workspace"
```

## Task 2: Define Protocol Schemas

**Files:**
- Create: `packages/core/src/protocol/types.ts`
- Create: `packages/core/src/protocol/schemas.ts`
- Create: `packages/core/src/protocol/id.ts`
- Create: `tests/core/protocol-schemas.test.ts`

- [ ] **Step 1: Write schema tests first**

Write `tests/core/protocol-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  EpisodeSchema,
  KnownFixFrontmatterSchema,
  ProposalSchema,
  ReviewSchema
} from "../../packages/core/src/protocol/schemas.js";

describe("protocol schemas", () => {
  it("accepts a valid repair episode", () => {
    const parsed = EpisodeSchema.parse({
      id: "episode_20260517_abc",
      protocol_version: "0.1",
      type: "repair_episode",
      scope: "team",
      agent_id: "openclaw-temp-xyz",
      agent_type: "temporary_repair_agent",
      environment_id: "sandbox-123",
      run_id: "run-456",
      idempotency_key: "episode_20260517_abc",
      problem_signature: "openclaw:claude-auth-expired",
      result: "success",
      knowledge_references: [
        {
          id: "openclaw-auth-expired",
          path: "kb/known-fixes/openclaw-auth-expired.md",
          used_in_phase: "diagnosis",
          effect: "helped_fix",
          outcome: "success"
        }
      ],
      source_refs: ["log://openclaw/sandbox-123/run-456"],
      summary: "Refreshed auth state and restarted the session.",
      created_at: "2026-05-17T10:00:00Z"
    });

    expect(parsed.scope).toBe("team");
  });

  it("rejects an episode without provenance", () => {
    const result = EpisodeSchema.safeParse({
      id: "episode_20260517_abc",
      protocol_version: "0.1",
      type: "repair_episode",
      scope: "team",
      agent_id: "openclaw-temp-xyz",
      agent_type: "temporary_repair_agent",
      environment_id: "sandbox-123",
      run_id: "run-456",
      idempotency_key: "episode_20260517_abc",
      problem_signature: "openclaw:claude-auth-expired",
      result: "success",
      knowledge_references: [],
      source_refs: [],
      summary: "Missing provenance.",
      created_at: "2026-05-17T10:00:00Z"
    });

    expect(result.success).toBe(false);
  });

  it("accepts a proposal with evidence", () => {
    const parsed = ProposalSchema.parse({
      id: "proposal_20260517_known_fix",
      protocol_version: "0.1",
      type: "knowledge_proposal",
      scope: "team",
      action: "create",
      target_type: "known_fix",
      target_id: "openclaw-auth-expired",
      agent_id: "openclaw-temp-xyz",
      agent_type: "temporary_repair_agent",
      environment_id: "sandbox-123",
      run_id: "run-456",
      idempotency_key: "proposal_20260517_known_fix",
      evidence: {
        source_uri: "log://openclaw/sandbox-123/run-456",
        source_hash: "sha256:abc",
        excerpt: "Claude auth expired; refresh fixed it.",
        repair_result: "success",
        verification: "Minimal model call completed."
      },
      patch: {
        path: "kb/known-fixes/openclaw-auth-expired.md",
        content: "# OpenClaw auth expired"
      },
      created_at: "2026-05-17T10:00:00Z"
    });

    expect(parsed.target_type).toBe("known_fix");
  });

  it("accepts a medium-risk review approval", () => {
    const parsed = ReviewSchema.parse({
      id: "review_20260517_known_fix",
      protocol_version: "0.1",
      proposal_id: "proposal_20260517_known_fix",
      reviewer_id: "reviewer-agent",
      reviewer_model: "configured-reviewer",
      prompt_version: "review-v0.1",
      decision: "approve",
      risk: "medium",
      confidence: 0.82,
      reasons: ["Evidence references a successful repair episode."],
      required_checks: ["praxisbase check"],
      created_at: "2026-05-17T10:00:00Z"
    });

    expect(parsed.decision).toBe("approve");
  });

  it("accepts known fix frontmatter", () => {
    const parsed = KnownFixFrontmatterSchema.parse({
      id: "openclaw-auth-expired",
      protocol_version: "0.1",
      type: "known_fix",
      scope: "team",
      risk: "medium",
      status: "published",
      knowledge_type: "known_fix",
      maturity: "draft",
      signatures: ["openclaw:claude-auth-expired"],
      skills: ["skills/openclaw/auth-repair/SKILL.md"],
      sources: [{ uri: "log://openclaw/sandbox-123/run-456", hash: "sha256:abc" }],
      confidence: 0.84,
      reference_count: 0,
      last_referenced_at: null,
      supersedes: [],
      superseded_by: null,
      updated_at: "2026-05-17T10:00:00Z"
    });

    expect(parsed.signatures).toContain("openclaw:claude-auth-expired");
  });
});
```

- [ ] **Step 2: Run schema tests to verify failure**

Run:

```bash
pnpm test tests/core/protocol-schemas.test.ts
```

Expected: FAIL because `schemas.ts` has not been created.

- [ ] **Step 3: Implement protocol types**

Write `packages/core/src/protocol/types.ts`:

```ts
export const PROTOCOL_VERSION = "0.1" as const;

export type Scope = "personal" | "project" | "team" | "global";
export type AgentType =
  | "temporary_repair_agent"
  | "persistent_bot"
  | "reviewer"
  | "curator"
  | "system_ingest";
export type RepairResult = "success" | "failed" | "partial" | "unknown";
export type RiskLevel = "low" | "medium" | "high";
export type ProposalAction = "create" | "patch" | "archive" | "link";
export type KnowledgeType =
  | "note"
  | "known_fix"
  | "procedure"
  | "skill"
  | "policy"
  | "decision"
  | "pitfall"
  | "guideline"
  | "model";
export type TargetType = KnowledgeType;
export type Maturity = "draft" | "verified" | "proven";
export type ReviewDecision = "approve" | "reject" | "needs_human" | "conflict";
export type UsedInPhase = "diagnosis" | "repair" | "verification" | "proposal";
export type KnowledgeEffect = "helped_fix" | "guided_action" | "prevented_risk" | "not_useful";

export interface Evidence {
  source_uri: string;
  source_hash: string;
  excerpt: string;
  repair_result: RepairResult;
  verification: string;
}

export interface KnowledgeReference {
  id: string;
  path: string;
  used_in_phase: UsedInPhase;
  effect: KnowledgeEffect;
  outcome: RepairResult;
}
```

Write `packages/core/src/protocol/id.ts`:

```ts
export function slugifyId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makeId(prefix: string, value: string): string {
  const slug = slugifyId(value);
  if (!slug) {
    throw new Error("Cannot create id from empty value");
  }
  return `${prefix}_${slug}`;
}
```

- [ ] **Step 4: Implement Zod schemas**

Write `packages/core/src/protocol/schemas.ts`:

```ts
import { z } from "zod";
import { PROTOCOL_VERSION } from "./types.js";

export const ProtocolVersionSchema = z.literal(PROTOCOL_VERSION);
export const ScopeSchema = z.enum(["personal", "project", "team", "global"]);
export const AgentTypeSchema = z.enum([
  "temporary_repair_agent",
  "persistent_bot",
  "reviewer",
  "curator",
  "system_ingest"
]);
export const RepairResultSchema = z.enum(["success", "failed", "partial", "unknown"]);
export const RiskLevelSchema = z.enum(["low", "medium", "high"]);
export const ProposalActionSchema = z.enum(["create", "patch", "archive", "link"]);
export const KnowledgeTypeSchema = z.enum([
  "note",
  "known_fix",
  "procedure",
  "skill",
  "policy",
  "decision",
  "pitfall",
  "guideline",
  "model"
]);
export const TargetTypeSchema = KnowledgeTypeSchema;
export const MaturitySchema = z.enum(["draft", "verified", "proven"]);
export const ReviewDecisionSchema = z.enum(["approve", "reject", "needs_human", "conflict"]);
export const UsedInPhaseSchema = z.enum(["diagnosis", "repair", "verification", "proposal"]);
export const KnowledgeEffectSchema = z.enum(["helped_fix", "guided_action", "prevented_risk", "not_useful"]);

const DateTimeSchema = z.string().datetime();
const NonEmptyStringArray = z.array(z.string().min(1)).min(1);

export const EvidenceSchema = z.object({
  source_uri: z.string().min(1),
  source_hash: z.string().min(1),
  excerpt: z.string().min(1),
  repair_result: RepairResultSchema,
  verification: z.string().min(1)
});

export const KnowledgeReferenceSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  used_in_phase: UsedInPhaseSchema,
  effect: KnowledgeEffectSchema,
  outcome: RepairResultSchema
});

export const GovernanceMetadataSchema = z.object({
  knowledge_type: KnowledgeTypeSchema,
  maturity: MaturitySchema,
  scope: ScopeSchema,
  reference_count: z.number().int().min(0).default(0),
  last_referenced_at: DateTimeSchema.nullable().default(null),
  supersedes: z.array(z.string()).default([]),
  superseded_by: z.string().nullable().default(null)
});

export const EpisodeSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("repair_episode"),
  scope: ScopeSchema,
  agent_id: z.string().min(1),
  agent_type: AgentTypeSchema,
  environment_id: z.string().min(1),
  run_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  problem_signature: z.string().min(1),
  result: RepairResultSchema,
  knowledge_references: z.array(KnowledgeReferenceSchema).default([]),
  source_refs: NonEmptyStringArray,
  summary: z.string().min(1),
  created_at: DateTimeSchema
});

export const ProposalSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("knowledge_proposal"),
  scope: ScopeSchema,
  action: ProposalActionSchema,
  target_type: TargetTypeSchema,
  target_id: z.string().min(1),
  agent_id: z.string().min(1),
  agent_type: AgentTypeSchema,
  environment_id: z.string().min(1),
  run_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  evidence: EvidenceSchema,
  patch: z.object({
    path: z.string().min(1),
    content: z.string().min(1)
  }),
  created_at: DateTimeSchema
});

export const ReviewSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  proposal_id: z.string().min(1),
  reviewer_id: z.string().min(1),
  reviewer_model: z.string().min(1),
  prompt_version: z.string().min(1),
  decision: ReviewDecisionSchema,
  risk: RiskLevelSchema,
  confidence: z.number().min(0).max(1),
  reasons: NonEmptyStringArray,
  required_checks: z.array(z.string()).default([]),
  created_at: DateTimeSchema
});

export const KnownFixFrontmatterSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("known_fix"),
  knowledge_type: z.literal("known_fix"),
  scope: ScopeSchema,
  risk: RiskLevelSchema,
  status: z.enum(["draft", "published", "archived"]),
  maturity: MaturitySchema,
  signatures: NonEmptyStringArray,
  skills: z.array(z.string()).default([]),
  sources: z.array(z.object({ uri: z.string().min(1), hash: z.string().min(1) })).min(1),
  confidence: z.number().min(0).max(1),
  reference_count: z.number().int().min(0).default(0),
  last_referenced_at: DateTimeSchema.nullable().default(null),
  supersedes: z.array(z.string()).default([]),
  superseded_by: z.string().nullable().default(null),
  updated_at: DateTimeSchema
});

export const PitfallFrontmatterSchema = GovernanceMetadataSchema.extend({
  id: z.string().regex(/^[a-z0-9-]+$/),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("pitfall"),
  knowledge_type: z.literal("pitfall"),
  risk: RiskLevelSchema,
  status: z.enum(["draft", "published", "archived"]),
  signatures: NonEmptyStringArray,
  sources: z.array(z.object({ uri: z.string().min(1), hash: z.string().min(1) })).min(1),
  updated_at: DateTimeSchema
});

export type Episode = z.infer<typeof EpisodeSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type KnownFixFrontmatter = z.infer<typeof KnownFixFrontmatterSchema>;
export type PitfallFrontmatter = z.infer<typeof PitfallFrontmatterSchema>;
```

- [ ] **Step 5: Run schema tests**

Run:

```bash
pnpm test tests/core/protocol-schemas.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit schemas**

```bash
git add packages/core/src/protocol tests/core/protocol-schemas.test.ts
git commit -m "Define PraxisBase protocol schemas"
```

## Task 3: Implement File Store And Init Templates

**Files:**
- Create: `packages/core/src/protocol/paths.ts`
- Create: `packages/core/src/store/file-store.ts`
- Create: `packages/core/src/templates/seed.ts`
- Create: `packages/cli/src/commands/init.ts`
- Modify: `packages/cli/src/index.ts`
- Create: `tests/cli/init.test.ts`

- [ ] **Step 1: Write init test**

Write `tests/cli/init.test.ts`:

```ts
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeWorkspace } from "../../packages/cli/src/commands/init.js";

describe("praxisbase init", () => {
  it("creates the protocol skeleton and seed content", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-init-"));

    await initializeWorkspace(root);

    await expect(stat(join(root, ".praxisbase/config.yaml"))).resolves.toBeTruthy();
    await expect(stat(join(root, ".praxisbase/policies/autonomy.yaml"))).resolves.toBeTruthy();
    await expect(stat(join(root, ".praxisbase/exceptions/human-required"))).resolves.toBeTruthy();
    await expect(stat(join(root, ".praxisbase/runs/review"))).resolves.toBeTruthy();
    await expect(stat(join(root, "skills/openclaw/auth-repair/SKILL.md"))).resolves.toBeTruthy();
    await expect(stat(join(root, "kb/known-fixes/openclaw-auth-expired.md"))).resolves.toBeTruthy();

    const config = await readFile(join(root, ".praxisbase/config.yaml"), "utf8");
    expect(config).toContain("protocol_version: \"0.1\"");
  });
});
```

- [ ] **Step 2: Run init test to verify failure**

Run:

```bash
pnpm test tests/cli/init.test.ts
```

Expected: FAIL because `initializeWorkspace` does not exist.

- [ ] **Step 3: Implement protocol paths**

Write `packages/core/src/protocol/paths.ts`:

```ts
export const protocolPaths = {
  config: ".praxisbase/config.yaml",
  schedules: ".praxisbase/schedules.yaml",
  autonomyPolicy: ".praxisbase/policies/autonomy.yaml",
  riskRules: ".praxisbase/policies/risk-rules.yaml",
  inboxEpisodes: ".praxisbase/inbox/episodes",
  inboxProposals: ".praxisbase/inbox/proposals",
  inboxReviews: ".praxisbase/inbox/reviews",
  outboxEpisodes: ".praxisbase/outbox/episodes",
  outboxProposals: ".praxisbase/outbox/proposals",
  exceptionsHumanRequired: ".praxisbase/exceptions/human-required",
  exceptionsConflicts: ".praxisbase/exceptions/conflicts",
  exceptionsFailedChecks: ".praxisbase/exceptions/failed-checks",
  runsReview: ".praxisbase/runs/review",
  runsPromote: ".praxisbase/runs/promote",
  runsBuild: ".praxisbase/runs/build",
  cacheLastKnownGood: ".praxisbase/cache/last-known-good",
  indexes: ".praxisbase/indexes",
  bundles: ".praxisbase/bundles",
  knownFixes: "kb/known-fixes",
  pitfalls: "kb/pitfalls",
  procedures: "kb/procedures",
  notes: "kb/notes",
  memory: "kb/memory",
  sources: "kb/sources",
  skillsOpenClaw: "skills/openclaw",
  dist: "dist"
} as const;
```

- [ ] **Step 4: Implement seed templates**

Write `packages/core/src/templates/seed.ts`:

```ts
export const seedFiles: Record<string, string> = {
  ".praxisbase/config.yaml": `protocol_version: "0.1"
name: praxisbase-openclaw-repair
default_scope: team
`,
  ".praxisbase/schedules.yaml": `schedules:
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
  - id: build-bundles
    task: build
    cron: "*/30 * * * *"
    runner: gitlab-ci
`,
  ".praxisbase/policies/autonomy.yaml": `autonomy:
  mode: ai_automerge_with_human_exceptions
  reviewer:
    min_confidence: 0.75
    require_independent_context: true
  auto_merge:
    low: true
    medium: true
    high: false
`,
  ".praxisbase/policies/risk-rules.yaml": `human_required_for:
  - delete
  - rewrite_policy
  - enable_new_default_skill
  - modify_permissions
  - reduce_safety_checks
`,
  ".praxisbase/exceptions/human-required/.keep": "",
  ".praxisbase/exceptions/conflicts/.keep": "",
  ".praxisbase/exceptions/failed-checks/.keep": "",
  ".praxisbase/runs/review/.keep": "",
  ".praxisbase/runs/promote/.keep": "",
  ".praxisbase/runs/build/.keep": "",
  ".praxisbase/cache/last-known-good/.keep": "",
  "skills/openclaw/baseline-diagnostics/SKILL.md": `# OpenClaw Baseline Diagnostics

Use this skill before applying a repair. Capture OpenClaw status, Claude Code status, recent logs, workspace path, runtime version, and network reachability. Do not modify production systems from a sandbox repair run.
`,
  "skills/openclaw/auth-repair/SKILL.md": `# OpenClaw Auth Repair

Use this skill when logs indicate Claude Code or the model gateway cannot authenticate.

## Verification

Run a minimal agent/model call and confirm it succeeds.

## Rollback

Restore the previous auth state snapshot if refresh makes the session worse.
`,
  "kb/known-fixes/openclaw-auth-expired.md": `---
id: openclaw-auth-expired
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: draft
maturity: draft
signatures:
  - openclaw:claude-auth-expired
skills:
  - skills/openclaw/auth-repair/SKILL.md
sources:
  - uri: seed://openclaw/auth-expired
    hash: sha256:seed
confidence: 0.6
reference_count: 0
last_referenced_at:
supersedes: []
superseded_by:
updated_at: 2026-05-17T00:00:00Z
---

## Symptoms

Claude Code reports expired authentication or cannot call the configured model gateway.

## Diagnosis

Check auth state, gateway reachability, and recent OpenClaw logs.

## Fix

Refresh sandbox auth state and restart the agent session.

## Verification

Run a minimal model call.

## Rollback

Restore the previous auth state snapshot.
`
};
```

- [ ] **Step 5: Implement file store**

Write `packages/core/src/store/file-store.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function writeText(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

export async function readText(root: string, relativePath: string): Promise<string> {
  return readFile(join(root, relativePath), "utf8");
}

export async function writeJson(root: string, relativePath: string, value: unknown): Promise<void> {
  await writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson<T = unknown>(root: string, relativePath: string): Promise<T> {
  return JSON.parse(await readText(root, relativePath)) as T;
}
```

- [ ] **Step 6: Implement init command**

Write `packages/cli/src/commands/init.ts`:

```ts
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { seedFiles } from "@praxisbase/core";
import { writeText } from "@praxisbase/core/store/file-store.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";

export async function initializeWorkspace(root: string): Promise<void> {
  const directories = [
    protocolPaths.inboxEpisodes,
    protocolPaths.inboxProposals,
    protocolPaths.inboxReviews,
    protocolPaths.outboxEpisodes,
    protocolPaths.outboxProposals,
    protocolPaths.indexes,
    protocolPaths.bundles,
    protocolPaths.procedures,
    protocolPaths.notes,
    protocolPaths.memory,
    protocolPaths.sources,
    protocolPaths.dist
  ];

  await Promise.all(directories.map((dir) => mkdir(join(root, dir), { recursive: true })));

  for (const [relativePath, content] of Object.entries(seedFiles)) {
    await writeText(root, relativePath, content);
  }
}
```

Modify `packages/core/src/index.ts`:

```ts
export * from "./protocol/types.js";
export * from "./protocol/schemas.js";
export * from "./protocol/paths.js";
export * from "./templates/seed.js";
```

Modify `packages/cli/src/index.ts` to register `init`:

```ts
#!/usr/bin/env node
import { Command } from "commander";
import { initializeWorkspace } from "./commands/init.js";

const program = new Command();

program
  .name("praxisbase")
  .description("Agent-native knowledge substrate for OpenClaw repair workflows")
  .version("0.1.0");

program.command("init").action(async () => {
  await initializeWorkspace(process.cwd());
});

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
```

- [ ] **Step 7: Run init test**

Run:

```bash
pnpm test tests/cli/init.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit init support**

```bash
git add packages/core/src packages/cli/src tests/cli/init.test.ts
git commit -m "Add PraxisBase workspace initialization"
```

## Task 4: Build OpenClaw Repair Context

**Files:**
- Create: `packages/core/src/repair/signature.ts`
- Create: `packages/core/src/repair/context.ts`
- Create: `tests/fixtures/openclaw/logs/claude-auth-expired.log`
- Create: `tests/core/repair-context.test.ts`
- Create: `packages/cli/src/commands/repair-context.ts`
- Create: `tests/cli/repair-context.test.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Add fixture log**

Write `tests/fixtures/openclaw/logs/claude-auth-expired.log`:

```text
2026-05-17T10:00:00Z openclaw session failed
Claude Code error: authentication expired
Model gateway call returned 401 unauthorized
Please refresh credentials and retry.
```

- [ ] **Step 2: Write repair context unit test**

Write `tests/core/repair-context.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildOpenClawRepairContext } from "../../packages/core/src/repair/context.js";

describe("OpenClaw repair context", () => {
  it("detects auth-expired logs and returns a safe bundle", async () => {
    const log = await readFile("tests/fixtures/openclaw/logs/claude-auth-expired.log", "utf8");

    const context = buildOpenClawRepairContext({ logs: log });

    expect(context.problem_signature).toBe("openclaw:claude-auth-expired");
    expect(context.skills).toContain("skills/openclaw/auth-repair/SKILL.md");
    expect(context.forbidden_operations).toContain("modify production systems");
    expect(context.verification_steps.length).toBeGreaterThan(0);
    expect(context.rollback_steps.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run repair context test to verify failure**

Run:

```bash
pnpm test tests/core/repair-context.test.ts
```

Expected: FAIL because repair context code does not exist.

- [ ] **Step 4: Implement signature detection**

Write `packages/core/src/repair/signature.ts`:

```ts
export function detectOpenClawProblemSignature(logs: string): string {
  const normalized = logs.toLowerCase();

  if (
    normalized.includes("authentication expired") ||
    normalized.includes("401 unauthorized") ||
    normalized.includes("refresh credentials")
  ) {
    return "openclaw:claude-auth-expired";
  }

  if (normalized.includes("workspace lock") || normalized.includes("lock file")) {
    return "openclaw:workspace-lock-stuck";
  }

  if (normalized.includes("node: command not found") || normalized.includes("node runtime")) {
    return "openclaw:node-runtime-missing";
  }

  return "openclaw:unknown";
}
```

- [ ] **Step 5: Implement repair context builder**

Write `packages/core/src/repair/context.ts`:

```ts
import { detectOpenClawProblemSignature } from "./signature.js";

export interface RepairContextInput {
  logs: string;
}

export interface RepairContext {
  protocol_version: "0.1";
  scenario: "openclaw";
  problem_signature: string;
  skills: string[];
  known_fixes: string[];
  diagnostic_commands: string[];
  forbidden_operations: string[];
  verification_steps: string[];
  rollback_steps: string[];
  escalation_conditions: string[];
}

export function buildOpenClawRepairContext(input: RepairContextInput): RepairContext {
  const signature = detectOpenClawProblemSignature(input.logs);

  if (signature === "openclaw:claude-auth-expired") {
    return {
      protocol_version: "0.1",
      scenario: "openclaw",
      problem_signature: signature,
      skills: ["skills/openclaw/baseline-diagnostics/SKILL.md", "skills/openclaw/auth-repair/SKILL.md"],
      known_fixes: ["kb/known-fixes/openclaw-auth-expired.md"],
      diagnostic_commands: [
        "openclaw status",
        "claude --version",
        "env | grep -E 'CLAUDE|OPENAI|ANTHROPIC|MODEL'"
      ],
      forbidden_operations: ["modify production systems", "delete user workspace data", "print secrets into chat"],
      verification_steps: ["Run a minimal model call from the sandbox", "Confirm OpenClaw session resumes"],
      rollback_steps: ["Restore previous auth state snapshot if available", "Revert local credential file changes"],
      escalation_conditions: ["Auth refresh fails twice", "Logs mention production credentials", "Verification command cannot run"]
    };
  }

  return {
    protocol_version: "0.1",
    scenario: "openclaw",
    problem_signature: signature,
    skills: ["skills/openclaw/baseline-diagnostics/SKILL.md"],
    known_fixes: [],
    diagnostic_commands: ["openclaw status", "tail -n 200 openclaw.log"],
    forbidden_operations: ["modify production systems", "delete user workspace data", "print secrets into chat"],
    verification_steps: ["Record diagnostic results"],
    rollback_steps: ["Do not apply changes until a known fix is identified"],
    escalation_conditions: ["No known signature matched"]
  };
}
```

- [ ] **Step 6: Run repair context unit test**

Run:

```bash
pnpm test tests/core/repair-context.test.ts
```

Expected: PASS.

- [ ] **Step 7: Implement CLI repair-context command**

Write `packages/cli/src/commands/repair-context.ts`:

```ts
import { readFile } from "node:fs/promises";
import { buildOpenClawRepairContext } from "@praxisbase/core/repair/context.js";

export async function repairContextCommand(scenario: string, options: { logs: string; json?: boolean }): Promise<string> {
  if (scenario !== "openclaw") {
    throw new Error(`Unsupported repair scenario: ${scenario}`);
  }

  const logs = await readFile(options.logs, "utf8");
  const context = buildOpenClawRepairContext({ logs });
  return options.json ? JSON.stringify(context, null, 2) : context.problem_signature;
}
```

Modify `packages/cli/src/index.ts` to register the command:

```ts
import { repairContextCommand } from "./commands/repair-context.js";

program
  .command("repair-context")
  .argument("<scenario>")
  .requiredOption("--logs <path>")
  .option("--json")
  .action(async (scenario: string, options: { logs: string; json?: boolean }) => {
    console.log(await repairContextCommand(scenario, options));
  });
```

- [ ] **Step 8: Write CLI test**

Write `tests/cli/repair-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { repairContextCommand } from "../../packages/cli/src/commands/repair-context.js";

describe("repair-context command", () => {
  it("returns JSON repair context", async () => {
    const output = await repairContextCommand("openclaw", {
      logs: "tests/fixtures/openclaw/logs/claude-auth-expired.log",
      json: true
    });

    const parsed = JSON.parse(output) as { problem_signature: string };
    expect(parsed.problem_signature).toBe("openclaw:claude-auth-expired");
  });
});
```

- [ ] **Step 9: Run repair CLI tests**

Run:

```bash
pnpm test tests/core/repair-context.test.ts tests/cli/repair-context.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit repair context**

```bash
git add packages/core/src/repair packages/cli/src tests
git commit -m "Build OpenClaw repair context bundles"
```

## Task 5: Implement Episode And Proposal Intake

**Files:**
- Create: `packages/cli/src/commands/episode.ts`
- Create: `packages/cli/src/commands/propose.ts`
- Create: `tests/fixtures/openclaw/episodes/success.json`
- Create: `tests/fixtures/openclaw/proposals/known-fix.json`
- Create: `tests/cli/intake.test.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Add valid fixture objects**

Write `tests/fixtures/openclaw/episodes/success.json`:

```json
{
  "id": "episode_20260517_abc",
  "protocol_version": "0.1",
  "type": "repair_episode",
  "scope": "team",
  "agent_id": "openclaw-temp-xyz",
  "agent_type": "temporary_repair_agent",
  "environment_id": "sandbox-123",
  "run_id": "run-456",
  "idempotency_key": "episode_20260517_abc",
  "problem_signature": "openclaw:claude-auth-expired",
  "result": "success",
  "knowledge_references": [
    {
      "id": "openclaw-auth-expired",
      "path": "kb/known-fixes/openclaw-auth-expired.md",
      "used_in_phase": "diagnosis",
      "effect": "helped_fix",
      "outcome": "success"
    }
  ],
  "source_refs": ["log://openclaw/sandbox-123/run-456"],
  "summary": "Refreshed auth state and restarted the session.",
  "created_at": "2026-05-17T10:00:00Z"
}
```

Write `tests/fixtures/openclaw/proposals/known-fix.json`:

```json
{
  "id": "proposal_20260517_known_fix",
  "protocol_version": "0.1",
  "type": "knowledge_proposal",
  "scope": "team",
  "action": "create",
  "target_type": "known_fix",
  "target_id": "openclaw-auth-expired",
  "agent_id": "openclaw-temp-xyz",
  "agent_type": "temporary_repair_agent",
  "environment_id": "sandbox-123",
  "run_id": "run-456",
  "idempotency_key": "proposal_20260517_known_fix",
  "evidence": {
    "source_uri": "log://openclaw/sandbox-123/run-456",
    "source_hash": "sha256:abc",
    "excerpt": "Claude auth expired; refresh fixed it.",
    "repair_result": "success",
    "verification": "Minimal model call completed."
  },
  "patch": {
    "path": "kb/known-fixes/openclaw-auth-expired.md",
    "content": "# OpenClaw auth expired\n"
  },
  "created_at": "2026-05-17T10:00:00Z"
}
```

- [ ] **Step 2: Write intake tests**

Write `tests/cli/intake.test.ts`:

```ts
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { submitEpisode } from "../../packages/cli/src/commands/episode.js";
import { submitProposal } from "../../packages/cli/src/commands/propose.js";

describe("episode and proposal intake", () => {
  it("writes a valid episode to inbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-episode-"));

    await submitEpisode(root, "tests/fixtures/openclaw/episodes/success.json");

    await expect(stat(join(root, ".praxisbase/inbox/episodes/episode_20260517_abc.json"))).resolves.toBeTruthy();
  });

  it("writes a valid proposal to inbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-proposal-"));

    await submitProposal(root, "tests/fixtures/openclaw/proposals/known-fix.json");

    const stored = await readFile(
      join(root, ".praxisbase/inbox/proposals/proposal_20260517_known_fix.json"),
      "utf8"
    );
    expect(stored).toContain("openclaw-auth-expired");
  });
});
```

- [ ] **Step 3: Implement episode command**

Write `packages/cli/src/commands/episode.ts`:

```ts
import { readFile } from "node:fs/promises";
import { EpisodeSchema } from "@praxisbase/core";
import { writeJson } from "@praxisbase/core/store/file-store.js";

export async function submitEpisode(root: string, inputPath: string): Promise<void> {
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const episode = EpisodeSchema.parse(raw);
  await writeJson(root, `.praxisbase/inbox/episodes/${episode.id}.json`, episode);
}
```

- [ ] **Step 4: Implement proposal command**

Write `packages/cli/src/commands/propose.ts`:

```ts
import { readFile } from "node:fs/promises";
import { ProposalSchema } from "@praxisbase/core";
import { writeJson } from "@praxisbase/core/store/file-store.js";

export async function submitProposal(root: string, inputPath: string): Promise<void> {
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const proposal = ProposalSchema.parse(raw);
  await writeJson(root, `.praxisbase/inbox/proposals/${proposal.id}.json`, proposal);
}
```

- [ ] **Step 5: Register intake commands**

Modify `packages/cli/src/index.ts`:

```ts
import { submitEpisode } from "./commands/episode.js";
import { submitProposal } from "./commands/propose.js";

program
  .command("episode")
  .argument("submit")
  .argument("<file>")
  .action(async (_submit: string, file: string) => {
    await submitEpisode(process.cwd(), file);
  });

program
  .command("propose")
  .argument("<file>")
  .action(async (file: string) => {
    await submitProposal(process.cwd(), file);
  });
```

- [ ] **Step 6: Run intake tests**

Run:

```bash
pnpm test tests/cli/intake.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit intake**

```bash
git add packages/cli/src tests/fixtures tests/cli/intake.test.ts
git commit -m "Accept repair episodes and knowledge proposals"
```

## Task 6: Implement Risk Review And Promotion

**Files:**
- Create: `packages/core/src/review/risk.ts`
- Create: `packages/core/src/review/reviewer.ts`
- Create: `packages/core/src/promote/promote.ts`
- Create: `tests/core/review-risk.test.ts`
- Create: `tests/core/promote.test.ts`
- Create: `packages/cli/src/commands/review.ts`
- Create: `packages/cli/src/commands/promote.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Write risk tests**

Write `tests/core/review-risk.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyProposalRisk, shouldAutoMergeReview } from "../../packages/core/src/review/risk.js";

describe("review risk", () => {
  it("classifies known-fix create as medium risk", () => {
    const risk = classifyProposalRisk({ action: "create", target_type: "known_fix" });
    expect(risk).toBe("medium");
  });

  it("classifies policy patch as high risk", () => {
    const risk = classifyProposalRisk({ action: "patch", target_type: "policy" });
    expect(risk).toBe("high");
  });

  it("classifies pitfall create as medium risk", () => {
    const risk = classifyProposalRisk({ action: "create", target_type: "pitfall" });
    expect(risk).toBe("medium");
  });

  it("allows auto-merge for medium approval above confidence threshold", () => {
    expect(shouldAutoMergeReview({ decision: "approve", risk: "medium", confidence: 0.8 })).toBe(true);
  });

  it("blocks auto-merge for high risk", () => {
    expect(shouldAutoMergeReview({ decision: "approve", risk: "high", confidence: 0.95 })).toBe(false);
  });
});
```

- [ ] **Step 2: Implement risk classifier**

Write `packages/core/src/review/risk.ts`:

```ts
import type { ProposalAction, RiskLevel, TargetType } from "../protocol/types.js";

export function classifyProposalRisk(input: { action: ProposalAction; target_type: TargetType }): RiskLevel {
  if (input.action === "archive") return "high";
  if (input.target_type === "policy" || input.target_type === "decision") return "high";
  if (input.target_type === "skill" && input.action !== "link") return "medium";
  if (input.target_type === "known_fix" || input.target_type === "procedure" || input.target_type === "pitfall") {
    return "medium";
  }
  return "low";
}

export function shouldAutoMergeReview(input: {
  decision: "approve" | "reject" | "needs_human" | "conflict";
  risk: RiskLevel;
  confidence: number;
}): boolean {
  return input.decision === "approve" && input.risk !== "high" && input.confidence >= 0.75;
}
```

- [ ] **Step 3: Implement deterministic MVP reviewer**

Write `packages/core/src/review/reviewer.ts`:

```ts
import { PROTOCOL_VERSION } from "../protocol/types.js";
import type { Proposal, Review } from "../protocol/schemas.js";
import { classifyProposalRisk } from "./risk.js";

export function reviewProposal(proposal: Proposal): Review {
  const risk = classifyProposalRisk({ action: proposal.action, target_type: proposal.target_type });
  const hasVerification = proposal.evidence.verification.trim().length > 0;
  const hasEvidence = proposal.evidence.source_uri.trim().length > 0 && proposal.evidence.source_hash.trim().length > 0;
  const decision = risk === "high" || !hasVerification || !hasEvidence ? "needs_human" : "approve";

  return {
    id: `review_${proposal.id}`,
    protocol_version: PROTOCOL_VERSION,
    proposal_id: proposal.id,
    reviewer_id: "mvp-deterministic-reviewer",
    reviewer_model: "deterministic-v0",
    prompt_version: "review-v0.1",
    decision,
    risk,
    confidence: decision === "approve" ? 0.82 : 0.65,
    reasons:
      decision === "approve"
        ? ["Evidence and verification are present."]
        : ["Proposal is high risk or lacks evidence required for auto-merge."],
    required_checks: ["praxisbase check"],
    created_at: new Date().toISOString()
  };
}
```

- [ ] **Step 4: Write promotion test**

Write `tests/core/promote.test.ts`:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { promoteApprovedProposal } from "../../packages/core/src/promote/promote.js";

describe("promotion", () => {
  it("writes approved known-fix proposal content into kb", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-promote-"));

    await promoteApprovedProposal(root, {
      proposal: {
        id: "proposal_20260517_known_fix",
        protocol_version: "0.1",
        type: "knowledge_proposal",
        scope: "team",
        action: "create",
        target_type: "known_fix",
        target_id: "openclaw-auth-expired",
        agent_id: "openclaw-temp-xyz",
        agent_type: "temporary_repair_agent",
        environment_id: "sandbox-123",
        run_id: "run-456",
        idempotency_key: "proposal_20260517_known_fix",
        evidence: {
          source_uri: "log://openclaw/sandbox-123/run-456",
          source_hash: "sha256:abc",
          excerpt: "Auth refresh fixed the repair.",
          repair_result: "success",
          verification: "Minimal model call completed."
        },
        patch: {
          path: "kb/known-fixes/openclaw-auth-expired.md",
          content: "# OpenClaw auth expired\n"
        },
        created_at: "2026-05-17T10:00:00Z"
      },
      review: {
        id: "review_proposal_20260517_known_fix",
        protocol_version: "0.1",
        proposal_id: "proposal_20260517_known_fix",
        reviewer_id: "reviewer",
        reviewer_model: "deterministic-v0",
        prompt_version: "review-v0.1",
        decision: "approve",
        risk: "medium",
        confidence: 0.82,
        reasons: ["Evidence exists."],
        required_checks: ["praxisbase check"],
        created_at: "2026-05-17T10:00:00Z"
      }
    });

    const written = await readFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), "utf8");
    expect(written).toContain("OpenClaw auth expired");
  });
});
```

- [ ] **Step 5: Implement promotion**

Write `packages/core/src/promote/promote.ts`:

```ts
import type { Proposal, Review } from "../protocol/schemas.js";
import { writeText } from "../store/file-store.js";
import { shouldAutoMergeReview } from "../review/risk.js";

export async function promoteApprovedProposal(root: string, input: { proposal: Proposal; review: Review }): Promise<void> {
  if (!shouldAutoMergeReview(input.review)) {
    throw new Error(`Review is not eligible for auto-merge: ${input.review.decision}`);
  }

  if (!input.proposal.patch.path.startsWith("kb/") && !input.proposal.patch.path.startsWith("skills/")) {
    throw new Error(`Proposal patch path is outside stable knowledge: ${input.proposal.patch.path}`);
  }

  await writeText(root, input.proposal.patch.path, input.proposal.patch.content);
}
```

- [ ] **Step 6: Run review and promotion tests**

Run:

```bash
pnpm test tests/core/review-risk.test.ts tests/core/promote.test.ts
```

Expected: PASS.

- [ ] **Step 7: Add CLI command wrappers**

Write `packages/cli/src/commands/review.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ProposalSchema } from "@praxisbase/core";
import { reviewProposal } from "@praxisbase/core/review/reviewer.js";
import { writeJson } from "@praxisbase/core/store/file-store.js";

export async function reviewAuto(root: string): Promise<void> {
  const proposalDir = join(root, ".praxisbase/inbox/proposals");
  const files = await readdir(proposalDir).catch(() => []);

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const raw = JSON.parse(await readFile(join(proposalDir, file), "utf8"));
    const proposal = ProposalSchema.parse(raw);
    const review = reviewProposal(proposal);
    await writeJson(root, `.praxisbase/inbox/reviews/${review.id}.json`, review);
    if (review.decision === "needs_human") {
      await writeJson(root, `.praxisbase/exceptions/human-required/${review.id}.json`, { proposal_id: proposal.id, review_id: review.id, reasons: review.reasons });
    }
  }
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  await writeJson(root, `.praxisbase/runs/review/${runId}.json`, { task: "review", status: "completed" });
}
```

Write `packages/cli/src/commands/promote.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ProposalSchema, ReviewSchema } from "@praxisbase/core";
import { promoteApprovedProposal } from "@praxisbase/core/promote/promote.js";
import { shouldAutoMergeReview } from "@praxisbase/core/review/risk.js";
import { writeJson } from "@praxisbase/core/store/file-store.js";

export async function promoteAuto(root: string): Promise<void> {
  const proposalDir = join(root, ".praxisbase/inbox/proposals");
  const reviewDir = join(root, ".praxisbase/inbox/reviews");
  const proposalFiles = await readdir(proposalDir).catch(() => []);
  const reviewFiles = await readdir(reviewDir).catch(() => []);

  const proposals = new Map();
  for (const file of proposalFiles.filter((name) => name.endsWith(".json"))) {
    const proposal = ProposalSchema.parse(JSON.parse(await readFile(join(proposalDir, file), "utf8")));
    proposals.set(proposal.id, proposal);
  }

  for (const file of reviewFiles.filter((name) => name.endsWith(".json"))) {
    const review = ReviewSchema.parse(JSON.parse(await readFile(join(reviewDir, file), "utf8")));
    if (!shouldAutoMergeReview(review)) continue;
    const proposal = proposals.get(review.proposal_id);
    if (proposal) {
      await promoteApprovedProposal(root, { proposal, review });
    }
  }
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  await writeJson(root, `.praxisbase/runs/promote/${runId}.json`, { task: "promote", status: "completed" });
}
```

Register `review --auto` and `promote --auto` in `packages/cli/src/index.ts`:

```ts
import { promoteAuto } from "./commands/promote.js";
import { reviewAuto } from "./commands/review.js";

program.command("review").option("--auto").action(async () => {
  await reviewAuto(process.cwd());
});

program.command("promote").option("--auto").action(async () => {
  await promoteAuto(process.cwd());
});
```

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit review and promotion**

```bash
git add packages/core/src/review packages/core/src/promote packages/cli/src tests/core
git commit -m "Review and promote knowledge proposals"
```

## Task 7: Generate Static Bundles And Inspection Output

**Files:**
- Create: `packages/core/src/search/search-index.ts`
- Create: `packages/core/src/build/build.ts`
- Create: `packages/core/src/build/html.ts`
- Create: `packages/core/src/bundles/fetch.ts`
- Create: `tests/core/build.test.ts`
- Create: `tests/cli/bundle-fetch.test.ts`
- Create: `packages/cli/src/commands/build.ts`
- Create: `packages/cli/src/commands/check.ts`
- Create: `packages/cli/src/commands/bundle-fetch.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Write build test**

Write `tests/core/build.test.ts`:

```ts
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeWorkspace } from "../../packages/cli/src/commands/init.js";
import { buildStaticArtifacts } from "../../packages/core/src/build/build.js";

describe("static build", () => {
  it("generates repair bundles, indexes, manifest, llms.txt, and HTML", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-build-"));
    await initializeWorkspace(root);

    await buildStaticArtifacts(root);

    await expect(stat(join(root, "dist/repair-bundles/manifest.json"))).resolves.toBeTruthy();
    await expect(stat(join(root, "dist/kb-index.json"))).resolves.toBeTruthy();
    await expect(stat(join(root, "dist/search-index.json"))).resolves.toBeTruthy();
    await expect(stat(join(root, "dist/llms.txt"))).resolves.toBeTruthy();
    await expect(stat(join(root, "dist/index.html"))).resolves.toBeTruthy();

    const manifest = await readFile(join(root, "dist/repair-bundles/manifest.json"), "utf8");
    expect(manifest).toContain("openclaw-sandbox");
  });
});
```

- [ ] **Step 2: Implement HTML helper**

Write `packages/core/src/build/html.ts`:

```ts
export function renderInspectionHtml(input: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${input.title}</title>
</head>
<body>
  <main>
    <h1>${input.title}</h1>
    ${input.body}
  </main>
</body>
</html>
`;
}
```

- [ ] **Step 3: Implement static build**

Write `packages/core/src/build/build.ts`:

```ts
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { readText, writeJson, writeText } from "../store/file-store.js";
import { renderInspectionHtml } from "./html.js";

async function exists(root: string, path: string): Promise<boolean> {
  try {
    await stat(`${root}/${path}`);
    return true;
  } catch {
    return false;
  }
}

function sha256(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

export async function buildStaticArtifacts(root: string): Promise<void> {
  const knownFixPath = "kb/known-fixes/openclaw-auth-expired.md";
  const knownFix = (await exists(root, knownFixPath)) ? await readText(root, knownFixPath) : "";
  const bundle = {
    protocol_version: "0.1",
    id: "openclaw-sandbox",
    scenario: "openclaw",
    generated_at: new Date().toISOString(),
    known_fixes: knownFix ? [knownFixPath] : [],
    skills: ["skills/openclaw/baseline-diagnostics/SKILL.md", "skills/openclaw/auth-repair/SKILL.md"],
    forbidden_operations: ["modify production systems", "delete user workspace data", "print secrets into chat"]
  };

  await writeJson(root, "dist/repair-bundles/openclaw-sandbox.json", bundle);
  await writeJson(root, "dist/repair-bundles/manifest.json", {
    protocol_version: "0.1",
    bundles: [
      {
        id: "openclaw-sandbox",
        path: "repair-bundles/openclaw-sandbox.json",
        checksum: sha256(JSON.stringify(bundle)),
        compatible_cli_version: "0.1.x"
      }
    ]
  });
  await writeJson(root, "dist/kb-index.json", {
    protocol_version: "0.1",
    objects: knownFix ? [{ id: "openclaw-auth-expired", type: "known_fix", path: knownFixPath }] : []
  });
  await writeJson(root, "dist/search-index.json", {
    protocol_version: "0.1",
    documents: knownFix ? [{ id: "openclaw-auth-expired", text: knownFix }] : []
  });
  await writeText(root, "dist/llms.txt", "# PraxisBase\n\n- OpenClaw repair bundle: /repair-bundles/openclaw-sandbox.json\n");
  await writeText(
    root,
    "dist/index.html",
    renderInspectionHtml({
      title: "PraxisBase OpenClaw Repair MVP",
      body: "<p>Static inspection output for repair knowledge.</p>"
    })
  );
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  await writeJson(root, `.praxisbase/runs/build/${runId}.json`, { task: "build", status: "completed" });
}
```

- [ ] **Step 4: Run build test**

Run:

```bash
pnpm test tests/core/build.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add bundle fetch with last-known-good cache**

Write `packages/core/src/bundles/fetch.ts`:

```ts
import { readJson, writeJson } from "../store/file-store.js";

export type BundleFetchResult = {
  bundle: unknown;
  warning?: "latest_unavailable_using_cache";
};

export async function fetchRepairBundle(root: string, scenario: string): Promise<BundleFetchResult> {
  const bundlePath = `dist/repair-bundles/${scenario}-sandbox.json`;
  const cachePath = `.praxisbase/cache/last-known-good/${scenario}-sandbox.json`;

  try {
    const bundle = await readJson(root, bundlePath);
    await writeJson(root, cachePath, bundle);
    return { bundle };
  } catch (latestError) {
    try {
      return {
        bundle: await readJson(root, cachePath),
        warning: "latest_unavailable_using_cache"
      };
    } catch {
      throw latestError;
    }
  }
}
```

Write `tests/cli/bundle-fetch.test.ts` to cover both latest bundle reads and cache fallback after deleting or making `dist/repair-bundles/openclaw-sandbox.json` unavailable.

- [ ] **Step 6: Add CLI build/check/bundle commands**

Write `packages/cli/src/commands/build.ts`:

```ts
import { buildStaticArtifacts } from "@praxisbase/core/build/build.js";

export async function buildCommand(root: string): Promise<void> {
  await buildStaticArtifacts(root);
}
```

Write `packages/cli/src/commands/check.ts`:

```ts
import { stat } from "node:fs/promises";

export async function checkCommand(root: string): Promise<void> {
  const required = [".praxisbase/config.yaml", "skills/openclaw/baseline-diagnostics/SKILL.md"];
  for (const path of required) {
    await stat(`${root}/${path}`);
  }
}
```

Register `build` and `check` in `packages/cli/src/index.ts`.

Register `bundle fetch` in `packages/cli/src/index.ts` and print JSON with `bundle` plus optional `warning`.

- [ ] **Step 7: Run full checks**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 8: Commit static build**

```bash
git add packages/core/src/build packages/cli/src tests/core/build.test.ts
git commit -m "Generate static repair bundles and inspection output"
```

## Task 8: Add GitLab Scheduled Pipeline Template

**Files:**
- Create: `templates/gitlab/.gitlab-ci.yml`
- Create: `tests/fixtures/gitlab-ci-expected.txt`

- [ ] **Step 1: Write GitLab CI template**

Write `templates/gitlab/.gitlab-ci.yml`:

```yaml
variables:
  NODE_IMAGE: node:20-alpine
  PRAXISBASE_ROOT: $CI_PROJECT_DIR

stages:
  - review
  - promote
  - build

.praxisbase-node:
  image: $NODE_IMAGE
  before_script:
    - corepack enable
    - pnpm install --frozen-lockfile

praxisbase:review:
  extends: .praxisbase-node
  stage: review
  resource_group: praxisbase-write
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule" && $PRAXISBASE_TASK == "review"
  script:
    - pnpm --filter @praxisbase/cli build
    - pnpm exec praxisbase review --auto

praxisbase:promote:
  extends: .praxisbase-node
  stage: promote
  resource_group: praxisbase-write
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule" && $PRAXISBASE_TASK == "promote"
  script:
    - pnpm --filter @praxisbase/cli build
    - pnpm exec praxisbase promote --auto
    - pnpm exec praxisbase check

praxisbase:build:
  extends: .praxisbase-node
  stage: build
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule" && $PRAXISBASE_TASK == "build"
    - if: $CI_COMMIT_BRANCH == "main"
  script:
    - pnpm --filter @praxisbase/cli build
    - pnpm exec praxisbase build
  artifacts:
    paths:
      - dist/
    expire_in: 7 days
```

- [ ] **Step 2: Verify template includes write lock**

Run:

```bash
rg "resource_group: praxisbase-write" templates/gitlab/.gitlab-ci.yml
```

Expected: at least two matches for review and promote jobs.

- [ ] **Step 3: Commit GitLab template**

```bash
git add templates/gitlab/.gitlab-ci.yml
git commit -m "Add GitLab schedules for PraxisBase automation"
```

## Final Verification

- [ ] **Step 1: Run typecheck and tests**

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 2: Run a local smoke flow**

```bash
repo=$(pwd)
tmpdir=$(mktemp -d)
pnpm --filter @praxisbase/cli build
(cd "$tmpdir" && node "$repo/packages/cli/dist/index.js" init)
(cd "$tmpdir" && node "$repo/packages/cli/dist/index.js" repair-context openclaw --logs "$repo/tests/fixtures/openclaw/logs/claude-auth-expired.log" --json)
(cd "$tmpdir" && node "$repo/packages/cli/dist/index.js" build)
(cd "$tmpdir" && node "$repo/packages/cli/dist/index.js" bundle fetch openclaw --signature openclaw:claude-auth-expired)
test -f "$tmpdir/dist/repair-bundles/manifest.json"
```

Expected: command exits with code 0 and manifest file exists.

- [ ] **Step 3: Commit final verification fixes**

If verification required any code or docs changes:

```bash
git add .
git commit -m "Stabilize OpenClaw repair MVP verification"
```

## Out Of Scope For This Plan

- MCP server implementation
- Hermes runner implementation
- K8s incident runtime integration
- External search service
- Vector database
- Phase 2 interactive `search`, `read`, `curate`, or `run ingest` commands
- Blockchain or distributed consensus
- Multi-tenant role system beyond Git permissions and protocol modes
- Direct production-system repair automation

## Handoff Notes For Another AI

- Read `docs/superpowers/specs/2026-05-17-agent-knowledge-substrate-design.md` before touching code.
- Use this plan as the execution source of truth for Phase 1.
- Use `docs/openspec/changes/openclaw-repair-mvp/` as the change contract.
- Use `docs/bdd/openclaw-repair-mvp.feature` as the behavior acceptance suite.
- Do not rename the project back to a wiki-only tool.
- Do not add vector search, MCP, Hermes runner, or K8s runtime code while executing this plan.
- Treat Phase 1 command scope as: `init`, `repair-context`, `bundle fetch`, `episode submit`, `propose`, `review --auto`, `promote --auto`, `build`, and `check`.
