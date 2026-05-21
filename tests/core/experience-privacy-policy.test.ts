import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateExperiencePrivacy } from "@praxisbase/core/experience/privacy-policy.js";

describe("experience privacy policy", () => {
  it("rejects personal scope in team mode", () => {
    const result = evaluateExperiencePrivacy({
      mode: "team-git",
      scopeHint: "personal",
      text: "Fixed OpenClaw auth expiry.",
    });

    assert.equal(result.verdict, "reject");
    assert.ok(result.reasons.includes("team_rejects_personal_scope"));
  });

  it("allows personal scope in personal mode", () => {
    const result = evaluateExperiencePrivacy({
      mode: "personal-local",
      scopeHint: "personal",
      text: "Fixed OpenClaw auth expiry.",
    });

    assert.equal(result.verdict, "allow");
  });

  it("routes credentials to human review", () => {
    const result = evaluateExperiencePrivacy({
      mode: "team-git",
      scopeHint: "team",
      text: "OPENCLAW_TOKEN=secret",
    });

    assert.equal(result.verdict, "human_required");
    assert.ok(result.reasons.includes("private_material_detected"));
  });

  it("rejects private chat hints in team mode", () => {
    const result = evaluateExperiencePrivacy({
      mode: "team-git",
      scopeHint: "team",
      channel: "feishu",
      text: "Private chat DM said to patch the bot.",
    });

    assert.equal(result.verdict, "reject");
    assert.ok(result.reasons.includes("team_rejects_private_chat"));
  });
});
