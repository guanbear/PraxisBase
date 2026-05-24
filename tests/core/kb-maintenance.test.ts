import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { auditKb, pruneKb } from "@praxisbase/core/kb/maintenance.js";

const validPage = [
  "# OpenClaw auth refresh repair",
  "",
  "## When to Use",
  "Use this when OpenClaw authentication expires during memory sync.",
  "",
  "## Problem",
  "OpenClaw memory sync fails after the local login expires.",
  "",
  "## Fix",
  "Refresh the OpenClaw login and retry memory sync.",
  "",
].join("\n");

const invalidPage = [
  "# Title",
  "",
  "A generated placeholder without a reusable topic or action.",
  "",
].join("\n");

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-kb-maint-"));
  await mkdir(join(root, "kb/known-fixes"), { recursive: true });
  await mkdir(join(root, "skills/openclaw/auth"), { recursive: true });
  await writeFile(join(root, "kb/known-fixes/openclaw-auth.md"), validPage, "utf8");
  await writeFile(join(root, "kb/known-fixes/bad-generated.md"), invalidPage, "utf8");
  await writeFile(join(root, "kb/known-fixes/readme.txt"), invalidPage, "utf8");
  await writeFile(join(root, "skills/openclaw/auth/SKILL.md"), invalidPage, "utf8");
  return root;
}

describe("kb maintenance", () => {
  it("audits only kb markdown pages and reports failing quality reasons", async () => {
    const root = await fixtureRoot();

    const report = await auditKb(root);

    assert.equal(report.type, "kb_audit_report");
    assert.equal(report.mode, "audit");
    assert.equal(report.checked, 2);
    assert.equal(report.passed, 1);
    assert.equal(report.failed, 1);
    assert.deepEqual(report.findings.map((finding) => finding.path), ["kb/known-fixes/bad-generated.md"]);
    assert.match(report.findings[0].reason, /reusable wiki topic|specific reusable action|wiki structure/i);
  });

  it("prune is dry-run by default and does not delete failing pages", async () => {
    const root = await fixtureRoot();

    const report = await pruneKb(root, {});

    assert.equal(report.mode, "prune");
    assert.equal(report.dry_run, true);
    assert.equal(report.failed, 1);
    assert.deepEqual(report.deleted, []);
    assert.equal(await exists(join(root, "kb/known-fixes/bad-generated.md")), true);
  });

  it("confirmed prune deletes only failing kb markdown pages", async () => {
    const root = await fixtureRoot();

    const report = await pruneKb(root, { yes: true });

    assert.equal(report.dry_run, false);
    assert.deepEqual(report.deleted, ["kb/known-fixes/bad-generated.md"]);
    assert.equal(await exists(join(root, "kb/known-fixes/bad-generated.md")), false);
    assert.equal(await exists(join(root, "kb/known-fixes/openclaw-auth.md")), true);
    assert.equal(await exists(join(root, "kb/known-fixes/readme.txt")), true);
    assert.equal(await exists(join(root, "skills/openclaw/auth/SKILL.md")), true);
  });
});
