import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL_VERSION } from "@praxisbase/core";
import {
  computeWikiSourceHash,
  makeWikiSlug,
  MATURITY_ORDER,
  SCOPE_ORDER,
} from "@praxisbase/core/wiki/model.js";
import {
  readWikiState,
  writeWikiState,
} from "@praxisbase/core/wiki/state.js";
import { collectWikiSources } from "@praxisbase/core/wiki/collect.js";

describe("wiki model", () => {
  it("creates deterministic slugs and source hashes", () => {
    assert.equal(makeWikiSlug("OpenClaw Auth Expired!"), "openclaw-auth-expired");
    assert.equal(makeWikiSlug("中文 认证 失败"), "wiki");
    assert.equal(computeWikiSourceHash("hello").startsWith("sha256:"), true);
    assert.equal(computeWikiSourceHash("hello"), computeWikiSourceHash("hello"));
    assert.ok(MATURITY_ORDER.proven > MATURITY_ORDER.verified);
    assert.ok(SCOPE_ORDER.project > SCOPE_ORDER.team);
    assert.ok(SCOPE_ORDER.team > SCOPE_ORDER.global);
    assert.ok(SCOPE_ORDER.global > SCOPE_ORDER.personal);
  });

  it("reads a missing wiki state as empty and writes compiler state", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-state-"));
    const state = await readWikiState(root);
    assert.equal(state.protocol_version, PROTOCOL_VERSION);
    assert.deepEqual(state.sources, {});

    await writeWikiState(root, {
      protocol_version: PROTOCOL_VERSION,
      sources: {
        "source-a": {
          source_hash: "sha256:a",
          last_compiled_at: "2026-05-20T00:00:00.000Z",
          candidate_ids: ["candidate-a"],
          page_ids: ["page-a"],
        },
      },
    });

    const saved = JSON.parse(await readFile(join(root, ".praxisbase/wiki/state.json"), "utf8"));
    assert.equal(saved.sources["source-a"].source_hash, "sha256:a");
  });

  it("does not hide a corrupt wiki state file", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-state-corrupt-"));
    await mkdir(join(root, ".praxisbase/wiki"), { recursive: true });
    await writeFile(join(root, ".praxisbase/wiki/state.json"), "{not-json");

    await assert.rejects(() => readWikiState(root), SyntaxError);
  });
});

