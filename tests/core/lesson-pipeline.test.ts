/// <reference types="node" />

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { protocolPaths, runLessonPipeline } from "@praxisbase/core";

test("lesson pipeline uses injected AI client and redacts private spans before team-mode AI extraction", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-lesson-pipeline-"));
  const source = join(root, "remote-openclaw");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "MEMORY.md"), [
    "# Remote Memory",
    "- Before restarting root@guanzhicheng.com at 100.64.1.10 with ~/.ssh/openclaw_key, confirm target machine first.",
  ].join("\n"));

  let aiUserPrompt = "";
  const report = await runLessonPipeline(root, {
    sourcePath: source,
    agent: "openclaw",
    scope: "team",
    origin: "trusted_personal_remote",
    authorityMode: "team-git",
    now: "2026-05-29T00:00:00.000Z",
    aiClient: {
      async generateJson(input) {
        aiUserPrompt = input.user;
        const parsed = JSON.parse(input.user) as { spans: Array<{ span_id: string }> };
        return {
          ok: true,
          json: {
            lessons: [{
              claim: "Confirm target machine before restarting a remote host.",
              safe_claim: "Confirm the target machine before restarting a remote host.",
              problem: "Remote operations can hit the wrong machine.",
              trigger: "Before remote restart or other machine-specific operation.",
              action: "Confirm the target machine before executing the operation.",
              verification: "The target machine was checked before execution.",
              negative_case: "Do not restart an assumed target machine.",
              applies_to_agents: ["openclaw"],
              applies_to_systems: ["remote-ops"],
              portability: "agent_family",
              privacy_tier: "team_allowed",
              scope: "team",
              confidence: 0.91,
              cue_family: "llm_inferred",
              evidence_span_ids: [parsed.spans[0]!.span_id],
              redaction_notes: [],
            }],
          },
        };
      },
    },
  });

  assert.equal(report.ai_lessons, 1);
  assert.doesNotMatch(aiUserPrompt, /root@guanzhicheng\.com/);
  assert.doesNotMatch(aiUserPrompt, /100\.64\.1\.10/);
  assert.doesNotMatch(aiUserPrompt, /openclaw_key/);
  assert.match(aiUserPrompt, /\[REDACTED_/);
});

test("lesson pipeline preserves home-relative source paths for inventory expansion", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-lesson-pipeline-root-"));
  const source = await mkdtemp(join(homedir(), ".praxisbase-lesson-pipeline-home-"));
  try {
    await writeFile(
      join(source, "MEMORY.md"),
      "- Need tools/network/dispatch or slow tasks: send a short ACK first.\n",
      "utf8",
    );

    const report = await runLessonPipeline(root, {
      sourcePath: `~/${source.slice(homedir().length + 1)}`,
      agent: "openclaw",
      scope: "personal",
      origin: "local",
      authorityMode: "personal-local",
      now: "2026-05-29T00:00:00.000Z",
      maxSpans: 10,
    });

    assert.equal(report.source_items, 1);
    assert.equal(report.lessons.length, 1);
    assert.match(report.lessons[0]!.safe_claim, /acknowledgement|ACK/i);
  } finally {
    await rm(source, { recursive: true, force: true });
  }
});

test("lesson pipeline writes and reuses persistent lesson state cache", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-lesson-pipeline-cache-"));
  const source = join(root, "openclaw-memory");
  await mkdir(source, { recursive: true });
  await writeFile(
    join(source, "MEMORY.md"),
    "- Need tools/network/dispatch or slow tasks: send a short ACK first.\n",
    "utf8",
  );

  const first = await runLessonPipeline(root, {
    sourcePath: source,
    agent: "openclaw",
    scope: "personal",
    origin: "local",
    authorityMode: "personal-local",
    now: "2026-05-29T00:00:00.000Z",
    maxSpans: 10,
  });
  const second = await runLessonPipeline(root, {
    sourcePath: source,
    agent: "openclaw",
    scope: "personal",
    origin: "local",
    authorityMode: "personal-local",
    now: "2026-05-29T00:05:00.000Z",
    maxSpans: 10,
  });

  assert.equal(first.cache_upserted, 1);
  assert.equal(second.cache_upserted, 1);
  const cacheRaw = await readFile(join(root, protocolPaths.cacheLessonState, "cache.json"), "utf8");
  const cache = JSON.parse(cacheRaw) as { records: Array<{ observation_count: number }> };
  assert.equal(cache.records.length, 1);
  assert.equal(cache.records[0]!.observation_count, 2);
});

