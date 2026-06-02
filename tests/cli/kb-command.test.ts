import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { kbCommand } from "@praxisbase/cli/commands/kb.js";
import { sourceCommand } from "@praxisbase/cli/commands/source.js";

const validPage = "# OpenClaw auth refresh repair\n\n## When to Use\nUse this when OpenClaw authentication expires during memory sync.\n\n## Fix\nRefresh the OpenClaw login and retry memory sync.\n";
const invalidPage = "# Title\n\nGenerated placeholder.\n";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-kb-"));
  await mkdir(join(root, "kb/known-fixes"), { recursive: true });
  await writeFile(join(root, "kb/known-fixes/openclaw-auth.md"), validPage, "utf8");
  await writeFile(join(root, "kb/known-fixes/bad-generated.md"), invalidPage, "utf8");
  return root;
}

describe("kb CLI command", () => {
  it("returns an audit JSON report", async () => {
    const root = await fixtureRoot();

    const output = await kbCommand(root, "audit", { json: true });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.type, "kb_audit_report");
    assert.equal(parsed.report.mode, "audit");
    assert.equal(parsed.report.failed, 1);
    assert.equal(parsed.report.findings[0].path, "kb/known-fixes/bad-generated.md");
  });

  it("prune defaults to dry-run from the CLI", async () => {
    const root = await fixtureRoot();

    const output = await kbCommand(root, "prune", { json: true });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.dry_run, true);
    assert.deepEqual(parsed.report.deleted, []);
    assert.equal(await exists(join(root, "kb/known-fixes/bad-generated.md")), true);
  });

  it("confirmed prune deletes bad kb pages", async () => {
    const root = await fixtureRoot();

    const output = await kbCommand(root, "prune", { yes: true, json: true });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.dry_run, false);
    assert.deepEqual(parsed.report.deleted, ["kb/known-fixes/bad-generated.md"]);
    assert.equal(await exists(join(root, "kb/known-fixes/bad-generated.md")), false);
  });

  it("explicit dry-run wins over confirmation", async () => {
    const root = await fixtureRoot();

    const output = await kbCommand(root, "prune", { yes: true, dryRun: true, json: true });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.dry_run, true);
    assert.deepEqual(parsed.report.deleted, []);
    assert.equal(await exists(join(root, "kb/known-fixes/bad-generated.md")), true);
  });

  it("rebuild prunes first and delegates to the daily experience flow", async () => {
    const root = await fixtureRoot();
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Fixed OpenClaw auth refresh and verified pnpm test.", "utf8");
    await sourceCommand(root, "add", {
      name: "local-codex",
      agent: "codex",
      type: "local",
      path: sessions,
      scope: "personal",
      json: true,
    });

    const output = await kbCommand(root, "rebuild", {
      yes: true,
      mode: "personal",
      degraded: true,
      buildSite: true,
      json: true,
      now: "2026-05-24T00:00:00.000Z",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.type, "kb_rebuild_report");
    assert.equal(parsed.report.prune.failed, 1);
    assert.equal(parsed.report.daily.type, "daily_experience_report");
    assert.equal(await exists(join(root, "kb/known-fixes/bad-generated.md")), false);
  });
});
