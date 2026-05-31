import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROTOCOL_VERSION,
  protocolPaths,
  buildWikiEvidencePoolFromRoot,
  type LessonState,
  type ExperienceLesson,
} from "@praxisbase/core";
import { writeAiProviderConfig } from "@praxisbase/core/ai/config.js";
import { addExperienceSource } from "@praxisbase/core/experience/source-config.js";
import { buildDailyLessonDispositions, runDailyExperience } from "@praxisbase/core/experience/daily.js";

type ReportLesson = ExperienceLesson & { state: LessonState };

function lesson(overrides: Partial<ExperienceLesson> & { state?: LessonState } = {}): ReportLesson {
  const id = overrides.lesson_id ?? "lesson_ack";
  return {
    lesson_id: id,
    claim: "Send ACK before slow tool or dispatch work.",
    safe_claim: "Send ACK before slow tool or dispatch work.",
    problem: "Slow tool, network, dispatch, or long-running work can leave users without timely feedback.",
    trigger: "Before starting slow work or work involving tools, network calls, or delegation dispatch.",
    action: "Send a short acknowledgement first, then proceed with the slow operation.",
    verification: "Confirm the acknowledgement is emitted before the long-running step begins.",
    negative_case: "Do not stay silent while beginning slow or externally dispatched work.",
    applies_to_agents: ["openclaw"],
    applies_to_systems: ["agent-runtime", "dispatch"],
    portability: "universal",
    privacy_tier: "safe",
    scope: "personal",
    confidence: 0.91,
    cue_family: "native_memory",
    source_refs: [`source-inventory://openclaw/${id}/MEMORY.md`],
    source_hashes: [`sha256:${id}`],
    evidence_spans: [{
      source_item_id: `src_${id}`,
      source_ref: `source-inventory://openclaw/${id}/MEMORY.md`,
      source_hash: `sha256:${id}`,
      span_id: `span_${id}`,
      line_start: 1,
      line_end: 1,
      byte_start: 0,
      byte_end: 80,
      heading_path: ["Runtime"],
      excerpt: "Send ACK before slow tool or dispatch work.",
      excerpt_hash: `sha256:${id}_excerpt`,
      span_kind: "bullet",
    }],
    redaction_notes: [],
    created_at: "2026-05-29T00:00:00.000Z",
    state: "candidate",
    ...overrides,
  };
}

