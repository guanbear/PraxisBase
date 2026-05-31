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
    assert.equal(containsPrivateMaterial("Restart root@guanzhicheng.com through macmini-ssh."), true);
    assert.equal(containsPrivateMaterial("Read /Users/guanbear/.openclaw/MEMORY.md before running."), true);
    assert.equal(containsPrivateMaterial("Upload audio to Slack raw user U1234567890."), true);
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

  it("flags raw copy, missing root artifacts, and source summary pages as guidance", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-fidelity-lint-"));
    const report = await runWikiLint(root, {
      pages: [
        {
          id: "wiki-raw-copy",
          slug: "raw-copy",
          title: "Raw Copy",
          page_kind: "known_fix",
          scope: "personal",
          maturity: "draft",
          lifecycle: "active",
          source_ids: ["sha256:a"],
          body_markdown: "# Raw Copy\n\n```json\n{\"raw\":\"transcript\"}\n```\n\n## Provenance\n- codex:1",
          path: "kb/known-fixes/raw-copy.md",
        },
        {
          id: "wiki-source-summary-as-fix",
          slug: "source-summary-as-fix",
          title: "Source Summary As Fix",
          page_kind: "source_summary",
          scope: "personal",
          maturity: "draft",
          lifecycle: "active",
          source_ids: ["sha256:b"],
          body_markdown: "# Source Summary As Fix\n\n## What To Do\nUse this source summary as a fix.\n\n## Provenance\n- codex:1",
          path: "kb/known-fixes/source-summary-as-fix.md",
        },
      ] as any,
    });

    assert.ok(report.findings.some((finding) => finding.rule === "missing-root-artifact"));
    assert.ok(report.findings.some((finding) => finding.rule === "raw-copy-page"));
    assert.ok(report.findings.some((finding) => finding.rule === "source-summary-promoted-as-guidance"));
  });

  it("flags body provenance that disagrees with frontmatter provenance", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-provenance-lint-"));
    const report = await runWikiLint(root, {
      pages: [
        {
          id: "wiki-provenance-mismatch",
          slug: "provenance-mismatch",
          title: "Provenance mismatch",
          page_kind: "known_fix",
          scope: "personal",
          maturity: "draft",
          lifecycle: "active",
          source_ids: ["sha256:a"],
          provenance_refs: [{ uri: "codex:session:1", hash: "sha256:a" }],
          body_markdown: [
            "# Provenance mismatch",
            "",
            "## When to Use",
            "Use this when validating wiki provenance.",
            "",
            "## Fix",
            "Keep body provenance aligned with frontmatter sources.",
            "",
            "## Verification",
            "Lint should flag mismatched body provenance.",
            "",
            "## Reusable Lessons",
            "Do not trust synthesized provenance text when structured sources disagree.",
            "",
            "## Provenance",
            "- codex:session:1 (sha256:b)",
          ].join("\n"),
          path: "kb/known-fixes/provenance-mismatch.md",
        },
      ] as any,
    });

    assert.ok(report.findings.some((finding) => finding.rule === "provenance_mismatch" as any));
  });

  it("accepts structured provenance refs whose URI ends with a period", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-provenance-period-lint-"));
    const report = await runWikiLint(root, {
      pages: [
        {
          id: "wiki-provenance-period",
          slug: "provenance-period",
          title: "Provenance period",
          page_kind: "known_fix",
          scope: "personal",
          maturity: "draft",
          lifecycle: "active",
          source_ids: ["sha256:a"],
          provenance_refs: [{ uri: "log://openclaw/2026-05-20-03-32-09-stability-report.", hash: "sha256:a" }],
          body_markdown: [
            "# Provenance period",
            "",
            "## When to Use",
            "Use this when validating provenance URI parsing.",
            "",
            "## Fix",
            "Keep the full structured source URI intact.",
            "",
            "## Verification",
            "Lint accepts a rendered source URI that ends with a period.",
            "",
            "## Reusable Lessons",
            "Do not strip a period when it is part of the structured source URI.",
            "",
            "## Provenance",
            "- log://openclaw/2026-05-20-03-32-09-stability-report. (sha256:a)",
          ].join("\n"),
          path: "kb/known-fixes/provenance-period.md",
        },
      ] as any,
    });

    assert.equal(report.findings.some((finding) => finding.rule === "provenance_mismatch" as any), false);
  });

  it("flags thin Agent Use placeholders as missing agent-use guidance", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-agent-use-lint-"));
    const report = await runWikiLint(root, {
      pages: [
        {
          id: "wiki-thin-agent-use",
          slug: "thin-agent-use",
          title: "Thin Agent Use",
          page_kind: "known_fix",
          scope: "personal",
          maturity: "draft",
          lifecycle: "active",
          source_ids: ["sha256:a"],
          provenance_refs: [{ uri: "codex:session:1", hash: "sha256:a" }],
          body_markdown: [
            "# Thin Agent Use",
            "",
            "## When to Use",
            "Use this when validating agent-use lint.",
            "",
            "## Fix",
            "Add actionable guidance.",
            "",
            "## Verification",
            "Lint should flag placeholder guidance.",
            "",
            "## Reusable Lessons",
            "Agent-use sections need trigger, action, and verification guidance.",
            "",
            "## Agent Use",
            "Use this page.",
            "",
            "## Provenance",
            "- codex:session:1 (sha256:a)",
          ].join("\n"),
          path: "kb/known-fixes/thin-agent-use.md",
        },
      ] as any,
    });

    assert.ok(report.findings.some((finding) => finding.rule === "missing-agent-use-section" as any));
  });

  it("flags the frozen task-runner provenance mismatch fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-provenance-fixture-lint-"));
    const body = await readFile(join(process.cwd(), "tests/fixtures/wiki/provenance-mismatch-task-runner.md"), "utf8");
    const report = await runWikiLint(root, {
      pages: [
        {
          id: "wiki-openclaw-task-runner-presence-checks",
          slug: "wiki-openclaw-task-runner-presence-checks",
          title: "OpenClaw task runner presence checks",
          page_kind: "known_fix",
          scope: "personal",
          maturity: "draft",
          lifecycle: "active",
          source_ids: ["sha256:17ff55c8b47a664a76f20ca32b303d38784c6400e4518ef9f21e5b86e4d27ef4"],
          provenance_refs: [{
            uri: "openclaw-memory://memory/dreaming/light/2026-05-22.md#274f59a874f6147a724928e145304c0f7f0a58e0a826d0127c32bc84b7be8a53",
            hash: "sha256:17ff55c8b47a664a76f20ca32b303d38784c6400e4518ef9f21e5b86e4d27ef4",
          }],
          body_markdown: body,
          path: "kb/notes/wiki-openclaw-task-runner-presence-checks.md",
        },
      ] as any,
    });

    const mismatch = report.findings.find((finding) => finding.rule === "provenance_mismatch" as any);
    assert.ok(mismatch);
    assert.match(JSON.stringify(mismatch.details), /hash_mismatch/);
  });
});
