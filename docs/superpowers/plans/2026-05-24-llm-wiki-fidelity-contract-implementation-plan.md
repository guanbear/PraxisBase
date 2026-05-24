# LLM Wiki Fidelity Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the M13 fidelity contract so PraxisBase produces and verifies a persistent compiled wiki artifact aligned with the original LLM Wiki pattern.

**Architecture:** Keep PraxisBase file-first and review/promote based. Add source summaries, root wiki artifacts, canonical topic signatures, lifecycle metadata, typed graph edges, and fidelity lint around the existing wiki curation pipeline instead of replacing it.

**Tech Stack:** TypeScript, Node test runner, existing `@praxisbase/core/wiki/*`, existing CLI commands under `packages/cli/src/commands/wiki.ts`, static site renderer, OpenSpec and BDD docs.

---

## File Map

- Modify `packages/core/src/wiki/curation-model.ts`: normalized schemas for source summaries, root artifacts, lifecycle metadata, typed relationships, and fidelity report counts.
- Modify `packages/core/src/wiki/curate.ts`: write source summaries during evidence preparation, attach lifecycle metadata to proposals, include canonical topic signature reasons, and append curation log events.
- Modify `packages/core/src/wiki/topic-planner.ts`: replace source-id driven and hard-coded-only topic identity with general canonical signatures while keeping current family boosters.
- Modify `packages/core/src/wiki/resolver.ts`: emit typed graph edges and keep resolver-valid aliases.
- Modify `packages/core/src/wiki/render-site.ts`: materialize `dist/wiki/index.md`, `dist/wiki/log.md`, `dist/wiki/purpose.md`, `dist/wiki/schema.md`, `dist/wiki/overview.md`, and render root artifacts in the site navigation.
- Modify `packages/core/src/wiki/lint.ts`: add fidelity lint rules.
- Modify `packages/core/src/agent-access/skill.ts` and `packages/core/src/wiki/retrieval.ts`: include root artifact summaries, compiled pages, graph neighbors, and provenance pointers in agent context.
- Modify `packages/cli/src/commands/wiki.ts`: expose fidelity lint/report results through existing `wiki graph` or new `wiki lint` behavior without changing the top-level CLI shape unexpectedly.
- Add tests under `tests/core/wiki-fidelity-contract.test.ts`.
- Add CLI smoke tests under `tests/cli/wiki-fidelity-contract-e2e.test.ts`.

## Task 1: Add Source Summary And Root Artifact Schemas

**Files:**
- Modify: `packages/core/src/wiki/curation-model.ts`
- Test: `tests/core/wiki-fidelity-contract.test.ts`

- [ ] **Step 1: Write failing schema tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WikiRootArtifactSchema,
  WikiSourceSummarySchema,
  WikiTypedRelationshipSchema,
} from "@praxisbase/core/wiki/curation-model.js";

