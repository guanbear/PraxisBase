import { mkdir, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  containsPrivateMaterial,
  isAllowedWikiPatchPath,
  runWikiLint,
  validateBodyShrink,
} from "@praxisbase/core/wiki/lint.js";

describe("wiki lint guards", () => {
  it("rejects unsafe patch paths and raw/private candidate text", () => {
    assert.equal(isAllowedWikiPatchPath("kb/notes/wiki-auth.md"), true);
    assert.equal(isAllowedWikiPatchPath("skills/openclaw/auth/SKILL.md"), true);
    assert.equal(isAllowedWikiPatchPath("../outside.md"), false);
    assert.equal(isAllowedWikiPatchPath(".praxisbase/raw-vault/session.json"), false);
    assert.equal(containsPrivateMaterial("user token abc was present"), true);
    assert.equal(containsPrivateMaterial("normal redacted summary"), false);
  });

  it("enforces merge body shrink threshold", () => {
    assert.equal(validateBodyShrink("a ".repeat(100), "b ".repeat(80), "patch").ok, true);
    assert.equal(validateBodyShrink("a ".repeat(100), "b ".repeat(20), "patch").ok, false);
    assert.equal(validateBodyShrink("a ".repeat(100), "archived", "archive").ok, true);
  });

  it("writes lint report and human-action exceptions for broken links and duplicates", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-lint-"));
    await mkdir(join(root, ".praxisbase"), { recursive: true });
    const report = await runWikiLint(root, {
      pages: [
        {
          id: "duplicate",
          slug: "same",
          title: "Same",
          page_kind: "note",
          scope: "team",
          maturity: "draft",
          lifecycle: "draft",
          source_ids: ["source-a"],
          claims: [],
          outbound_links: [],
          body_markdown: "[[missing]]",
        },
        {
          id: "duplicate",
          slug: "same",
          title: "Same",
          page_kind: "note",
          scope: "team",
          maturity: "draft",
          lifecycle: "draft",
          source_ids: ["source-b"],
          claims: [],
          outbound_links: [],
          body_markdown: "",
        },
      ] as any,
    });

    assert.equal(report.changed_stable_knowledge, false);
    assert.ok(report.findings.some((finding) => finding.rule === "broken_wikilink"));
    assert.ok(report.findings.some((finding) => finding.rule === "duplicate_slug"));

    const reportFiles = await readdir(join(root, ".praxisbase/reports/wiki-lint"));
    assert.equal(reportFiles.length, 1);
    const saved = JSON.parse(await readFile(join(root, ".praxisbase/reports/wiki-lint", reportFiles[0]), "utf8"));
    assert.equal(saved.type, "wiki_lint_report");
  });
});
