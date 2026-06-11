import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { auditKb, pruneKb } from "@praxisbase/core/kb/maintenance.js";
import { normalizeStableSlug } from "@praxisbase/core/protocol/slug.js";

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
  "## Related Wiki Pages",
  "* [[bad-generated|Bad generated page]]",
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
  await writeFile(join(root, "skills/openclaw/auth/SKILL.md"), validPage, "utf8");
  return root;
}

describe("kb maintenance", () => {
  it("audits stable kb and promoted skill markdown files and reports failing quality reasons", async () => {
    const root = await fixtureRoot();

    const report = await auditKb(root);

    assert.equal(report.type, "kb_audit_report");
    assert.equal(report.mode, "audit");
    assert.equal(report.checked, 3);
    assert.equal(report.passed, 2);
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
    const remaining = await readFile(join(root, "kb/known-fixes/openclaw-auth.md"), "utf8");
    assert.ok(!remaining.includes("[[bad-generated"));
    assert.ok(remaining.includes("Bad generated page"));
  });

  it("reports dirty provenance in promoted skills", async () => {
    const root = await fixtureRoot();
    await writeFile(join(root, "skills/openclaw/auth/SKILL.md"), [
      "---",
      "source_refs:",
      "  - openclaw-memory://memory/dreaming/light/2026-05-19.md#abc",
      "---",
      "# OpenClaw auth refresh repair",
      "",
      "## When to Use",
      "Use this when OpenClaw authentication expires during memory sync.",
      "",
      "## Fix",
      "Refresh the OpenClaw login and retry memory sync.",
    ].join("\n"), "utf8");

    const report = await auditKb(root);

    assert.ok(report.findings.some((finding) => finding.path === "skills/openclaw/auth/SKILL.md"));
  });

  it("strips dirty provenance from mixed pages instead of deleting the page", async () => {
    const root = await fixtureRoot();
    const mixedPath = join(root, "kb/known-fixes/mixed-provenance.md");
    await writeFile(mixedPath, [
      "---",
      "id: mixed-provenance",
      "title: Mixed Provenance Repair",
      "source_refs:",
      "  - log://openclaw/stability-report",
      "  - openclaw-memory://memory/dreaming/light/2026-05-19.md#abc",
      "source_hashes:",
      "  - sha256:valid",
      "  - sha256:dirty",
      "sources:",
      "  - uri: log://openclaw/stability-report",
      "    hash: sha256:valid",
      "  - uri: openclaw-memory://memory/dreaming/light/2026-05-19.md#abc",
      "    hash: sha256:dirty",
      "source_count: 2",
      "---",
      "# Mixed Provenance Repair",
      "",
      "## When to Use",
      "Use this when OpenClaw authentication expires during memory sync.",
      "",
      "## Fix",
      "Refresh the OpenClaw login and retry memory sync.",
      "",
      "## Provenance",
      "- log://openclaw/stability-report (sha256:valid)",
      "- openclaw-memory://memory/dreaming/light/2026-05-19.md#abc (sha256:dirty)",
    ].join("\n"), "utf8");

    const report = await pruneKb(root, { yes: true });

    assert.equal(await exists(mixedPath), true);
    assert.ok(!report.deleted.includes("kb/known-fixes/mixed-provenance.md"));
    const updated = await readFile(mixedPath, "utf8");
    assert.ok(updated.includes("log://openclaw/stability-report"));
    assert.ok(!updated.includes("memory/dreaming"));
    assert.ok(!updated.includes("sha256:dirty"));
    assert.match(updated, /source_count:\s+1/);
  });

  it("deletes fully dirty pages and unlinks inbound wikilinks", async () => {
    const root = await fixtureRoot();
    await writeFile(join(root, "kb/known-fixes/fully-dirty.md"), [
      "---",
      "id: fully-dirty",
      "sources:",
      "  - uri: openclaw-memory://memory/dreaming/light/2026-05-19.md#abc",
      "    hash: sha256:dirty",
      "source_count: 1",
      "---",
      "# Fully Dirty Repair",
      "",
      "## When to Use",
      "Use this when OpenClaw authentication expires during memory sync.",
      "",
      "## Fix",
      "Refresh the OpenClaw login and retry memory sync.",
    ].join("\n"), "utf8");
    await writeFile(join(root, "kb/known-fixes/openclaw-auth.md"), validPage.replace("[[bad-generated|Bad generated page]]", "[[fully-dirty|Fully dirty page]]"), "utf8");

    const report = await pruneKb(root, { yes: true });

    assert.ok(report.deleted.includes("kb/known-fixes/fully-dirty.md"));
    assert.equal(await exists(join(root, "kb/known-fixes/fully-dirty.md")), false);
    const remaining = await readFile(join(root, "kb/known-fixes/openclaw-auth.md"), "utf8");
    assert.ok(!remaining.includes("[[fully-dirty"));
    assert.ok(remaining.includes("Fully dirty page"));
  });

  it("renames overlong kb slugs and repoints inbound wikilinks", async () => {
    const root = await fixtureRoot();
    const oldSlug = "missing-replay-data-compromises-the-ability-to-debug-or-verify-past-execution-behaviors";
    const newSlug = normalizeStableSlug(oldSlug);
    await writeFile(join(root, `kb/known-fixes/${oldSlug}.md`), [
      "---",
      `id: ${oldSlug}`,
      "title: Missing replay data compromises the ability to debug or verify past execution behaviors",
      "related_wiki_paths:",
      `  - kb/known-fixes/${oldSlug}.md`,
      "---",
      "# Missing replay data compromises the ability to debug or verify past execution behaviors",
      "",
      "## When to Use",
      "Use this when OpenClaw authentication expires during memory sync.",
      "",
      "## Fix",
      "Refresh the OpenClaw login and retry memory sync.",
    ].join("\n"), "utf8");
    await writeFile(join(root, "kb/known-fixes/openclaw-auth.md"), validPage.replace("[[bad-generated|Bad generated page]]", `[[${oldSlug}|Replay evidence]]`), "utf8");

    await pruneKb(root, { yes: true });

    assert.equal(await exists(join(root, `kb/known-fixes/${oldSlug}.md`)), false);
    assert.equal(await exists(join(root, `kb/known-fixes/${newSlug}.md`)), true);
    const renamed = await readFile(join(root, `kb/known-fixes/${newSlug}.md`), "utf8");
    assert.match(renamed, new RegExp(`id:\\s+${newSlug}`));
    assert.ok(renamed.includes("Missing replay data compromises the ability to debug or verify past execution behaviors"));
    assert.ok(renamed.includes(`kb/known-fixes/${newSlug}.md`));
    const inbound = await readFile(join(root, "kb/known-fixes/openclaw-auth.md"), "utf8");
    assert.ok(inbound.includes(`[[${newSlug}|Replay evidence]]`));
  });
});