describe("wiki fidelity contract schemas", () => {
  it("accepts a source summary with provenance and topic contribution", () => {
    const parsed = WikiSourceSummarySchema.parse({
      id: "source-summary-1",
      type: "wiki_source_summary",
      source_id: "source-1",
      source_ref: "codex:session:1",
      source_hash: "sha256:abc",
      source_kind: "native_memory",
      scope: "personal",
      summary: "Codex verified that ACKs should be sent before long-running delegated work.",
      entities: ["Codex", "OpenClaw"],
      topics: ["ACK timing"],
      observation_ids: ["obs-1"],
      topic_keys: ["ack-timing::personal"],
      privacy_verdict: "safe",
      contributed_to_pages: ["kb/procedures/ack-timing-before-long-running-agent-work.md"],
      created_at: "2026-05-24T00:00:00.000Z",
    });
    assert.equal(parsed.type, "wiki_source_summary");
  });

  it("accepts root artifacts and typed relationships", () => {
    assert.equal(WikiRootArtifactSchema.parse({
      id: "wiki-root-index",
      type: "wiki_root_artifact",
      kind: "index",
      path: "dist/wiki/index.md",
      title: "Wiki Index",
      body_markdown: "# Wiki Index\n\n- [[ack-timing|ACK timing]]",
      generated_at: "2026-05-24T00:00:00.000Z",
    }).kind, "index");

    assert.equal(WikiTypedRelationshipSchema.parse({
      from: "wiki-ack-timing",
      to: "wiki-openclaw-operational-coordination",
      type: "depends_on",
      confidence: 0.88,
      source_refs: ["codex:session:1"],
    }).type, "depends_on");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-fidelity-contract.test.js`

Expected: FAIL because the three schemas are not exported.

- [ ] **Step 3: Add minimal schemas**

Add these exports to `packages/core/src/wiki/curation-model.ts`:

```ts
export const WikiSourceSummarySchema = z.object({
  id: z.string().min(1),
  type: z.literal("wiki_source_summary"),
  source_id: z.string().min(1),
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  source_kind: WikiEvidenceKindSchema.or(z.literal("stable_kb")).or(z.literal("skill")).or(z.literal("review")),
  scope: ScopeSchema,
  summary: z.string().min(1),
  entities: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  observation_ids: z.array(z.string()).default([]),
  topic_keys: z.array(z.string()).default([]),
  privacy_verdict: z.enum(["safe", "personal_only", "team_allowed", "human_required", "reject"]),
  contributed_to_pages: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
});

export type WikiSourceSummary = z.infer<typeof WikiSourceSummarySchema>;

export const WikiRootArtifactSchema = z.object({
  id: z.string().min(1),
  type: z.literal("wiki_root_artifact"),
  kind: z.enum(["purpose", "schema", "index", "log", "overview"]),
  path: z.string().min(1),
  title: z.string().min(1),
  body_markdown: z.string().min(1),
  generated_at: z.string().datetime(),
});

export type WikiRootArtifact = z.infer<typeof WikiRootArtifactSchema>;

export const WikiRelationshipTypeSchema = z.enum(["related", "uses", "depends_on", "fixes", "caused_by", "verified_by", "contradicts", "supersedes", "same_topic_as", "source_overlap"]);

export type WikiRelationshipType = z.infer<typeof WikiRelationshipTypeSchema>;

export const WikiTypedRelationshipSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: WikiRelationshipTypeSchema,
  confidence: z.number().min(0).max(1),
  source_refs: z.array(z.string()).default([]),
});

export type WikiTypedRelationship = z.infer<typeof WikiTypedRelationshipSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-fidelity-contract.test.js`

Expected: PASS.

## Task 2: Produce Source Summaries During Curation

**Files:**
- Modify: `packages/core/src/wiki/curate.ts`
- Modify: `packages/core/src/wiki/curation-model.ts`
- Test: `tests/core/wiki-fidelity-contract.test.ts`

- [ ] **Step 1: Add failing source-summary curation test**

Append:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { curateWiki } from "@praxisbase/core/wiki/curate.js";
import { writeJson } from "@praxisbase/core/store/file-store.js";

it("writes source summaries for useful evidence without promoting them as guidance", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-fidelity-"));
  await writeJson(root, ".praxisbase/reports/memory/codex-1.json", {
    id: "memory-1",
    type: "native_memory_report",
    source_ref: "codex:session:1",
    source_hash: "sha256:abc",
    agent: "codex",
    scope: "personal",
    title: "ACK timing",
    summary: "Codex verified that agents should send an ACK before long-running OpenClaw delegated work.",
    body: "Problem: long delegated work looked silent. Action: send ACK before dispatch. Verification: user saw progress.",
    created_at: "2026-05-24T00:00:00.000Z",
  });

  const report = await curateWiki(root, {
    mode: "dry-run",
    degraded: true,
    now: "2026-05-24T00:00:00.000Z",
  });

  assert.equal(report.input_counts.evidence_items, 1);
  const summary = JSON.parse(await readFile(join(root, ".praxisbase/reports/wiki-source-summaries/source-summary-memory-1.json"), "utf-8"));
  assert.equal(summary.type, "wiki_source_summary");
  assert.equal(summary.source_ref, "codex:session:1");
  assert.deepEqual(summary.contributed_to_pages, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-fidelity-contract.test.js`

Expected: FAIL because source summaries are not written.

- [ ] **Step 3: Implement source summary writer**

In `packages/core/src/wiki/curate.ts`, add a constant:

```ts
const REPORTS_WIKI_SOURCE_SUMMARIES = ".praxisbase/reports/wiki-source-summaries";
```

Add helper:

```ts
async function writeWikiSourceSummaries(root: string, input: {
  evidence: WikiEvidenceItem[];
  observations: WikiObservation[];
  topics: WikiTopic[];
  now: string;
}): Promise<void> {
  const observationsByEvidence = new Map<string, WikiObservation[]>();
  for (const obs of input.observations) {
    const bucket = observationsByEvidence.get(obs.evidence_id) ?? [];
    bucket.push(obs);
    observationsByEvidence.set(obs.evidence_id, bucket);
  }
  const topicKeysByObservation = new Map<string, string[]>();
  for (const topic of input.topics) {
    for (const observationId of topic.observation_ids) {
      const bucket = topicKeysByObservation.get(observationId) ?? [];
      bucket.push(topic.topic_key);
      topicKeysByObservation.set(observationId, bucket);
    }
  }

  for (const item of input.evidence) {
    const observationsForItem = observationsByEvidence.get(item.id) ?? [];
    const topicKeys = Array.from(new Set(observationsForItem.flatMap((obs) => topicKeysByObservation.get(obs.id) ?? []))).sort();
    await writeJson(root, `${REPORTS_WIKI_SOURCE_SUMMARIES}/source-summary-${item.id}.json`, {
      id: `source-summary-${item.id}`,
      type: "wiki_source_summary",
      source_id: item.id,
      source_ref: item.source_ref,
      source_hash: item.source_hash,
      source_kind: item.kind,
      scope: item.scope,
      summary: item.summary,
      entities: Array.from(new Set(observationsForItem.flatMap((obs) => obs.entities))).sort(),
      topics: Array.from(new Set(observationsForItem.flatMap((obs) => obs.topics))).sort(),
      observation_ids: observationsForItem.map((obs) => obs.id).sort(),
      topic_keys: topicKeys,
      privacy_verdict: item.privacy_verdict,
      contributed_to_pages: [],
      created_at: input.now,
    });
  }
}
```

Call it after observations and topics are built and before proposal synthesis.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-fidelity-contract.test.js`

Expected: PASS.

## Task 3: Generalize Canonical Topic Keys

**Files:**
- Modify: `packages/core/src/wiki/topic-planner.ts`
- Test: `tests/core/wiki-topic-planner.test.ts`
- Test: `tests/core/wiki-fidelity-contract.test.ts`

- [ ] **Step 1: Add failing canonical signature test**

Add a test that two evidence observations with different titles but the same entity/problem/action compile to one topic:

```ts
import { buildWikiTopics } from "@praxisbase/core/wiki/topic-planner.js";

it("clusters by canonical entity problem action signature instead of title", () => {
  const base = {
    scope: "personal" as const,
    kind: "fix" as const,
    outcome: "success" as const,
    privacy_verdict: "safe" as const,
    filtered_out: false,
    confidence: 0.86,
    verification: "Verified by successful delegated run.",
    reusable_lesson: "Send an ACK before long-running delegated work.",
    entities: ["OpenClaw", "Codex"],
    topics: ["delegated work"],
  };
  const topics = buildWikiTopics([
    {
      ...base,
      id: "obs-1",
      evidence_id: "e1",
      source_ref: "codex:1",
      source_hash: "sha256:a",
      problem: "OpenClaw delegated work appears silent",
      action: "Send ACK before dispatching long task",
    },
    {
      ...base,
      id: "obs-2",
      evidence_id: "e2",
      source_ref: "openclaw:1",
      source_hash: "sha256:b",
      problem: "Long agent dispatch has no early feedback",
      action: "ACK before delegated OpenClaw work starts",
    },
  ]);
  assert.equal(topics.length, 1);
  assert.equal(topics[0].source_count, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-topic-planner.test.js dist-tests/tests/core/wiki-fidelity-contract.test.js`

Expected: FAIL if the two observations split.

- [ ] **Step 3: Implement canonical signature helper**

In `topic-planner.ts`, add:

```ts
function canonicalTerms(text: string): string[] {
  const normalized = normalizeText(text);
  const aliases: Array<[RegExp, string]> = [
    [/\backnowledg(e|ement)?\b|\back\b/g, "ack"],
    [/\bdelegat(ed|ion)?\b|\bdispatch(ed|ing)?\b/g, "delegate"],
    [/\bsilent\b|\bno early feedback\b|\bno feedback\b/g, "silent"],
    [/\blong running\b|\blong task\b|\bslow\b/g, "long"],
  ];
  let aliased = normalized;
  for (const [pattern, replacement] of aliases) {
    aliased = aliased.replace(pattern, replacement);
  }
  return Array.from(new Set(aliased.split(/\s+/).filter((term) => term.length >= 3))).sort();
}

function canonicalTopicSignature(obs: WikiObservation): string {
  const entities = obs.entities.map(normalizeText).filter(Boolean).sort();
  const terms = canonicalTerms([obs.problem, obs.action, obs.reusable_lesson, ...obs.topics].filter(Boolean).join(" "));
  const anchors = terms.filter((term) => ["ack", "delegate", "silent", "long", "stdin", "runner", "gateway", "slack"].includes(term));
  return normalizedTopicKey([
    `kind:${obs.kind}`,
    `scope:${obs.scope}`,
    entities.join(",") || "no-entities",
    anchors.join(",") || terms.slice(0, 8).join(",") || "no-terms",
  ]);
}
```

Update `topicKeyForObservation()` so semantic family remains first, then `canonicalTopicSignature(obs)`, then old fallback only if canonical signature is empty.

- [ ] **Step 4: Run tests**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-topic-planner.test.js dist-tests/tests/core/wiki-fidelity-contract.test.js`

Expected: PASS.

## Task 4: Materialize Root Wiki Artifacts

**Files:**
- Modify: `packages/core/src/wiki/render-site.ts`
- Test: `tests/core/wiki-render-site.test.ts`
- Test: `tests/core/wiki-fidelity-contract.test.ts`

- [ ] **Step 1: Add failing site artifact test**

```ts
import { access, readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { buildWikiSite } from "@praxisbase/core/wiki/render-site.js";

it("builds root wiki artifacts for agent and human navigation", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-root-artifacts-"));
  await mkdir(join(root, "kb", "procedures"), { recursive: true });
  await writeFile(join(root, "kb", "procedures", "ack.md"), [
    "---",
    "id: wiki-ack",
    "title: ACK timing",
    "page_kind: procedure",
    "scope: personal",
    "maturity: draft",
    "sources:",
    "  - uri: codex:session:1",
    "    hash: sha256:a",
    "---",
    "# ACK timing",
    "## When to Use",
    "Use before delegated work.",
    "## What To Do",
    "Send an ACK.",
    "## Verify",
    "The user sees progress.",
    "## Reusable Lessons",
    "Do not start long work silently.",
    "## Provenance",
    "- codex:session:1",
  ].join("\n"));

  await buildWikiSite(root);
  await access(join(root, "dist/wiki/index.md"));
  await access(join(root, "dist/wiki/log.md"));
  await access(join(root, "dist/wiki/purpose.md"));
  await access(join(root, "dist/wiki/schema.md"));
  await access(join(root, "dist/wiki/overview.md"));
  const index = await readFile(join(root, "dist/wiki/index.md"), "utf-8");
  assert.match(index, /ACK timing/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-render-site.test.js dist-tests/tests/core/wiki-fidelity-contract.test.js`

Expected: FAIL because `dist/wiki/*.md` does not exist.

- [ ] **Step 3: Implement root artifact generation**

In `render-site.ts`, add a helper that writes five markdown files from collected pages:

```ts
async function writeRootWikiArtifacts(root: string, pages: WikiSitePage[], now: string): Promise<void> {
  const byKind = new Map<string, WikiSitePage[]>();
  for (const page of pages) {
    const bucket = byKind.get(page.page_kind ?? "note") ?? [];
    bucket.push(page);
    byKind.set(page.page_kind ?? "note", bucket);
  }

  const indexLines = ["# Wiki Index", ""];
  for (const [kind, bucket] of Array.from(byKind.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    indexLines.push(`## ${kind}`, "");
    for (const page of bucket.sort((a, b) => a.title.localeCompare(b.title))) {
      indexLines.push(`- [[${page.id}|${page.title}]] - ${page.summary ?? ""}`.trim());
    }
    indexLines.push("");
  }

  await writeFileEnsured(root, "dist/wiki/index.md", indexLines.join("\n"));
  await writeFileEnsured(root, "dist/wiki/log.md", `# Wiki Log\n\n## [${now}] build-site | ${pages.length} pages\n`);
  await writeFileEnsured(root, "dist/wiki/purpose.md", "# Wiki Purpose\n\nThis wiki compiles agent experience into reusable, provenance-backed operational knowledge.\n");
  await writeFileEnsured(root, "dist/wiki/schema.md", "# Wiki Schema\n\nRequired stable page sections: When to Use, What To Do, Verify, Reusable Lessons, Provenance.\n");
  await writeFileEnsured(root, "dist/wiki/overview.md", `# Wiki Overview\n\nCompiled pages: ${pages.length}.\n`);
}
```

Use existing file-write helpers in the file if present. If there is no helper, use the existing project `writeJson` style as a guide and import `mkdir`/`writeFile` from `node:fs/promises`.

- [ ] **Step 4: Run tests**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-render-site.test.js dist-tests/tests/core/wiki-fidelity-contract.test.js`

Expected: PASS.

## Task 5: Add Lifecycle Metadata To Curated Proposals

**Files:**
- Modify: `packages/core/src/wiki/curation-model.ts`
- Modify: `packages/core/src/wiki/curate.ts`
- Modify: `packages/core/src/wiki/promotion-quality.ts`
- Test: `tests/core/wiki-curation-model.test.ts`
- Test: `tests/core/wiki-promotion-quality.test.ts`

- [ ] **Step 1: Add failing metadata test**

```ts
it("requires lifecycle metadata on compiled wiki proposals", () => {
  const proposal = makeValidProposal({
    lifecycle: "active",
    last_confirmed_at: "2026-05-24T00:00:00.000Z",
    supersedes: [],
    superseded_by: null,
  });
  assert.equal(CuratedWikiProposalSchema.parse(proposal).lifecycle, "active");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-curation-model.test.js dist-tests/tests/core/wiki-promotion-quality.test.js`

Expected: FAIL because lifecycle fields are not accepted or produced.

- [ ] **Step 3: Extend proposal schema and builders**

Add optional fields first to avoid breaking old proposals:

```ts
lifecycle: z.enum(["active", "stale", "superseded", "archived"]).default("active"),
last_confirmed_at: z.string().datetime().optional(),
supersedes: z.array(z.string()).default([]),
superseded_by: z.string().nullable().default(null),
relationship_types: z.array(WikiTypedRelationshipSchema.shape.type).default([]),
```

In AI and deterministic proposal builders in `curate.ts`, set:

```ts
lifecycle: "active",
last_confirmed_at: now,
supersedes: [],
superseded_by: null,
relationship_types: [],
```

- [ ] **Step 4: Run tests**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-curation-model.test.js dist-tests/tests/core/wiki-promotion-quality.test.js`

Expected: PASS.

## Task 6: Emit Typed Graph Edges

**Files:**
- Modify: `packages/core/src/wiki/resolver.ts`
- Modify: `packages/core/src/wiki/site-model.ts`
- Test: `tests/core/wiki-resolver.test.ts`
- Test: `tests/core/wiki-fidelity-contract.test.ts`

- [ ] **Step 1: Add failing graph edge type test**

```ts
import { buildWikiGraph } from "@praxisbase/core/wiki/resolver.js";
import type { WikiSitePage } from "@praxisbase/core/wiki/site-model.js";

function makeSitePage(input: Partial<WikiSitePage> & { id: string; title: string; body_markdown: string; source_ids: string[] }): WikiSitePage {
  return {
    id: input.id,
    title: input.title,
    slug: input.id,
    path: `kb/notes/${input.id}.md`,
    summary: input.title,
    page_kind: "note",
    scope: "personal",
    maturity: "draft",
    lifecycle: "active",
    body_markdown: input.body_markdown,
    body_text: input.body_markdown,
    source_ids: input.source_ids,
    signatures: [],
    provenance_refs: input.source_ids.map((hash) => ({ uri: `source:${hash}`, hash })),
    outbound_links: [],
    updated_at: "2026-05-24T00:00:00.000Z",
    ...input,
  };
}

it("emits typed graph edges for related links and shared provenance", () => {
  const graph = buildWikiGraph([
    makeSitePage({ id: "wiki-a", title: "A", body_markdown: "[[wiki-b|B]]", source_ids: ["sha256:1"] }),
    makeSitePage({ id: "wiki-b", title: "B", body_markdown: "", source_ids: ["sha256:1"] }),
  ]);
  assert.ok(graph.links.some((edge) => edge.from === "wiki-a" && edge.to === "wiki-b" && edge.type === "related"));
  assert.ok(graph.links.some((edge) => edge.from === "wiki-a" && edge.to === "wiki-b" && edge.type === "source_overlap"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-resolver.test.js dist-tests/tests/core/wiki-fidelity-contract.test.js`

Expected: FAIL if edges have no type or no source overlap.

- [ ] **Step 3: Extend graph edge model**

Update the graph edge type to include:

```ts
type: "related" | "uses" | "depends_on" | "fixes" | "caused_by" | "verified_by" | "contradicts" | "supersedes" | "same_topic_as" | "source_overlap";
confidence?: number;
source_refs?: string[];
```

Set wikilink edges to `related`. Add source-overlap edges only when two pages share at least one source hash and no identical edge already exists.

- [ ] **Step 4: Run graph tests**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-resolver.test.js dist-tests/tests/core/wiki-fidelity-contract.test.js`

Expected: PASS.

## Task 7: Add Fidelity Lint Rules

**Files:**
- Modify: `packages/core/src/wiki/lint.ts`
- Test: `tests/core/wiki-lint.test.ts`
- Test: `tests/core/wiki-fidelity-contract.test.ts`

- [ ] **Step 1: Add failing lint test**

```ts
import { runWikiLint } from "@praxisbase/core/wiki/lint.js";
import { dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

async function writeWikiPage(root: string, relativePath: string, input: { id: string; title: string; page_kind: string; body: string }): Promise<void> {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, [
    "---",
    `id: ${input.id}`,
    `title: ${input.title}`,
    `page_kind: ${input.page_kind}`,
    "scope: personal",
    "maturity: draft",
    "sources:",
    "  - uri: codex:session:1",
    "    hash: sha256:a",
    "---",
    input.body,
  ].join("\n"));
}

it("flags raw copy, missing root artifacts, and source summary pages as guidance", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-fidelity-lint-"));
  await writeWikiPage(root, "kb/known-fixes/raw-copy.md", {
    id: "wiki-raw-copy",
    title: "Raw Copy",
    page_kind: "known_fix",
    body: "```json\n{\"raw\":\"transcript\"}\n```\n## Provenance\n- codex:1",
  });
  await writeWikiPage(root, "kb/known-fixes/source-summary-as-fix.md", {
    id: "wiki-source-summary-as-fix",
    title: "Source Summary As Fix",
    page_kind: "source_summary",
    body: "## What To Do\nUse this source summary as a fix.\n## Provenance\n- codex:1",
  });
  const lint = await runWikiLint(root);
  assert.ok(lint.findings.some((f) => f.rule === "missing-root-artifact"));
  assert.ok(lint.findings.some((f) => f.rule === "raw-copy-page"));
  assert.ok(lint.findings.some((f) => f.rule === "source-summary-promoted-as-guidance"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-lint.test.js dist-tests/tests/core/wiki-fidelity-contract.test.js`

Expected: FAIL because these rules do not exist.

- [ ] **Step 3: Implement lint rules**

Add findings with stable rule ids:

```ts
"missing-root-artifact"
"missing-source-summary"
"raw-copy-page"
"source-summary-promoted-as-guidance"
"missing-agent-use-section"
"stale-or-superseded-conflict"
"unresolved-typed-edge"
```

Keep severities deterministic:

- error: raw-copy, missing provenance, unresolved typed edge, superseded active page;
- warning: missing root artifact, missing source summary, orphan, stale, missing agent-use section.

- [ ] **Step 4: Run lint tests**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-lint.test.js dist-tests/tests/core/wiki-fidelity-contract.test.js`

Expected: PASS.

## Task 8: Add Agent Context Fidelity

**Files:**
- Modify: `packages/core/src/wiki/retrieval.ts`
- Modify: `packages/core/src/agent-access/skill.ts`
- Test: `tests/core/wiki-retrieval.test.ts`

- [ ] **Step 1: Add failing context test**

```ts
it("returns compiled pages, root artifact hints, graph neighbors, and provenance pointers", async () => {
  const result = await retrieveWikiContext(root, {
    query: "ACK timing",
    maxBytes: 5000,
    includeRootArtifacts: true,
    includeGraphNeighbors: true,
  });
  assert.match(result.text, /Wiki Purpose|Wiki Index/);
  assert.match(result.text, /ACK timing/);
  assert.match(result.text, /Provenance/);
  assert.doesNotMatch(result.text, /raw transcript blob/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-retrieval.test.js`

Expected: FAIL until retrieval includes root artifacts and graph neighbors.

- [ ] **Step 3: Implement retrieval additions**

Add optional parameters to retrieval input:

```ts
includeRootArtifacts?: boolean;
includeGraphNeighbors?: boolean;
```

Prepend bounded root artifact snippets from `dist/wiki/purpose.md`, `dist/wiki/schema.md`, and `dist/wiki/index.md`. Add up to five graph neighbors from `dist/graph.json` for selected pages. Keep all content under `maxBytes`.

- [ ] **Step 4: Run retrieval tests**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/wiki-retrieval.test.js`

Expected: PASS.

## Task 9: Golden Corpus E2E

**Files:**
- Add: `tests/fixtures/wiki-fidelity-golden/` or inline golden fixture helpers in the E2E test
- Add: `tests/cli/wiki-fidelity-contract-e2e.test.ts`

- [x] **Step 1: Create fixture evidence**

Create fixture files that represent:

- two Codex/OpenClaw evidence items about ACK timing;
- one unrelated official reference item that should be filtered;
- one source with private material that should become human-required or rejected;
- one query synthesis item that should become a `synthesis` proposal.

- [x] **Step 2: Add failing E2E test**

```ts
it("compiles golden evidence into fewer linked wiki pages than sources", async () => {
  const root = await copyGoldenFixture();
  await runCli(root, ["wiki", "curate", "--review", "--degraded", "--json"]);
  await runCli(root, ["review", "policy", "--mode", "personal", "--promote", "--json"]);
  await runCli(root, ["wiki", "build-site", "--json"]);
  const graph = JSON.parse(await readFile(join(root, "dist/graph.json"), "utf-8"));
  const curationReports = await readReports(root, ".praxisbase/reports/wiki-curation");
  const latest = curationReports.at(-1);
  assert.ok(latest.input_counts.evidence_items > latest.output_counts.written_proposals);
  assert.ok(latest.compiler_counts.topics < latest.input_counts.evidence_items);
  assert.ok(graph.links.some((edge: { type?: string }) => edge.type === "related" || edge.type === "source_overlap"));
  await access(join(root, "dist/wiki/index.md"));
  await access(join(root, "dist/wiki/log.md"));
  await access(join(root, "dist/wiki/purpose.md"));
  await access(join(root, "dist/wiki/schema.md"));
  await access(join(root, "dist/wiki/overview.md"));
});
```

- [x] **Step 3: Run E2E test to verify it fails**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/wiki-fidelity-contract-e2e.test.js`

Expected: FAIL before Tasks 1-8 are complete.

- [x] **Step 4: Run E2E test to verify it passes**

Run: `pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/cli/wiki-fidelity-contract-e2e.test.js`

Expected: PASS.

## Task 10: Final Verification And Commit

**Files:**
- All files modified above.

- [x] **Step 1: Run targeted suite**

Run:

```bash
pnpm build && tsc -p tsconfig.tests.json && node --test \
  dist-tests/tests/core/wiki-fidelity-contract.test.js \
  dist-tests/tests/core/wiki-topic-planner.test.js \
  dist-tests/tests/core/wiki-render-site.test.js \
  dist-tests/tests/core/wiki-lint.test.js \
  dist-tests/tests/core/wiki-retrieval.test.js \
  dist-tests/tests/core/wiki-resolver.test.js \
  dist-tests/tests/cli/wiki-fidelity-contract-e2e.test.js
```

Expected: PASS.

- [x] **Step 2: Run full check**

Run: `pnpm check`

Expected: PASS.

- [x] **Step 3: Inspect git diff**

Run: `git status --short && git diff --stat`

Expected: only source, tests, fixture, and docs files are changed. Runtime directories such as `kb/`, `dist/`, and `.praxisbase/` are not staged unless explicitly requested.

- [x] **Step 4: Commit**

```bash
git add packages/core/src/wiki packages/core/src/agent-access packages/cli/src/commands/wiki.ts tests docs
git commit -m "feat: enforce llm wiki fidelity contract"
```

Expected: commit succeeds after full verification.
