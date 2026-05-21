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
    assert.ok(result.outputs.includes("dist/graph.html"));
    assert.ok(result.outputs.includes("dist/issues.html"));
    assert.ok(result.outputs.includes("dist/pages/openclaw-auth-expired.html"));
    assert.ok(result.outputs.includes("dist/pages/openclaw-auth-expired.txt"));
    assert.ok(result.outputs.includes("dist/pages/openclaw-auth-expired.json"));
    assert.ok(result.outputs.includes("dist/llms-full.txt"));
    assert.ok(result.outputs.includes("dist/graph.jsonld"));
    assert.ok(result.outputs.includes("dist/graph-slices/overview.json"));
    assert.ok(result.outputs.includes("dist/ai-readme.md"));
    assert.ok(result.outputs.some((output) => output.startsWith(".praxisbase/reports/wiki-quality/")));
    assert.equal(result.health.quality_findings, 0);

    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Knowledge Health"));
    assert.ok(index.includes("searchInput"));
    assert.ok(index.includes("data-kind-filter"));
    assert.ok(index.includes("href=\"style.css\""));
    assert.ok(index.includes("href=\"graph.html\""));
    assert.ok(index.includes("href=\"issues.html\""));
    assert.equal(index.includes("href=\"/"), false);
    assert.equal(index.includes("<script>alert"), false);

    const page = await readFile(join(root, "dist/pages/openclaw-auth-expired.html"), "utf8");
    assert.ok(page.includes("Provenance"));
    assert.ok(page.includes("raw-vault://codex/session-1"));
    assert.ok(page.includes("sha256:s1"));
    assert.ok(page.includes("Related"));
    assert.ok(page.includes("href=\"../style.css\""));
    assert.equal(page.includes("href=\"/"), false);
    assert.equal(page.includes("<script>alert"), false);

    const graphPage = await readFile(join(root, "dist/graph.html"), "utf8");
    assert.ok(graphPage.includes("graph-shell"));
    assert.ok(graphPage.includes("window.__WIKI_GRAPH__"));

    const issuesPage = await readFile(join(root, "dist/issues.html"), "utf8");
    assert.ok(issuesPage.includes("Quality Issues"));

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
    assert.ok(index.includes("Quality findings"));
  });

  it("shows daily experience report summary on homepage when report exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-daily-"));
    await mkdir(join(root, "kb/notes"), { recursive: true });
    await mkdir(join(root, ".praxisbase/reports/daily"), { recursive: true });
    await writeFile(join(root, "kb/notes/a.md"), `---
id: a
type: note
scope: team
maturity: draft
---
# Note A

Body.
`);
    await writeFile(
      join(root, ".praxisbase/reports/daily/daily_2026_05_21.json"),
      JSON.stringify({
        id: "daily_2026_05_21",
        protocol_version: "0.1",
        type: "daily_experience_report",
        authority_mode: "team-git",
        mode: "write",
        sources: [
          { name: "openclaw-bot", agent: "openclaw", channel: "feishu", source_type: "openclaw-api", status: "completed", scanned: 10, fetched: 8, enveloped: 8, imported: 6, rejected: 1, human_required: 1, warnings: [] },
          { name: "claude-repair", agent: "claude-code", channel: "log-system", source_type: "http", status: "completed", scanned: 5, fetched: 5, enveloped: 5, imported: 4, rejected: 0, human_required: 1, warnings: [] },
        ],
        proposal_candidates: 3,
        quality_findings: 0,
        site_pages: 7,
        changed_stable_knowledge: false,
        outputs: [],
        warnings: [],
        created_at: "2026-05-21T12:00:00.000Z",
      }),
    );

    await buildWikiSite(root);
    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Latest Daily Experience"));
    assert.ok(index.includes("2026-05-21"));
    assert.ok(index.includes("team-git"));
    assert.ok(index.includes("Sources"));
    assert.match(index, /<strong>2<\/strong>/);
    assert.match(index, /<strong>10<\/strong>/);
    assert.match(index, /<strong>1<\/strong>/);
    assert.match(index, /<strong>2<\/strong>/);
    assert.match(index, /<strong>3<\/strong>/);
    assert.match(index, /<strong>7<\/strong>/);
    const issues = await readFile(join(root, "dist/issues.html"), "utf8");
    assert.ok(issues.includes("Daily Privacy Findings"));
    assert.ok(issues.includes("Rejected"));
    assert.ok(issues.includes("Human required"));
    await assert.rejects(stat(join(root, "dist/experience.html")));
  });

  it("homepage works when no daily report exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-nodaily-"));
    await mkdir(join(root, "kb/notes"), { recursive: true });
    await writeFile(join(root, "kb/notes/a.md"), `---
id: a
type: note
scope: team
maturity: draft
---
# Note A

Body.
`);

    const result = await buildWikiSite(root);
    assert.ok(result.outputs.includes("dist/index.html"));
    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Knowledge Health"));
    assert.equal(index.includes("Latest Daily Experience"), false);
    await assert.rejects(stat(join(root, "dist/experience.html")));
  });
});
