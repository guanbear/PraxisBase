import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addExperienceSource } from "@praxisbase/core/experience/source-config.js";
import { deriveDailyNextActions, privacyExceptionSignatureForEnvelope, runDailyExperience } from "@praxisbase/core/experience/daily.js";
import { listSourceItemLedgerEntries } from "@praxisbase/core/experience/source-item-ledger.js";
import { MICROCOMPACT_PLACEHOLDER } from "@praxisbase/core/experience/context-juice.js";
import { writeAiProviderConfig } from "@praxisbase/core/ai/config.js";
import { PROTOCOL_VERSION, protocolPaths } from "@praxisbase/core";

describe("runDailyExperience", () => {
  const passingSemanticWikiReview = {
    type: "semantic_wiki_review",
    candidate_id: "ignored-by-normalizer",
    target_path: "ignored-by-normalizer",
    decision: "promote",
    quality_score: 0.91,
    long_term_agent_value: true,
    is_run_report_summary: false,
    is_raw_or_near_raw_copy: false,
    is_actionable: true,
    is_reusable: true,
    evidence_support: "strong",
    should_merge_with: null,
    revision_required: false,
    fatal_issues: [],
    missing_requirements: [],
    reason: "Reusable procedure with concrete trigger and verification.",
    reviewed_at: "2026-05-21T01:00:00.000Z",
  };
  const authorityContextRank = [
    "stable_pb_page",
    "promoted_skill",
    "active_personal_lesson",
    "gbrain_sidecar",
    "agentmemory_sidecar",
    "legacy_distilled",
    "raw_audit",
  ] as const;
  const emptyLessonsSummary = {
    enabled: false,
    source_items: 0,
    selected_spans: 0,
    deterministic_lessons: 0,
    ai_lessons: 0,
    active_personal: 0,
    wiki_ready: 0,
    skill_ready: 0,
    human_required: 0,
    rejected: 0,
    wiki_evidence: 0,
    ai_cache: { enabled: false, hits: 0, misses: 0, writes: 0, corrupt: 0 },
    authority_contract: {
      wiki_semantic_input: "none" as const,
      context_rank: [...authorityContextRank],
      promotion_evidence: {
        lesson_state_authority: false,
        legacy_distilled: false as const,
        gbrain_sidecar: false as const,
        agentmemory_sidecar: false as const,
      },
    },
    golden_validation: [],
  };

  it("uses stable privacy exception signatures across regenerated envelope ids", () => {
    const baseEnvelope: Parameters<typeof privacyExceptionSignatureForEnvelope>[0] = {
      id: "experience-envelope_first",
      protocol_version: PROTOCOL_VERSION,
      type: "experience_envelope",
      source_id: "remote-openclaw",
      agent: "openclaw",
      channel: "terminal",
      source_ref: "ssh://trusted-remote/MEMORY.md",
      source_hash: "sha256:memory-first-source",
      scope_hint: "personal",
      redacted_summary: "Use a trusted remote shell wrapper before operating on the target machine.",
      fetched_at: "2026-05-21T00:00:00.000Z",
      privacy: {
        mode: "personal-local",
        verdict: "human_required",
        reasons: ["private_material_detected", "trusted_personal_remote"],
      },
      warnings: [],
    };

    const first = privacyExceptionSignatureForEnvelope(baseEnvelope);
    const regenerated = privacyExceptionSignatureForEnvelope({
      ...baseEnvelope,
      id: "experience-envelope_second",
      privacy: {
        ...baseEnvelope.privacy,
        reasons: ["trusted_personal_remote", "private_material_detected"],
      },
    });

    assert.equal(first, regenerated);
  });

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
        budget_used_uncached: 7,
        skipped_by_budget: 0,
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
      semantic_review: { enabled: false, reviewed: 0, promote: 0, merge: 0, revise: 0, reject: 0, needs_human: 0, unavailable: 0 },
      skill_synthesis: { enabled: false, signals: 0, rejected_signals: 0, clusters: 0, candidates: 0, reviewed: 0, approved: 0, rejected: 0, needs_human: 0, skipped: 0, promoted: 0 },
      lessons: emptyLessonsSummary,
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
    assert.ok(nextActions.commands.some((command) => command.includes("--mode personal --auto-release")));
    assert.ok(nextActions.messages.some((message) => message.includes("privacy")));
  });

  it("derives team-git privacy triage next actions without personal auto-release", () => {
    const nextActions = deriveDailyNextActions({
      id: "daily-experience_20260521_team",
      protocol_version: PROTOCOL_VERSION,
      type: "daily_experience_report",
      authority_mode: "team-git",
      mode: "write",
      ai_distill: {
        configured: true,
        mode: "production",
        production_ready: true,
        provider: "openai-compatible",
        model: "test-model",
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
      sources: [{
        name: "openclaw-answer-bot",
        agent: "openclaw",
        channel: "feishu",
        source_type: "git",
        status: "partial",
        scanned: 34,
        fetched: 34,
        enveloped: 34,
        imported: 0,
        rejected: 0,
        human_required: 34,
        warnings: [],
      }],
      proposal_candidates: 0,
      quality_findings: 0,
      site_pages: 5,
      changed_stable_knowledge: false,
      semantic_review: { enabled: false, reviewed: 0, promote: 0, merge: 0, revise: 0, reject: 0, needs_human: 0, unavailable: 0 },
      skill_synthesis: { enabled: false, signals: 0, rejected_signals: 0, clusters: 0, candidates: 0, reviewed: 0, approved: 0, rejected: 0, needs_human: 0, skipped: 0, promoted: 0 },
      lessons: emptyLessonsSummary,
      outputs: ["dist/index.html"],
      warnings: [],
      created_at: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(nextActions.status, "needs_privacy_triage");
    assert.deepEqual(nextActions.commands, ["praxisbase privacy triage --mode team-git --json"]);
  });

  it("surfaces skill synthesis needs_human before wiki review in next actions", () => {
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
        budget_used_uncached: 4,
        skipped_by_budget: 0,
        warnings: [],
      },
      sources: [],
      proposal_candidates: 0,
      quality_findings: 0,
      site_pages: 6,
      changed_stable_knowledge: false,
      semantic_review: { enabled: false, reviewed: 0, promote: 0, merge: 0, revise: 0, reject: 0, needs_human: 0, unavailable: 0 },
      skill_synthesis: { enabled: true, signals: 12, rejected_signals: 2, clusters: 3, candidates: 3, reviewed: 3, approved: 1, rejected: 0, needs_human: 2, skipped: 1, promoted: 0 },
      lessons: emptyLessonsSummary,
      outputs: ["dist/index.html"],
      warnings: [],
      created_at: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(nextActions.status, "needs_review");
    assert.equal(nextActions.counts.skill_synthesis_signals, 12);
    assert.equal(nextActions.counts.skill_synthesis_candidates, 3);
    assert.equal(nextActions.counts.skill_synthesis_approved, 1);
    assert.equal(nextActions.counts.skill_synthesis_needs_human, 2);
    assert.equal(nextActions.counts.skill_synthesis_skipped, 1);
    assert.ok(nextActions.commands.some((command) => command.includes("skill review")));
    assert.ok(nextActions.messages.some((message) => message.includes("2 skill candidate")));
  });

  it("surfaces lifecycle and validation queues in next actions", () => {
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
      semantic_review: { enabled: false, reviewed: 0, promote: 0, merge: 0, revise: 0, reject: 0, needs_human: 0, unavailable: 0 },
      skill_synthesis: { enabled: true, signals: 4, rejected_signals: 0, clusters: 1, candidates: 1, reviewed: 1, approved: 1, rejected: 0, needs_human: 0, skipped: 0, promoted: 0 },
      lifecycle: { proposals_by_decision: { promote: 1, archive: 1 } },
      skill_validation: { total_reports: 2, by_decision: { pass: 1, fail: 1 }, candidates_without_passing: 1 },
      lessons: emptyLessonsSummary,
      outputs: [],
      warnings: [],
      created_at: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(nextActions.counts.lifecycle_proposals, 2);
    assert.equal(nextActions.counts.skill_validation_total, 2);
    assert.equal(nextActions.counts.skill_validation_fail, 1);
    assert.equal(nextActions.counts.skill_validation_candidates_without_passing, 1);
    assert.ok(nextActions.commands.some((command) => command.includes("skill validate")));
    assert.ok(nextActions.commands.some((command) => command.includes("wiki build-site")));
    assert.ok(nextActions.messages.some((message) => message.includes("need validation")));
  });

  it("includes skill synthesis summary in GBrain export ready state", () => {
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
        budget_used_uncached: 4,
        skipped_by_budget: 0,
        warnings: [],
      },
      sources: [],
      proposal_candidates: 0,
      quality_findings: 0,
      site_pages: 6,
      changed_stable_knowledge: true,
      semantic_review: { enabled: false, reviewed: 0, promote: 0, merge: 0, revise: 0, reject: 0, needs_human: 0, unavailable: 0 },
      skill_synthesis: { enabled: true, signals: 8, rejected_signals: 1, clusters: 2, candidates: 2, reviewed: 2, approved: 2, rejected: 0, needs_human: 0, skipped: 0, promoted: 0 },
      lessons: emptyLessonsSummary,
      outputs: ["dist/index.html"],
      warnings: [],
      created_at: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(nextActions.status, "ready_to_export_gbrain");
    assert.equal(nextActions.counts.skill_synthesis_signals, 8);
    assert.equal(nextActions.counts.skill_synthesis_candidates, 2);
    assert.ok(nextActions.messages.some((message) => message.includes("Skill synthesis: 8 signals")));
  });

  it("prefers GBrain export after stable wiki changes without pending gates", () => {
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
        budget_used_uncached: 4,
        skipped_by_budget: 0,
        warnings: [],
      },
      sources: [],
      proposal_candidates: 0,
      quality_findings: 0,
      site_pages: 6,
      changed_stable_knowledge: true,
      semantic_review: { enabled: false, reviewed: 0, promote: 0, merge: 0, revise: 0, reject: 0, needs_human: 0, unavailable: 0 },
      skill_synthesis: { enabled: false, signals: 0, rejected_signals: 0, clusters: 0, candidates: 0, reviewed: 0, approved: 0, rejected: 0, needs_human: 0, skipped: 0, promoted: 0 },
      lessons: emptyLessonsSummary,
      outputs: ["dist/index.html"],
      warnings: [],
      created_at: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(nextActions.status, "ready_to_export_gbrain");
    assert.equal(nextActions.gbrain_export_recommended, true);
    assert.equal(nextActions.agentmemory_export_recommended, true);
    assert.ok(nextActions.commands[0].includes("gbrain export"));
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

  it("continues the daily loop when optional AgentMemory import is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-agentmemory-warning-"));
    await addExperienceSource(root, {
      name: "agentmemory",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:3111",
    });

    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      degraded: true,
      noAi: true,
      now: "2026-05-29T01:00:00.000Z",
      fetchImpl: (async () => new Response("down", { status: 503, statusText: "Service Unavailable" })) as typeof fetch,
    });

    assert.equal(report.sources.length, 1);
    assert.equal(report.sources[0].source_type, "agentmemory");
    assert.equal(report.sources[0].status, "failed");
    assert.ok(report.sources[0].warnings.some((warning) => warning.includes("agentmemory_health_failed")));
    assert.ok(report.warnings.some((warning) => warning.includes("agentmemory_health_failed")));
    assert.equal((report as any).personal_ga.agent_consumption.find((item: any) => item.surface === "agentmemory")?.available, false);
    assert.ok(report.outputs.some((output) => output.startsWith(protocolPaths.reportsDaily)));
    assert.ok(report.outputs.some((output) => output.startsWith(protocolPaths.runsDaily)));
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
    await writeFile(join(sessions, "session-1.txt"), "Fixed OpenClaw auth on root@guanzhicheng.com through macmini-ssh after token=abc123456789 was printed in /Users/guanbear/.openclaw/MEMORY.md.", "utf8");
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
    assert.equal(exception.details.redacted_summary.includes("root@guanzhicheng.com"), false);
    assert.equal(exception.details.redacted_summary.includes("macmini-ssh"), false);
    assert.equal(exception.details.redacted_summary.includes("/Users/guanbear"), false);
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
      semanticReview: true,
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
          if (input.schemaName === "semantic_wiki_review") {
            return { ok: true, json: passingSemanticWikiReview };
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

  it("writes source item ledger entries but validates the distill cache before reuse", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-source-item-ledger-"));
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

    const makeClient = (counter: { distillCalls: number }) => ({
      async generateJson(input: { schemaName: string; user: string }) {
        if (input.schemaName === "CuratedWikiProposalDraft") {
          return { ok: false as const, error: "curation not relevant for this test" };
        }
        counter.distillCalls++;
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
          ok: true as const,
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
    });

    const firstCounter = { distillCalls: 0 };
    await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxCurationProposals: 0,
      aiClient: makeClient(firstCounter),
    });

    assert.equal(firstCounter.distillCalls, 1);
    const firstLedger = await listSourceItemLedgerEntries(root);
    assert.equal(firstLedger.length, 1);
    assert.equal(firstLedger[0].status, "distilled");
    assert.equal(firstLedger[0].parser, "codex-session");
    assert.equal(firstLedger[0].model, "GLM-4.7");
    assert.equal(firstLedger[0].authority_mode, "personal-local");
    assert.equal(firstLedger[0].chunk_hashes.length, 1);
    assert.ok(firstLedger[0].distill_cache_path?.startsWith(protocolPaths.cacheAiDistill));

    await rm(join(root, firstLedger[0].distill_cache_path!));

    const secondCounter = { distillCalls: 0 };
    const second = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T02:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxCurationProposals: 0,
      aiClient: makeClient(secondCounter),
    });

    assert.equal(secondCounter.distillCalls, 1);
    assert.equal(second.ai_distill.cache_hits, 0);
    const secondLedger = await listSourceItemLedgerEntries(root);
    assert.equal(secondLedger.length, 1);
    assert.equal(secondLedger[0].status, "distilled");
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
    assert.equal((report as any).personal_ga.queue.run_kind, "bounded_smoke");
    assert.equal((report as any).personal_ga.queue.full_run, false);
    assert.ok((report as any).personal_ga.queue.remaining_high_priority_items >= 1);
    const progressPath = report.outputs.find((output) => output.startsWith(".praxisbase/runs/live/"));
    assert.ok(progressPath);
    const progress = JSON.parse(await readFile(join(root, progressPath), "utf8"));
    assert.equal(progress.status, "completed");
    assert.equal(progress.ai_distill.chunks, 1);
  });

  it("treats maxAiChunks as uncached provider-call budget and reports cache counters", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-ai-uncached-budget-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "z-cached-1.txt"), "Fixed OpenClaw auth refresh and pnpm test passed.", "utf8");
    await writeFile(join(sessions, "y-cached-2.txt"), "Fixed OpenClaw ACK timing and pnpm test passed.", "utf8");
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    const makeClient = (counter: { distillCalls: number }) => ({
      async generateJson(input: { schemaName: string; user: string }) {
        if (input.schemaName === "CuratedWikiProposalDraft") {
          return { ok: false as const, error: "curation not relevant for this test" };
        }
        counter.distillCalls++;
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
          ok: true as const,
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
    });

    const warmCounter = { distillCalls: 0 };
    await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      limit: 2,
      maxAiChunks: 2,
      maxCurationProposals: 0,
      aiClient: makeClient(warmCounter),
    });
    assert.equal(warmCounter.distillCalls, 2);

    await writeFile(join(sessions, "a-uncached-3.txt"), "Updated OpenClaw retry handling and pnpm test passed.", "utf8");
    const progressEvents: unknown[] = [];
    const runCounter = { distillCalls: 0 };
    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T02:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      limit: 3,
      maxAiChunks: 1,
      maxCurationProposals: 0,
      aiClient: makeClient(runCounter),
      onProgress: (event) => {
        progressEvents.push(event);
      },
    });

    assert.equal(runCounter.distillCalls, 1);
    assert.equal(report.ai_distill.chunks, 3);
    assert.equal(report.ai_distill.cache_hits, 2);
    assert.equal(report.ai_distill.budget_max_uncached, 1);
    assert.equal(report.ai_distill.budget_used_uncached, 1);
    assert.equal(report.ai_distill.skipped_by_budget, 0);
    assert.match(report.ai_distill.warnings.join("\n"), /max_uncached_ai_chunks_reached:1/);
    assert.equal((report as any).personal_ga.mode, "production_ai");
    assert.equal((report as any).personal_ga.blocking_reasons.includes("ai_budget_exhausted"), false);
    assert.equal((report as any).personal_ga.queue.run_kind, "full");
    assert.equal((report as any).personal_ga.queue.full_run, true);
    assert.equal((report as any).personal_ga.queue.bounded_smoke, false);
    assert.equal((report as any).personal_ga.queue.uncached_ai_calls, 1);
    assert.equal((report as any).personal_ga.queue.cache_hits, 2);
    assert.equal((report as any).personal_ga.queue.remaining_high_priority_items, 0);
    assert.ok(progressEvents.some((event) => {
      const chunk = (event as { current_chunk?: { uncached_ai_chunks?: number; max_uncached_ai_chunks?: number } }).current_chunk;
      return chunk?.uncached_ai_chunks === 1 && chunk.max_uncached_ai_chunks === 1;
    }));
  });

  it("does not block personal GA when only low-priority chunks remain after high-priority ledger drains", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-low-priority-budget-"));
    const highPrioritySessions = join(root, "high-priority-sessions");
    const lowPriorityLogs = join(root, "low-priority-logs");
    await mkdir(highPrioritySessions, { recursive: true });
    await writeFile(join(highPrioritySessions, "session-1.txt"), "Fixed OpenClaw dispatch routing and pnpm test passed.", "utf8");
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await addExperienceSource(root, {
      name: "a-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: highPrioritySessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    const aiClient = {
      async generateJson(input: { schemaName: string; user: string }) {
        if (input.schemaName === "CuratedWikiProposalDraft") return { ok: false as const, error: "curation not relevant for this test" };
        const prompt = JSON.parse(input.user) as {
          source: {
            source_ref: string;
            source_hash: string;
            chunk_hash: string;
            agent: string;
            scope_hint: "personal";
          };
        };
        return {
          ok: true as const,
          json: {
            source_ref: prompt.source.source_ref,
            source_hash: prompt.source.source_hash,
            chunk_hashes: [prompt.source.chunk_hash],
            agent: prompt.source.agent,
            scope_hint: prompt.source.scope_hint,
            summary: "OpenClaw dispatch routing fix was verified.",
            actions: ["Verified dispatch routing evidence before reporting success."],
            failed_attempts: [],
            outcome: "success",
            verification: ["pnpm test passed"],
            reusable_lessons: ["Verify dispatch routing evidence before reporting success."],
            risks: [],
            suggested_tags: ["openclaw", "dispatch"],
            suggested_wiki_kind: "known_fix",
            skill_candidate: { should_create: false },
            confidence: 0.91,
          },
        };
      },
    };

    await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxAiChunks: 1,
      maxCurationProposals: 0,
      aiClient,
    });

    await mkdir(lowPriorityLogs, { recursive: true });
    await writeFile(join(lowPriorityLogs, "log-1.txt"), "Generic integration log one passed.", "utf8");
    await writeFile(join(lowPriorityLogs, "log-2.txt"), "Generic integration log two passed.", "utf8");
    await addExperienceSource(root, {
      name: "z-generic",
      agent: "generic",
      sourceType: "local",
      scopeDefault: "personal",
      path: lowPriorityLogs,
      now: "2026-05-21T02:00:00.000Z",
    });

    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T03:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      limit: 3,
      maxAiChunks: 0,
      maxCurationProposals: 0,
      aiClient,
    });

    assert.equal(report.ai_distill.skipped_by_budget, 2);
    assert.equal((report as any).personal_ga.queue.run_kind, "full");
    assert.equal((report as any).personal_ga.queue.remaining_high_priority_items, 0);
    assert.equal((report as any).personal_ga.queue.skipped_low_priority_items, 2);
    assert.equal((report as any).personal_ga.mode, "production_ai");
    assert.equal((report as any).personal_ga.blocking_reasons.includes("ai_budget_exhausted"), false);
  });

  it("does not count filtered remote OpenClaw dreaming noise as high-priority remaining work", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-remote-openclaw-noise-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await addExperienceSource(root, {
      name: "guanzhicheng-openclaw",
      agent: "openclaw",
      sourceType: "ssh",
      scopeDefault: "personal",
      path: "/root/.openclaw/praxisbase/latest.json",
      host: "root@example.test",
      privacyTrust: "trusted_personal_remote",
      now: "2026-05-21T00:00:00.000Z",
    });

    const remoteExport = JSON.stringify({
      items: [
        {
          id: "memory/2026-04-06.md:82:94",
          source_ref: "openclaw-ssh://remote/memory/2026-04-06.md:82:94",
          summary: "After updating OpenClaw, verify the actual deployment path and restart mechanism before reporting success.",
          raw_log: "Use git pull, pnpm build, restart LaunchAgent, then verify OpenClaw is running.",
          outcome: "success",
        },
        {
          id: "memory/dreaming/light/2026-05-07.md:438:448",
          source_ref: "openclaw-ssh://remote/memory/dreaming/light/2026-05-07.md:438:448",
          summary: "Candidate: Assistant: nightly follow-up replay validation State: failed Route: runner",
          raw_log: "Candidate: Assistant: nightly follow-up replay validation\nconfidence: 0.00\nevidence: memory/.dreams/session-corpus/2026-05-07.txt\nstatus: staged",
        },
        {
          id: "memory/dreaming/light/2026-05-04.md:328:337",
          source_ref: "openclaw-ssh://remote/memory/dreaming/light/2026-05-04.md:328:337",
          summary: "Candidate: Assistant: default model not supported",
          raw_log: "Candidate: Assistant: default model not supported\nconfidence: 0.58\nevidence: memory/.dreams/session-corpus/2026-05-04.txt\nstatus: staged",
        },
      ],
    });

    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxAiChunks: 1,
      maxCurationProposals: 0,
      runCommand: async () => remoteExport,
      aiClient: {
        async generateJson(input: { schemaName: string; user: string }) {
          if (input.schemaName === "CuratedWikiProposalDraft") return { ok: false as const, error: "curation not relevant for this test" };
          const prompt = JSON.parse(input.user) as {
            source: {
              source_ref: string;
              source_hash: string;
              chunk_hash: string;
              agent: string;
              scope_hint: "personal";
            };
          };
          return {
            ok: true as const,
            json: {
              source_ref: prompt.source.source_ref,
              source_hash: prompt.source.source_hash,
              chunk_hashes: [prompt.source.chunk_hash],
              agent: prompt.source.agent,
              scope_hint: prompt.source.scope_hint,
              summary: "Verify remote OpenClaw deployment path and restart mechanism before reporting success.",
              actions: ["Checked deployment path.", "Restarted the configured service.", "Verified the service was running."],
              failed_attempts: [],
              outcome: "success",
              verification: ["OpenClaw running check passed"],
              reusable_lessons: ["Confirm the actual remote deployment path and restart mechanism before reporting OpenClaw updates as complete."],
              risks: [],
              suggested_tags: ["openclaw", "remote"],
              suggested_wiki_kind: "known_fix",
              skill_candidate: { should_create: false },
              confidence: 0.9,
            },
          };
        },
      },
    });

    const queue = (report as any).personal_ga.queue;
    const remote = queue.high_priority_sources.find((source: any) => source.source_name === "guanzhicheng-openclaw");
    assert.equal(remote.planned_items, 1);
    assert.equal(remote.processed_items, 1);
    assert.equal(remote.remaining_high_priority_items, 0);
    assert.equal(remote.blocking, false);
    assert.equal(queue.remaining_high_priority_items, 0);
    assert.equal(queue.run_kind, "full");
  });

  it("does not let cached chunks in one source consume uncached AI budget for later sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-ai-cross-source-budget-"));
    const cachedSessions = join(root, "cached-sessions");
    const newSessions = join(root, "new-sessions");
    await mkdir(cachedSessions, { recursive: true });
    await mkdir(newSessions, { recursive: true });
    await writeFile(join(cachedSessions, "cached-1.txt"), "Fixed OpenClaw auth refresh and pnpm test passed.", "utf8");
    await writeFile(join(cachedSessions, "cached-2.txt"), "Fixed OpenClaw ACK timing and pnpm test passed.", "utf8");
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await addExperienceSource(root, {
      name: "cached-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: cachedSessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    const sourceRefs: string[] = [];
    const makeClient = () => ({
      async generateJson(input: { schemaName: string; user: string }) {
        if (input.schemaName === "CuratedWikiProposalDraft") return { ok: false as const, error: "curation not relevant for this test" };
        const prompt = JSON.parse(input.user) as {
          source: {
            source_ref: string;
            source_hash: string;
            chunk_hash: string;
            agent: "codex";
            scope_hint: "personal";
          };
        };
        sourceRefs.push(prompt.source.source_ref);
        return {
          ok: true as const,
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
    });

    await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxAiChunks: 2,
      maxCurationProposals: 0,
      aiClient: makeClient(),
    });
    sourceRefs.length = 0;

    await writeFile(join(newSessions, "new-1.txt"), "Updated OpenClaw retry handling and pnpm test passed.", "utf8");
    await addExperienceSource(root, {
      name: "new-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: newSessions,
      now: "2026-05-21T02:00:00.000Z",
    });

    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T03:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxAiChunks: 1,
      maxCurationProposals: 0,
      aiClient: makeClient(),
    });

    assert.equal(report.ai_distill.budget_used_uncached, 1);
    assert.equal(sourceRefs.length, 1);
    assert.match(sourceRefs[0], /new-1/);
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

  it("writes context juice reports and keys source item reuse by context juice identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-context-juice-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    const longText = `Fixed OpenClaw memory recall and pnpm test passed. ${"x".repeat(20 * 1024)}`;
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
      noContextEconomy: true,
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return { ok: false, error: "curation not relevant for this test" };
          }
          const prompt = JSON.parse(input.user) as {
            source: { source_ref: string; source_hash: string; chunk_hash: string; agent: string; scope_hint: string };
            text: string;
          };
          assert.match(prompt.text, /praxisbase_context_juice/);
          return {
            ok: true,
            json: {
              source_ref: prompt.source.source_ref,
              source_hash: prompt.source.source_hash,
              chunk_hashes: [prompt.source.chunk_hash],
              agent: prompt.source.agent,
              scope_hint: prompt.source.scope_hint,
              summary: "OpenClaw memory recall fix was verified.",
              actions: ["Applied memory recall repair."],
              failed_attempts: [],
              outcome: "success",
              verification: ["pnpm test passed"],
              reusable_lessons: ["Keep OpenClaw memory recall fixes bounded and verified."],
              risks: [],
              suggested_tags: ["openclaw", "memory"],
              suggested_wiki_kind: "known_fix",
              skill_candidate: { should_create: false },
              confidence: 0.9,
            },
          };
        },
      },
    });

    assert.ok(report.context_juice);
    assert.equal(report.context_juice.enabled, true);
    assert.equal(report.context_juice.items_seen, 1);
    assert.equal(report.context_juice.items_budgeted, 1);
    assert.ok(report.context_juice.saved_bytes > 0);
    assert.ok(report.context_juice.report_ref);
    assert.ok(report.outputs.some((output) => output.startsWith(protocolPaths.reportsContextJuice)));
    const juiceReport = JSON.parse(await readFile(join(root, report.context_juice.report_ref!), "utf8"));
    assert.equal(juiceReport.type, "context_juice_report");
    assert.equal(juiceReport.budget_results.length, 1);
    assert.equal(juiceReport.budget_results[0].truncated, true);

    const ledgers = await listSourceItemLedgerEntries(root);
    assert.equal(ledgers.length, 1);
    assert.match(ledgers[0].reducer_identity, /context-juice-v1/);
  });

  it("microcompacts structured trajectories before AI distill input", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-microcompact-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-trajectory.json"), JSON.stringify([
      { id: "goal", kind: "user_goal", content: "Fix OpenClaw auth expiry" },
      { id: "old-output-1", kind: "tool_result", content: "old noisy OpenClaw command output 1 ".repeat(80) },
      { id: "old-output-2", kind: "tool_result", content: "old noisy OpenClaw command output 2 ".repeat(80) },
      { id: "failure", kind: "failure", content: "OpenClaw auth token expired" },
      { id: "fix", kind: "fix", content: "Refreshed token and restarted OpenClaw" },
      { id: "verify", kind: "verification", content: "pnpm test passed" },
      { id: "recent-output-1", kind: "tool_result", content: "recent verification output 1" },
      { id: "recent-output-2", kind: "tool_result", content: "recent verification output 2" },
      { id: "recent-output-3", kind: "tool_result", content: "recent verification output 3" },
      { id: "recent-output-4", kind: "tool_result", content: "recent verification output 4" },
      { id: "recent-output", kind: "tool_result", content: "recent verification output" },
    ]), "utf8");
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    let distillText = "";
    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxCurationProposals: 0,
      noContextEconomy: true,
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return { ok: false, error: "curation not relevant for this test" };
          }
          const prompt = JSON.parse(input.user) as {
            source: { source_ref: string; source_hash: string; chunk_hash: string; agent: string; scope_hint: string };
            text: string;
          };
          distillText = prompt.text;
          return {
            ok: true,
            json: {
              source_ref: prompt.source.source_ref,
              source_hash: prompt.source.source_hash,
              chunk_hashes: [prompt.source.chunk_hash],
              agent: prompt.source.agent,
              scope_hint: prompt.source.scope_hint,
              summary: "OpenClaw auth expiry repair was verified.",
              actions: ["Refreshed auth token."],
              failed_attempts: [],
              outcome: "success",
              verification: ["pnpm test passed"],
              reusable_lessons: ["Preserve failures, fixes, and verification while compacting noisy tool results."],
              risks: [],
              suggested_tags: ["openclaw", "auth"],
              suggested_wiki_kind: "known_fix",
              skill_candidate: { should_create: false },
              confidence: 0.9,
            },
          };
        },
      },
    });

    assert.match(distillText, new RegExp(MICROCOMPACT_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(distillText, /OpenClaw auth token expired/);
    assert.match(distillText, /Refreshed token/);
    assert.match(distillText, /pnpm test passed/);
    assert.ok(report.context_juice);
    assert.equal(report.context_juice.items_microcompacted, 1);
    const juiceReport = JSON.parse(await readFile(join(root, report.context_juice.report_ref!), "utf8"));
    assert.equal(juiceReport.microcompact_results.length, 1);
    assert.equal(juiceReport.microcompact_results[0].cleared_entries, 2);
    assert.equal(juiceReport.microcompact_results[0].protected_signal_count, 3);
  });

  it("can pre-summarize oversized payloads before distill when explicitly enabled", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-presummary-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    const longText = Array.from({ length: 180 }, (_, i) => `OpenClaw repair evidence ${i}: fixed retry handling and pnpm test passed.`).join("\n");
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

    let distillText = "";
    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      maxCurationProposals: 0,
      payloadPreSummary: {
        enabled: true,
        lowerThresholdBytes: 1024,
        upperThresholdBytes: 64 * 1024,
        maxCalls: 2,
      },
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "payload_presummary") {
            const prompt = JSON.parse(input.user) as { source_ref: string; source_hash: string };
            return {
              ok: true,
              json: {
                summary: `Pre-summary kept fix, verification, and provenance for ${prompt.source_ref} ${prompt.source_hash}.`,
                provenance: [prompt.source_ref, prompt.source_hash],
              },
            };
          }
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return { ok: false, error: "curation not relevant for this test" };
          }
          const prompt = JSON.parse(input.user) as {
            source: { source_ref: string; source_hash: string; chunk_hash: string; agent: string; scope_hint: string };
            text: string;
          };
          distillText = prompt.text;
          return {
            ok: true,
            json: {
              source_ref: prompt.source.source_ref,
              source_hash: prompt.source.source_hash,
              chunk_hashes: [prompt.source.chunk_hash],
              agent: prompt.source.agent,
              scope_hint: prompt.source.scope_hint,
              summary: "OpenClaw retry repair was verified.",
              actions: ["Fixed retry handling."],
              failed_attempts: [],
              outcome: "success",
              verification: ["pnpm test passed"],
              reusable_lessons: ["Preserve provenance when compacting retry repair evidence."],
              risks: [],
              suggested_tags: ["openclaw", "retry"],
              suggested_wiki_kind: "known_fix",
              skill_candidate: { should_create: false },
              confidence: 0.9,
            },
          };
        },
      },
    });

    assert.match(distillText, /^Pre-summary kept fix/);
    assert.ok(report.context_juice);
    assert.equal(report.context_juice.presummary_summarized, 1);
    assert.ok(report.context_juice.presummary_saved_bytes > 0);
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

  it("exposes semantic_review counts from curation in the daily report", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-semantic-review-counts-"));
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
      semanticReview: true,
      now: "2026-05-21T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "CuratedWikiProposalDraft") {
            return {
              ok: true,
              json: {
                title: "OpenClaw auth refresh semantic review",
                summary: "Use retry guard coverage when repairing OpenClaw auth refresh.",
                page_kind: "known_fix",
                target_path: "kb/known-fixes/openclaw-auth-refresh-semantic-review.md",
                body_markdown: [
                  "# OpenClaw auth refresh semantic review",
                  "",
                  "## Problem",
                  "Auth refresh handling was incomplete.",
                  "",
                  "## Fix",
                  "- Add retry guard coverage before retrying auth refresh.",
                  "- Verify the fix with pnpm test.",
                  "",
                  "## Verification",
                  "- pnpm test passed",
                ].join("\n"),
                confidence: 0.91,
                risk_notes: [],
              },
            };
          }
          if (input.schemaName === "semantic_wiki_review") {
            return { ok: true, json: passingSemanticWikiReview };
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
              summary: "OpenClaw auth refresh needs retry guard coverage.",
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

    assert.ok(report.semantic_review);
    assert.equal(report.semantic_review.enabled, true);
    assert.equal(report.semantic_review.reviewed, 1);
    assert.equal(report.semantic_review.promote, 1);
    assert.equal(typeof report.semantic_review.reject, "number");
    assert.equal(typeof report.semantic_review.needs_human, "number");
  });

  it("can run skill synthesis as an explicit daily stage without writing stable skills", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-skill-synthesis-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "OpenClaw memory import used export, hash verification, and provenance import.", "utf8");
    await writeFile(join(sessions, "session-2.txt"), "Repeated OpenClaw memory import used export, hash verification, and provenance import.", "utf8");
    await writeFile(join(sessions, "session-3.txt"), "OpenClaw ACK timing repair: send ACK before slow tool work, then verify replay.", "utf8");
    await writeFile(join(sessions, "session-4.txt"), "Repeated OpenClaw ACK timing repair: send ACK before slow tool work, then verify replay.", "utf8");
    await mkdir(join(root, "kb/procedures"), { recursive: true });
    await writeFile(join(root, "kb/procedures/openclaw-memory-import.md"), [
      "---",
      "id: openclaw-memory-import",
      "protocol_version: \"0.1\"",
      "type: procedure",
      "knowledge_type: procedure",
      "scope: personal",
      "maturity: verified",
      "sources:",
      "  - uri: raw-vault://codex/session-1",
      "    hash: sha256:distilled1",
      "  - uri: raw-vault://codex/session-2",
      "    hash: sha256:distilled2",
      "updated_at: \"2026-05-26T00:00:00.000Z\"",
      "---",
      "# OpenClaw memory import",
      "",
      "## When To Use",
      "Use when importing OpenClaw memory into PraxisBase.",
      "",
      "## Procedure",
      "1. Export memory JSON.",
      "2. Verify hash.",
      "3. Import with provenance.",
      "",
      "## Verification",
      "- Daily smoke passed.",
    ].join("\n"), "utf8");
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await addExperienceSource(root, {
      name: "local-codex",
      agent: "codex",
      sourceType: "local",
      path: sessions,
      scopeDefault: "personal",
    });

    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      now: "2026-05-26T00:00:00.000Z",
      skillSynthesis: true,
      maxSkillCandidates: 1,
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "DistilledExperience") {
            const prompt = JSON.parse(input.user) as { source: { source_ref: string; source_hash: string; chunk_hash: string; agent: "codex"; scope_hint: "personal" } };
            if (prompt.source.source_ref.includes("session-3") || prompt.source.source_ref.includes("session-4")) {
              return { ok: true, json: {
                source_ref: prompt.source.source_ref,
                source_hash: prompt.source.source_hash,
                chunk_hashes: [prompt.source.chunk_hash],
                agent: prompt.source.agent,
                scope_hint: prompt.source.scope_hint,
                summary: "OpenClaw ACK timing repair.",
                problem: "Need to repair OpenClaw ACK timing.",
                actions: ["Inspected routes.", "Updated timeout.", "Verified replay."],
                failed_attempts: [],
                outcome: "success",
                verification: ["replay passed"],
                reusable_lessons: ["Inspect routes, update timeout, then verify replay."],
                risks: [],
                suggested_tags: ["openclaw"],
                suggested_wiki_kind: "procedure",
                skill_candidate: {
                  should_create: true,
                  title: "OpenClaw ACK timing operations",
                  trigger: "Need to repair OpenClaw ACK timing",
                  procedure: ["Inspect route metadata.", "Update ACK timeout.", "Verify replay."],
                },
                confidence: 0.91,
              } };
            }
            return { ok: true, json: {
              source_ref: prompt.source.source_ref,
              source_hash: prompt.source.source_hash,
              chunk_hashes: [prompt.source.chunk_hash],
              agent: prompt.source.agent,
              scope_hint: prompt.source.scope_hint,
              summary: "OpenClaw memory import repair.",
              problem: "Need to import OpenClaw memory into PraxisBase with provenance.",
              actions: ["Exported memory JSON.", "Verified hash.", "Imported with provenance."],
              failed_attempts: [],
              outcome: "success",
              verification: ["pnpm test passed"],
              reusable_lessons: ["Export memory, verify hash, then import with provenance."],
              risks: [],
              suggested_tags: ["openclaw"],
              suggested_wiki_kind: "procedure",
              skill_candidate: {
                should_create: true,
                title: "OpenClaw memory import operations",
                trigger: "Need to import OpenClaw memory into PraxisBase",
                procedure: ["Export memory JSON.", "Verify hash.", "Import with provenance."],
              },
              confidence: 0.91,
            } };
          }
          if (input.schemaName === "semantic_skill_review") {
            return { ok: true, json: {
              decision: "approve_candidate",
              quality_score: 0.91,
              class_level: true,
              actionable: true,
              reusable: true,
              safe_for_future_agents: true,
              evidence_support: "strong",
              should_update_existing: null,
              fatal_issues: [],
              missing_requirements: [],
              reason: "Durable class-level skill.",
              reviewed_at: "2026-05-26T00:00:00.000Z",
            } };
          }
          return { ok: true, json: {} };
        },
      },
    });

    assert.equal(report.skill_synthesis.enabled, true);
    assert.equal(report.skill_synthesis.candidates, 1);
    assert.equal(report.skill_synthesis.skipped, 0);
    assert.ok(report.outputs.some((path) => path.includes(".praxisbase/reports/skill-synthesis/")));
    await assert.rejects(() => stat(join(root, "skills/openclaw/openclaw-memory-import-operations/SKILL.md")), { code: "ENOENT" });
  });

  it("auto-promotes wiki_curated_proposal with passing semantic review", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-semantic-promote-"));
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await mkdir(join(root, ".praxisbase/reports/wiki-curation"), { recursive: true });
    await mkdir(join(root, ".praxisbase/reports/daily"), { recursive: true });
    await mkdir(join(root, ".praxisbase/staging/experience-envelopes"), { recursive: true });
    await mkdir(join(root, ".praxisbase/inbox/reviews"), { recursive: true });
    await mkdir(join(root, ".praxisbase/runs/review"), { recursive: true });
    await mkdir(join(root, ".praxisbase/exceptions/human-required"), { recursive: true });

    await writeFile(
      join(root, ".praxisbase/inbox/proposals/wiki-curated_semantic_pass.json"),
      JSON.stringify({
        id: "wiki-curated_semantic_pass",
        protocol_version: "0.1",
        type: "wiki_curated_proposal",
        target_path: "kb/known-fixes/openclaw-ack-timing.md",
        action: "create",
        page_kind: "known_fix",
        scope: "personal",
        title: "OpenClaw ACK timing",
        summary: "Fix ACK timing.",
        body_markdown: "# OpenClaw ACK timing\n\n## Problem\nACK timing regressed after deploy.\n\n## Fix\n- Adjust the ACK timeout to 5 seconds before retrying.\n- Verify the fix with pnpm test.\n\n## Verification\n- pnpm test passed",
        source_refs: ["raw-vault://codex/ack"],
        source_hashes: ["sha256:ack"],
        source_count: 2,
        evidence_ids: ["capture_ack_1"],
        confidence: 0.91,
        maturity: "draft",
        provenance: [{ source_ref: "raw-vault://codex/ack", source_hash: "sha256:ack" }],
        review_hint: {
          why_review: "Semantic review passed",
          suggested_decision: "approve",
          risk_notes: ["semantic_review:promote", "semantic_score:0.91", "semantic_reason:High quality reusable fix"],
        },
        guards: [{ id: "path", ok: true, message: "allowed" }],
        created_at: "2026-05-26T10:00:00.000Z",
      }),
      "utf8",
    );

    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      buildSite: true,
      now: "2026-05-26T11:00:00.000Z",
      degraded: true,
    });

    assert.equal(report.changed_stable_knowledge, true);
    const promoted = await readFile(join(root, "kb/known-fixes/openclaw-ack-timing.md"), "utf8");
    assert.match(promoted, /OpenClaw ACK timing/);
  });

  it("blocks auto-promotion of wiki_curated_proposal without passing semantic review", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-daily-semantic-block-"));
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await mkdir(join(root, ".praxisbase/reports/wiki-curation"), { recursive: true });
    await mkdir(join(root, ".praxisbase/reports/daily"), { recursive: true });
    await mkdir(join(root, ".praxisbase/staging/experience-envelopes"), { recursive: true });
    await mkdir(join(root, ".praxisbase/inbox/reviews"), { recursive: true });
    await mkdir(join(root, ".praxisbase/runs/review"), { recursive: true });
    await mkdir(join(root, ".praxisbase/exceptions/human-required"), { recursive: true });

    await writeFile(
      join(root, ".praxisbase/inbox/proposals/wiki-curated_no_semantic.json"),
      JSON.stringify({
        id: "wiki-curated_no_semantic",
        protocol_version: "0.1",
        type: "wiki_curated_proposal",
        target_path: "kb/known-fixes/openclaw-no-semantic.md",
        action: "create",
        page_kind: "known_fix",
        scope: "personal",
        title: "OpenClaw no semantic review",
        summary: "Fix without semantic review.",
        body_markdown: "# No Semantic Review\n\n## Problem\nMissing semantic review.\n\n## Fix\n- Run semantic review before promotion.\n- Verify with pnpm test.\n\n## Verification\n- pnpm test passed",
        source_refs: ["raw-vault://codex/nosem"],
        source_hashes: ["sha256:nosem"],
        source_count: 2,
        evidence_ids: ["capture_nosem_1"],
        confidence: 0.91,
        maturity: "draft",
        provenance: [{ source_ref: "raw-vault://codex/nosem", source_hash: "sha256:nosem" }],
        review_hint: {
          why_review: "No semantic review present",
          suggested_decision: "approve",
          risk_notes: [],
        },
        guards: [{ id: "path", ok: true, message: "allowed" }],
        created_at: "2026-05-26T10:00:00.000Z",
      }),
      "utf8",
    );

    const report = await runDailyExperience(root, {
      authorityMode: "personal-local",
      mode: "write",
      buildSite: true,
      now: "2026-05-26T11:00:00.000Z",
      degraded: true,
    });

    assert.equal(report.changed_stable_knowledge, false);
    await assert.rejects(() => readFile(join(root, "kb/known-fixes/openclaw-no-semantic.md"), "utf8"));
    const exceptions = await readdir(join(root, ".praxisbase/exceptions/human-required"));
    const exceptionFiles = await Promise.all(exceptions.map(async (file) =>
      JSON.parse(await readFile(join(root, ".praxisbase/exceptions/human-required", file), "utf8"))
    ));
    assert.ok(
      exceptionFiles.some((exc) => exc.reason === "semantic_review_required_for_auto_promotion"),
      "expected an exception with reason semantic_review_required_for_auto_promotion",
    );
  });
});
