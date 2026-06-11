import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WikiQualityReportSchema } from "@praxisbase/core/protocol/schemas.js";
import { buildWikiQualityReport } from "@praxisbase/core/wiki/quality.js";

describe("buildWikiQualityReport", () => {
  it("reports provenance, graph, stale, unsafe path, duplicate signature, and private material findings", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-quality-"));
    const report = await buildWikiQualityReport(root, {
      pages: [
        {
          id: "auth",
          slug: "auth",
          title: "Auth",
          page_kind: "known_fix",
          scope: "team",
          maturity: "proven",
          lifecycle: "verified",
          source_ids: ["sha256:a"],
          body_markdown: "[[missing]]",
          path: "kb/known-fixes/auth.md",
          signatures: ["openclaw:auth"],
        },
        {
          id: "unsafe",
          slug: "unsafe",
          title: "Unsafe",
          page_kind: "note",
          scope: "team",
          maturity: "draft",
          lifecycle: "stale",
          source_ids: [],
          body_markdown: "The token appeared in output.",
          path: "../unsafe.md",
          signatures: ["openclaw:auth"],
        },
        {
          id: "orphan",
          slug: "orphan",
          title: "Orphan",
          page_kind: "note",
          scope: "team",
          maturity: "draft",
          lifecycle: "draft",
          source_ids: ["note-source"],
          body_markdown: "Body.",
          path: "kb/notes/orphan.md",
          signatures: [],
        },
      ],
      now: "2026-05-21T00:00:00.000Z",
    });

    assert.ok(WikiQualityReportSchema.safeParse(report).success);
    assert.equal(report.changed_stable_knowledge, false);
    assert.ok(report.findings.some((finding) => finding.rule === "broken_link"));
    assert.ok(report.findings.some((finding) => finding.rule === "duplicate_signature"));
    assert.ok(report.findings.some((finding) => finding.rule === "missing_source_hash"));
    assert.ok(report.findings.some((finding) => finding.rule === "missing_citation"));
    assert.ok(report.findings.some((finding) => finding.rule === "orphan_page"));
    assert.ok(report.findings.some((finding) => finding.rule === "stale_page"));
    assert.ok(report.findings.some((finding) => finding.rule === "unsafe_path"));
    assert.ok(report.findings.some((finding) => finding.rule === "private_material"));
    assert.equal(report.summary.total, report.findings.length);

    const files = await readdir(join(root, ".praxisbase/reports/wiki-quality"));
    assert.equal(files.length, 1);
  });
});
