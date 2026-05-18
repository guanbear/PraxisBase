import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { repairContextCommand } from "@praxisbase/cli/commands/repair-context.js";

describe("repair-context command", () => {
  it("returns JSON repair context", async () => {
    const output = await repairContextCommand("openclaw", {
      logs: "tests/fixtures/openclaw/logs/claude-auth-expired.log",
      json: true,
    });

    const parsed = JSON.parse(output) as { problem_signature: string };
    assert.equal(parsed.problem_signature, "openclaw:claude-auth-expired");
  });

  it("returns signature for non-json mode", async () => {
    const output = await repairContextCommand("openclaw", {
      logs: "tests/fixtures/openclaw/logs/claude-auth-expired.log",
    });

    assert.equal(output, "openclaw:claude-auth-expired");
  });

  it("rejects unsupported scenario", async () => {
    await assert.rejects(
      repairContextCommand("k8s", { logs: "some-file.log" }),
      /Unsupported repair scenario: k8s/
    );
  });
});
