import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DailyExperienceReportSchema,
  ExperienceEnvelopeSchema,
  ExperienceSourceConfigSchema,
  protocolPaths,
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
});
