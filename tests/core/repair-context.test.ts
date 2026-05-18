import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildOpenClawRepairContext } from "@praxisbase/core/repair/context.js";
import { detectOpenClawProblemSignature } from "@praxisbase/core/repair/signature.js";

describe("OpenClaw repair context", () => {
  it("detects auth-expired logs and returns a safe bundle", async () => {
    const log = await readFile("tests/fixtures/openclaw/logs/claude-auth-expired.log", "utf8");

    const context = buildOpenClawRepairContext({ logs: log });

    assert.equal(context.problem_signature, "openclaw:claude-auth-expired");
    assert.ok(context.skills.includes("skills/openclaw/auth-repair/SKILL.md"));
    assert.ok(context.forbidden_operations.includes("modify production systems"));
    assert.ok(context.verification_steps.length > 0);
    assert.ok(context.rollback_steps.length > 0);
    assert.ok(context.escalation_conditions.length > 0);
  });

  it("detects workspace-lock-stuck signature", async () => {
    const log = await readFile("tests/fixtures/openclaw/logs/workspace-lock-stuck.log", "utf8");
    assert.equal(detectOpenClawProblemSignature(log), "openclaw:workspace-lock-stuck");

    const context = buildOpenClawRepairContext({ logs: log });
    assert.equal(context.problem_signature, "openclaw:workspace-lock-stuck");
    assert.ok(context.verification_steps.length > 0);
  });

  it("detects node-runtime-missing signature", async () => {
    const log = await readFile("tests/fixtures/openclaw/logs/node-runtime-missing.log", "utf8");
    assert.equal(detectOpenClawProblemSignature(log), "openclaw:node-runtime-missing");

    const context = buildOpenClawRepairContext({ logs: log });
    assert.equal(context.problem_signature, "openclaw:node-runtime-missing");
  });

  it("returns unknown for unmatched logs", async () => {
    const log = await readFile("tests/fixtures/openclaw/logs/unknown-error.log", "utf8");
    assert.equal(detectOpenClawProblemSignature(log), "openclaw:unknown");

    const context = buildOpenClawRepairContext({ logs: log });
    assert.equal(context.problem_signature, "openclaw:unknown");
    assert.deepEqual(context.known_fixes, []);
  });
});
