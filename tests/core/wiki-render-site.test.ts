import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
    assert.ok(result.outputs.includes("dist/review.html"));
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
    assert.ok(index.includes("href=\"review.html\""));
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

  it("removes stale generated page artifacts when stable wiki pages disappear", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-stale-pages-"));
    const pagePath = join(root, "kb/notes/transient.md");
    await mkdir(join(root, "kb/notes"), { recursive: true });
    await writeFile(pagePath, `---
id: transient
type: note
scope: personal
maturity: draft
---
# Transient Page

Temporary body.
`);

    await buildWikiSite(root);
    await assert.doesNotReject(stat(join(root, "dist/pages/transient.html")));
    await assert.doesNotReject(stat(join(root, "dist/pages/transient.json")));
    await assert.doesNotReject(stat(join(root, "dist/pages/transient.txt")));

    await rm(pagePath);
    await buildWikiSite(root);

    await assert.rejects(stat(join(root, "dist/pages/transient.html")));
    await assert.rejects(stat(join(root, "dist/pages/transient.json")));
    await assert.rejects(stat(join(root, "dist/pages/transient.txt")));
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
    await mkdir(join(root, ".praxisbase/raw-vault/refs"), { recursive: true });
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
    await writeFile(join(root, ".praxisbase/raw-vault/refs/raw_ref_openclaw-auth.json"), JSON.stringify({
      id: "raw_ref_openclaw-auth",
      type: "raw_vault_ref",
      agent: "openclaw",
      kind: "openclaw_episode",
      source_ref: "openclaw-memory://openclaw://memory/auth#chunk-1",
      source_hash: "sha256:openclaw-auth",
      redacted_summary: "OpenClaw detected Claude authentication expired and asked for login again.",
      scope_hint: "project",
      created_at: "2026-05-21T13:00:00.000Z",
    }), "utf8");

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
    assert.ok(index.includes("href=\"review.html#human-required\""));
    assert.ok(index.includes("href=\"review.html#pending-candidates\""));
    assert.ok(index.includes("Latest Experience Summaries"));
    assert.ok(index.includes("OpenClaw detected Claude authentication expired"));
    assert.ok(index.includes("openclaw-memory://openclaw://memory/auth#chunk-1"));
    const issues = await readFile(join(root, "dist/issues.html"), "utf8");
    assert.ok(issues.includes("Daily Privacy Findings"));
    assert.ok(issues.includes("Rejected"));
    assert.ok(issues.includes("Human required"));
    await assert.rejects(stat(join(root, "dist/experience.html")));
  });

  it("shows pending wiki proposal candidates with confirmation guidance", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-pending-"));
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await mkdir(join(root, ".praxisbase/exceptions/human-required"), { recursive: true });
    await writeFile(
      join(root, ".praxisbase/inbox/proposals/wiki-proposal_auth.json"),
      JSON.stringify({
        id: "wiki-proposal_auth",
        protocol_version: "0.1",
        type: "wiki_proposal_candidate",
        source_id: "capture:auth",
        source_kind: "capture",
        source_hash: "sha256:auth",
        changed_stable_knowledge: false,
        patch: {
          path: "kb/notes/wiki-openclaw-auth.md",
          content: `---
id: wiki-openclaw-auth
protocol_version: "0.1"
type: note
knowledge_type: note
scope: personal
status: draft
maturity: draft
sources:
  - uri: "capture:auth"
    hash: "sha256:auth"
confidence: 0.5
updated_at: "2026-05-21T10:00:00.000Z"
---
# OpenClaw Auth Refresh

When OpenClaw auth expires, refresh the login before retrying agent repair.
`,
        },
        created_at: "2026-05-21T10:00:00.000Z",
      }),
      "utf8",
    );
    await writeFile(
      join(root, ".praxisbase/exceptions/human-required/exception_auth.json"),
      JSON.stringify({
        id: "exception_auth",
        protocol_version: "0.1",
        type: "exception_record",
        category: "human_required",
        source_id: "capture:private-auth",
        reason: "Experience privacy verdict human_required: private_material_detected",
        details: {
          agent: "codex",
          scope_hint: "personal",
          source_ref: "raw-vault://codex/private-auth",
          source_hash: "sha256:private-auth",
        },
        created_at: "2026-05-21T10:02:00.000Z",
      }),
      "utf8",
    );

    await buildWikiSite(root);

    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Pending Experience Candidates"));
    assert.ok(index.includes("href=\"review.html#pending-candidates\""));
    assert.ok(index.includes("OpenClaw Auth Refresh"));
    assert.ok(index.includes("kb/notes/wiki-openclaw-auth.md"));
    assert.ok(index.includes("praxisbase review --auto"));
    assert.ok(index.includes("praxisbase promote --auto"));

    const searchIndex = JSON.parse(await readFile(join(root, "dist/search-index.json"), "utf8"));
    assert.equal(searchIndex.documents.length, 1);
    assert.equal(searchIndex.documents[0].kind, "pending:note");
    assert.equal(searchIndex.documents[0].path, "kb/notes/wiki-openclaw-auth.md");
    assert.equal(searchIndex.documents[0].href, "review.html#pending-wiki-proposal_auth");

    const review = await readFile(join(root, "dist/review.html"), "utf8");
    assert.ok(review.includes("Review Queue"));
    assert.ok(review.includes("id=\"pending-candidates\""));
    assert.ok(review.includes("OpenClaw Auth Refresh"));
    assert.ok(review.includes("kb/notes/wiki-openclaw-auth.md"));
    assert.ok(review.includes("praxisbase review --auto"));
    assert.ok(review.includes("praxisbase promote --auto"));
    assert.ok(review.includes("id=\"human-required\""));
    assert.ok(review.includes("Experience privacy verdict human_required"));
    assert.ok(review.includes(".praxisbase/exceptions/human-required/exception_auth.json"));
  });

  it("uses curated wiki proposals as the primary pending review queue", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-curated-pending-"));
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await writeFile(
      join(root, ".praxisbase/inbox/proposals/wiki-curated_auth.json"),
      JSON.stringify({
        id: "wiki-curated_auth",
        protocol_version: "0.1",
        type: "wiki_curated_proposal",
        target_path: "kb/known-fixes/openclaw-auth-expired.md",
        action: "create",
        page_kind: "known_fix",
        scope: "personal",
        title: "OpenClaw auth expired recovery",
        summary: "Refresh OpenClaw login before retrying memory sync.",
        body_markdown: "# OpenClaw auth expired recovery\n\n## Problem\nOpenClaw memory sync fails after auth expiry.\n\n## Verification\nRetry memory sync.",
        source_refs: ["raw-vault://codex/session-1", "openclaw://memory/auth"],
        source_hashes: ["sha256:s1", "sha256:s2"],
        source_count: 2,
        evidence_ids: ["capture_1", "memory_1"],
        confidence: 0.91,
        maturity: "draft",
        provenance: [
          { source_ref: "raw-vault://codex/session-1", source_hash: "sha256:s1" },
          { source_ref: "openclaw://memory/auth", source_hash: "sha256:s2" },
        ],
        review_hint: { why_review: "Repeated successful repair", suggested_decision: "approve", risk_notes: [] },
        guards: [{ id: "path", ok: true, message: "allowed" }],
        created_at: "2026-05-21T10:00:00.000Z",
      }),
      "utf8",
    );

    await buildWikiSite(root);

    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Pending Experience Candidates"));
    assert.ok(index.includes("OpenClaw auth expired recovery"));
    assert.ok(index.includes("kb/known-fixes/openclaw-auth-expired.md"));

    const review = await readFile(join(root, "dist/review.html"), "utf8");
    assert.ok(review.includes("id=\"pending-candidates\""));
    assert.ok(review.includes("OpenClaw auth expired recovery"));
    assert.ok(review.includes("raw-vault://codex/session-1"));

    const searchIndex = JSON.parse(await readFile(join(root, "dist/search-index.json"), "utf8"));
    assert.equal(searchIndex.documents[0].kind, "pending:known_fix");
    assert.equal(searchIndex.documents[0].href, "review.html#pending-wiki-curated_auth");
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