describe("M25 production integration", () => {
  it("aggregates lesson reports across multiple local sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-m25-daily-"));
    const openclawMemory = join(root, "openclaw");
    const codexMemory = join(root, "codex");
    await mkdir(openclawMemory, { recursive: true });
    await mkdir(codexMemory, { recursive: true });
    await writeFile(join(openclawMemory, "MEMORY.md"), [
      "# OpenClaw Memory",
      "- Send ACK before slow tool, network, or dispatch work.",
      "- Fail-closed guard must not pretend success.",
    ].join("\n"));
    await writeFile(join(codexMemory, "MEMORY.md"), [
      "# Codex Memory",
      "- Confirm target machine before restart.",
      "- Run a self-test after code changes.",
    ].join("\n"));

    await addExperienceSource(root, {
      name: "local-openclaw",
      agent: "openclaw",
      sourceType: "local",
      scopeDefault: "personal",
      path: openclawMemory,
      now: "2026-05-29T00:00:00.000Z",
    });
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: codexMemory,
      now: "2026-05-29T00:00:00.000Z",
    });

    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-29T01:00:00.000Z",
      degraded: true,
      maxCurationProposals: 0,
    });

    assert.equal(report.sources.length, 2);
    assert.equal(report.lessons.enabled, true);
    assert.equal(report.lessons.source_items, 2);
    assert.ok(report.lessons.deterministic_lessons >= 4);
    assert.equal(report.lessons.authority_contract.wiki_semantic_input, "lesson_clusters");
    assert.equal(report.lessons.authority_contract.promotion_evidence.lesson_state_authority, true);
    assert.ok(report.lessons.report_ref);
    assert.equal((report as any).personal_ga.mode, "degraded_no_ai");
    assert.equal((report as any).personal_ga.production_ready, false);
    assert.ok((report as any).personal_ga.blocking_reasons.includes("ai_lesson_extraction_disabled"));
    assert.equal((report as any).personal_ga.lesson_count, report.lessons.active_personal + report.lessons.wiki_ready + report.lessons.skill_ready + report.lessons.human_required + report.lessons.rejected);
    assert.equal((report as any).personal_ga.lesson_count, (report as any).personal_ga.disposition_count);
    assert.ok((report as any).personal_ga.dispositions.length > 0);

    const lessonReport = JSON.parse(await readFile(join(root, report.lessons.report_ref!), "utf8")) as {
      source_reports?: Array<{ source_name: string; lessons: number }>;
      lessons?: unknown[];
    };
    assert.deepEqual(
      lessonReport.source_reports?.map((source) => source.source_name).sort(),
      ["local-codex", "local-openclaw"],
    );
    assert.equal(lessonReport.lessons?.length, report.lessons.deterministic_lessons);
  });

  it("uses the configured daily AI provider for lesson extraction", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-m25-daily-ai-"));
    const memory = join(root, "openclaw");
    await mkdir(memory, { recursive: true });
    await writeFile(join(memory, "MEMORY.md"), [
      "# OpenClaw Memory",
      "- In long-running operations, give the user progress before executing the expensive step.",
    ].join("\n"));

    await addExperienceSource(root, {
      name: "local-openclaw",
      agent: "openclaw",
      sourceType: "local",
      scopeDefault: "personal",
      path: memory,
      now: "2026-05-29T00:00:00.000Z",
    });
    await writeAiProviderConfig(root, {
      provider: "openai-compatible",
      model: "test-model",
      baseUrl: "https://llm.example.test/v1",
      apiKeyEnv: "TEST_LLM_API_KEY",
    });

    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-29T01:00:00.000Z",
      maxCurationProposals: 0,
      env: { TEST_LLM_API_KEY: "test-key" },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role: string; content: string }> };
        const user = body.messages?.find((message) => message.role === "user")?.content ?? "{}";
        const parsed = JSON.parse(user) as { spans: Array<{ span_id: string }> };
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                lessons: [{
                  claim: "Provide progress before long-running operations.",
                  safe_claim: "Provide progress before long-running operations.",
                  problem: "Long operations can leave the user without feedback.",
                  trigger: "Before an expensive or slow operation starts.",
                  action: "Send a short progress update before executing the operation.",
                  verification: "The progress update is emitted before the expensive step.",
                  negative_case: "Do not stay silent while beginning expensive work.",
                  applies_to_agents: ["openclaw"],
                  applies_to_systems: ["agent-runtime"],
                  portability: "agent_family",
                  privacy_tier: "safe",
                  scope: "personal",
                  confidence: 0.91,
                  cue_family: "llm_inferred",
                  evidence_span_ids: [parsed.spans[0]!.span_id],
                  redaction_notes: [],
                }],
              }),
            },
          }],
        }), { status: 200 });
      },
    });

    assert.equal(report.lessons.enabled, true);
    assert.equal(report.lessons.ai_lessons, 1);
  });

  it("does not spend lesson AI calls when the daily AI chunk budget is finite", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-m25-daily-ai-budget-"));
    const memory = join(root, "openclaw");
    await mkdir(memory, { recursive: true });
    await writeFile(join(memory, "MEMORY.md"), [
      "# OpenClaw Memory",
      "- Need tools/network/dispatch or slow tasks: send a short ACK first.",
    ].join("\n"));

    await addExperienceSource(root, {
      name: "local-openclaw",
      agent: "openclaw",
      sourceType: "local",
      scopeDefault: "personal",
      path: memory,
      now: "2026-05-29T00:00:00.000Z",
    });
    await writeAiProviderConfig(root, {
      provider: "openai-compatible",
      model: "test-model",
      baseUrl: "https://llm.example.test/v1",
      apiKeyEnv: "TEST_LLM_API_KEY",
    });

    let lessonCalls = 0;
    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-29T01:00:00.000Z",
      maxAiChunks: 0,
      maxCurationProposals: 0,
      env: { TEST_LLM_API_KEY: "test-key" },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role: string; content: string }> };
        const user = body.messages?.find((message) => message.role === "user")?.content ?? "";
        if (user.includes("\"spans\"")) lessonCalls++;
        return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
      },
    });

    assert.equal(lessonCalls, 0);
    assert.equal(report.lessons.enabled, true);
    assert.equal(report.lessons.ai_lessons, 0);
    assert.ok(report.warnings.some((warning) => warning === "lesson_ai_skipped_by_finite_budget"));
    assert.equal((report as any).personal_ga.mode, "budget_exhausted");
    assert.equal((report as any).personal_ga.production_ready, false);
    assert.ok((report as any).personal_ga.blocking_reasons.includes("ai_budget_exhausted"));
  });

  it("renders lesson metrics from the latest daily report on the wiki site", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-m25-site-"));
    await mkdir(join(root, ".praxisbase/reports/daily"), { recursive: true });
    await mkdir(join(root, protocolPaths.reportsLessons), { recursive: true });
    await writeFile(join(root, protocolPaths.reportsLessons, "lesson_daily.json"), JSON.stringify({
      id: "lesson_daily",
      protocol_version: PROTOCOL_VERSION,
      type: "lesson_pipeline_report",
      source_items: 2,
      selected_spans: 5,
      deterministic_lessons: 2,
      ai_lessons: 1,
      lessons: [
        lesson({
          lesson_id: "ready_ack",
          state: "wiki_ready",
          privacy_tier: "safe",
          safe_claim: "Send ACK before slow tool work.",
          applies_to_systems: ["agent-runtime", "dispatch"],
        }),
        lesson({
          lesson_id: "human_remote",
          state: "human_required",
          privacy_tier: "human_required",
          safe_claim: "Confirm private route before remote restart.",
          evidence_spans: [{
            source_item_id: "remote",
            source_ref: "source-inventory://openclaw/remote/MEMORY.md",
            source_hash: "sha256:remote",
            span_id: "span_private",
            line_start: 1,
            line_end: 1,
            byte_start: 0,
            byte_end: 80,
            heading_path: ["Remote"],
            excerpt: "Use root@guanzhicheng.com through macmini-ssh.",
            excerpt_hash: "sha256:private",
            span_kind: "bullet",
          }],
        }),
      ],
      counts_by_state: { wiki_ready: 1, human_required: 1 },
      privacy: { abstracted: 1, human_required: 1, rejected: 0 },
      wiki_evidence: 1,
      source_reports: [],
      created_at: "2026-05-29T01:00:00.000Z",
    }));
    await writeFile(join(root, ".praxisbase/reports/daily/daily_lessons.json"), JSON.stringify({
      id: "daily_lessons",
      protocol_version: PROTOCOL_VERSION,
      type: "daily_experience_report",
      authority_mode: "personal-local",
      mode: "write",
      ai_distill: {
        configured: false,
        mode: "degraded",
        production_ready: false,
        chunks: 0,
        distilled: 0,
        failed: 0,
        human_required: 0,
        privacy_required: 0,
        review_required: 0,
        rejected_low_signal: 0,
        rejected_quality: 0,
        cache_hits: 0,
        budget_used_uncached: 0,
        skipped_by_budget: 0,
        warnings: [],
      },
      sources: [],
      proposal_candidates: 0,
      quality_findings: 0,
      site_pages: 0,
      changed_stable_knowledge: false,
      lessons: {
        enabled: true,
        source_items: 2,
        selected_spans: 5,
        deterministic_lessons: 4,
        ai_lessons: 1,
        active_personal: 1,
        wiki_ready: 2,
        skill_ready: 1,
        human_required: 0,
        rejected: 0,
        wiki_evidence: 3,
        ai_cache: { enabled: true, hits: 2, misses: 1, writes: 1, corrupt: 0 },
        golden_validation: [{ fixture: "openclaw-local", matches: 5, privateLeakCount: 0 }],
        report_ref: ".praxisbase/reports/lessons/lesson_daily.json",
      },
      outputs: [],
      warnings: [],
      created_at: "2026-05-29T01:00:00.000Z",
    }));

    const { buildWikiSite } = await import("@praxisbase/core/wiki/render-site.js");
    await buildWikiSite(root);

    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("M25 Lessons"));
    assert.ok(index.includes("Lesson wiki ready"));
    assert.ok(index.includes("Lesson AI cache hits"));
    assert.ok(index.includes("Golden openclaw-local"));
    assert.ok(index.includes("Lesson Candidates"));
    assert.ok(index.includes("Send ACK before slow tool work."));
    assert.ok(index.includes("wiki_ready"));
    assert.ok(index.includes("safe"));
    assert.ok(index.includes("agent-runtime"));
    assert.ok(index.includes("source-inventory://openclaw/ready_ack/MEMORY.md#span_ready_ack"));
    assert.ok(index.includes("Confirm private route before remote restart."));
    assert.ok(!index.includes("root@guanzhicheng.com"));
    assert.ok(!index.includes("macmini-ssh"));
  });

  it("feeds safe lesson reports into wiki evidence and excludes private lessons", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-m25-evidence-"));
    await mkdir(join(root, protocolPaths.reportsLessons), { recursive: true });
    await writeFile(join(root, protocolPaths.reportsLessons, "lesson_report.json"), JSON.stringify({
      id: "lesson_report",
      protocol_version: PROTOCOL_VERSION,
      type: "lesson_pipeline_report",
      source_items: 5,
      selected_spans: 5,
      deterministic_lessons: 5,
      ai_lessons: 0,
      lessons: [
        lesson({ lesson_id: "safe_ack", state: "wiki_ready", privacy_tier: "safe", safe_claim: "Send ACK before slow tool work." }),
        lesson({ lesson_id: "team_self_test", state: "wiki_ready", privacy_tier: "team_allowed", safe_claim: "Run self-test after changes." }),
        lesson({ lesson_id: "personal_host", state: "wiki_ready", privacy_tier: "personal_only", safe_claim: "Use the private host wrapper." }),
        lesson({ lesson_id: "human_secret", state: "human_required", privacy_tier: "human_required", safe_claim: "Review private credential handling." }),
        lesson({ lesson_id: "reject_secret", state: "rejected", privacy_tier: "reject", safe_claim: "Do not publish raw secret details." }),
      ],
      counts_by_state: {},
      privacy: { abstracted: 0, human_required: 1, rejected: 1 },
      wiki_evidence: 2,
      source_reports: [],
      created_at: "2026-05-29T01:00:00.000Z",
    }));

    const pool = await buildWikiEvidencePoolFromRoot(root);
    const titles = pool.items.map((item) => item.title).sort();
    assert.deepEqual(titles, [
      "Run self-test after changes.",
      "Send ACK before slow tool work.",
    ]);
    assert.equal(pool.items.every((item) => item.kind === "distilled_experience"), true);
  });

  it("feeds only the latest lesson report into wiki evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-m25-latest-evidence-"));
    await mkdir(join(root, protocolPaths.reportsLessons), { recursive: true });
    await writeFile(join(root, protocolPaths.reportsLessons, "lesson_old.json"), JSON.stringify({
      id: "lesson_old",
      protocol_version: PROTOCOL_VERSION,
      type: "lesson_pipeline_report",
      authority_mode: "personal-local",
      source_items: 1,
      selected_spans: 1,
      deterministic_lessons: 1,
      ai_lessons: 0,
      lessons: [
        lesson({
          lesson_id: "old_noisy_ack",
          state: "wiki_ready",
          safe_claim: "Old noisy candidate should not enter the current wiki evidence.",
          source_refs: ["source-inventory://openclaw/old/MEMORY.md"],
          source_hashes: ["sha256:old"],
          evidence_spans: [{
            source_item_id: "old",
            source_ref: "source-inventory://openclaw/old/MEMORY.md",
            source_hash: "sha256:old",
            span_id: "old-span",
            line_start: 1,
            line_end: 1,
            byte_start: 0,
            byte_end: 80,
            heading_path: ["Old"],
            excerpt: "Candidate: stale session-corpus noise",
            excerpt_hash: "sha256:old-excerpt",
            span_kind: "bullet",
          }],
        }),
      ],
      counts_by_state: { wiki_ready: 1 },
      privacy: { abstracted: 0, human_required: 0, rejected: 0 },
      wiki_evidence: 1,
      source_reports: [],
      created_at: "2026-05-29T01:00:00.000Z",
    }));
    await writeFile(join(root, protocolPaths.reportsLessons, "lesson_new.json"), JSON.stringify({
      id: "lesson_new",
      protocol_version: PROTOCOL_VERSION,
      type: "lesson_pipeline_report",
      authority_mode: "personal-local",
      source_items: 1,
      selected_spans: 1,
      deterministic_lessons: 1,
      ai_lessons: 0,
      lessons: [
        lesson({
          lesson_id: "new_target_machine",
          state: "wiki_ready",
          safe_claim: "Confirm target machine before restart.",
          source_refs: ["source-inventory://openclaw/new/MEMORY.md"],
          source_hashes: ["sha256:new"],
        }),
        lesson({
          lesson_id: "new_self_test",
          state: "wiki_ready",
          safe_claim: "Run self-test after changes.",
          source_refs: ["source-inventory://openclaw/new/MEMORY.md"],
          source_hashes: ["sha256:new"],
        }),
      ],
      counts_by_state: { wiki_ready: 1 },
      privacy: { abstracted: 0, human_required: 0, rejected: 0 },
      wiki_evidence: 2,
      source_reports: [],
      created_at: "2026-05-30T01:00:00.000Z",
    }));

    const pool = await buildWikiEvidencePoolFromRoot(root);
    assert.deepEqual(pool.items.map((item) => item.title).sort(), [
      "Confirm target machine before restart.",
      "Run self-test after changes.",
    ]);
    assert.equal(JSON.stringify(pool.items).includes("stale session-corpus noise"), false);
  });

  it("produces queued dispositions for wiki-ready lessons that exceed the curation proposal limit", () => {
    const wikiReadyLessons = Array.from({ length: 8 }, (_, i) =>
      lesson({
        lesson_id: `wiki_ready_${i + 1}`,
        state: "wiki_ready",
        privacy_tier: "safe",
        safe_claim: `Wiki-ready lesson ${i + 1}: reusable practice for agent runtime.`,
        applies_to_agents: ["openclaw"],
        applies_to_systems: ["agent-runtime"],
        source_refs: [`source-inventory://openclaw/wiki_${i + 1}/MEMORY.md`],
        source_hashes: [`sha256:wiki_${i + 1}`],
        evidence_spans: [{
          source_item_id: `wiki_${i + 1}`,
          source_ref: `source-inventory://openclaw/wiki_${i + 1}/MEMORY.md`,
          source_hash: `sha256:wiki_${i + 1}`,
          span_id: `span_wiki_${i + 1}`,
          line_start: 1,
          line_end: 1,
          byte_start: 0,
          byte_end: 80,
          heading_path: ["Runtime"],
          excerpt: `Wiki-ready lesson ${i + 1} excerpt.`,
          excerpt_hash: `sha256:wiki_${i + 1}_excerpt`,
          span_kind: "bullet",
        }],
      }),
    );

    const dispositions = buildDailyLessonDispositions({
      lessons: wikiReadyLessons,
      curationReport: {
        proposals: wikiReadyLessons.slice(0, 3).map((candidate) => ({
          target_path: `kb/procedures/${candidate.lesson_id}.md`,
          title: candidate.safe_claim,
        })),
      },
      personalGaMode: "production_ai",
    });

    assert.equal(dispositions.length, 8);

    const materialized = dispositions.filter(
      (disposition) => disposition.decision === "promoted_to_wiki" || disposition.decision === "merged_into_existing_page",
    );
    const queued = dispositions.filter(
      (disposition) => disposition.decision === "queued_for_next_run",
    );

    assert.equal(materialized.length, 3);
    assert.equal(queued.length, 5);

    for (const disposition of queued) {
      assert.equal(disposition.blocking_reason, "proposal_or_processing_limit");
      assert.equal(disposition.reason, "lesson_ready_but_processing_limit_reached");
    }

    const lessonIds = new Set(dispositions.map((disposition) => disposition.lesson_id));
    assert.equal(lessonIds.size, dispositions.length, "every lesson appears exactly once");
  });

  it("does not feed safe lesson candidates into wiki evidence before wiki-ready state", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-m25-evidence-state-"));
    await mkdir(join(root, protocolPaths.reportsLessons), { recursive: true });
    await writeFile(join(root, protocolPaths.reportsLessons, "lesson_report.json"), JSON.stringify({
      id: "lesson_report",
      protocol_version: PROTOCOL_VERSION,
      type: "lesson_pipeline_report",
      source_items: 2,
      selected_spans: 2,
      deterministic_lessons: 2,
      ai_lessons: 0,
      lessons: [
        lesson({ lesson_id: "ready_ack", state: "wiki_ready", privacy_tier: "safe", safe_claim: "Send ACK before slow tool work." }),
        lesson({ lesson_id: "candidate_self_test", state: "candidate", privacy_tier: "safe", safe_claim: "Run self-test after changes." }),
      ],
      counts_by_state: { wiki_ready: 1, candidate: 1 },
      privacy: { abstracted: 0, human_required: 0, rejected: 0 },
      wiki_evidence: 1,
      source_reports: [],
      created_at: "2026-05-29T01:00:00.000Z",
    }));

    const pool = await buildWikiEvidencePoolFromRoot(root);
    assert.deepEqual(pool.items.map((item) => item.title), ["Send ACK before slow tool work."]);
  });

  it("prefers lesson-derived wiki evidence over same-source raw legacy evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-m25-evidence-authority-"));
    await mkdir(join(root, protocolPaths.reportsLessons), { recursive: true });
    await mkdir(join(root, protocolPaths.rawVaultRefs), { recursive: true });
    const readyLesson = lesson({
      lesson_id: "ready_ack",
      state: "wiki_ready",
      privacy_tier: "safe",
      source_refs: ["raw-vault://codex/session-1"],
      source_hashes: ["sha256:same-source"],
      safe_claim: "Send ACK before slow tool work.",
    });
    await writeFile(join(root, protocolPaths.reportsLessons, "lesson_report.json"), JSON.stringify({
      id: "lesson_report",
      protocol_version: PROTOCOL_VERSION,
      type: "lesson_pipeline_report",
      source_items: 1,
      selected_spans: 1,
      deterministic_lessons: 1,
      ai_lessons: 0,
      lessons: [readyLesson],
      counts_by_state: { wiki_ready: 1 },
      privacy: { abstracted: 0, human_required: 0, rejected: 0 },
      wiki_evidence: 1,
      source_reports: [],
      created_at: "2026-05-29T01:00:00.000Z",
    }));
    await writeFile(join(root, protocolPaths.rawVaultRefs, "legacy.json"), JSON.stringify({
      id: "legacy",
      source_ref: "raw-vault://codex/session-1",
      source_hash: "sha256:same-source",
      scope: "personal",
      redacted_summary: "Raw legacy summary says ACK worked once and should be used.",
      created_at: "2026-05-29T00:00:00.000Z",
    }));

    const pool = await buildWikiEvidencePoolFromRoot(root);
    assert.deepEqual(pool.items.map((item) => item.title), ["Send ACK before slow tool work."]);
    assert.equal(pool.items[0]!.kind, "distilled_experience");
  });
});
