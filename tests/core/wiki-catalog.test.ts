import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildKnowledgeCatalog } from "@praxisbase/core/wiki/catalog.js";
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

describe("buildKnowledgeCatalog", () => {
  it("groups entries by scope, layer, type, and maturity", () => {
    const pages: WikiSitePage[] = [
      makePage({
        id: "fix-1",
        path: "kb/known-fixes/fix-1.md",
        title: "Fix 1",
        scope: "team",
        maturity: "proven",
        page_kind: "known_fix",
        provenance_refs: [{ uri: "log://s1", hash: "sha256:h1" }],
      }),
      makePage({
        id: "skill-1",
        path: "skills/openclaw/repair/SKILL.md",
        title: "Repair Skill",
        scope: "project",
        maturity: "verified",
        page_kind: "skill",
        provenance_refs: [{ uri: "log://s2", hash: "sha256:h2" }],
      }),
    ];

    const catalog = buildKnowledgeCatalog(pages, { now: "2026-05-28T10:00:00Z" });

    assert.equal(catalog.entries.length, 2);
    assert.deepEqual(catalog.grouped_by_scope.team, ["fix-1"]);
    assert.deepEqual(catalog.grouped_by_scope.project, ["skill-1"]);
    assert.deepEqual(catalog.grouped_by_maturity.proven, ["fix-1"]);
    assert.deepEqual(catalog.grouped_by_maturity.verified, ["skill-1"]);
    assert.deepEqual(catalog.grouped_by_type.known_fix, ["fix-1"]);
    assert.deepEqual(catalog.grouped_by_type.skill, ["skill-1"]);
    assert.equal(catalog.changed_stable_knowledge, false);
  });

  it("includes provenance hashes without raw evidence bodies", () => {
    const pages: WikiSitePage[] = [
      makePage({
        id: "page-1",
        path: "kb/test.md",
        title: "Test",
        provenance_refs: [
          { uri: "log://a", hash: "sha256:abc" },
          { uri: "log://b", hash: "sha256:def" },
        ],
        body_text: "This is raw evidence body content that should not appear in catalog.",
      }),
    ];

    const catalog = buildKnowledgeCatalog(pages, { now: "2026-05-28T10:00:00Z" });

    assert.deepEqual(catalog.entries[0].source_hashes, ["sha256:abc", "sha256:def"]);
    assert.equal(catalog.entries[0].source_refs.length, 2);
    const serialized = JSON.stringify(catalog.entries[0]);
    assert.ok(!serialized.includes("raw evidence body"));
  });

  it("includes skill pages in catalog entries", () => {
    const pages: WikiSitePage[] = [
      makePage({
        id: "skill-repair",
        path: "skills/openclaw/repair/SKILL.md",
        title: "Repair Skill",
        page_kind: "skill",
        maturity: "verified",
      }),
    ];

    const catalog = buildKnowledgeCatalog(pages, { now: "2026-05-28T10:00:00Z" });

    assert.equal(catalog.entries.length, 1);
    assert.equal(catalog.entries[0].page_kind, "skill");
    assert.deepEqual(catalog.entries[0].related_skills, ["skills/openclaw/repair/SKILL.md"]);
  });

  it("last_observed matches page updated_at when available", () => {
    const pages: WikiSitePage[] = [
      makePage({
        id: "timed-page",
        path: "kb/test.md",
        title: "Timed",
        updated_at: "2026-05-20T10:00:00Z",
      }),
    ];

    const catalog = buildKnowledgeCatalog(pages, { now: "2026-05-28T10:00:00Z" });

    assert.equal(catalog.entries[0].last_observed, "2026-05-20T10:00:00Z");
  });

  it("changed_stable_knowledge is always false", () => {
    const pages: WikiSitePage[] = [
      makePage({ id: "any", path: "kb/test.md", title: "Any" }),
    ];

    const catalog = buildKnowledgeCatalog(pages, { now: "2026-05-28T10:00:00Z" });
    assert.equal(catalog.changed_stable_knowledge, false);
  });

  it("catalog id is deterministic for same inputs", () => {
    const pages: WikiSitePage[] = [
      makePage({ id: "p1", path: "kb/test.md", title: "T" }),
    ];

    const cat1 = buildKnowledgeCatalog(pages, { now: "2026-05-28T10:00:00Z" });
    const cat2 = buildKnowledgeCatalog(pages, { now: "2026-05-28T10:00:00Z" });

    assert.equal(cat1.id, cat2.id);
  });

  it("catalog id differs for different inputs", () => {
    const pages1: WikiSitePage[] = [
      makePage({ id: "p1", path: "kb/test.md", title: "T" }),
    ];
    const pages2: WikiSitePage[] = [
      makePage({ id: "p2", path: "kb/test2.md", title: "T2" }),
    ];

    const cat1 = buildKnowledgeCatalog(pages1, { now: "2026-05-28T10:00:00Z" });
    const cat2 = buildKnowledgeCatalog(pages2, { now: "2026-05-28T10:00:00Z" });

    assert.notEqual(cat1.id, cat2.id);
  });
});
