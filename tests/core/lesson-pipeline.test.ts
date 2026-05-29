/// <reference types="node" />

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { runLessonPipeline } from "@praxisbase/core";

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
