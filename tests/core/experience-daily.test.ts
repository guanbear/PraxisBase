import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addExperienceSource } from "@praxisbase/core/experience/source-config.js";
import { deriveDailyNextActions, runDailyExperience } from "@praxisbase/core/experience/daily.js";
import { writeAiProviderConfig } from "@praxisbase/core/ai/config.js";
import { PROTOCOL_VERSION, protocolPaths } from "@praxisbase/core";

describe("runDailyExperience", () => {
  it("derives clear personal next actions from daily report counts", () => {
    const nextActions = deriveDailyNextActions({
      id: "daily-experience_20260521",
      protocol_version: PROTOCOL_VERSION,
      type: "daily_experience_report",
      authority_mode: "personal-local",
      mode: "write",
      ai_distill: {
        configured: true,
        mode: "production",
        production_ready: false,
        provider: "openai-compatible",
        model: "test-model",
        chunks: 12,
        distilled: 8,
        failed: 1,
        human_required: 3,
        privacy_required: 2,
        review_required: 1,
        rejected_low_signal: 4,
        rejected_quality: 1,
        cache_hits: 5,
        warnings: [],
      },
      sources: [{
        name: "codex",
        agent: "codex",
        channel: "local",
        source_type: "local",
        status: "partial",
        scanned: 3,
        fetched: 3,
        enveloped: 3,
        imported: 0,
        rejected: 0,
        human_required: 3,
        warnings: [],
      }],
      proposal_candidates: 2,
      quality_findings: 0,
      site_pages: 5,
      changed_stable_knowledge: true,
      outputs: ["dist/index.html"],
      warnings: [],
      created_at: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(nextActions.status, "needs_privacy_triage");
    assert.equal(nextActions.counts.privacy_required, 3);
    assert.equal(nextActions.counts.review_required, 3);
    assert.equal(nextActions.counts.rejected_low_signal, 4);
    assert.equal(nextActions.counts.rejected_quality, 1);
    assert.equal(nextActions.counts.changed_stable_knowledge, true);
    assert.equal(nextActions.agentmemory_export_recommended, false);
    assert.ok(nextActions.commands.some((command) => command.includes("privacy triage")));
    assert.ok(nextActions.messages.some((message) => message.includes("privacy")));
  });

  it("recommends AgentMemory export only after stable wiki changes without pending gates", () => {
    const nextActions = deriveDailyNextActions({
      id: "daily-experience_20260521",
      protocol_version: PROTOCOL_VERSION,
      type: "daily_experience_report",
      authority_mode: "personal-local",
      mode: "write",
      ai_distill: {
        configured: true,
        mode: "production",
        production_ready: true,
        chunks: 4,
        distilled: 4,
        failed: 0,
        human_required: 0,
        privacy_required: 0,
        review_required: 0,
        rejected_low_signal: 0,
        rejected_quality: 0,
        cache_hits: 0,
        warnings: [],
      },
      sources: [],
      proposal_candidates: 0,
      quality_findings: 0,
      site_pages: 6,
      changed_stable_knowledge: true,
      outputs: ["dist/index.html"],
      warnings: [],
      created_at: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(nextActions.status, "ready_to_export_agentmemory");
    assert.equal(nextActions.agentmemory_export_recommended, true);
    assert.ok(nextActions.commands.some((command) => command.includes("agentmemory export")));
  });

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
    const exception = JSON.parse(await readFile(join(root, ".praxisbase/exceptions/human-required", exceptions[0]), "utf8"));
    assert.match(JSON.stringify(exception), /team_rejects_personal_scope/);
    assert.match(exception.details.redacted_summary, /Implemented OpenClaw auth refresh/);
  });

  it("writes redacted review context to daily privacy exceptions", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-privacy-context-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Fixed OpenClaw auth after token=abc123456789 was printed.", "utf8");
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

    assert.equal(report.sources[0].human_required, 1);
    const exceptions = await readdir(join(root, ".praxisbase/exceptions/human-required"));
    const exception = JSON.parse(await readFile(join(root, ".praxisbase/exceptions/human-required", exceptions[0]), "utf8"));
    assert.match(exception.details.redacted_summary, /OpenClaw auth/);
    assert.equal(exception.details.redacted_summary.includes("abc123456789"), false);
    assert.match(exception.details.redacted_summary, /\[REDACTED\]/);
  });

  it("turns auto-released privacy triage exceptions into redacted evidence on the next daily run", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-triage-release-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Fixed OpenClaw auth after token=abc123456789 was printed.", "utf8");
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      maxCurationProposals: 0,
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson() {
          return { ok: false, error: "distill should be blocked by pre-AI privacy" };
        },
      },
    });
    const exceptionFiles = await readdir(join(root, ".praxisbase/exceptions/human-required"));
    assert.equal(exceptionFiles.length, 1);
    const exceptionPath = join(root, ".praxisbase/exceptions/human-required", exceptionFiles[0]);
    const exception = JSON.parse(await readFile(exceptionPath, "utf8"));
    await writeFile(exceptionPath, JSON.stringify({
      ...exception,
      details: {
        ...exception.details,
        triage: {
          classification: "safe_personal_experience",
          confidence: 0.88,
          rationale: "The reusable lesson is safe after redaction.",
          suggested_redactions: [],
          hard_block_reasons: [],
          decision: "auto_released",
          triaged_at: "2026-05-21T01:30:00.000Z",
        },
      },
    }, null, 2), "utf8");

    const second = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      maxCurationProposals: 0,
      now: "2026-05-21T02:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson() {
          return { ok: false, error: "auto-released privacy evidence should not call distill" };
        },
      },
    });

    assert.equal(second.sources[0].human_required, 0);
    assert.equal(second.sources[0].imported, 1);
    const envelopes = await readdir(join(root, ".praxisbase/staging/experience-envelopes"));
    assert.equal(envelopes.length, 1);
    const envelope = JSON.parse(await readFile(join(root, ".praxisbase/staging/experience-envelopes", envelopes[0]), "utf8"));
    assert.equal(envelope.privacy.verdict, "allow");
    assert.ok(envelope.privacy.reasons.includes("privacy_triage_auto_released"));
    assert.match(envelope.redacted_summary, /OpenClaw auth/);
    assert.equal(envelope.redacted_summary.includes("abc123456789"), false);
    assert.equal(/\btoken\b/i.test(envelope.redacted_summary), false);
    const preservedException = JSON.parse(await readFile(exceptionPath, "utf8"));
    assert.equal(preservedException.details.triage.decision, "auto_released");
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

  it("auto-promotes low-risk personal wiki proposals before building the site", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-auto-promote-site-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), [
      "Fixed OpenClaw auth refresh handling.",
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

    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      buildSite: true,
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return {
              ok: true,
              json: {
                title: "OpenClaw auth refresh repair",
                summary: "Add retry guard coverage before retrying OpenClaw auth refresh.",
                page_kind: "known_fix",
                target_path: "kb/known-fixes/openclaw-auth-refresh-repair.md",
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
                  "",
                  "## Reusable Lessons",
                  "- Add retry guards around auth refresh repair paths.",
                ].join("\n"),
                confidence: 0.91,
                risk_notes: [],
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
              skill_candidate: { should_create: false },
              confidence: 0.91,
            },
          };
        },
      },
    });

    assert.equal(report.changed_stable_knowledge, true);
    assert.equal(report.site_pages, 1);
    const promoted = await readFile(join(root, "kb/known-fixes/openclaw-auth-refresh-repair.md"), "utf8");
    assert.match(promoted, /OpenClaw auth refresh repair/);
    const sourceSummaryFiles = await readdir(join(root, ".praxisbase/reports/wiki-source-summaries"));
    const sourceSummaries = await Promise.all(sourceSummaryFiles.map(async (file) =>
      JSON.parse(await readFile(join(root, ".praxisbase/reports/wiki-source-summaries", file), "utf8")) as {
        contributed_to_pages: string[];
      }
    ));
    assert.ok(
      sourceSummaries.some((summary) =>
        summary.contributed_to_pages.includes("kb/known-fixes/openclaw-auth-refresh-repair.md")
      ),
      "expected daily auto-promote to record the promoted wiki page on source summaries",
    );
    const page = await readFile(join(root, "dist/pages/openclaw-auth-refresh-repair.html"), "utf8");
    assert.match(page, /OpenClaw auth refresh repair/);
  });

  it("uses the configured distill model override for production provider calls", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-distill-stage-model-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Fixed OpenClaw auth refresh and pnpm test passed.", "utf8");
    await writeAiProviderConfig(root, {
      provider: "openai-compatible",
      model: "GLM-5.1",
      distillModel: "GLM-4.7",
    });
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    let requestedModel = "";
    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: {
        PRAXISBASE_LLM_API_KEY: "test-key",
        PRAXISBASE_LLM_BASE_URL: "https://llm.example.test/v1",
      },
      maxCurationProposals: 0,
      fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ content: string }> };
        requestedModel = body.model;
        const prompt = JSON.parse(body.messages[1].content) as {
          source: {
            source_ref: string;
            source_hash: string;
            chunk_hash: string;
            agent: "codex";
            scope_hint: "personal";
          };
        };
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                source_ref: prompt.source.source_ref,
                source_hash: prompt.source.source_hash,
                chunk_hashes: [prompt.source.chunk_hash],
                agent: prompt.source.agent,
                scope_hint: prompt.source.scope_hint,
                summary: "OpenClaw auth refresh was fixed and verified.",
                actions: ["Fixed auth refresh handling."],
                failed_attempts: [],
                outcome: "success",
                verification: ["pnpm test passed"],
                reusable_lessons: ["Verify OpenClaw auth refresh fixes with pnpm test."],
                risks: [],
                suggested_tags: ["openclaw", "auth"],
                suggested_wiki_kind: "known_fix",
                skill_candidate: { should_create: false },
                confidence: 0.9,
              }),
            },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    assert.equal(requestedModel, "GLM-4.7");
    assert.equal(report.ai_distill.model, "GLM-4.7");
  });

  it("reuses cached distill results on a later daily run", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-distill-cache-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Fixed OpenClaw ACK timing and pnpm test passed.", "utf8");
    await writeAiProviderConfig(root, {
      provider: "openai-compatible",
      model: "GLM-4.7",
    });
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    let distillCalls = 0;
    const first = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxCurationProposals: 0,
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
              summary: "OpenClaw ACK timing fix was verified.",
              actions: ["Adjusted ACK timing."],
              failed_attempts: [],
              outcome: "success",
              verification: ["pnpm test passed"],
              reusable_lessons: ["Verify ACK timing fixes before reuse."],
              risks: [],
              suggested_tags: ["openclaw", "ack"],
              suggested_wiki_kind: "known_fix",
              skill_candidate: { should_create: false },
              confidence: 0.9,
            },
          };
        },
      },
    });

    assert.equal(distillCalls, 1);
    assert.equal((first.ai_distill as { cache_hits?: number }).cache_hits, 0);

    const second = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T02:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxCurationProposals: 0,
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return { ok: false, error: "curation not relevant for this test" };
          }
          throw new Error("distill AI should not be called when cache is warm");
        },
      },
    });

    assert.equal(distillCalls, 1);
    assert.equal(second.ai_distill.distilled, 1);
    assert.equal((second.ai_distill as { cache_hits?: number }).cache_hits, 1);
    assert.equal(second.sources[0].enveloped, 1);
    const cacheFiles = await readdir(join(root, ".praxisbase/cache/ai-distill"));
    assert.equal(cacheFiles.length, 1);
  });

  it("can retry only chunks with cached AI distill failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-retry-failed-distill-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Fixed OpenClaw ACK timing and pnpm test passed.", "utf8");
    await writeFile(join(sessions, "session-2.txt"), "Fixed OpenClaw Slack replay and pnpm test passed.", "utf8");
    await writeAiProviderConfig(root, {
      provider: "openai-compatible",
      model: "GLM-4.7",
    });
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    let firstCalls = 0;
    const first = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxCurationProposals: 0,
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return { ok: false, error: "curation not relevant for this test" };
          }
          firstCalls++;
          const prompt = JSON.parse(input.user) as {
            text: string;
            source: {
              source_ref: string;
              source_hash: string;
              chunk_hash: string;
              agent: "codex";
              scope_hint: "personal";
            };
          };
          if (prompt.text.includes("Slack replay")) {
            return { ok: false, error: "timeout" };
          }
          return {
            ok: true,
            json: {
              source_ref: prompt.source.source_ref,
              source_hash: prompt.source.source_hash,
              chunk_hashes: [prompt.source.chunk_hash],
              agent: prompt.source.agent,
              scope_hint: prompt.source.scope_hint,
              summary: "OpenClaw ACK timing fix was verified.",
              actions: ["Adjusted ACK timing."],
              failed_attempts: [],
              outcome: "success",
              verification: ["pnpm test passed"],
              reusable_lessons: ["Verify ACK timing fixes before reuse."],
              risks: [],
              suggested_tags: ["openclaw", "ack"],
              suggested_wiki_kind: "known_fix",
              skill_candidate: { should_create: false },
              confidence: 0.9,
            },
          };
        },
      },
    });

    assert.equal(firstCalls, 2);
    assert.equal(first.ai_distill.distilled, 1);
    assert.equal(first.ai_distill.failed, 1);

    await writeFile(join(sessions, "session-3.txt"), "Fixed OpenClaw docs indexing and pnpm test passed.", "utf8");

    let retryCalls = 0;
    const second = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T02:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxCurationProposals: 0,
      retryFailedDistillOnly: true,
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return { ok: false, error: "curation not relevant for this test" };
          }
          retryCalls++;
          const prompt = JSON.parse(input.user) as {
            text: string;
            source: {
              source_ref: string;
              source_hash: string;
              chunk_hash: string;
              agent: "codex";
              scope_hint: "personal";
            };
          };
          assert.match(prompt.text, /Slack replay/);
          return {
            ok: true,
            json: {
              source_ref: prompt.source.source_ref,
              source_hash: prompt.source.source_hash,
              chunk_hashes: [prompt.source.chunk_hash],
              agent: prompt.source.agent,
              scope_hint: prompt.source.scope_hint,
              summary: "OpenClaw Slack replay fix was verified.",
              actions: ["Adjusted Slack replay handling."],
              failed_attempts: [],
              outcome: "success",
              verification: ["pnpm test passed"],
              reusable_lessons: ["Retry failed distill chunks without rerunning warm or new chunks."],
              risks: [],
              suggested_tags: ["openclaw", "slack"],
              suggested_wiki_kind: "known_fix",
              skill_candidate: { should_create: false },
              confidence: 0.9,
            },
          };
        },
      },
    });

    assert.equal(retryCalls, 1);
    assert.equal(second.ai_distill.distilled, 2);
    assert.equal(second.ai_distill.failed, 0);
    assert.equal(second.ai_distill.cache_hits, 1);
    assert.match(second.warnings.join("\n"), /retry_failed_distill_skipped_uncached:1/);
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

  it("writes chunk-level live progress while AI distill is running", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-ai-progress-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Implemented OpenClaw auth refresh and pnpm test passed.", "utf8");
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
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return { ok: false, error: "curation not relevant for this test" };
          }
          const liveFiles = await readdir(join(root, ".praxisbase/runs/live"));
          const progress = JSON.parse(await readFile(join(root, ".praxisbase/runs/live", liveFiles[0]), "utf8"));
          assert.equal(progress.current_stage, "ai_distill");
          assert.equal(progress.current_source, "local-codex");
          assert.equal(progress.current_chunk.index, 1);
          assert.equal(progress.current_chunk.total, 1);
          assert.equal(progress.ai_distill.chunks, 1);

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

    assert.equal(report.ai_distill.distilled, 1);
  });

  it("emits stage progress events with elapsed timing for CLI observers", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-progress-events-"));
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

    const events: Array<{ current_stage?: string; elapsed_ms: number; stage_elapsed_ms: number }> = [];
    await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      degraded: true,
      now: "2026-05-21T01:00:00.000Z",
      onProgress: (event) => {
        events.push({
          current_stage: event.current_stage,
          elapsed_ms: event.elapsed_ms,
          stage_elapsed_ms: event.stage_elapsed_ms,
        });
      },
    });

    assert.ok(events.some((event) => event.current_stage === "source"));
    assert.ok(events.some((event) => event.current_stage === "wiki-compile"));
    assert.ok(events.some((event) => event.current_stage === "wiki-curate"));
    assert.ok(events.some((event) => event.elapsed_ms >= 0));
    assert.ok(events.every((event) => Number.isFinite(event.stage_elapsed_ms)));
  });

  it("runs production AI distill with bounded concurrency", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-ai-concurrency-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Implemented OpenClaw auth refresh and pnpm test passed.", "utf8");
    await writeFile(join(sessions, "session-2.txt"), "Fixed OpenClaw ACK timing and pnpm test passed.", "utf8");
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
    let inFlight = 0;
    let maxInFlight = 0;
    let releaseBoth: (() => void) | undefined;
    const bothStarted = new Promise<void>((resolve) => {
      releaseBoth = resolve;
    });
    const waitForBoth = async () => {
      await Promise.race([
        bothStarted,
        new Promise<void>((resolve) => setTimeout(resolve, 20)),
      ]);
    };

    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxAiChunks: 2,
      aiConcurrency: 2,
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return { ok: false, error: "curation not relevant for this test" };
          }
          distillCalls++;
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          if (distillCalls === 2) releaseBoth?.();
          await waitForBoth();
          inFlight--;

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

    assert.equal(report.ai_distill.chunks, 2);
    assert.equal(report.ai_distill.distilled, 2);
    assert.equal(maxInFlight, 2);
  });

  it("allows high AI concurrency above eight while keeping the configured bound", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-ai-high-concurrency-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    for (let index = 1; index <= 12; index++) {
      await writeFile(join(sessions, `session-${String(index).padStart(2, "0")}.txt`), `Fixed OpenClaw repair path ${index} and pnpm test passed.`, "utf8");
    }
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
    let inFlight = 0;
    let maxInFlight = 0;
    let releaseStarted: (() => void) | undefined;
    const enoughStarted = new Promise<void>((resolve) => {
      releaseStarted = resolve;
    });
    const waitForEnoughOrTimeout = async () => {
      await Promise.race([
        enoughStarted,
        new Promise<void>((resolve) => setTimeout(resolve, 50)),
      ]);
    };

    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxAiChunks: 12,
      aiConcurrency: 12,
      maxCurationProposals: 0,
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return { ok: false, error: "curation not relevant for this test" };
          }
          distillCalls++;
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          if (distillCalls === 12) releaseStarted?.();
          await waitForEnoughOrTimeout();
          inFlight--;
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

    assert.equal(report.ai_distill.chunks, 12);
    assert.equal(report.ai_distill.distilled, 12);
    assert.equal(maxInFlight, 12);
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

  it("includes context economy summary when reducer runs on production sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-ctx-econ-enabled-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    const longText = Array.from({ length: 60 }, (_, i) => `Line ${i}: pnpm test passed with OpenClaw repair output.`).join("\n");
    await writeFile(join(sessions, "session-1.txt"), longText, "utf8");
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
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxCurationProposals: 0,
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return { ok: false, error: "curation not relevant for this test" };
          }
          const prompt = JSON.parse(input.user) as {
            source: { source_ref: string; source_hash: string; chunk_hash: string; agent: string; scope_hint: string };
          };
          return {
            ok: true,
            json: {
              source_ref: prompt.source.source_ref,
              source_hash: prompt.source.source_hash,
              chunk_hashes: [prompt.source.chunk_hash],
              agent: prompt.source.agent,
              scope_hint: prompt.source.scope_hint,
              summary: "OpenClaw repair verified.",
              actions: ["Applied repair."],
              failed_attempts: [],
              outcome: "success",
              verification: ["pnpm test passed"],
              reusable_lessons: ["Keep repairs bounded."],
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

    assert.ok(report.context_economy);
    assert.equal(report.context_economy.enabled, true);
    assert.equal(report.context_economy.items_seen, 1);
    assert.ok(report.context_economy.report_ref);
    assert.ok(report.outputs.some((output) => output.startsWith(".praxisbase/reports/context-economy/")));
    const contextReport = JSON.parse(await readFile(join(root, report.context_economy.report_ref!), "utf8"));
    assert.equal(contextReport.type, "context_economy_report");
  });

  it("skips context economy when noContextEconomy is set", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-ctx-econ-disabled-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Implemented OpenClaw auth refresh and pnpm test passed.", "utf8");
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
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      noContextEconomy: true,
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxCurationProposals: 0,
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return { ok: false, error: "curation not relevant" };
          }
          const prompt = JSON.parse(input.user) as {
            source: { source_ref: string; source_hash: string; chunk_hash: string; agent: string; scope_hint: string };
          };
          return {
            ok: true,
            json: {
              source_ref: prompt.source.source_ref,
              source_hash: prompt.source.source_hash,
              chunk_hashes: [prompt.source.chunk_hash],
              agent: prompt.source.agent,
              scope_hint: prompt.source.scope_hint,
              summary: "Verified repair.",
              actions: ["Applied fix."],
              failed_attempts: [],
              outcome: "success",
              verification: ["pnpm test passed"],
              reusable_lessons: [],
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

    assert.ok(report.context_economy);
    assert.equal(report.context_economy.enabled, false);
    assert.equal(report.context_economy.rule_set_hash, "disabled");
    assert.equal(report.context_economy.items_seen, 0);
    assert.equal(report.context_economy.report_ref, undefined);
    assert.ok(!report.outputs.some((output) => output.includes("context-economy")));
  });

  it("loads project rules from .praxisbase/context-economy/rules.json and applies them", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-project-rules-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    const longText = Array.from({ length: 60 }, (_, i) => `Line ${i}: verbose OpenClaw repair log output here.`).join("\n");
    await writeFile(join(sessions, "session-1.txt"), longText, "utf8");
    await mkdir(join(root, ".praxisbase/context-economy"), { recursive: true });
    await writeFile(
      join(root, ".praxisbase/context-economy/rules.json"),
      JSON.stringify({
        rules: [{
          id: "project-test-rule",
          family: "project-custom",
          priority: 10,
          confidence: 0.95,
          actions: [{ type: "head_tail", head_lines: 5, tail_lines: 5 }],
        }],
      }),
    );
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
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxCurationProposals: 0,
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return { ok: false, error: "curation not relevant" };
          }
          const prompt = JSON.parse(input.user) as {
            source: { source_ref: string; source_hash: string; chunk_hash: string; agent: string; scope_hint: string };
          };
          return {
            ok: true,
            json: {
              source_ref: prompt.source.source_ref,
              source_hash: prompt.source.source_hash,
              chunk_hashes: [prompt.source.chunk_hash],
              agent: prompt.source.agent,
              scope_hint: prompt.source.scope_hint,
              summary: "Verified repair.",
              actions: ["Applied fix."],
              failed_attempts: [],
              outcome: "success",
              verification: ["pnpm test passed"],
              reusable_lessons: [],
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

    assert.ok(report.context_economy);
    assert.equal(report.context_economy.enabled, true);
    assert.ok(report.context_economy.items_seen >= 1);
    assert.ok(report.context_economy.report_ref);
    const contextReport = JSON.parse(await readFile(join(root, report.context_economy.report_ref!), "utf8"));
    assert.equal(contextReport.rule_set_hash, report.context_economy.rule_set_hash);
    assert.equal(contextReport.rule_hits["project-test-rule"], 1);
    assert.equal(contextReport.family_hits["project-custom"], 1);
  });

  it("salts chunk hashes even when context economy passes text through", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-ctx-econ-pass-through-salt-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Short OpenClaw fix note. pnpm test passed.", "utf8");
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    const capturedEnabled: string[] = [];
    await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "dry-run",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxCurationProposals: 0,
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") return { ok: false, error: "curation not relevant" };
          const prompt = JSON.parse(input.user) as { source: { chunk_hash: string; source_ref: string; source_hash: string; agent: string; scope_hint: string } };
          capturedEnabled.push(prompt.source.chunk_hash);
          return {
            ok: true,
            json: {
              source_ref: prompt.source.source_ref,
              source_hash: prompt.source.source_hash,
              chunk_hashes: [prompt.source.chunk_hash],
              agent: prompt.source.agent,
              scope_hint: prompt.source.scope_hint,
              summary: "Verified short repair.",
              actions: ["Recorded fix."],
              failed_attempts: [],
              outcome: "success",
              verification: ["pnpm test passed"],
              reusable_lessons: [],
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

    const capturedDisabled: string[] = [];
    await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "dry-run",
      now: "2026-05-21T01:00:00.000Z",
      noContextEconomy: true,
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxCurationProposals: 0,
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") return { ok: false, error: "curation not relevant" };
          const prompt = JSON.parse(input.user) as { source: { chunk_hash: string; source_ref: string; source_hash: string; agent: string; scope_hint: string } };
          capturedDisabled.push(prompt.source.chunk_hash);
          return {
            ok: true,
            json: {
              source_ref: prompt.source.source_ref,
              source_hash: prompt.source.source_hash,
              chunk_hashes: [prompt.source.chunk_hash],
              agent: prompt.source.agent,
              scope_hint: prompt.source.scope_hint,
              summary: "Verified short repair.",
              actions: ["Recorded fix."],
              failed_attempts: [],
              outcome: "success",
              verification: ["pnpm test passed"],
              reusable_lessons: [],
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

    assert.equal(capturedEnabled.length, 1);
    assert.equal(capturedDisabled.length, 1);
    assert.notEqual(capturedEnabled[0], capturedDisabled[0]);
  });
});
