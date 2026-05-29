/// <reference types="node" />
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { extractLessonsWithAi, protocolPaths } from "@praxisbase/core";

function makeSpan(spanId = "s1") {
  return {
    source_item_id: "memory",
    source_ref: "source-inventory://openclaw/MEMORY.md",
    source_hash: "sha256:m",
    span_id: spanId,
    line_start: 1,
    line_end: 1,
    byte_start: 0,
    byte_end: 80,
    heading_path: ["Ops"],
    excerpt: "Confirm target machine before restart.",
    excerpt_hash: "sha256:e",
    span_kind: "bullet",
  } as any;
}

function makeLesson(evidenceSpanIds = ["s1"]) {
  return {
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
    evidence_span_ids: evidenceSpanIds,
    redaction_notes: [],
  };
}

test("LLM extractor validates strict lesson JSON and attaches spans", async () => {
  const client = {
    generateJson: async () => ({
      ok: true as const,
      json: {
        lessons: [makeLesson()],
      },
    }),
  };

  const lessons = await extractLessonsWithAi([makeSpan()], {
    client,
    now: "2026-05-29T00:00:00.000Z",
  });

  assert.equal(lessons.length, 1);
  assert.equal(lessons[0]!.evidence_spans[0]!.span_id, "s1");
});

test("LLM extractor returns empty on client failure", async () => {
  const failClient = {
    generateJson: async () => ({ ok: false as const, error: "API key missing" }),
  };

  const lessons = await extractLessonsWithAi([makeSpan()], {
    client: failClient,
    now: "2026-05-29T00:00:00.000Z",
  });

  assert.equal(lessons.length, 0);
});

test("LLM extractor drops lessons without valid span evidence", async () => {
  const client = {
    generateJson: async () => ({
      ok: true as const,
      json: {
        lessons: [makeLesson(["nonexistent"])],
      },
    }),
  };

  const lessons = await extractLessonsWithAi([makeSpan()], {
    client,
    now: "2026-05-29T00:00:00.000Z",
  });

  assert.equal(lessons.length, 0);
});

test("LLM extractor rejects weak one-off run reports even when AI emits a lesson", async () => {
  const weakSpan = {
    ...makeSpan("run-1"),
    excerpt: "Smoke ran successfully for run 20260529-abc.",
    excerpt_hash: "sha256:weak",
    span_kind: "paragraph",
  };
  const client = {
    generateJson: async () => ({
      ok: true as const,
      json: {
        lessons: [{
          ...makeLesson(["run-1"]),
          claim: "Smoke ran successfully.",
          safe_claim: "Smoke ran successfully.",
          problem: "A smoke run completed.",
          trigger: "When checking this run.",
          action: "Note that this smoke run completed.",
          verification: "Run 20260529-abc passed.",
          confidence: 0.9,
        }],
      },
    }),
  };

  const lessons = await extractLessonsWithAi([weakSpan], {
    client,
    now: "2026-05-29T00:00:00.000Z",
    agent: "openclaw",
    scope: "personal",
  });

  assert.equal(lessons.length, 0);
});

test("LLM extractor retries once on malformed output", async () => {
  let calls = 0;
  const client = {
    generateJson: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true as const,
          json: {
            lessons: [{ ...makeLesson(), confidence: 2 }],
          },
        };
      }
      return {
        ok: true as const,
        json: {
          lessons: [makeLesson()],
        },
      };
    },
  };

  const lessons = await extractLessonsWithAi([makeSpan()], {
    client,
    now: "2026-05-29T00:00:00.000Z",
  });

  assert.equal(calls, 2);
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0]!.evidence_spans[0]!.span_id, "s1");
});

test("LLM extractor reuses cache by prompt model and span identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-lesson-ai-cache-"));
  let calls = 0;
  const client = {
    generateJson: async () => {
      calls += 1;
      return {
        ok: true as const,
        json: {
          lessons: [makeLesson()],
        },
      };
    },
  };

  const first = await extractLessonsWithAi([makeSpan()], {
    client,
    now: "2026-05-29T00:00:00.000Z",
    agent: "openclaw",
    scope: "personal",
    cache: { root, identity: "glm-4.7" },
  });
  const second = await extractLessonsWithAi([makeSpan()], {
    client,
    now: "2026-05-29T00:00:00.000Z",
    agent: "openclaw",
    scope: "personal",
    cache: { root, identity: "glm-4.7" },
  });

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(calls, 1);
  const files = await readdir(join(root, protocolPaths.cacheLessonExtract));
  assert.equal(files.length, 1);
});