describe("collectWikiSources", () => {
  it("collects stable kb markdown and skills with deterministic source ids", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-collect-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await mkdir(join(root, "skills/openclaw/auth-repair"), { recursive: true });
    await writeFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), `---
id: openclaw-auth-expired
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: published
maturity: verified
signatures: ["openclaw:auth-expired"]
skills: ["skills/openclaw/auth-repair/SKILL.md"]
sources: [{ uri: "raw-vault://codex/session-1", hash: "sha256:s1" }]
confidence: 0.8
reference_count: 2
last_referenced_at: null
supersedes: []
superseded_by: null
updated_at: "2026-05-20T00:00:00.000Z"
---
# OpenClaw Auth Expired

Refresh auth when the CLI reports expired credentials.
`);
    await writeFile(join(root, "skills/openclaw/auth-repair/SKILL.md"), `---
id: openclaw-auth-repair
scope: team
knowledge_type: skill
maturity: verified
---
# Auth Repair

Refresh OpenClaw auth safely.
`);

    const sources = await collectWikiSources(root);
    assert.deepEqual(
      sources.map((source) => source.id),
      [
        "skill:skills/openclaw/auth-repair/SKILL.md",
        "stable_kb:kb/known-fixes/openclaw-auth-expired.md",
      ]
    );

    const stableKb = sources.find((source) => source.kind === "stable_kb");
    const skill = sources.find((source) => source.kind === "skill");
    assert.equal(stableKb?.title, "OpenClaw Auth Expired");
    assert.equal(stableKb?.scope, "team");
    assert.equal(stableKb?.knowledge_type, "known_fix");
    assert.ok(stableKb?.body?.includes("Refresh auth"));
    assert.equal(skill?.kind, "skill");
  });

  it("uses only redacted summaries for captures and keeps personal scope personal", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-capture-"));
    await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
    await writeFile(join(root, ".praxisbase/outbox/captures/capture_1.json"), JSON.stringify({
      id: "capture_1",
      protocol_version: PROTOCOL_VERSION,
      type: "capture_record",
      agent: "codex",
      workspace: root,
      scope_hint: "personal",
      result: "success",
      triggers: ["task_finish"],
      signals: [],
      artifacts: [
        {
          kind: "transcript",
          source_ref: "raw-vault://codex/session-1",
          source_hash: "sha256:session1",
          redacted_summary: "Fixed auth by refreshing the session.",
        },
      ],
      created_at: "2026-05-20T00:00:00.000Z",
    }));

    const sources = await collectWikiSources(root);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].kind, "capture");
    assert.equal(sources[0].scope, "personal");
    assert.equal(sources[0].body, undefined);
    assert.equal(sources[0].summary, "Fixed auth by refreshing the session.");
  });

  it("collects allowlisted JSON evidence without raw bodies and sorts by id", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-json-"));
    await mkdir(join(root, ".praxisbase/inbox/episodes"), { recursive: true });
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await mkdir(join(root, ".praxisbase/inbox/reviews"), { recursive: true });
    await mkdir(join(root, ".praxisbase/reports/memory"), { recursive: true });
    await mkdir(join(root, ".praxisbase/raw-vault/refs"), { recursive: true });

    await writeFile(join(root, ".praxisbase/inbox/episodes/episode_1.json"), JSON.stringify({
      id: "episode_1",
      protocol_version: PROTOCOL_VERSION,
      type: "repair_episode",
      scope: "team",
      agent_id: "codex",
      agent_type: "temporary_repair_agent",
      environment_id: "dev",
      run_id: "run_1",
      idempotency_key: "idem_1",
      problem_signature: "openclaw:auth-expired",
      result: "success",
      used_skills: [],
      used_objects: [],
      source_refs: ["raw-vault://codex/session-1"],
      knowledge_references: [],
      summary: "Fixed OpenClaw auth by refreshing the session.",
      created_at: "2026-05-20T00:00:00.000Z",
    }));

    await writeFile(join(root, ".praxisbase/reports/memory/memory_1.json"), JSON.stringify({
      id: "memory_1",
      protocol_version: PROTOCOL_VERSION,
      type: "memory_import_report",
      agent: "openhuman",
      imported_sources: 1,
      proposal_candidates: [],
      capture_candidates: [],
      default_scope: "personal",
      changed_stable_knowledge: false,
      warnings: [],
      source_hashes: ["sha256:memory1"],
      created_at: "2026-05-20T00:00:00.000Z",
    }));

    await writeFile(join(root, ".praxisbase/inbox/proposals/proposal_1.json"), JSON.stringify({
      id: "proposal_1",
      protocol_version: PROTOCOL_VERSION,
      type: "knowledge_proposal",
      scope: "team",
      action: "create",
      target_type: "note",
      target_id: "auth-note",
      agent_id: "codex",
      agent_type: "temporary_repair_agent",
      environment_id: "dev",
      run_id: "run_1",
      idempotency_key: "idem_proposal_1",
      evidence: {
        source_uri: "raw-vault://codex/session-1",
        source_hash: "sha256:proposal1",
        excerpt: "Auth was fixed after refresh.",
        repair_result: "success",
        verification: "Command succeeded.",
        redacted_summary: "Auth refresh proposal.",
      },
      patch: {
        path: "kb/notes/auth-note.md",
        content: "# Auth Note\n\nDraft body should not be collected as raw evidence.",
      },
      created_at: "2026-05-20T00:00:00.000Z",
    }));

    await writeFile(join(root, ".praxisbase/inbox/reviews/review_1.json"), JSON.stringify({
      id: "review_1",
      protocol_version: PROTOCOL_VERSION,
      proposal_id: "proposal_1",
      reviewer_id: "reviewer",
      reviewer_model: "test-model",
      prompt_version: "v1",
      decision: "approve",
      risk: "low",
      confidence: 0.9,
      reasons: ["Evidence is redacted and scoped."],
      required_checks: [],
      created_at: "2026-05-20T00:00:00.000Z",
    }));

    await writeFile(join(root, ".praxisbase/raw-vault/refs/ref_1.json"), JSON.stringify({
      id: "ref_1",
      source_ref: "raw-vault://codex/session-1",
      source_hash: "sha256:ref1",
      redacted_summary: "Raw vault ref summary only.",
      scope_hint: "personal",
      created_at: "2026-05-20T00:00:00.000Z",
      raw_body: "SHOULD_NOT_APPEAR_IN_WIKI_SOURCE",
    }));

    const sources = await collectWikiSources(root);
    assert.deepEqual(
      sources.map((source) => source.id),
      [
        "episode:episode_1",
        "external_ref:ref_1",
        "native_memory:memory_1",
        "proposal:proposal_1",
        "review:review_1",
      ]
    );
    assert.deepEqual(
      sources.map((source) => source.id),
      [...sources.map((source) => source.id)].sort()
    );
    assert.equal(sources.find((source) => source.kind === "episode")?.summary, "Fixed OpenClaw auth by refreshing the session.");
    assert.equal(sources.find((source) => source.kind === "native_memory")?.source_hash, "sha256:memory1");
    assert.equal(sources.find((source) => source.kind === "proposal")?.summary, "Auth refresh proposal.");
    assert.equal(sources.find((source) => source.kind === "review")?.summary, "Evidence is redacted and scoped.");
    assert.equal(sources.find((source) => source.kind === "external_ref")?.summary, "Raw vault ref summary only.");
    assert.equal(sources.some((source) => source.body?.includes("SHOULD_NOT_APPEAR")), false);
  });
});
