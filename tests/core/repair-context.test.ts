import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildOpenClawRepairContext } from "@praxisbase/core/repair/context.js";
import { detectOpenClawProblemSignature } from "@praxisbase/core/repair/signature.js";

describe("OpenClaw repair context", () => {
  it("detects auth-expired logs and returns a safe bundle", async () => {
    const log = await readFile("tests/fixtures/openclaw/logs/claude-auth-expired.log", "utf8");

    const context = await buildOpenClawRepairContext({ logs: log });

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

    const context = await buildOpenClawRepairContext({ logs: log });
    assert.equal(context.problem_signature, "openclaw:workspace-lock-stuck");
    assert.ok(context.verification_steps.length > 0);
  });

  it("detects node-runtime-missing signature", async () => {
    const log = await readFile("tests/fixtures/openclaw/logs/node-runtime-missing.log", "utf8");
    assert.equal(detectOpenClawProblemSignature(log), "openclaw:node-runtime-missing");

    const context = await buildOpenClawRepairContext({ logs: log });
    assert.equal(context.problem_signature, "openclaw:node-runtime-missing");
  });

  it("returns unknown for unmatched logs", async () => {
    const log = await readFile("tests/fixtures/openclaw/logs/unknown-error.log", "utf8");
    assert.equal(detectOpenClawProblemSignature(log), "openclaw:unknown");

    const context = await buildOpenClawRepairContext({ logs: log });
    assert.equal(context.problem_signature, "openclaw:unknown");
    assert.deepEqual(context.known_fixes, []);
  });

  it("loads promoted knowledge and skills by frontmatter signature with a budget", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-m28-repair-context-"));
    await writeFile(join(root, "dispatch.log"), "stickyResult is not defined; dispatch route mismatch; runner missing", "utf8");
    await writeFile(join(root, "kb.md"), "", "utf8").catch(() => undefined);
    await import("node:fs/promises").then(async ({ mkdir }) => {
      await mkdir(join(root, "kb/known-fixes"), { recursive: true });
      await mkdir(join(root, "skills/openclaw/dispatch-routing"), { recursive: true });
      await mkdir(join(root, ".praxisbase/policies"), { recursive: true });
    });
    await writeFile(join(root, ".praxisbase/policies/context-budget.json"), JSON.stringify({
      openclaw_repair_context_bytes: 220,
    }, null, 2), "utf8");
    await writeFile(join(root, "kb/known-fixes/openclaw-dispatch-routing-failures.md"), [
      "---",
      "id: openclaw-dispatch-routing-failures",
      "title: OpenClaw dispatch routing failures",
      "type: known_fix",
      "knowledge_type: known_fix",
      "scope: team",
      "maturity: verified",
      "reference_count: 7",
      "signatures:",
      "  - openclaw:dispatch-routing-failure",
      "---",
      "# OpenClaw dispatch routing failures",
      "",
      "## When to Use",
      "Use when stickyResult errors, dispatch route mismatches, or runner missing messages appear.",
      "",
      "## Verify",
      "Run dispatch smoke tests and verify route metadata.",
    ].join("\n"), "utf8");
    await writeFile(join(root, "skills/openclaw/dispatch-routing/SKILL.md"), [
      "---",
      "name: Dispatch Routing",
      "scope: team",
      "status: promoted",
      "signatures:",
      "  - openclaw:dispatch-routing-failure",
      "---",
      "# Dispatch Routing",
      "Check runner, route, spawn id, and result evidence.",
    ].join("\n"), "utf8");

    const context = await buildOpenClawRepairContext({
      logs: await readFile(join(root, "dispatch.log"), "utf8"),
      root,
    });

    assert.equal(context.problem_signature, "openclaw:dispatch-routing-failure");
    assert.deepEqual(context.known_fixes, ["kb/known-fixes/openclaw-dispatch-routing-failures.md"]);
    assert.deepEqual(context.skills, ["skills/openclaw/dispatch-routing/SKILL.md"]);
    assert.equal(context.truncated, true);
  });

  it("frontmatter-driven signatures tolerate common failure word variants", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-repair-context-variants-"));
    await import("node:fs/promises").then(async ({ mkdir }) => {
      await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    });
    await writeFile(join(root, "kb/known-fixes/openclaw-dispatch-routing-failures.md"), [
      "---",
      "id: openclaw-dispatch-routing-failures",
      "title: OpenClaw dispatch routing failures",
      "scope: team",
      "maturity: verified",
      "reference_count: 1",
      "signatures:",
      "  - openclaw:dispatch-routing-failure",
      "---",
      "# OpenClaw dispatch routing failures",
    ].join("\n"), "utf8");

    const context = await buildOpenClawRepairContext({
      root,
      logs: "OpenClaw dispatch failed because stickyResult was undefined and route metadata was missing.",
    });

    assert.equal(context.problem_signature, "openclaw:dispatch-routing-failure");
  });

  it("loads the repository OpenClaw dispatch page by frontmatter signature", async () => {
    const context = await buildOpenClawRepairContext({
      root: process.cwd(),
      logs: "OpenClaw delegation failed: stickyResult is not defined. Runner missing, dispatch route mismatch, and spawn proof missing.",
    });

    assert.equal(context.problem_signature, "openclaw:dispatch-routing-failure");
    assert.ok(context.known_fixes.includes("kb/known-fixes/openclaw-dispatch-routing-failures.md"));
    assert.equal(context.skills.includes("skills/openclaw/openclaw-dispatch-routing-failures/SKILL.md"), false);
  });
});