test("LLM extractor reports cache hits misses writes and corrupt entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-lesson-ai-cache-stats-"));
  const stats = { hits: 0, misses: 0, writes: 0, corrupt: 0 };
  let calls = 0;
  const client = {
    generateJson: async () => {
      calls += 1;
      return {
        ok: true as const,
        json: {
          lessons: [makeLesson()],
        },
      };
    },
  };

  await extractLessonsWithAi([makeSpan()], {
    client,
    now: "2026-05-29T00:00:00.000Z",
    agent: "openclaw",
    scope: "personal",
    cache: { root, identity: "glm-4.7", stats },
  });
  await extractLessonsWithAi([makeSpan()], {
    client,
    now: "2026-05-29T00:00:00.000Z",
    agent: "openclaw",
    scope: "personal",
    cache: { root, identity: "glm-4.7", stats },
  });

  const [cacheFile] = await readdir(join(root, protocolPaths.cacheLessonExtract));
  await writeFile(join(root, protocolPaths.cacheLessonExtract, cacheFile!), "{\"lessons\":[{\"bad\":true}]}", "utf8");

  await extractLessonsWithAi([makeSpan()], {
    client,
    now: "2026-05-29T00:00:00.000Z",
    agent: "openclaw",
    scope: "personal",
    cache: { root, identity: "glm-4.7", stats },
  });

  assert.equal(calls, 2);
  assert.deepEqual(stats, { hits: 1, misses: 2, writes: 2, corrupt: 1 });
});

test("LLM extractor cache identity includes source provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-lesson-ai-cache-source-"));
  let calls = 0;
  const client = {
    generateJson: async () => {
      calls += 1;
      return {
        ok: true as const,
        json: {
          lessons: [makeLesson()],
        },
      };
    },
  };
  const firstSpan = makeSpan();
  const secondSpan = {
    ...makeSpan(),
    source_item_id: "memory-copy",
    source_ref: "source-inventory://openclaw/OTHER-MEMORY.md",
  };

  await extractLessonsWithAi([firstSpan], {
    client,
    now: "2026-05-29T00:00:00.000Z",
    agent: "openclaw",
    scope: "personal",
    cache: { root, identity: "glm-4.7" },
  });
  const second = await extractLessonsWithAi([secondSpan], {
    client,
    now: "2026-05-29T00:00:00.000Z",
    agent: "openclaw",
    scope: "personal",
    cache: { root, identity: "glm-4.7" },
  });

  assert.equal(calls, 2);
  assert.equal(second[0]!.source_refs[0], "source-inventory://openclaw/OTHER-MEMORY.md");
  const files = await readdir(join(root, protocolPaths.cacheLessonExtract));
  assert.equal(files.length, 2);
});

test("LLM extractor cache identity includes planner parser and reducer identities", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-lesson-ai-cache-identity-"));
  let calls = 0;
  const client = {
    generateJson: async () => {
      calls += 1;
      return {
        ok: true as const,
        json: {
          lessons: [makeLesson()],
        },
      };
    },
  };

  await extractLessonsWithAi([makeSpan()], {
    client,
    now: "2026-05-29T00:00:00.000Z",
    agent: "openclaw",
    scope: "personal",
    cache: {
      root,
      identity: "glm-4.7",
      plannerIdentity: "planner-v1",
      parserIdentity: "parser-v1",
      reducerIdentity: "reducer-v1",
    },
  });
  await extractLessonsWithAi([makeSpan()], {
    client,
    now: "2026-05-29T00:00:00.000Z",
    agent: "openclaw",
    scope: "personal",
    cache: {
      root,
      identity: "glm-4.7",
      plannerIdentity: "planner-v2",
      parserIdentity: "parser-v1",
      reducerIdentity: "reducer-v1",
    },
  });
  await extractLessonsWithAi([makeSpan()], {
    client,
    now: "2026-05-29T00:00:00.000Z",
    agent: "openclaw",
    scope: "personal",
    cache: {
      root,
      identity: "glm-4.7",
      plannerIdentity: "planner-v2",
      parserIdentity: "parser-v2",
      reducerIdentity: "reducer-v1",
    },
  });
  await extractLessonsWithAi([makeSpan()], {
    client,
    now: "2026-05-29T00:00:00.000Z",
    agent: "openclaw",
    scope: "personal",
    cache: {
      root,
      identity: "glm-4.7",
      plannerIdentity: "planner-v2",
      parserIdentity: "parser-v2",
      reducerIdentity: "reducer-v2",
    },
  });

  assert.equal(calls, 4);
  const files = await readdir(join(root, protocolPaths.cacheLessonExtract));
  assert.equal(files.length, 4);
});
