import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PrivacyTriageReportSchema,
  protocolPaths,
  runPrivacyTriage,
  writeAiProviderConfig,
} from "@praxisbase/core";
import { addExperienceSource } from "@praxisbase/core/experience/source-config.js";
import type { AiJsonClient } from "@praxisbase/core";

async function writeException(root: string, input: {
  id: string;
  reason?: string;
  scope?: string;
  sourceRef?: string;
  sourceHash?: string;
  summary?: string;
  channel?: string;
  agent?: string;
}) {
  const dir = join(root, ".praxisbase/exceptions/human-required");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${input.id}.json`), JSON.stringify({
    id: input.id,
    protocol_version: "0.1",
    type: "exception_record",
    category: "human_required",
    source_id: `source_${input.id}`,
    reason: input.reason ?? "Experience privacy verdict human_required: private_material_detected",
    details: {
      source_id: `experience_${input.id}`,
      agent: input.agent ?? "codex",
      channel: input.channel ?? "local",
      scope_hint: input.scope ?? "personal",
      source_ref: input.sourceRef ?? `raw-vault://codex/${input.id}`,
      source_hash: input.sourceHash ?? `sha256:${input.id}`,
      redacted_summary: input.summary ?? "Fixed an OpenClaw project workflow and verified it with pnpm check.",
      privacy: {
        mode: "personal-local",
        verdict: "human_required",
        reasons: ["private_material_detected"],
      },
    },
    created_at: "2026-05-22T00:00:00.000Z",
  }, null, 2), "utf8");
}

function triageClient(classification = "safe_personal_experience", confidence = 0.9): AiJsonClient {
  return {
    async generateJson(input) {
      assert.equal(input.schemaName, "PrivacyTriageDecision");
      assert.doesNotMatch(input.user, /abc123456789/);
      return {
        ok: true,
        json: {
          classification,
          confidence,
          rationale: "The item describes reusable project experience, not credentials.",
          suggested_redactions: [],
        },
      };
    },
  };
}

