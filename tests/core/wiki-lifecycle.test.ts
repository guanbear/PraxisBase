import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildKnowledgeLifecycleReport } from "@praxisbase/core/wiki/lifecycle.js";
import type { WikiSitePage } from "@praxisbase/core/wiki/site-model.js";

function makePage(overrides: Partial<WikiSitePage> & { id: string; path: string }): WikiSitePage {
  return {
    slug: overrides.id,
    title: overrides.id,
    source_ids: [],
    summary: "test",
    body_text: "test body",
    signatures: [],
    ...overrides,
  };
}

describe("buildKnowledgeLifecycleReport", () => {
  it("proposes promote for draft with 2+ source refs", () => {
    const pages: WikiSitePage[] = [
      makePage({
        id: "draft-promote",
        path: "kb/known-fixes/draft-promote.md",
        maturity: "draft",
        provenance_refs: [
          { uri: "log://src-1", hash: "sha256:abc" },
          { uri: "log://src-2", hash: "sha256:def" },
        ],
      }),
    ];

    const report = buildKnowledgeLifecycleReport(pages, { now: "2026-05-28T10:00:00Z" });

    assert.equal(report.observations.length, 1);
    assert.equal(report.proposals.length, 1);
    assert.equal(report.proposals[0].decision, "promote");
    assert.equal(report.proposals[0].proposed_maturity, "verified");
    assert.equal(report.proposals[0].current_maturity, "draft");
    assert.equal(report.changed_stable_knowledge, false);
  });

  it("proposes promote for draft with reference_count > 0", () => {
    const pages: WikiSitePage[] = [
      makePage({
        id: "draft-ref-count",
        path: "kb/known-fixes/draft-ref.md",
        maturity: "draft",
        reference_count: 5,
        provenance_refs: [],
      }),
    ];

    const report = buildKnowledgeLifecycleReport(pages, { now: "2026-05-28T10:00:00Z" });

    assert.equal(report.proposals[0].decision, "promote");
  });

  it("no_op for draft without sufficient provenance", () => {
    const pages: WikiSitePage[] = [
      makePage({
        id: "draft-weak",
        path: "kb/known-fixes/draft-weak.md",
        maturity: "draft",
        provenance_refs: [{ uri: "log://src-1", hash: "sha256:abc" }],
        reference_count: 0,
      }),
    ];

    const report = buildKnowledgeLifecycleReport(pages, { now: "2026-05-28T10:00:00Z" });

    assert.equal(report.proposals[0].decision, "no_op");
  });

  it("proposes decay for proven page that is stale by old updated_at", () => {
    const pages: WikiSitePage[] = [
      makePage({
        id: "stale-proven",
        path: "kb/known-fixes/stale-proven.md",
        maturity: "proven",
        updated_at: "2025-06-01T10:00:00Z",
        provenance_refs: [{ uri: "log://x", hash: "sha256:x" }],
      }),
    ];

    const report = buildKnowledgeLifecycleReport(pages, { now: "2026-05-28T10:00:00Z" });

    assert.equal(report.proposals[0].decision, "decay");
    assert.equal(report.proposals[0].proposed_maturity, "stale");
  });

  it("proposes archive for superseded page", () => {
    const pages: WikiSitePage[] = [
      makePage({
        id: "old-page",
        path: "kb/known-fixes/old.md",
        maturity: "verified",
        superseded_by: "new-page",
      }),
    ];

    const report = buildKnowledgeLifecycleReport(pages, { now: "2026-05-28T10:00:00Z" });

    assert.equal(report.proposals[0].decision, "archive");
    assert.equal(report.proposals[0].proposed_maturity, "archived");
  });

  it("no_op for archived knowledge", () => {
    const pages: WikiSitePage[] = [
      makePage({
        id: "archived-page",
        path: "kb/known-fixes/archived.md",
        maturity: "archived",
      }),
    ];

    const report = buildKnowledgeLifecycleReport(pages, { now: "2026-05-28T10:00:00Z" });

    assert.equal(report.proposals[0].decision, "no_op");
  });

  it("proposes conflict for pages with shared source hashes and supersession", () => {
    const pages: WikiSitePage[] = [
      makePage({
        id: "page-a",
        path: "kb/known-fixes/a.md",
        maturity: "proven",
        updated_at: "2026-05-01T10:00:00Z",
        provenance_refs: [{ uri: "log://src", hash: "sha256:shared" }],
      }),
      makePage({
        id: "page-b",
        path: "kb/known-fixes/b.md",
        maturity: "verified",
        updated_at: "2026-05-20T10:00:00Z",
        provenance_refs: [{ uri: "log://src", hash: "sha256:shared" }],
        superseded_by: "page-a",
      }),
    ];

    const report = buildKnowledgeLifecycleReport(pages, { now: "2026-05-28T10:00:00Z" });

    const pageA = report.proposals.find((p) => p.page_id === "page-a");
    assert.ok(pageA);
    assert.equal(pageA.decision, "conflict");
  });

  it("proposes archive for stale page past double threshold", () => {
    const pages: WikiSitePage[] = [
      makePage({
        id: "very-stale",
        path: "kb/known-fixes/very-stale.md",
        maturity: "stale",
        updated_at: "2024-01-01T10:00:00Z",
        provenance_refs: [],
      }),
    ];

    const report = buildKnowledgeLifecycleReport(pages, { now: "2026-05-28T10:00:00Z" });

    assert.equal(report.proposals[0].decision, "archive");
    assert.equal(report.proposals[0].proposed_maturity, "archived");
  });

  it("never changes stable knowledge (changed_stable_knowledge is always false)", () => {
    const pages: WikiSitePage[] = [
      makePage({ id: "any-page", path: "kb/test.md", maturity: "draft" }),
    ];

    const report = buildKnowledgeLifecycleReport(pages, { now: "2026-05-28T10:00:00Z" });
    assert.equal(report.changed_stable_knowledge, false);
  });

  it("observations include source refs and hashes from provenance_refs", () => {
    const pages: WikiSitePage[] = [
      makePage({
        id: "prov-page",
        path: "kb/test.md",
        maturity: "verified",
        updated_at: "2026-05-28T10:00:00Z",
        provenance_refs: [
          { uri: "log://s1", hash: "sha256:h1" },
          { uri: "log://s2", hash: "sha256:h2" },
        ],
      }),
    ];

    const report = buildKnowledgeLifecycleReport(pages, { now: "2026-05-28T10:00:00Z" });

    assert.deepEqual(report.observations[0].source_refs, ["log://s1", "log://s2"]);
    assert.deepEqual(report.observations[0].source_hashes, ["sha256:h1", "sha256:h2"]);
  });
});
