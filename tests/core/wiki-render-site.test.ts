import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWikiSite } from "@praxisbase/core/wiki/render-site.js";

describe("buildWikiSite", () => {
  it("renders dashboard, page shell, search assets, graph, and AI exports", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-site-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await writeFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), `---
id: openclaw-auth-expired
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: published
maturity: proven
signatures: ["openclaw:auth-expired"]
skills: []
sources: [{ uri: "raw-vault://codex/session-1", hash: "sha256:s1" }]
confidence: 0.9
reference_count: 3
last_referenced_at: null
supersedes: []
superseded_by: null
updated_at: "2026-05-20T00:00:00.000Z"
---
# OpenClaw Auth Expired

Refresh login. <script>alert("x")</script>
`);

    const result = await buildWikiSite(root);
    assert.ok(result.outputs.includes("dist/index.html"));
    assert.ok(result.outputs.includes("dist/pages/openclaw-auth-expired.html"));
    assert.ok(result.outputs.includes("dist/pages/openclaw-auth-expired.txt"));
    assert.ok(result.outputs.includes("dist/pages/openclaw-auth-expired.json"));
    assert.ok(result.outputs.includes("dist/llms-full.txt"));
    assert.ok(result.outputs.includes("dist/graph.jsonld"));
    assert.ok(result.outputs.includes("dist/ai-readme.md"));

    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Knowledge Health"));
    assert.ok(index.includes("searchInput"));
    assert.equal(index.includes("<script>alert"), false);

    const page = await readFile(join(root, "dist/pages/openclaw-auth-expired.html"), "utf8");
    assert.ok(page.includes("Provenance"));
    assert.ok(page.includes("Related"));
    assert.equal(page.includes("<script>alert"), false);

    await assert.doesNotReject(stat(join(root, "dist/style.css")));
    await assert.doesNotReject(stat(join(root, "dist/site.js")));
  });

  it("shows actionable health issues on the dashboard", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-health-"));
    await mkdir(join(root, "kb/notes"), { recursive: true });
    await writeFile(join(root, "kb/notes/a.md"), `---
id: a
type: note
scope: team
maturity: draft
---
# Same

[[missing]]
`);
    await writeFile(join(root, "kb/notes/b.md"), `---
id: b
type: note
scope: team
maturity: draft
---
# Same

Body.
`);
    await buildWikiSite(root);
    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Broken links"));
    assert.ok(index.includes("Duplicates"));
  });
});
