import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addExperienceSource } from "@praxisbase/core/experience/source-config.js";
import { runDailyExperience } from "@praxisbase/core/experience/daily.js";
import { writeAiProviderConfig } from "@praxisbase/core/ai/config.js";
import { protocolPaths } from "@praxisbase/core";

describe("runDailyExperience", () => {
  it("runs the personal daily loop from configured sources into wiki proposals", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-personal-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Implemented OpenClaw auth refresh and pnpm test passed.", "utf8");
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      degraded: true,
      now: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(report.authority_mode, "personal-local");
    assert.equal(report.sources.length, 1);
    assert.equal(report.sources[0].enveloped, 1);
    assert.equal(report.sources[0].imported, 1);
    assert.equal(report.proposal_candidates, 1);
    assert.equal(report.changed_stable_knowledge, false);
    assert.ok(report.outputs.some((output) => output.startsWith(protocolPaths.reportsDaily)));
    assert.ok(report.outputs.some((output) => output.startsWith(".praxisbase/reports/wiki-curation/")));
    assert.ok(report.outputs.some((output) => output.startsWith(protocolPaths.stagingExperienceEnvelopes)));
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    const proposals = await Promise.all(proposalFiles.map(async (file) => (
      JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", file), "utf8"))
    )));
    assert.ok(proposals.some((proposal) => proposal.type === "wiki_curated_proposal"));
  });

  it("keeps personal material out of team daily ingestion", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-team-privacy-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Implemented OpenClaw auth refresh.", "utf8");
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    const report = await runDailyExperience(root, {
      authorityMode: "team-git",
      mode: "write",
      degraded: true,
      now: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(report.sources[0].rejected, 1);
    assert.equal(report.sources[0].imported, 0);
    assert.equal(report.proposal_candidates, 0);
    await assert.rejects(() => stat(join(root, ".praxisbase/raw-vault/refs")), { code: "ENOENT" });
    const exceptions = await readdir(join(root, ".praxisbase/exceptions/human-required"));
    assert.equal(exceptions.length, 1);
    const exception = await readFile(join(root, ".praxisbase/exceptions/human-required", exceptions[0]), "utf8");
    assert.match(exception, /team_rejects_personal_scope/);
  });

  it("requires AI config for production daily by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-ai-required-"));

    await assert.rejects(
      () => runDailyExperience(root, {
        authorityMode: "personal-local",
        mode: "write",
        now: "2026-05-21T01:00:00.000Z",
      }),
      /AI_DISTILL_NOT_CONFIGURED/,
    );
  });

  it("distills safe personal chunks through an injected AI client", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-ai-production-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), [
      "Implemented OpenClaw auth refresh handling.",
      "Added retry guard and pnpm test passed.",
    ].join("\n"), "utf8");
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    let calls = 0;
    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson(input) {
          calls++;
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return {
              ok: true,
              json: {
                title: "OpenClaw auth refresh repair",
                summary: "Add retry guard coverage before retrying OpenClaw auth refresh.",
                body_markdown: [
                  "# OpenClaw auth refresh repair",
                  "",
                  "## Problem",
                  "Auth refresh handling was incomplete.",
                  "",
                  "## Fix",
                  "- Added retry guard.",
                  "",
                  "## Verification",
                  "- pnpm test passed",
                ].join("\n"),
                confidence: 0.91,
              },
            };
          }
          const prompt = JSON.parse(input.user) as {
            source: {
              source_ref: string;
              source_hash: string;
              chunk_hash: string;
              agent: "codex";
              scope_hint: "personal";
            };
          };
          return {
            ok: true,
            json: {
              source_ref: prompt.source.source_ref,
              source_hash: prompt.source.source_hash,
              chunk_hashes: [prompt.source.chunk_hash],
              agent: prompt.source.agent,
              scope_hint: prompt.source.scope_hint,
              summary: "OpenClaw auth refresh needs retry guard coverage.",
              problem: "Auth refresh handling was incomplete.",
              actions: ["Added retry guard."],
              failed_attempts: [],
              outcome: "success",
              verification: ["pnpm test passed"],
              reusable_lessons: ["Add retry guards around auth refresh repair paths."],
              risks: [],
              suggested_tags: ["openclaw", "auth"],
              suggested_wiki_kind: "known_fix",
              skill_candidate: { should_create: true, title: "OpenClaw auth refresh repair", trigger: "OpenClaw auth refresh failures", procedure: ["Check retry guard coverage."] },
              confidence: 0.91,
            },
          };
        },
      },
    });

    assert.equal(calls, 2);
    assert.equal(report.ai_distill.mode, "production");
    assert.equal(report.ai_distill.production_ready, true);
    assert.equal(report.ai_distill.distilled, 1);
    assert.equal(report.sources[0].imported, 1);
    assert.equal(report.proposal_candidates, 1);
    assert.ok(report.outputs.some((output) => output.startsWith(".praxisbase/reports/wiki-curation/")));
  });

  it("limits production AI distill across all sources and writes live progress", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-ai-budget-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Implemented OpenClaw auth refresh and pnpm test passed.", "utf8");
    await writeFile(join(sessions, "session-2.txt"), "Fixed OpenClaw ACK timing and pnpm test passed.", "utf8");
    await writeFile(join(sessions, "session-3.txt"), "Updated OpenClaw retry handling and pnpm test passed.", "utf8");
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    let distillCalls = 0;
    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxAiChunks: 1,
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return { ok: false, error: "curation not relevant for this test" };
          }
          distillCalls++;
          const prompt = JSON.parse(input.user) as {
            source: {
              source_ref: string;
              source_hash: string;
              chunk_hash: string;
              agent: "codex";
              scope_hint: "personal";
            };
          };
          return {
            ok: true,
            json: {
              source_ref: prompt.source.source_ref,
              source_hash: prompt.source.source_hash,
              chunk_hashes: [prompt.source.chunk_hash],
              agent: prompt.source.agent,
              scope_hint: prompt.source.scope_hint,
              summary: "OpenClaw repair was verified.",
              actions: ["Applied the repair."],
              failed_attempts: [],
              outcome: "success",
              verification: ["pnpm test passed"],
              reusable_lessons: ["Keep the repair bounded and verify it."],
              risks: [],
              suggested_tags: ["openclaw"],
              suggested_wiki_kind: "known_fix",
              skill_candidate: { should_create: false },
              confidence: 0.9,
            },
          };
        },
      },
    });

    assert.equal(distillCalls, 1);
    assert.equal(report.ai_distill.chunks, 1);
    assert.match(report.warnings.join("\n"), /max_ai_chunks_reached:1/);
    const progressPath = report.outputs.find((output) => output.startsWith(".praxisbase/runs/live/"));
    assert.ok(progressPath);
    const progress = JSON.parse(await readFile(join(root, progressPath), "utf8"));
    assert.equal(progress.status, "completed");
    assert.equal(progress.ai_distill.chunks, 1);
  });

  it("rejects team personal chunks before calling AI", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-ai-team-gate-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Implemented OpenClaw auth refresh.", "utf8");
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    const report = await runDailyExperience(root, {
      authorityMode: "team-git",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson() {
          throw new Error("AI should not be called for team personal chunks");
        },
      },
    });

    assert.equal(report.ai_distill.human_required, 1);
    assert.equal(report.ai_distill.distilled, 0);
    assert.equal(report.sources[0].rejected, 1);
    assert.equal(report.sources[0].imported, 0);
  });
});
