import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWikiGraph, resolveWikiLinks } from "@praxisbase/core/wiki/resolver.js";

describe("wiki resolver", () => {
  const pages = [
    {
      id: "page-auth",
      slug: "openclaw-auth-expired",
      title: "OpenClaw Auth Expired",
      page_kind: "known_fix",
      scope: "team",
      maturity: "verified",
      lifecycle: "reviewed",
      source_ids: ["source-auth"],
      claims: [],
      outbound_links: ["auth-repair-skill"],
      body_markdown: "See [[auth-repair-skill|Auth Repair]]. `[[ignored]]`\n\n```txt\n[[ignored-fence]]\n```",
    },
    {
      id: "page-skill",
      slug: "auth-repair-skill",
      title: "Auth Repair Skill",
      page_kind: "skill",
      scope: "team",
      maturity: "verified",
      lifecycle: "reviewed",
      source_ids: ["source-skill"],
      claims: [],
      outbound_links: [],
      body_markdown: "Refresh auth.",
    },
  ] as const;

  it("resolves wikilinks while ignoring code spans and fences", () => {
    const result = resolveWikiLinks(pages as any);
    assert.deepEqual(result.links.map((link) => `${link.from}->${link.to}`), ["page-auth->page-skill"]);
    assert.deepEqual(result.broken_links, []);
  });

  it("builds backlinks and duplicate/orphan health findings", () => {
    const graph = buildWikiGraph(pages as any);
    assert.equal(graph.nodes.length, 2);
    assert.deepEqual(graph.backlinks["page-skill"], ["page-auth"]);
    assert.deepEqual(graph.duplicates, []);
    assert.deepEqual(graph.orphans, []);
  });
});