test("lesson pipeline reports AI extraction cache hits and misses", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-lesson-pipeline-ai-cache-"));
  const source = join(root, "openclaw-memory");
  await mkdir(source, { recursive: true });
  await writeFile(
    join(source, "MEMORY.md"),
    "- Confirm target machine before executing a remote restart.\n",
    "utf8",
  );
  let calls = 0;
  const aiClient = {
    async generateJson(input: { user: string }) {
      calls += 1;
      const parsed = JSON.parse(input.user) as { spans: Array<{ span_id: string }> };
      return {
        ok: true as const,
        json: {
          lessons: [{
            claim: "Confirm target machine before executing remote restart.",
            safe_claim: "Confirm the target machine before executing remote restart.",
            problem: "Remote restarts can target the wrong machine.",
            trigger: "Before restart or destructive remote operation.",
            action: "Check the target machine before executing.",
            verification: "Target was checked before execution.",
            negative_case: "Do not assume the remote target is correct.",
            applies_to_agents: ["openclaw"],
            applies_to_systems: ["remote-ops"],
            portability: "agent_family",
            privacy_tier: "safe",
            scope: "personal",
            confidence: 0.91,
            cue_family: "llm_inferred",
            evidence_span_ids: [parsed.spans[0]!.span_id],
            redaction_notes: [],
          }],
        },
      };
    },
  };

  const first = await runLessonPipeline(root, {
    sourcePath: source,
    agent: "openclaw",
    scope: "personal",
    origin: "local",
    authorityMode: "personal-local",
    now: "2026-05-29T00:00:00.000Z",
    maxSpans: 10,
    aiClient,
    aiCacheIdentity: "glm-4.7",
  });
  const second = await runLessonPipeline(root, {
    sourcePath: source,
    agent: "openclaw",
    scope: "personal",
    origin: "local",
    authorityMode: "personal-local",
    now: "2026-05-29T00:05:00.000Z",
    maxSpans: 10,
    aiClient,
    aiCacheIdentity: "glm-4.7",
  });

  assert.equal(calls, 1);
  assert.deepEqual(first.ai_cache, { enabled: true, hits: 0, misses: 1, writes: 1, corrupt: 0 });
  assert.deepEqual(second.ai_cache, { enabled: true, hits: 1, misses: 0, writes: 0, corrupt: 0 });
});

test("lesson pipeline reports the authority contract for downstream integrations", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-lesson-pipeline-authority-"));
  const source = join(root, "openclaw-memory");
  await mkdir(source, { recursive: true });
  await writeFile(
    join(source, "MEMORY.md"),
    "- Need tools/network/dispatch or slow tasks: send a short ACK first.\n",
    "utf8",
  );

  const report = await runLessonPipeline(root, {
    sourcePath: source,
    agent: "openclaw",
    scope: "personal",
    origin: "local",
    authorityMode: "personal-local",
    now: "2026-05-29T00:00:00.000Z",
    maxSpans: 10,
  });

  assert.equal(report.authority_contract.wiki_semantic_input, "lesson_clusters");
  assert.deepEqual(report.authority_contract.context_rank, [
    "stable_pb_page",
    "promoted_skill",
    "active_personal_lesson",
    "gbrain_sidecar",
    "agentmemory_sidecar",
    "legacy_distilled",
    "raw_audit",
  ]);
  assert.deepEqual(report.authority_contract.promotion_evidence, {
    lesson_state_authority: true,
    legacy_distilled: false,
    gbrain_sidecar: false,
    agentmemory_sidecar: false,
  });
});
