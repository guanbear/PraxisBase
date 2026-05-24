import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWikiSite } from "@praxisbase/core/wiki/render-site.js";
import { rankWikiContextItems, retrieveWikiContext, tokenizeForWikiSearch } from "@praxisbase/core/wiki/retrieval.js";

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

  it("returns compiled pages, root artifact hints, graph neighbors, and provenance pointers", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-retrieve-"));
    await mkdir(join(root, "kb/procedures"), { recursive: true });
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await mkdir(join(root, ".praxisbase/raw-vault/refs"), { recursive: true });
    await writeFile(join(root, "kb/procedures/ack-timing.md"), `---
id: ack-timing
type: procedure
knowledge_type: procedure
scope: personal
maturity: draft
sources: [{ uri: "codex:session:1", hash: "sha256:ack" }]
updated_at: "2026-05-24T00:00:00.000Z"
---
# ACK timing

## What To Do
Send ACK before long-running agent work.

## Agent Use
Use this before delegating slow tool work.
`);
    await writeFile(join(root, "kb/known-fixes/agent-feedback.md"), `---
id: agent-feedback
type: known_fix
knowledge_type: known_fix
scope: personal
maturity: draft
sources: [{ uri: "codex:session:1", hash: "sha256:ack" }]
updated_at: "2026-05-24T00:00:00.000Z"
---
# Agent feedback

## What To Do
See [[ack-timing|ACK timing]].

## Agent Use
Use this when an agent appears silent.
`);
    await writeFile(join(root, ".praxisbase/raw-vault/refs/raw.json"), JSON.stringify({
      redacted_summary: "raw transcript blob should not be returned",
      source_ref: "raw-vault://codex/raw",
    }));

    await buildWikiSite(root);
    const result = await retrieveWikiContext(root, {
      query: "ACK timing",
      maxBytes: 5000,
      maxItems: 1,
      includeRootArtifacts: true,
      includeGraphNeighbors: true,
    });

    assert.match(result.text, /Wiki Purpose|Wiki Index/);
    assert.match(result.text, /ACK timing/);
    assert.match(result.text, /Provenance/);
    assert.match(result.text, /Graph Neighbors/);
    assert.doesNotMatch(result.text, /raw transcript blob/);
  });
});