describe("privacy triage", () => {
  it("exposes the privacy triage report path and schema", () => {
    assert.equal(protocolPaths.reportsPrivacyTriage, ".praxisbase/reports/privacy-triage");
    const parsed = PrivacyTriageReportSchema.parse({
      id: "privacy-triage_2026-05-22",
      protocol_version: "0.1",
      type: "privacy_triage_report",
      authority_mode: "personal-local",
      mode: "write",
      ai: { configured: true, provider: "openai-compatible", model: "test-model" },
      items: [],
      summary: { scanned: 0, auto_released: 0, keep_human_required: 0, team_review_only: 0 },
      changed_stable_knowledge: false,
      outputs: [],
      warnings: [],
      created_at: "2026-05-22T00:00:00.000Z",
    });
    assert.equal(parsed.changed_stable_knowledge, false);
  });

  it("auto-releases high-confidence safe personal experience", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-safe-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, { id: "safe-personal" });

    const report = await runPrivacyTriage(root, {
      authorityMode: "personal-local",
      mode: "write",
      autoRelease: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: triageClient(),
    });

    assert.equal(report.summary.scanned, 1);
    assert.equal(report.summary.auto_released, 1);
    assert.equal(report.items[0].decision, "auto_released");
    assert.equal(report.changed_stable_knowledge, false);
    const exception = JSON.parse(await readFile(join(root, ".praxisbase/exceptions/human-required/safe-personal.json"), "utf8"));
    assert.equal(exception.details.triage.classification, "safe_personal_experience");
    assert.equal(exception.details.triage.decision, "auto_released");
  });

  it("keeps concrete private values human-required even when AI says safe", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-hard-block-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, {
      id: "secret",
      summary: "The repair used token=abc123456789 during local debugging.",
    });

    const report = await runPrivacyTriage(root, {
      authorityMode: "personal-local",
      mode: "write",
      autoRelease: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: triageClient(),
    });

    assert.equal(report.summary.auto_released, 0);
    assert.equal(report.summary.keep_human_required, 1);
    assert.equal(report.items[0].decision, "keep_human_required");
    assert.ok(report.items[0].hard_block_reasons.includes("private_material_detected"));
  });

  it("does not hard-block already redacted placeholder values", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-redacted-placeholder-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, {
      id: "redacted-placeholder",
      summary: "The auth token=[REDACTED] appeared in a policy example while fixing OpenClaw.",
    });

    const report = await runPrivacyTriage(root, {
      authorityMode: "personal-local",
      mode: "write",
      autoRelease: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: triageClient(),
    });

    assert.deepEqual(report.items[0].hard_block_reasons, []);
    assert.equal(report.items[0].decision, "auto_released");
  });

  it("keeps team mode review-only even for high-confidence safe classifications", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-team-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, { id: "team-item", scope: "team" });

    const report = await runPrivacyTriage(root, {
      authorityMode: "team-git",
      mode: "write",
      autoRelease: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: triageClient(),
    });

    assert.equal(report.summary.auto_released, 0);
    assert.equal(report.summary.team_review_only, 1);
    assert.equal(report.items[0].decision, "team_review_only");
  });

  it("auto-reviews sanitized high-confidence team items only when explicitly enabled", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-team-auto-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, {
      id: "team-auto",
      scope: "team",
      channel: "feishu",
      agent: "openclaw",
      sourceRef: "openclaw://answer-bot/pm.sqlite/chunks/example",
      summary: "A Feishu thread showed the repair bot should ACK before a long-running task and then post verified status.",
    });
    const schemas: string[] = [];

    const report = await runPrivacyTriage(root, {
      authorityMode: "team-git",
      mode: "write",
      teamAutoReview: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson(input) {
          schemas.push(input.schemaName);
          if (input.schemaName === "PrivacyTriageDecision") {
            return {
              ok: true,
              json: {
                classification: "needs_redaction",
                confidence: 0.86,
                rationale: "Team context needs sanitization before reuse.",
                suggested_redactions: ["Remove chat and source identifiers."],
              },
            };
          }
          assert.equal(input.schemaName, "TeamPrivacyReleaseSummary");
          return {
            ok: true,
            json: {
              release_summary: "Repair agents should acknowledge long-running work before starting it, then provide a verified completion status when the task finishes.",
              reusable_lesson: "Acknowledge first, verify before reporting success.",
              residual_risk: "",
            },
          };
        },
      },
    });

    assert.deepEqual(schemas, ["PrivacyTriageDecision", "TeamPrivacyReleaseSummary"]);
    assert.equal(report.summary.auto_released, 1);
    assert.equal(report.summary.team_review_only, 0);
    assert.equal(report.items[0].decision, "auto_released");
    assert.equal(report.items[0].classification, "needs_redaction");
    assert.match(report.items[0].release_summary ?? "", /acknowledge long-running work/i);
    const exception = JSON.parse(await readFile(join(root, ".praxisbase/exceptions/human-required/team-auto.json"), "utf8"));
    assert.equal(exception.details.triage.auto_review_policy, "team-ai-sanitized-v1");
    assert.match(exception.details.triage.release_summary, /verified completion status/i);
  });

  it("keeps team auto-review blocked when the sanitized summary still contains private material", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-team-auto-block-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, { id: "team-auto-block", scope: "team", channel: "feishu", agent: "openclaw" });

    const report = await runPrivacyTriage(root, {
      authorityMode: "team-git",
      mode: "write",
      teamAutoReview: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "PrivacyTriageDecision") {
            return {
              ok: true,
              json: {
                classification: "safe_personal_experience",
                confidence: 0.9,
                rationale: "Looks reusable.",
                suggested_redactions: [],
              },
            };
          }
          return {
            ok: true,
            json: {
              release_summary: "Use token=abc123456789 when calling the private service.",
              reusable_lesson: "Do the private thing.",
              residual_risk: "",
            },
          };
        },
      },
    });

    assert.equal(report.summary.auto_released, 0);
    assert.equal(report.summary.team_review_only, 1);
    assert.equal(report.items[0].decision, "team_review_only");
    assert.ok(report.warnings.some((warning) => warning.includes("privacy_triage_team_auto_review_unsafe_summary")));
  });

  it("keeps low-signal team greetings out of auto-reviewed knowledge", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-team-auto-low-signal-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, { id: "team-auto-low-signal", scope: "team", channel: "feishu", agent: "openclaw", summary: "A user sent a generic greeting." });

    const report = await runPrivacyTriage(root, {
      authorityMode: "team-git",
      mode: "write",
      teamAutoReview: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "PrivacyTriageDecision") {
            return {
              ok: true,
              json: {
                classification: "safe_personal_experience",
                confidence: 0.9,
                rationale: "Only a greeting.",
                suggested_redactions: [],
              },
            };
          }
          return {
            ok: true,
            json: {
              release_summary: "A team-scope interaction contained only a generic greeting with no operational, personal, or sensitive details.",
              reusable_lesson: "Generic greetings are low-signal and should be retained only minimally.",
              residual_risk: "",
            },
          };
        },
      },
    });

    assert.equal(report.summary.auto_released, 0);
    assert.equal(report.summary.team_review_only, 1);
    assert.ok(report.warnings.some((warning) => warning.includes("privacy_triage_team_auto_review_low_signal")));
  });

  it("keeps Feishu team exceptions review-only and redacts Feishu ids before AI triage", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-feishu-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, {
      id: "feishu-team",
      agent: "feishu",
      channel: "feishu",
      scope: "team",
      sourceRef: "feishu-chat://oc_pb_chat_m30_group_001/om_pb_m30_group_001",
      summary: "Feishu user ou_pb_m30_user_001 discussed retry steps and token=mock_sensitive_token_123456.",
    });

    const report = await runPrivacyTriage(root, {
      authorityMode: "team-git",
      mode: "write",
      autoRelease: true,
      now: "2026-06-05T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson(input) {
          assert.equal(input.schemaName, "PrivacyTriageDecision");
          assert.doesNotMatch(input.user, /ou_pb_m30_user_001/);
          assert.doesNotMatch(input.user, /mock_sensitive_token_123456/);
          return {
            ok: true,
            json: {
              classification: "needs_redaction",
              confidence: 0.8,
              rationale: "Feishu private identifiers were redacted.",
              suggested_redactions: ["Keep Feishu identifiers redacted."],
            },
          };
        },
      },
    });

    assert.equal(report.items[0].decision, "team_review_only");
    assert.ok(report.items[0].hard_block_reasons.includes("feishu_private_identifier_detected"));
    assert.ok(report.items[0].hard_block_reasons.includes("private_material_detected"));
  });

  it("keeps ambiguous remote personal evidence human-required until explicitly reviewed", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-remote-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, {
      id: "remote-openclaw",
      channel: "ssh",
      sourceRef: "ssh://root@example.com/.openclaw/memory.json",
      summary: "Remote OpenClaw memory repair was useful and verified.",
    });

    const report = await runPrivacyTriage(root, {
      authorityMode: "personal-local",
      mode: "write",
      autoRelease: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: triageClient(),
    });

    assert.equal(report.summary.auto_released, 0);
    assert.equal(report.summary.keep_human_required, 1);
    assert.equal(report.items[0].decision, "keep_human_required");
    assert.ok(report.items[0].hard_block_reasons.includes("remote_source_requires_review"));
  });

  it("auto-releases safe personal evidence from explicitly trusted remote OpenClaw sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-trusted-remote-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await addExperienceSource(root, {
      name: "remote-openclaw",
      agent: "openclaw",
      sourceType: "ssh",
      channel: "unknown",
      scopeDefault: "personal",
      host: "root@example.com",
      path: "/root/.openclaw/praxisbase/latest.json",
      privacyTrust: "trusted_personal_remote",
    });
    await writeException(root, {
      id: "trusted-remote-openclaw",
      agent: "openclaw",
      channel: "ssh",
      sourceRef: "ssh://root@example.com/.openclaw/memory.json",
      summary: "Remote OpenClaw memory repair was useful and verified with pnpm test.",
    });

    const report = await runPrivacyTriage(root, {
      authorityMode: "personal-local",
      mode: "write",
      autoRelease: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: triageClient(),
    });

    assert.equal(report.summary.auto_released, 1);
    assert.equal(report.items[0].decision, "auto_released");
    assert.deepEqual(report.items[0].hard_block_reasons, []);
  });

  it("keeps trusted remote OpenClaw evidence human-required when concrete private values are present", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-trusted-remote-secret-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await addExperienceSource(root, {
      name: "remote-openclaw",
      agent: "openclaw",
      sourceType: "ssh",
      channel: "unknown",
      scopeDefault: "personal",
      host: "root@example.com",
      path: "/root/.openclaw/praxisbase/latest.json",
      privacyTrust: "trusted_personal_remote",
    });
    await writeException(root, {
      id: "trusted-remote-secret",
      agent: "openclaw",
      channel: "ssh",
      sourceRef: "ssh://root@example.com/.openclaw/memory.json",
      summary: "Remote OpenClaw repair used token=abc123456789 during debugging.",
    });

    const report = await runPrivacyTriage(root, {
      authorityMode: "personal-local",
      mode: "write",
      autoRelease: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: triageClient(),
    });

    assert.equal(report.summary.auto_released, 0);
    assert.equal(report.summary.keep_human_required, 1);
    assert.equal(report.items[0].decision, "keep_human_required");
    assert.ok(report.items[0].hard_block_reasons.includes("private_material_detected"));
  });

  it("writes a privacy triage report", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-report-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, { id: "report-item" });

    const report = await runPrivacyTriage(root, {
      authorityMode: "personal-local",
      mode: "write",
      autoRelease: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: triageClient(),
    });

    const reports = await readdir(join(root, ".praxisbase/reports/privacy-triage"));
    assert.equal(reports.length, 1);
    assert.ok(report.outputs.includes(".praxisbase/reports/privacy-triage/privacy-triage_2026-05-22t01-00-00-000z.json"));
  });

  it("unwraps provider answer objects for triage decisions", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-answer-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, { id: "answer-item" });

    const report = await runPrivacyTriage(root, {
      authorityMode: "personal-local",
      mode: "write",
      autoRelease: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson() {
          return {
            ok: true,
            json: {
              answer: {
                classification: "safe_personal_experience",
                confidence: 0.91,
                rationale: "Safe personal project workflow.",
                suggested_redactions: [],
              },
            },
          };
        },
      },
    });

    assert.equal(report.items[0].classification, "safe_personal_experience");
    assert.equal(report.items[0].decision, "auto_released");
  });

  it("unwraps provider answer JSON strings for triage decisions", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-answer-string-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, { id: "answer-string-item" });

    const report = await runPrivacyTriage(root, {
      authorityMode: "personal-local",
      mode: "write",
      autoRelease: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson() {
          return {
            ok: true,
            json: {
              answer: JSON.stringify({
                classification: "safe_personal_experience",
                confidence: 0.92,
                rationale: "Safe personal project workflow.",
                suggested_redactions: [],
              }),
            },
          };
        },
      },
    });

    assert.equal(report.items[0].classification, "safe_personal_experience");
    assert.equal(report.items[0].decision, "auto_released");
  });

  it("normalizes common AI field aliases and confidence strings", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-aliases-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, { id: "alias-item" });

    const report = await runPrivacyTriage(root, {
      authorityMode: "personal-local",
      mode: "write",
      autoRelease: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson() {
          return {
            ok: true,
            json: {
              result: {
                category: "safe",
                confidence_score: "87%",
                reason: "This is a reusable local workflow note without concrete private values.",
                redactions: ["Keep raw source refs in the vault only."],
              },
            },
          };
        },
      },
    });

    assert.equal(report.items[0].classification, "safe_personal_experience");
    assert.equal(report.items[0].confidence, 0.87);
    assert.equal(report.items[0].rationale, "This is a reusable local workflow note without concrete private values.");
    assert.deepEqual(report.items[0].suggested_redactions, ["Keep raw source refs in the vault only."]);
    assert.equal(report.items[0].decision, "auto_released");
  });

  it("keeps malformed AI triage output as unclear without aborting the queue", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-malformed-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, { id: "bad-ai-item" });

    const report = await runPrivacyTriage(root, {
      authorityMode: "personal-local",
      mode: "write",
      autoRelease: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson() {
          return { ok: true, json: { message: "safe" } };
        },
      },
    });

    assert.equal(report.items[0].classification, "unclear");
    assert.equal(report.items[0].decision, "keep_human_required");
    assert.match(report.warnings.join("\n"), /privacy_triage_schema_error/);
    assert.match(report.warnings.join("\n"), /keys=message/);
  });

  it("skips already triaged exceptions by default and reports progress", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-skip-progress-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, { id: "already-triaged" });
    await writeException(root, { id: "needs-triage" });
    const alreadyPath = join(root, ".praxisbase/exceptions/human-required/already-triaged.json");
    const already = JSON.parse(await readFile(alreadyPath, "utf8"));
    await writeFile(alreadyPath, JSON.stringify({
      ...already,
      details: {
        ...already.details,
        triage: {
          classification: "safe_personal_experience",
          confidence: 0.9,
          rationale: "Already triaged.",
          suggested_redactions: [],
          hard_block_reasons: [],
          decision: "auto_released",
          triaged_at: "2026-05-22T00:30:00.000Z",
        },
      },
    }, null, 2), "utf8");

    const progress: string[] = [];
    let calls = 0;
    const report = await runPrivacyTriage(root, {
      authorityMode: "personal-local",
      mode: "write",
      autoRelease: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson() {
          calls++;
          return {
            ok: true,
            json: {
              classification: "safe_personal_experience",
              confidence: 0.9,
              rationale: "Safe personal workflow experience.",
              suggested_redactions: [],
            },
          };
        },
      },
      onProgress(event) {
        progress.push(event.status);
      },
    });

    assert.equal(calls, 1);
    assert.equal(report.summary.scanned, 1);
    assert.equal(report.summary.skipped_already_triaged, 1);
    assert.equal(report.items[0].exception_id, "needs-triage");
    assert.ok(progress.includes("running"));
    assert.equal(progress.at(-1), "completed");
  });

  it("skips non-privacy human-required exceptions", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-skip-quality-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, { id: "privacy-item" });
    const dir = join(root, ".praxisbase/exceptions/human-required");
    await writeFile(join(dir, "quality-item.json"), JSON.stringify({
      id: "quality-item",
      protocol_version: "0.1",
      type: "exception_record",
      category: "human_required",
      source_id: "source_quality",
      reason: "Quality gate human required: low_confidence, quality_human_required",
      details: {
        candidate_path: ".praxisbase/review/wiki-candidates/example.json",
      },
      created_at: "2026-05-22T00:00:00.000Z",
    }, null, 2), "utf8");
    let calls = 0;

    const report = await runPrivacyTriage(root, {
      authorityMode: "personal-local",
      mode: "write",
      autoRelease: true,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson() {
          calls++;
          return {
            ok: true,
            json: {
              classification: "safe_personal_experience",
              confidence: 0.9,
              rationale: "Safe personal workflow experience.",
              suggested_redactions: [],
            },
          };
        },
      },
    });

    assert.equal(calls, 1);
    assert.equal(report.summary.scanned, 1);
    assert.equal(report.summary.skipped_non_privacy, 1);
    assert.deepEqual(report.items.map((item) => item.exception_id), ["privacy-item"]);
  });

  it("runs privacy triage AI calls with bounded concurrency", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-privacy-triage-concurrency-"));
    await writeAiProviderConfig(root, { provider: "openai-compatible", model: "test-model" });
    await writeException(root, { id: "item-a" });
    await writeException(root, { id: "item-b" });
    await writeException(root, { id: "item-c" });
    let active = 0;
    let maxActive = 0;

    const report = await runPrivacyTriage(root, {
      authorityMode: "personal-local",
      mode: "write",
      autoRelease: true,
      aiConcurrency: 2,
      now: "2026-05-22T01:00:00.000Z",
      env: { PRAXISBASE_LLM_API_KEY: "test-key" },
      aiClient: {
        async generateJson() {
          active++;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 10));
          active--;
          return {
            ok: true,
            json: {
              classification: "safe_personal_experience",
              confidence: 0.9,
              rationale: "Safe personal workflow experience.",
              suggested_redactions: [],
            },
          };
        },
      },
    });

    assert.equal(report.summary.scanned, 3);
    assert.equal(report.summary.auto_released, 3);
    assert.equal(maxActive, 2);
  });
});
