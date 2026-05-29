# M25 Memory-First Experience Distillation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PraxisBase extract useful OpenClaw/Codex agent experience from raw memory/session/log evidence and compile it into governed lesson, wiki, skill, and runtime-context candidates.

**Architecture:** Add a memory-first lesson layer between source adapters and wiki/skill curation. The layer builds source inventory and evidence spans, extracts `ExperienceLesson` candidates deterministically and with LLMs, abstracts privacy, scores stability, then feeds existing wiki/skill/context surfaces. OpenHuman source mechanisms are used as design references only; do not copy GPL code, prompts, or rules.

**Tech Stack:** TypeScript, Node.js, zod schemas, existing `AiJsonClient`, existing file-store/report paths, Node test runner through `pnpm test`.

---

## File Structure

- Create `packages/core/src/experience/lesson-model.ts`: zod schemas and TypeScript types for source inventory, spans, lessons, states, reports.
- Create `packages/core/src/experience/source-inventory.ts`: file/sqlite/session/skill source discovery and markdown section/span mapping.
- Create `packages/core/src/experience/lesson-planner.ts`: span scoring and budgeted selection.
- Create `packages/core/src/experience/lesson-deterministic.ts`: high-precision non-LLM extraction.
- Create `packages/core/src/experience/lesson-extractor.ts`: LLM extraction, schema validation, cache identity, malformed-output handling.
- Create `packages/core/src/experience/lesson-privacy.ts`: safe-claim abstraction and team/personal routing.
- Create `packages/core/src/experience/lesson-cache.ts`: lesson state scoring, dedupe, pin/forget/dismiss.
- Create `packages/core/src/experience/lesson-authority.ts`: integration-contract helpers for choosing lesson clusters over legacy summaries and sidecar hits.
- Create `packages/core/src/experience/lesson-retrieval.ts`: personal runtime lesson retrieval and bounded rendering.
- Create `packages/core/src/wiki/lesson-compiler.ts`: convert lesson clusters into wiki curation inputs/page sections.
- Modify `packages/core/src/experience/daily.ts`: run inventory/planner/extract/cache before existing wiki/skill lanes.
- Modify `packages/core/src/wiki/curate.ts`: prefer lesson-derived evidence when available.
- Modify `packages/core/src/synthesis/skill-signals.ts` and `packages/core/src/synthesis/skill-proposer.ts`: consume skill-ready lessons.
- Modify `packages/core/src/agent-access/context-bundle.ts`: include lower-authority personal lesson hits.
- Modify `packages/core/src/wiki/site-model.ts`, `site-html.ts`, and `render-site.ts`: show lesson states, privacy routing, and golden validation.
- Modify `packages/cli/src/index.ts` or split command files if current CLI structure prefers it: add lesson inventory/extract/cache/golden/injection preview commands.
- Modify `packages/core/src/index.ts` and `packages/core/package.json` exports for public M25 modules.
- Add focused tests under `tests/core/`.
- Add CLI tests under `tests/cli/` after core behavior is stable.

## Task 0: Integration Contract Guard

**Files:**
- Create: `packages/core/src/experience/lesson-authority.ts`
- Modify: `packages/core/src/index.ts`
- Test: `tests/core/lesson-authority.test.ts`

- [ ] **Step 1: Write failing integration-contract tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { chooseWikiSemanticInput, canSkillSignalPromote, rankContextAuthority } from "@praxisbase/core";

test("wiki-ready lessons outrank legacy distilled summaries", () => {
  const decision = chooseWikiSemanticInput({
    source_ref: "source-inventory://openclaw/MEMORY.md",
    lesson_clusters: [{ state: "wiki_ready", lessons: [{ safe_claim: "Confirm target machine before restart." }] }],
    legacy_distilled: [{ summary: "Restart issue happened once." }],
    degraded: false,
  } as any);

  assert.equal(decision.kind, "lesson_cluster");
  assert.equal(decision.reason, "wiki_ready_lesson_cluster");
});

test("skill candidate cannot promote from one-off summary alone", () => {
  const allowed = canSkillSignalPromote({
    skill_ready_lessons: [],
    stable_wiki_pages: [],
    legacy_distilled: [{ summary: "A skill might help." }],
    sidecar_hits: [{ source: "gbrain" }],
  } as any);

  assert.equal(allowed.ok, false);
  assert.match(allowed.reason, /lesson-state authority/);
});

