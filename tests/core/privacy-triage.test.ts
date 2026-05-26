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
import type { AiJsonClient } from "@praxisbase/core";

async function writeException(root: string, input: {
  id: string;
  reason?: string;
  scope?: string;
  sourceRef?: string;
  sourceHash?: string;
  summary?: string;
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
      agent: "codex",
      channel: "local",
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
