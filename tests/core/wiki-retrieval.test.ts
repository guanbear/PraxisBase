import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rankWikiContextItems, tokenizeForWikiSearch } from "@praxisbase/core/wiki/retrieval.js";

describe("wiki retrieval", () => {
  const items = [
    {
      id: "known-auth",
      path: "kb/known-fixes/openclaw-auth-expired.md",
      kind: "known_fix",
      title: "OpenClaw Auth Expired",
      summary: "Signature openclaw:auth-expired refresh login.",
      body: "Use auth repair skill.",
      maturity: "proven",
      scope: "team",
      source_ids: ["source-a"],
      outbound_links: ["skill-auth"],
    },
    {
      id: "skill-auth",
      path: "skills/openclaw/auth-repair/SKILL.md",
      kind: "skill",
      title: "Auth Repair",
      summary: "Refresh OpenClaw credentials.",
      body: "Run safe login refresh.",
      maturity: "verified",
      scope: "team",
      source_ids: ["source-b"],
      outbound_links: [],
    },
    {
      id: "cn-auth",
      path: "kb/notes/wiki-cn-auth.md",
      kind: "note",
      title: "认证失败",
      summary: "OpenClaw 认证失败 需要刷新登录。",
      body: "",
      maturity: "draft",
      scope: "project",
      source_ids: ["source-c"],
      outbound_links: [],
    },
  ];

  it("tokenizes English terms and CJK bigrams", () => {
    assert.ok(tokenizeForWikiSearch("openclaw auth").includes("openclaw"));
    assert.ok(tokenizeForWikiSearch("认证失败").includes("认证"));
    assert.ok(tokenizeForWikiSearch("认证失败").includes("失败"));
  });

  it("ranks exact signatures first and expands graph-related items", () => {
    const ranked = rankWikiContextItems(items, {
      query: "openclaw:auth-expired",
      stage: "repair",
      maxItems: 3,
    });
    assert.equal(ranked[0].id, "known-auth");
    assert.equal(ranked[1].id, "skill-auth");
  });

  it("matches Chinese query text", () => {
    const ranked = rankWikiContextItems(items, {
      query: "认证失败",
      stage: "diagnosis",
      maxItems: 2,
    });
    assert.equal(ranked[0].id, "cn-auth");
  });
});