test("runtime authority ranks stable PB before lessons and sidecars", () => {
  const ranked = rankContextAuthority([
    { id: "gbrain-1", authority: "gbrain_sidecar" },
    { id: "lesson-1", authority: "active_personal_lesson" },
    { id: "skill-1", authority: "promoted_skill" },
    { id: "page-1", authority: "stable_pb_page" },
  ] as any);

  assert.deepEqual(ranked.map((item) => item.id), ["page-1", "skill-1", "lesson-1", "gbrain-1"]);
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/lesson-authority.test.js`

Expected: FAIL because `lesson-authority.ts` exports do not exist.

- [ ] **Step 3: Implement contract helpers**

Create `packages/core/src/experience/lesson-authority.ts` with:

```ts
export type ContextAuthority =
  | "stable_pb_page"
  | "promoted_skill"
  | "active_personal_lesson"
  | "gbrain_sidecar"
  | "agentmemory_sidecar"
  | "legacy_distilled"
  | "raw_audit";

const AUTHORITY_RANK: Record<ContextAuthority, number> = {
  stable_pb_page: 0,
  promoted_skill: 1,
  active_personal_lesson: 2,
  gbrain_sidecar: 3,
  agentmemory_sidecar: 4,
  legacy_distilled: 5,
  raw_audit: 6,
};

export function rankContextAuthority<T extends { authority: ContextAuthority }>(items: T[]): T[] {
  return [...items].sort((a, b) => AUTHORITY_RANK[a.authority] - AUTHORITY_RANK[b.authority]);
}

export function chooseWikiSemanticInput(input: {
  lesson_clusters?: Array<{ state: string }>;
  legacy_distilled?: unknown[];
  degraded?: boolean;
}) {
  if (input.lesson_clusters?.some((cluster) => cluster.state === "wiki_ready")) {
    return { kind: "lesson_cluster" as const, reason: "wiki_ready_lesson_cluster" };
  }
  if (input.degraded && input.legacy_distilled?.length) {
    return { kind: "legacy_distilled" as const, reason: "explicit_degraded_mode" };
  }
  return { kind: "none" as const, reason: "no_authoritative_semantic_input" };
}

export function canSkillSignalPromote(input: {
  skill_ready_lessons?: unknown[];
  stable_wiki_pages?: unknown[];
}) {
  if (input.skill_ready_lessons?.length || input.stable_wiki_pages?.length) {
    return { ok: true as const, reason: "lesson-state authority present" };
  }
  return { ok: false as const, reason: "missing lesson-state authority" };
}
```

Export these helpers from `packages/core/src/index.ts`.

- [ ] **Step 4: Run the integration-contract test**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/lesson-authority.test.js`

Expected: PASS.

## Task 1: Lesson Schemas

**Files:**
- Create: `packages/core/src/experience/lesson-model.ts`
- Modify: `packages/core/src/index.ts`
- Test: `tests/core/lesson-model.test.ts`

- [ ] **Step 1: Write failing schema tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { ExperienceLessonSchema, EvidenceSpanSchema } from "@praxisbase/core";

test("experience lesson requires portability privacy and evidence spans", () => {
  const span = EvidenceSpanSchema.parse({
    source_item_id: "src_openclaw_memory",
    source_ref: "file://openclaw/MEMORY.md",
    source_hash: "sha256:abc",
    span_id: "span_1",
    line_start: 10,
    line_end: 12,
    byte_start: 100,
    byte_end: 240,
    heading_path: ["Running", "Dispatch"],
    excerpt: "Long dispatch tasks need a brief ACK.",
    excerpt_hash: "sha256:def",
    span_kind: "bullet",
  });

  const lesson = ExperienceLessonSchema.parse({
    lesson_id: "lesson_ack",
    claim: "Send a brief ACK before long dispatch work.",
    safe_claim: "Send a brief ACK before long-running tool or dispatch work.",
    problem: "The user sees silence during slow work.",
    trigger: "A task needs tools, network, dispatch, or more than a few seconds.",
    action: "Reply with a short acknowledgement before continuing.",
    verification: "The agent sent an ACK before using tools.",
    negative_case: "Do not stay silent until the final answer.",
    applies_to_agents: ["openclaw", "codex"],
    applies_to_systems: ["agent-runtime"],
    portability: "agent_family",
    privacy_tier: "safe",
    scope: "personal",
    confidence: 0.91,
    cue_family: "native_memory",
    source_refs: [span.source_ref],
    source_hashes: [span.source_hash],
    evidence_spans: [span],
    redaction_notes: [],
    created_at: "2026-05-29T00:00:00.000Z",
  });

  assert.equal(lesson.portability, "agent_family");
  assert.equal(lesson.evidence_spans[0].span_id, "span_1");
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/lesson-model.test.js`

Expected: FAIL because `lesson-model.ts` exports do not exist.

- [ ] **Step 3: Implement schemas**

Create `packages/core/src/experience/lesson-model.ts` with these exported schemas and types:

```ts
import { z } from "zod";
import { ScopeSchema } from "../protocol/schemas.js";

export const SourceKindSchema = z.enum([
  "memory_file", "tools_file", "session", "report", "sqlite_memory",
  "skill", "sidecar_import", "generic_file",
]);

export const EvidenceSpanSchema = z.object({
  source_item_id: z.string().min(1),
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  span_id: z.string().min(1),
  line_start: z.number().int().min(1),
  line_end: z.number().int().min(1),
  byte_start: z.number().int().min(0),
  byte_end: z.number().int().min(0),
  heading_path: z.array(z.string()).default([]),
  excerpt: z.string().min(1),
  excerpt_hash: z.string().min(1),
  span_kind: z.enum(["heading", "bullet", "paragraph", "json_message", "tool_call", "tool_result", "sqlite_row", "skill_section"]),
});

export const SourceInventoryItemSchema = z.object({
  source_item_id: z.string().min(1),
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  agent: z.enum(["codex", "openclaw", "claude-code", "opencode", "hermes", "openhuman", "generic"]),
  source_kind: SourceKindSchema,
  authority_hint: z.enum(["agent_native_memory", "user_authored", "generated_report", "session_transcript", "external_sidecar"]),
  scope_hint: ScopeSchema,
  origin: z.enum(["local", "trusted_personal_remote", "team_git", "external"]),
  mtime: z.string().optional(),
  size_bytes: z.number().int().min(0),
  parser_identity: z.string().min(1),
  content_spans: z.array(EvidenceSpanSchema).default([]),
  privacy_precheck: z.enum(["allow_for_ai", "local_only", "human_required", "reject"]).default("allow_for_ai"),
});

export const ExperienceLessonSchema = z.object({
  lesson_id: z.string().min(1),
  claim: z.string().min(1),
  safe_claim: z.string().min(1),
  problem: z.string().min(1),
  trigger: z.string().min(1),
  action: z.string().min(1),
  verification: z.string().optional(),
  negative_case: z.string().optional(),
  applies_to_agents: z.array(z.string()).default([]),
  applies_to_systems: z.array(z.string()).default([]),
  portability: z.enum(["universal", "agent_family", "project", "environment", "private_instance"]),
  privacy_tier: z.enum(["safe", "personal_only", "team_allowed", "human_required", "reject"]),
  scope: ScopeSchema,
  confidence: z.number().min(0).max(1),
  cue_family: z.enum(["explicit_user", "native_memory", "repeated_failure", "verified_fix", "tool_sequence", "reflection", "llm_inferred"]),
  source_refs: z.array(z.string().min(1)).min(1),
  source_hashes: z.array(z.string().min(1)).min(1),
  evidence_spans: z.array(EvidenceSpanSchema).min(1),
  redaction_notes: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
});

export type EvidenceSpan = z.infer<typeof EvidenceSpanSchema>;
export type SourceInventoryItem = z.infer<typeof SourceInventoryItemSchema>;
export type ExperienceLesson = z.infer<typeof ExperienceLessonSchema>;
```

Export it from `packages/core/src/index.ts`.

- [ ] **Step 4: Run the schema test**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/lesson-model.test.js`

Expected: PASS.

## Task 2: Source Inventory And Span Mapping

**Files:**
- Create: `packages/core/src/experience/source-inventory.ts`
- Test: `tests/core/source-inventory.test.ts`

- [ ] **Step 1: Write failing tests for long memory files**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSourceInventory } from "@praxisbase/core";

test("section maps long OpenClaw MEMORY.md instead of skipping it", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-m25-"));
  const dir = join(root, "openclaw");
  await mkdir(dir, { recursive: true });
  const body = [
    "# Memory",
    "## Running & Routing",
    "- Long dispatch tasks need a brief ACK before tools run.",
    "- Fail-closed delegate guard must not pretend success.",
    "## Memory Management",
    "- MEMORY.md above 12000 chars can be truncated during injection.",
    "x".repeat(700_000),
  ].join("\n");
  await writeFile(join(dir, "MEMORY.md"), body, "utf8");

  const inventory = await buildSourceInventory(root, {
    agent: "openclaw",
    path: dir,
    scope: "personal",
    origin: "local",
  });

  const memory = inventory.find((item) => item.source_kind === "memory_file");
  assert.ok(memory);
  assert.ok(memory.content_spans.length >= 3);
  assert.ok(memory.content_spans.some((span) => span.heading_path.includes("Running & Routing")));
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/source-inventory.test.js`

Expected: FAIL because `buildSourceInventory` does not exist.

- [ ] **Step 3: Implement inventory**

Implement `buildSourceInventory(root, options)` with:

- recursive file discovery using supported extensions from existing chunking behavior;
- memory-file detection by basename `MEMORY.md`, `TOOLS.md`, and names containing `memory`;
- markdown span parser that tracks headings, bullets, paragraphs, line ranges, byte ranges, and excerpt hash;
- source hash via existing `computeHash`;
- source ref format `source-inventory://<agent>/<relative-path>`.

Use `readFile`, `stat`, `readdir`, `relative`, and `join`. Do not reuse `chunkExperienceSource` for long memory files because it skips oversized files.

- [ ] **Step 4: Run tests**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/source-inventory.test.js`

Expected: PASS.

## Task 3: Signal Planner

**Files:**
- Create: `packages/core/src/experience/lesson-planner.ts`
- Test: `tests/core/lesson-planner.test.ts`

- [ ] **Step 1: Write failing budget-priority test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { planLessonSpans } from "@praxisbase/core";

test("memory spans survive small budgets before newer logs", () => {
  const memorySpan = {
    source_item_id: "memory",
    source_ref: "source-inventory://openclaw/MEMORY.md",
    source_hash: "sha256:m",
    span_id: "memory-ack",
    line_start: 2,
    line_end: 2,
    byte_start: 10,
    byte_end: 60,
    heading_path: ["Running"],
    excerpt: "Need ACK before long dispatch tasks.",
    excerpt_hash: "sha256:me",
    span_kind: "bullet" as const,
  };
  const logSpan = { ...memorySpan, source_item_id: "log", source_ref: "source-inventory://openclaw/new.log", span_id: "log-1", excerpt: "Smoke ran.", excerpt_hash: "sha256:le" };
  const selected = planLessonSpans([
    { source_item_id: "log", source_kind: "session", authority_hint: "session_transcript", content_spans: [logSpan] } as any,
    { source_item_id: "memory", source_kind: "memory_file", authority_hint: "agent_native_memory", content_spans: [memorySpan] } as any,
  ], { maxSpans: 1 });

  assert.equal(selected[0].span_id, "memory-ack");
});
```

- [ ] **Step 2: Implement planner**

Implement `scoreEvidenceSpan(item, span)` and `planLessonSpans(items, options)`:

- base score by `source_kind`: memory/tools/skill/report/session/log;
- bonus for explicit terms: `remember`, `next time`, `must`, `avoid`, `fail`, `verified`, `ACK`, `dispatch`, `truncat`, `collate`, `cache`;
- bonus for `authority_hint=agent_native_memory` or `user_authored`;
- reserve memory budget by sorting memory spans before ordinary logs when scores are close.

- [ ] **Step 3: Run planner test**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/lesson-planner.test.js`

Expected: PASS.

## Task 4: Deterministic Lesson Extraction

**Files:**
- Create: `packages/core/src/experience/lesson-deterministic.ts`
- Test: `tests/core/lesson-deterministic.test.ts`

- [ ] **Step 1: Write failing tests for explicit lessons and weak reports**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { extractDeterministicLessons } from "@praxisbase/core";

test("extracts explicit memory lesson with span provenance", () => {
  const lessons = extractDeterministicLessons([{
    source_item_id: "memory",
    source_ref: "source-inventory://openclaw/MEMORY.md",
    source_hash: "sha256:m",
    span_id: "s1",
    line_start: 1,
    line_end: 1,
    byte_start: 0,
    byte_end: 80,
    heading_path: ["UX"],
    excerpt: "Need tools/network/dispatch or slow tasks: send a short ACK first.",
    excerpt_hash: "sha256:e",
    span_kind: "bullet",
  } as any], { now: "2026-05-29T00:00:00.000Z", scope: "personal", agent: "openclaw" });

  assert.equal(lessons.length, 1);
  assert.match(lessons[0].safe_claim, /ACK|acknowledg/i);
  assert.equal(lessons[0].evidence_spans[0].span_id, "s1");
});

test("skips weak smoke-only span", () => {
  const lessons = extractDeterministicLessons([{ excerpt: "Smoke ran successfully.", span_id: "s2", source_ref: "x", source_hash: "sha256:x", source_item_id: "x", line_start: 1, line_end: 1, byte_start: 0, byte_end: 20, heading_path: [], excerpt_hash: "sha256:y", span_kind: "paragraph" } as any], { now: "2026-05-29T00:00:00.000Z", scope: "personal", agent: "openclaw" });
  assert.equal(lessons.length, 0);
});
```

- [ ] **Step 2: Implement deterministic extraction**

Implement a conservative extractor with pattern families:

- ACK before slow/tool/network/dispatch work;
- fail-closed honesty;
- do not expose internal tool failures;
- memory truncation;
- target-machine confirmation;
- self-test after changes;
- cache busting;
- case-insensitive DB collation;
- rate-limit/model failover;
- repeated failure and partial recovery.

Every emitted lesson must include `cue_family`, `evidence_spans`, `source_refs`, `source_hashes`, and `created_at`.

- [ ] **Step 3: Run deterministic tests**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/lesson-deterministic.test.js`

Expected: PASS.

## Task 5: LLM Lesson Extraction

**Files:**
- Create: `packages/core/src/experience/lesson-extractor.ts`
- Test: `tests/core/lesson-extractor.test.ts`

- [ ] **Step 1: Write fake-client test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { extractLessonsWithAi } from "@praxisbase/core";

test("LLM extractor validates strict lesson JSON and attaches spans", async () => {
  const client = {
    completeJson: async () => ({
      lessons: [{
        claim: "Confirm target machine before executing remote restart.",
        safe_claim: "Confirm the target machine before executing remote restart commands.",
        problem: "Remote commands can affect the wrong machine.",
        trigger: "Before restart or destructive remote operation.",
        action: "Check the target host or configured route before executing.",
        verification: "Command target was confirmed before execution.",
        negative_case: "Do not run restart commands against an assumed host.",
        applies_to_agents: ["openclaw", "codex"],
        applies_to_systems: ["remote-ops"],
        portability: "universal",
        privacy_tier: "safe",
        scope: "personal",
        confidence: 0.9,
        cue_family: "llm_inferred",
        evidence_span_ids: ["s1"],
        redaction_notes: [],
      }],
    }),
  };
  const span = { source_item_id: "remote", source_ref: "source-inventory://openclaw/MEMORY.md", source_hash: "sha256:m", span_id: "s1", line_start: 1, line_end: 2, byte_start: 0, byte_end: 100, heading_path: ["Ops"], excerpt: "Confirm target machine before restart.", excerpt_hash: "sha256:e", span_kind: "bullet" };
  const lessons = await extractLessonsWithAi([span as any], { client: client as any, now: "2026-05-29T00:00:00.000Z" });
  assert.equal(lessons[0].evidence_spans[0].span_id, "s1");
});
```

- [ ] **Step 2: Implement extractor**

Use existing `AiJsonClient` shape from `packages/core/src/ai/client.ts`.

Implementation rules:

- build a prompt that says "extract reusable lessons, not summaries";
- ask for `lessons[]` with `evidence_span_ids`;
- map returned ids back to full `EvidenceSpan`;
- parse with zod;
- on malformed output, retry once with a short schema-repair prompt;
- return an extraction report with counts and warnings.
- persist successful AI lesson extraction results under `.praxisbase/cache/lesson-extract`;
- validate cached lessons with `ExperienceLessonSchema` before reuse and ignore corrupt cache entries;
- key the extractor cache by prompt version, provider/model identity, agent, scope, source hash, span id, and excerpt hash.

Cache-specific implementation status:

- [x] Persist successful AI lesson extraction results under `.praxisbase/cache/lesson-extract`.
- [x] Validate cached lessons with `ExperienceLessonSchema` before reuse and ignore corrupt cache entries.
- [x] Add extractor/CLI tests proving repeated `lesson extract --ai` reuses cache without another provider call.
- [ ] Add planner/reducer/parser identities and hit/miss reporting to the AI lesson extraction cache.

- [ ] **Step 3: Run extractor test**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/lesson-extractor.test.js`

Expected: PASS.

## Task 6: Privacy Abstraction

**Files:**
- Create: `packages/core/src/experience/lesson-privacy.ts`
- Test: `tests/core/lesson-privacy.test.ts`

- [ ] **Step 1: Write private remote abstraction tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { abstractLessonPrivacy } from "@praxisbase/core";

test("abstracts concrete remote host from safe claim", () => {
  const result = abstractLessonPrivacy({
    safe_claim: "Use root@example.com and /Users/me/.ssh/key before restart.",
    claim: "Use root@example.com and /Users/me/.ssh/key before restart.",
    privacy_tier: "personal_only",
  } as any, { mode: "team-git" });

  assert.equal(result.lesson.privacy_tier, "human_required");
  assert.doesNotMatch(result.lesson.safe_claim, /root@example\.com|\.ssh/);
});
```

- [ ] **Step 2: Implement abstraction**

Add redaction/abstraction for:

- email-like remote login strings;
- IPv4 addresses;
- hostnames with user prefixes;
- absolute Unix paths and key paths;
- token/password/api-key assignments;
- Slack-style raw user ids when team mode cannot expose them.

Return `{ lesson, changed, reasons }`.

- [ ] **Step 3: Run privacy tests**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/lesson-privacy.test.js`

Expected: PASS.

## Task 7: Lesson Cache And Stability

**Files:**
- Create: `packages/core/src/experience/lesson-cache.ts`
- Test: `tests/core/lesson-cache.test.ts`

- [ ] **Step 1: Write state scoring tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { classifyLessonState } from "@praxisbase/core";

test("safe high confidence lesson becomes active personal", () => {
  const state = classifyLessonState({
    confidence: 0.92,
    privacy_tier: "safe",
    portability: "agent_family",
    source_refs: ["a"],
    source_hashes: ["sha256:a"],
    evidence_spans: [{}],
    cue_family: "native_memory",
  } as any, { mode: "personal-local", sourceCount: 1, verified: true });
  assert.equal(state, "active_personal");
});

test("forgotten lesson remains forgotten", () => {
  const state = classifyLessonState({ privacy_tier: "safe" } as any, { mode: "personal-local", userState: "forgotten" });
  assert.equal(state, "forgotten");
});
```

- [ ] **Step 2: Implement cache helpers**

Implement:

- `classifyLessonState(lesson, options)`;
- `lessonStableKey(lesson)` using normalized structured semantics (`problem`, `trigger`, `action`), applies-to systems, and portability. Do not use raw `claim` or `safe_claim` as the primary key, because repeated evidence should collapse into one reusable lesson;
- `dedupeLessons(lessons)`;
- `rankLessonsForWiki(lessons)`;
- `rankLessonsForRuntime(lessons)`.
- [x] Persist governed lesson state cache under `.praxisbase/cache/lesson-state/cache.json`.
- [x] Upsert repeated lesson sightings by stable key, merge provenance, preserve user overrides, and record state history.
- [x] Add pin/forget/dismiss/reject override helpers for future CLI/site controls.
- [x] Integrate `runLessonPipeline` with the governed state cache and report `cache_upserted`.
- [x] Add semantic duplicate grouping and contradiction routing beyond deterministic stable-key dedupe.

- [x] **Step 3: Run cache tests**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/lesson-cache.test.js`

Expected: PASS.

## Task 8: Wiki Compiler Integration

**Files:**
- Create: `packages/core/src/wiki/lesson-compiler.ts`
- Modify: `packages/core/src/wiki/curate.ts`
- Test: `tests/core/wiki-lesson-compiler.test.ts`

- [ ] **Step 1: Write wiki candidate shape test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildWikiEvidenceFromLessons } from "@praxisbase/core";

test("lesson-derived wiki evidence is synthesized and span-cited", () => {
  const evidence = buildWikiEvidenceFromLessons([{
    lesson_id: "lesson_dispatch",
    safe_claim: "Do not claim delegation succeeded until dispatch evidence exists.",
    problem: "Delegation can fail silently.",
    trigger: "Before reporting delegated OpenClaw work.",
    action: "Check dispatch evidence and report failure honestly.",
    verification: "A dispatch id or worker result exists.",
    negative_case: "Do not pretend the delegate succeeded.",
    applies_to_agents: ["openclaw"],
    applies_to_systems: ["dispatch"],
    portability: "agent_family",
    privacy_tier: "safe",
    scope: "personal",
    confidence: 0.9,
    cue_family: "native_memory",
    source_refs: ["source-inventory://openclaw/MEMORY.md"],
    source_hashes: ["sha256:m"],
    evidence_spans: [{ span_id: "s1", excerpt: "fail-closed guard", source_ref: "source-inventory://openclaw/MEMORY.md", source_hash: "sha256:m" }],
    created_at: "2026-05-29T00:00:00.000Z",
  } as any]);

  assert.match(evidence[0].summary, /delegation/i);
  assert.ok(evidence[0].reusable_lessons.length > 0);
});
```

- [ ] **Step 2: Implement lesson-to-wiki adapter**

Map lesson clusters to `WikiEvidenceItem` or a new compatible evidence input:

- title from safe claim;
- problem/action/verification from lesson fields;
- reusable lessons from safe claim and negative case;
- signatures from applies-to systems, portability, and lesson stable key;
- provenance from spans.

In `curate.ts`, load lesson reports when present and prefer them over raw evidence summaries for M25 sources.

- [ ] **Step 3: Add authority guard**

Use `chooseWikiSemanticInput()` before accepting raw summary input. If `wiki_ready` lesson clusters exist, the wiki path must use lesson-derived evidence. If no lessons exist and the run is not degraded, write a report warning instead of creating a raw-summary proposal.

- [ ] **Step 4: Run wiki integration test**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-lesson-compiler.test.js dist-tests/tests/core/wiki-curation.test.js`

Expected: PASS.

## Task 9: Skill And Runtime Integration

**Files:**
- Modify: `packages/core/src/synthesis/skill-signals.ts`
- Modify: `packages/core/src/synthesis/skill-proposer.ts`
- Create: `packages/core/src/experience/lesson-retrieval.ts`
- Modify: `packages/core/src/agent-access/context-bundle.ts`
- Test: `tests/core/lesson-retrieval.test.ts`
- Test: `tests/core/skill-synthesis.test.ts`
- Test: `tests/core/context-bundle.test.ts`

- [ ] **Step 1: Write runtime lesson retrieval test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { retrieveRuntimeLessons, renderRuntimeLessonBlock } from "@praxisbase/core";

test("runtime lesson block is bounded and lower authority", () => {
  const hits = retrieveRuntimeLessons([{
    lesson_id: "lesson_ack",
    safe_claim: "Send a brief ACK before long-running tool work.",
    applies_to_agents: ["codex", "openclaw"],
    applies_to_systems: ["agent-runtime"],
    confidence: 0.9,
    privacy_tier: "safe",
    portability: "agent_family",
  } as any], { query: "openclaw long tool task", agent: "openclaw", maxHits: 3 });
  const block = renderRuntimeLessonBlock(hits, { maxBytes: 512 });
  assert.match(block, /Relevant PB Experience/);
  assert.match(block, /lower-authority/i);
});
```

- [ ] **Step 2: Implement retrieval and context integration**

Implement query matching by:

- query term overlap with `safe_claim`, `problem`, `trigger`, and `action`;
- agent overlap;
- system overlap;
- confidence and state.

Render a bounded block headed `## Relevant PB Experience (lower-authority personal lessons)`.

Add it to M24 context bundles after stable pages/promoted skills and before sidecar hits.

- [ ] **Step 3: Add runtime authority ordering**

Use `rankContextAuthority()` so context bundles always order stable PB pages, promoted skills, active personal lessons, GBrain sidecar hits, and AgentMemory sidecar hits in that authority order. Sidecar hits should be wrapped as sidecar context and must not be counted as promotion evidence.

- [ ] **Step 4: Add skill-ready lesson input**

In `skill-signals.ts`, accept lesson clusters with:

- procedural action;
- verification or negative case;
- `privacy_tier` safe/personal_only/team_allowed according to mode;
- state `skill_ready`;
- no private instance leakage.

Keep update-before-create behavior in `skill-proposer.ts`.

- [ ] **Step 5: Add skill authority guard**

Use `canSkillSignalPromote()` before creating promotion-eligible skill candidates. Raw logs, one-off summaries, GBrain sidecar hits, and AgentMemory sidecar hits can appear in diagnostics, but they cannot produce promotion-eligible skill candidates without `skill_ready` lessons or stable procedural wiki pages.

- [ ] **Step 6: Run integration tests**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/lesson-retrieval.test.js dist-tests/tests/core/context-bundle.test.js dist-tests/tests/core/skill-synthesis.test.js`

Expected: PASS.

## Task 10: Daily, CLI, Site, And Golden Validation

**Files:**
- Modify: `packages/core/src/experience/daily.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/core/src/wiki/site-model.ts`
- Modify: `packages/core/src/wiki/site-html.ts`
- Test: `tests/core/experience-daily.test.ts`
- Test: `tests/cli/daily-command.test.ts`
- Test: `tests/core/m25-golden-validation.test.ts`

- [ ] **Step 1: Add golden validation test fixtures inline**

In `tests/core/m25-golden-validation.test.ts`, construct raw memory strings with the local and remote target lessons. Do not use the user's agent-generated summaries as input. Use raw-style memory bullets and session snippets.

Test expectations:

```ts
assert.ok(local.matches >= 5);
assert.ok(remote.matches >= 6);
assert.equal(local.privateLeakCount, 0);
assert.equal(remote.privateLeakCount, 0);
```

- [ ] **Step 2: Wire daily**

In `daily.ts`, run:

1. `buildSourceInventory`;
2. `planLessonSpans`;
3. deterministic extraction;
4. AI extraction when configured;
5. privacy abstraction;
6. lesson cache classification;
7. lesson-derived wiki/skill inputs.

Daily report should include:

- inventory counts;
- selected span counts;
- deterministic lessons;
- AI lessons;
- active personal lessons;
- wiki-ready lessons;
- skill-ready lessons;
- privacy abstracted/human-required/rejected counts;
- golden validation counts when fixtures are requested.

- [ ] **Step 3: Add CLI commands**

Add subcommands or options consistent with existing CLI style:

```bash
praxisbase lesson inventory --json
praxisbase lesson extract --json
praxisbase lesson cache --json
praxisbase lesson golden --fixture openclaw-local --json
praxisbase lesson inject-preview --query "openclaw dispatch" --agent openclaw --json
```

If a new `lesson` top-level command does not fit the current commander structure, put these under `personal` or `daily` but keep the JSON report names the same.

- [ ] **Step 4: Add site model fields**

Expose:

- lesson counts by state;
- privacy routing counts;
- golden validation status;
- top active personal lessons;
- wiki-ready and skill-ready lesson candidates;
- source span provenance links.

Do not render raw private excerpts by default.

- [ ] **Step 5: Run daily/CLI/site tests**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/m25-golden-validation.test.js dist-tests/tests/core/experience-daily.test.js dist-tests/tests/cli/daily-command.test.js`

Expected: PASS.

## Task 11: Full Verification

**Files:**
- No new files unless tests reveal missing exports.

- [ ] **Step 1: Run focused M25 tests**

Run:

```bash
pnpm build
tsc -p tsconfig.tests.json
node --test dist-tests/tests/core/lesson-*.test.js dist-tests/tests/core/source-inventory.test.js dist-tests/tests/core/wiki-lesson-compiler.test.js dist-tests/tests/core/m25-golden-validation.test.js
```

Expected: all selected tests pass.

- [ ] **Step 2: Run affected existing tests**

Run:

```bash
node --test dist-tests/tests/core/experience-daily.test.js dist-tests/tests/core/wiki-curation.test.js dist-tests/tests/core/skill-synthesis.test.js dist-tests/tests/core/context-bundle.test.js dist-tests/tests/core/wiki-render-site.test.js
```

Expected: all selected tests pass.

- [ ] **Step 3: Run full check before handoff**

Run: `pnpm check`

Expected: typecheck and all tests pass.

- [ ] **Step 4: Inspect output quality**

Run a bounded personal daily with real sources only after focused tests pass:

```bash
praxisbase daily run --mode personal --max-ai-chunks 20 --progress --json
praxisbase lesson inject-preview --query "openclaw dispatch fail closed" --agent openclaw --json
praxisbase wiki build-site --json
```

Expected:

- generated lessons include useful OpenClaw/Codex operating experience when evidence exists;
- private concrete values do not appear in stable outputs;
- site shows lesson states and provenance;
- runtime preview ranks stable PB pages/promoted skills above personal lessons.

## Self-Review Checklist

- Spec coverage: Task 0 covers the integration contract; Tasks 1-3 cover inventory/planning; Tasks 4-6 cover extraction/privacy; Task 7 covers stability; Tasks 8-9 cover wiki/skill/runtime; Task 10 covers CLI/site/golden validation.
- Placeholder scan: No task depends on an undefined future design; each task names files, tests, commands, and expected behavior.
- Type consistency: `EvidenceSpan`, `SourceInventoryItem`, `ExperienceLesson`, lesson states, portability, privacy tier, and cue family names match the M25 design and OpenSpec.
