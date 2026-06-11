import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addExperienceSource } from "@praxisbase/core/experience/source-config.js";
import { resolveExperienceSource } from "@praxisbase/core/experience/source-adapters.js";

describe("Feishu source adapter", () => {
  it("pulls a Feishu doc through mock CLI and creates a redacted envelope", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-feishu-doc-"));
    const source = await addExperienceSource(root, {
      name: "feishu-team-docs",
      agent: "feishu",
      sourceType: "feishu",
      parser: "feishu-doc",
      channel: "feishu",
      scopeDefault: "team",
      feishuTarget: "doccn_pb_m30_public_001",
      feishuCliPath: "mock-feishu",
      feishuAppIdEnv: "FEISHU_APP_ID",
      feishuAppSecretEnv: "FEISHU_APP_SECRET",
      now: "2026-06-05T09:00:00.000Z",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "team-git",
      env: {
        FEISHU_APP_ID: "mock-app-id",
        FEISHU_APP_SECRET: "mock-app-secret",
      },
      runCommand: async (command, args) => {
        assert.equal(command, "mock-feishu");
        assert.deepEqual(args, ["fetch", "--target", "doccn_pb_m30_public_001", "--parser", "feishu-doc", "--json"]);
        return await import("node:fs/promises").then((fs) => fs.readFile("tests/fixtures/feishu-source/feishu-doc.json", "utf8"));
      },
      now: "2026-06-05T09:30:00.000Z",
    });

    assert.equal(result.status, "completed");
    assert.equal(result.envelopes.length, 1);
    assert.equal(result.envelopes[0].agent, "feishu");
    assert.equal(result.envelopes[0].channel, "feishu");
    assert.equal(result.envelopes[0].source_ref, "feishu-doc://doccn_pb_m30_public_001");
    assert.match(result.envelopes[0].redacted_summary, /OpenClaw deployment checklist/);
    assert.equal(result.envelopes[0].redacted_summary.includes("Before restarting OpenClaw gateway"), false);
    assert.equal(result.envelopes[0].privacy.verdict, "allow");
  });

  it("rejects Feishu 1v1 direct messages before envelope creation", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-feishu-dm-"));
    const source = await addExperienceSource(root, {
      name: "feishu-team-dm",
      agent: "feishu",
      sourceType: "feishu",
      parser: "feishu-chat",
      channel: "feishu",
      scopeDefault: "team",
      feishuTarget: "oc_pb_chat_m30_dm_001",
      feishuCliPath: "mock-feishu",
      feishuAppIdEnv: "FEISHU_APP_ID",
      feishuAppSecretEnv: "FEISHU_APP_SECRET",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "team-git",
      env: { FEISHU_APP_ID: "mock-app-id", FEISHU_APP_SECRET: "mock-app-secret" },
      runCommand: async () => await import("node:fs/promises").then((fs) => fs.readFile("tests/fixtures/feishu-source/feishu-chat-1v1-negative.json", "utf8")),
    });

    assert.equal(result.envelopes.length, 0);
    assert.equal(result.rejected, 1);
    assert.ok(result.warnings.includes("feishu_1v1_rejected_before_envelope"));
  });

  it("hard-blocks Feishu ids and credentials before envelope creation", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-feishu-pii-"));
    const source = await addExperienceSource(root, {
      name: "feishu-team-chat",
      agent: "feishu",
      sourceType: "feishu",
      parser: "feishu-chat",
      channel: "feishu",
      scopeDefault: "team",
      feishuTarget: "oc_pb_chat_m30_sensitive_001",
      feishuCliPath: "mock-feishu",
      feishuAppIdEnv: "FEISHU_APP_ID",
      feishuAppSecretEnv: "FEISHU_APP_SECRET",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "team-git",
      env: { FEISHU_APP_ID: "mock-app-id", FEISHU_APP_SECRET: "mock-app-secret" },
      runCommand: async () => await import("node:fs/promises").then((fs) => fs.readFile("tests/fixtures/feishu-source/feishu-chat-pii-negative.json", "utf8")),
    });

    assert.equal(result.envelopes.length, 0);
    assert.equal(result.rejected, 1);
    assert.ok(result.warnings.includes("feishu_private_identifier_blocked_before_envelope"));
    assert.ok(result.warnings.includes("feishu_private_material_blocked_before_envelope"));
    assert.equal(JSON.stringify(result.envelopes).includes("mock_sensitive_token_123456"), false);
  });

  it("rejects non-HTTPS Feishu API endpoints unless loopback", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-feishu-http-"));
    const source = await addExperienceSource(root, {
      name: "feishu-api",
      agent: "feishu",
      sourceType: "feishu",
      parser: "feishu-doc",
      channel: "feishu",
      scopeDefault: "team",
      feishuTarget: "doccn_pb_m30_public_001",
      url: "http://feishu.example.invalid",
      feishuAppIdEnv: "FEISHU_APP_ID",
      feishuAppSecretEnv: "FEISHU_APP_SECRET",
    });

    const result = await resolveExperienceSource(root, source, {
      authorityMode: "team-git",
      env: { FEISHU_APP_ID: "mock-app-id", FEISHU_APP_SECRET: "mock-app-secret" },
    });

    assert.equal(result.status, "failed");
    assert.ok(result.warnings.some((warning) => warning.includes("FEISHU_API_REQUIRES_HTTPS")));
  });
});
