import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DailyExperienceReportSchema,
  ExperienceEnvelopeSchema,
  ExperienceSourceConfigSchema,
  protocolPaths,
  ContextEconomyReportSchema,
  ContextReductionResultSchema,
  NormalizedReducerInputSchema,
  ContextReducerRuleSchema,
  REDUCER_VERSION,
} from "@praxisbase/core";

describe("daily experience protocol", () => {
  it("exposes daily experience paths", () => {
    assert.equal(protocolPaths.experienceSources, ".praxisbase/sources");
    assert.equal(protocolPaths.stagingExperienceEnvelopes, ".praxisbase/staging/experience-envelopes");
    assert.equal(protocolPaths.reportsDaily, ".praxisbase/reports/daily");
    assert.equal(protocolPaths.runsDaily, ".praxisbase/runs/daily");
    assert.equal(protocolPaths.cacheAiDistill, ".praxisbase/cache/ai-distill");
  });

  it("accepts an OpenClaw Feishu-channel source as OpenClaw memory", () => {
    const parsed = ExperienceSourceConfigSchema.parse({
      id: "source_openclaw-bot",
      protocol_version: "0.1",
      type: "experience_source_config",
      name: "openclaw-bot",
      agent: "openclaw",
      source_type: "openclaw-api",
      channel: "feishu",
      parser: "openclaw-export",
      scope_default: "team",
      remote: "bot-prod",
      created_at: "2026-05-21T00:00:00.000Z",
      updated_at: "2026-05-21T00:00:00.000Z",
    });

    assert.equal(parsed.agent, "openclaw");
    assert.equal(parsed.channel, "feishu");
  });

  it("accepts a redacted Claude Code repair envelope", () => {
    const parsed = ExperienceEnvelopeSchema.parse({
      id: "experience_claude-repair-1",
      protocol_version: "0.1",
      type: "experience_envelope",
      source_id: "source_claude-repair-log",
      agent: "claude-code",
      channel: "log-system",
      source_ref: "logs://openclaw-repairs/1",
      source_hash: "sha256:abc",
      scope_hint: "team",
      signature: "openclaw:auth-expired",
      problem_signature: "openclaw:auth-expired",
      outcome: "success",
      redacted_summary: "Claude Code repaired OpenClaw by refreshing expired auth and rerunning checks.",
      fetched_at: "2026-05-21T00:00:00.000Z",
      privacy: { mode: "team-git", verdict: "allow", reasons: [] },
      warnings: [],
    });

    assert.equal(parsed.agent, "claude-code");
  });

  it("accepts a daily report with no stable knowledge mutation", () => {
    const parsed = DailyExperienceReportSchema.parse({
      id: "daily_2026-05-21",
      protocol_version: "0.1",
      type: "daily_experience_report",
      authority_mode: "team-git",
      mode: "write",
      ai_distill: {
        configured: true,
        mode: "production",
        production_ready: true,
        model: "GLM-4.7",
        chunks: 1,
        distilled: 1,
        failed: 0,
        human_required: 0,
        cache_hits: 1,
        warnings: [],
      },
      sources: [{
        name: "openclaw-bot",
        agent: "openclaw",
        channel: "feishu",
        source_type: "openclaw-api",
        status: "completed",
        scanned: 1,
        fetched: 1,
        enveloped: 1,
        imported: 1,
        rejected: 0,
        human_required: 0,
        warnings: [],
      }],
      proposal_candidates: 0,
      quality_findings: 0,
      site_pages: 0,
      changed_stable_knowledge: false,
      outputs: [],
      warnings: [],
      created_at: "2026-05-21T00:00:00.000Z",
    });

    assert.equal(parsed.changed_stable_knowledge, false);
    assert.equal(parsed.ai_distill.cache_hits, 1);
  });

  it("exposes context economy report path", () => {
    assert.equal(protocolPaths.reportsContextEconomy, ".praxisbase/reports/context-economy");
  });

  it("validates context economy report schema with reducer fields", () => {
    const report = ContextEconomyReportSchema.parse({
      id: "ctx-econ_20260525T000000",
      protocol_version: "0.1",
      type: "context_economy_report",
      reducer_version: REDUCER_VERSION,
      rule_set_hash: "sha256:abc123",
      items_seen: 10,
      items_reduced: 7,
      items_passed_through: 3,
      input_bytes: 50000,
      output_bytes: 20000,
      saved_bytes: 30000,
      rule_hits: { "test-output-default": 5, "generic-default": 2 },
      family_hits: { "test-output": 5, "generic": 2 },
      warnings: [],
      created_at: "2026-05-25T00:00:00.000Z",
    });

    assert.equal(report.type, "context_economy_report");
    assert.equal(report.items_seen, 10);
    assert.equal(report.saved_bytes, 30000);
    assert.deepEqual(report.rule_hits, { "test-output-default": 5, "generic-default": 2 });
  });

  it("validates context reduction result schema", () => {
    const result = ContextReductionResultSchema.parse({
      applied: true,
      text: "reduced",
      original_bytes: 1000,
      reduced_bytes: 100,
      saved_bytes: 900,
      saved_ratio: 0.9,
      matched_rule_id: "test-output-default",
      matched_rule_family: "test-output",
      matched_rule_confidence: 0.9,
      reducer_version: REDUCER_VERSION,
      rule_set_hash: "sha256:rules",
      reduction_hash: "sha256:reduction",
      source_ref: "raw-vault://codex/session-1",
      source_hash: "sha256:abc",
      facts: { command: "pnpm test", exit_code: 0, is_failure: false },
      counters: { original_lines: 50, reduced_lines: 5 },
      warnings: [],
    });

    assert.equal(result.applied, true);
    assert.equal(result.saved_ratio, 0.9);
    assert.equal(result.matched_rule_family, "test-output");
  });
});
