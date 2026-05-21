import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDistillPrompt,
  distillExperience,
  DistilledExperienceSchema,
} from "@praxisbase/core/ai/distill.js";
import type { AiJsonClient } from "@praxisbase/core/ai/client.js";

const baseInput = {
  source_id: "source_codex",
  agent: "codex" as const,
  channel: "local",
  source_ref: "raw-vault://codex/session-1",
  source_hash: "sha256:source",
  scope_hint: "personal" as const,
  chunk_id: "chunk_1",
  chunk_hash: "sha256:chunk",
  text: "Fixed OpenClaw auth handling and ran pnpm check.",
};

function validExperience() {
  return {
    source_ref: baseInput.source_ref,
    source_hash: baseInput.source_hash,
    chunk_hashes: [baseInput.chunk_hash],
    agent: "codex",
    scope_hint: "personal",
    summary: "Fixed OpenClaw auth handling and verified it with pnpm check.",
    problem: "OpenClaw auth handling was unreliable.",
    context: "Local Codex repair session.",
    actions: ["Changed auth handling"],
    failed_attempts: [],
    outcome: "success",
    verification: ["pnpm check"],
    reusable_lessons: ["Verify auth fixes with the project check command."],
    risks: [],
    suggested_tags: ["openclaw", "auth"],
    suggested_wiki_kind: "known_fix",
    skill_candidate: {
      should_create: false,
    },
    confidence: 0.82,
  };
}

describe("AI experience distill", () => {
  it("validates distilled experience schema", () => {
    const parsed = DistilledExperienceSchema.parse(validExperience());
    assert.equal(parsed.outcome, "success");
    assert.equal(parsed.suggested_wiki_kind, "known_fix");
  });

  it("builds a prompt that requests JSON and avoids secrets", () => {
    const prompt = buildDistillPrompt(baseInput);
    assert.match(prompt.system, /Return only JSON/);
    assert.match(prompt.system, /Do not include secrets/);
    assert.match(prompt.user, /Fixed OpenClaw auth/);
  });

  it("returns structured experience from a mocked AI client", async () => {
    const client: AiJsonClient = {
      async generateJson() {
        return { ok: true, json: validExperience() };
      },
    };

    const result = await distillExperience(baseInput, { client });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.experience.summary, "Fixed OpenClaw auth handling and verified it with pnpm check.");
      assert.deepEqual(result.experience.verification, ["pnpm check"]);
    }
  });

  it("normalizes common GLM structured-output drift", async () => {
    const client: AiJsonClient = {
      async generateJson() {
        return {
          ok: true,
          json: {
            summary: "Captured a PraxisBase initialization procedure.",
            problem: "The agent needed a first-run PraxisBase setup path.",
            context: { workspace: "local personal setup" },
            actions: "Configured AI provider and generated the bootstrap skill.",
            failed_attempts: "",
            outcome: "System successfully injected initialization context for the agent session.",
            verification: "praxisbase ai doctor --json",
            reusable_lessons: "Use the generated PraxisBase skill before daily runs.",
            risks: "",
            suggested_tags: "praxisbase,bootstrap",
            suggested_wiki_kind: "configuration",
            skill_candidate: false,
            confidence: "0.74",
          },
        };
      },
    };

    const result = await distillExperience(baseInput, { client });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.experience.source_ref, baseInput.source_ref);
      assert.equal(result.experience.source_hash, baseInput.source_hash);
      assert.deepEqual(result.experience.chunk_hashes, [baseInput.chunk_hash]);
      assert.equal(result.experience.agent, "codex");
      assert.equal(result.experience.scope_hint, "personal");
      assert.deepEqual(result.experience.actions, ["Configured AI provider and generated the bootstrap skill."]);
      assert.deepEqual(result.experience.verification, ["praxisbase ai doctor --json"]);
      assert.equal(result.experience.outcome, "unknown");
      assert.equal(result.experience.suggested_wiki_kind, "procedure");
      assert.deepEqual(result.experience.skill_candidate, { should_create: false });
      assert.equal(result.experience.confidence, 0.74);
    }
  });

  it("returns ai_error when the client fails", async () => {
    const client: AiJsonClient = {
      async generateJson() {
        return { ok: false, error: "timeout" };
      },
    };

    const result = await distillExperience(baseInput, { client });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.category, "ai_error");
  });

  it("returns schema_error for malformed AI JSON", async () => {
    const client: AiJsonClient = {
      async generateJson() {
        return { ok: true, json: { summary: "missing required fields" } };
      },
    };

    const result = await distillExperience(baseInput, { client });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.category, "schema_error");
  });

  it("returns privacy_error when AI output contains private material", async () => {
    const client: AiJsonClient = {
      async generateJson() {
        return {
          ok: true,
          json: {
            ...validExperience(),
            summary: "Fixed auth with token=abc123456789.",
          },
        };
      },
    };

    const result = await distillExperience(baseInput, { client });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.category, "privacy_error");
  });
});
