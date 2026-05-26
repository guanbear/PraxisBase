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

  it("renders wiki links in page markdown as clickable links to resolved pages", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-links-"));
    await mkdir(join(root, "kb/notes"), { recursive: true });
    await writeFile(join(root, "kb/notes/wiki-related-page.md"), `---
id: wiki-related-page
type: note
scope: personal
maturity: draft
---
# Related Page

Target body.
`);
    await writeFile(join(root, "kb/notes/source-page.md"), `---
id: source-page
type: note
scope: personal
maturity: draft
---
# Source Page

See [[related-page|Related page]] before changing code.
`);

    await buildWikiSite(root);

    const page = await readFile(join(root, "dist/pages/source-page.html"), "utf8");
    assert.ok(page.includes('href="wiki-related-page.html"'));
    assert.ok(page.includes(">Related page</a>"));
  });

  it("writes root wiki artifacts and links them from the site navigation", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-root-artifacts-"));
    await mkdir(join(root, "kb/procedures"), { recursive: true });
    await writeFile(join(root, "kb/procedures/ack-timing.md"), `---
id: ack-timing
type: procedure
knowledge_type: procedure
scope: personal
maturity: draft
sources: [{ uri: "codex:session:1", hash: "sha256:ack" }]
updated_at: "2026-05-24T00:00:00.000Z"
---
# ACK Timing

Send an ACK before long-running agent work.
`);

    const result = await buildWikiSite(root);

    assert.ok(result.outputs.includes("dist/wiki/index.md"));
    assert.ok(result.outputs.includes("dist/wiki/log.md"));
    assert.ok(result.outputs.includes("dist/wiki/purpose.md"));
    assert.ok(result.outputs.includes("dist/wiki/schema.md"));
    assert.ok(result.outputs.includes("dist/wiki/overview.md"));

    const indexArtifact = await readFile(join(root, "dist/wiki/index.md"), "utf8");
    assert.match(indexArtifact, /ACK Timing/);
    assert.match(indexArtifact, /\[\[ack-timing\|ACK Timing\]\]/);

    const indexHtml = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(indexHtml.includes("href=\"wiki/index.md\""));
  });

  it("renders path-leaf wiki aliases when title slugs differ", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-path-alias-"));
    await mkdir(join(root, "kb/notes"), { recursive: true });
    await writeFile(join(root, "kb/notes/wiki-improving-perceived-responsiveness-and-ack-handling-in-openclaw-octoclaw.md"), `---
id: wiki-improving-perceived-responsiveness-and-ack-handling-in-openclaw-octoclaw
type: note
scope: personal
maturity: draft
---
# Improving Perceived Responsiveness in OpenClaw/OctoClaw

Target body.
`);
    await writeFile(join(root, "kb/notes/source-page.md"), `---
id: source-page
type: note
scope: personal
maturity: draft
---
# Source Page

See [[improving-perceived-responsiveness-and-ack-handling-in-openclaw-octoclaw|ACK handling]].
`);

    await buildWikiSite(root);

    const graph = JSON.parse(await readFile(join(root, "dist/graph.json"), "utf8"));
    assert.equal(graph.broken_links.length, 0);
    const page = await readFile(join(root, "dist/pages/source-page.html"), "utf8");
    assert.ok(page.includes('href="wiki-improving-perceived-responsiveness-and-ack-handling-in-openclaw-octoclaw.html"'));
    assert.ok(page.includes(">ACK handling</a>"));
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
          { name: "personal-agentmemory", agent: "agentmemory", channel: "unknown", source_type: "agentmemory", status: "partial", scanned: 4, fetched: 3, enveloped: 3, imported: 3, rejected: 0, human_required: 0, warnings: ["agentmemory_health_failed: timeout"] },
        ],
        context_economy: {
          enabled: true,
          reducer_version: "context-reducer-v1",
          rule_set_hash: "sha256:rules",
          items_seen: 12,
          items_reduced: 8,
          items_passed_through: 4,
          input_bytes: 20000,
          output_bytes: 7000,
          saved_bytes: 13000,
          report_ref: ".praxisbase/reports/context-economy/context_economy_2026_05_21.json",
          warnings: [],
        },
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
    assert.match(index, /<strong>3<\/strong>/);
    assert.match(index, /<strong>13<\/strong>/);
    assert.match(index, /<strong>1<\/strong>/);
    assert.match(index, /<strong>2<\/strong>/);
    assert.match(index, /<strong>3<\/strong>/);
    assert.match(index, /<strong>7<\/strong>/);
    assert.ok(index.includes("Context Economy"));
    assert.ok(index.includes("Saved bytes"));
    assert.ok(index.includes("13,000"));
    assert.ok(index.includes("AgentMemory"));
    assert.ok(index.includes("personal-agentmemory"));
    assert.ok(index.includes("agentmemory_health_failed: timeout"));
    assert.ok(index.includes("href=\"review.html#human-required\""));
    assert.ok(index.includes("href=\"review.html#pending-candidates\""));
    assert.ok(index.includes("href=\"#knowledge-pages\""));
    assert.ok(index.includes("id=\"knowledge-pages\""));
    assert.ok(index.includes("Knowledge Pages"));
    assert.equal(index.includes("Latest Experience Summaries"), false);
    assert.equal(index.includes("openclaw-memory://openclaw://memory/auth#chunk-1"), false);
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
    assert.ok(review.includes("Review Required"));
    assert.ok(review.includes("Privacy Required"));
    assert.ok(review.includes("Rejected"));
    assert.ok(review.includes("Promoted"));
    assert.ok(review.includes("OpenClaw Auth Refresh"));
    assert.ok(review.includes("kb/notes/wiki-openclaw-auth.md"));
    assert.ok(review.includes("praxisbase review --auto"));
    assert.ok(review.includes("praxisbase promote --auto"));
    assert.ok(review.includes("praxisbase privacy triage --mode personal --auto-release --json"));
    assert.ok(review.includes("praxisbase agentmemory export --mode personal --write --json"));
    assert.ok(review.includes("id=\"human-required\""));
    assert.ok(review.includes("id=\"privacy-required\""));
    assert.ok(review.includes("id=\"rejected\""));
    assert.ok(review.includes("Experience privacy verdict human_required"));
    assert.ok(review.includes(".praxisbase/exceptions/human-required/exception_auth.json"));
  });

  it("shows privacy triage metadata for human-required records", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-privacy-triage-"));
    await mkdir(join(root, ".praxisbase/exceptions/human-required"), { recursive: true });
    await writeFile(
      join(root, ".praxisbase/exceptions/human-required/exception_triage.json"),
      JSON.stringify({
        id: "exception_triage",
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
          triage: {
            classification: "safe_personal_experience",
            decision: "auto_released",
            confidence: 0.91,
            rationale: "The item describes project workflow without credentials.",
            suggested_redactions: [],
          },
        },
        created_at: "2026-05-21T10:02:00.000Z",
      }),
      "utf8",
    );

    await buildWikiSite(root);

    const review = await readFile(join(root, "dist/review.html"), "utf8");
    assert.ok(review.includes("safe_personal_experience"));
    assert.ok(review.includes("auto_released"));
    assert.ok(review.includes("0.91"));
    assert.ok(review.includes("The item describes project workflow without credentials."));
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

  it("shows wiki curation report metrics on index and review pages", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-curation-report-"));
    await mkdir(join(root, ".praxisbase/reports/wiki-curation"), { recursive: true });
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await mkdir(join(root, ".praxisbase/exceptions/human-required"), { recursive: true });
    await writeFile(
      join(root, ".praxisbase/reports/wiki-curation/wiki-curation-report_older.json"),
      JSON.stringify({
        id: "wiki-curation-report_older",
        protocol_version: "0.1",
        type: "wiki_curation_report",
        created_at: "2026-05-21T12:00:00.000Z",
        mode: "dry-run",
        ai: { configured: false, mode: "degraded" },
        input_counts: { evidence_items: 1, filtered_noise: 0, human_required: 0, rejected: 0, clusters: 1 },
        output_counts: { curated_proposals: 1, written_proposals: 0, conflicts: 0 },
        compiler_counts: {
          observations: 1,
          topics: 1,
          page_plans_by_action: { create: 1, update: 0, merge: 0, supersede: 0, archive: 0 },
          duplicate_source_hash_groups: 0,
          hard_blocks: 0,
          human_required_quality: 0,
        },
        proposals: [],
        warnings: [],
      }),
      "utf8",
    );
    await writeFile(
      join(root, ".praxisbase/reports/wiki-curation/wiki-curation-report_2026_05_22.json"),
      JSON.stringify({
        id: "wiki-curation-report_2026_05_22",
        protocol_version: "0.1",
        type: "wiki_curation_report",
        created_at: "2026-05-22T12:00:00.000Z",
        mode: "review",
        ai: { configured: true, mode: "production", model: "gpt-4.1" },
        input_counts: { evidence_items: 80, filtered_noise: 12, human_required: 5, rejected: 3, clusters: 8 },
        output_counts: { curated_proposals: 10, written_proposals: 7, conflicts: 1 },
        compiler_counts: {
          observations: 42,
          topics: 8,
          page_plans_by_action: { create: 5, update: 2, merge: 1, supersede: 0, archive: 0 },
          duplicate_source_hash_groups: 3,
          hard_blocks: 2,
          human_required_quality: 4,
        },
        proposals: [],
        warnings: [],
      }),
      "utf8",
    );

    await buildWikiSite(root);

    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Wiki Compiler"));
    assert.ok(index.includes("Observations"));
    assert.match(index, /<strong>42<\/strong>/);
    assert.ok(index.includes("Topics"));
    assert.match(index, /<strong>8<\/strong>/);
    assert.ok(index.includes("Plan Create"));
    assert.match(index, /<strong>5<\/strong>/);
    assert.ok(index.includes("Plan Update"));
    assert.match(index, /<strong>2<\/strong>/);
    assert.ok(index.includes("Plan Merge"));
    assert.match(index, /<strong>1<\/strong>/);
    assert.ok(index.includes("Plan Supersede"));
    assert.ok(index.includes("Plan Archive"));
    assert.ok(index.includes("Dup source-hash groups"));
    assert.match(index, /<strong>3<\/strong>/);
    assert.ok(index.includes("Hard blocks"));
    assert.match(index, /<strong>2<\/strong>/);
    assert.ok(index.includes("Quality review needed"));
    assert.match(index, /<strong>4<\/strong>/);
    assert.ok(index.includes("Written proposals"));
    assert.match(index, /<strong>7<\/strong>/);
    assert.ok(index.includes("2026-05-22"));
    assert.ok(index.includes("review"));
    assert.ok(index.includes("AI production"));
    assert.ok(index.includes("gpt-4.1"));
    assert.equal(index.includes("2026-05-21"), false);
    assert.equal(index.includes("Deterministic"), false);

    const review = await readFile(join(root, "dist/review.html"), "utf8");
    assert.ok(review.includes("Wiki Compiler"));
    assert.ok(review.includes("Observations"));
    assert.match(review, /<strong>42<\/strong>/);
  });

  it("shows relationship counts and link explanations in wiki compiler section and review cards", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-relationships-"));
    await mkdir(join(root, ".praxisbase/reports/wiki-curation"), { recursive: true });
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await mkdir(join(root, ".praxisbase/exceptions/human-required"), { recursive: true });
    await writeFile(
      join(root, ".praxisbase/reports/wiki-curation/wiki-curation-report_rel.json"),
      JSON.stringify({
        id: "wiki-curation-report_rel",
        protocol_version: "0.1",
        type: "wiki_curation_report",
        created_at: "2026-05-22T13:00:00.000Z",
        mode: "review",
        ai: { configured: true, mode: "production", model: "glm-4.7" },
        input_counts: { evidence_items: 6, filtered_noise: 0, human_required: 0, rejected: 0, clusters: 2 },
        output_counts: { curated_proposals: 2, written_proposals: 2, conflicts: 0 },
        compiler_counts: {
          observations: 6,
          topics: 2,
          page_plans_by_action: { create: 1, update: 0, merge: 1, supersede: 0, archive: 0 },
          duplicate_source_hash_groups: 1,
          hard_blocks: 0,
          human_required_quality: 1,
          relationship_counts: {
            required_links: 2,
            suggested_links: 1,
            merge_plans: 1,
            ambiguous_merge_targets: 1,
            isolated_topics: 0,
            orphan_risk_after_plan: 0,
          },
        },
        proposals: [],
        warnings: [],
      }),
      "utf8",
    );
    await writeFile(
      join(root, ".praxisbase/inbox/proposals/wiki-curated_rel.json"),
      JSON.stringify({
        id: "wiki-curated_rel",
        protocol_version: "0.1",
        type: "wiki_curated_proposal",
        target_path: "kb/known-fixes/openclaw-ack-timing.md",
        action: "update",
        page_kind: "known_fix",
        scope: "personal",
        title: "OpenClaw ACK timing",
        summary: "Merge ACK timing lessons with existing pages.",
        body_markdown: "# OpenClaw ACK timing\n\n## Problem\nACK timing regressed.\n\n## Fix\nSee [[openclaw-ack-timing|OpenClaw ACK timing]].",
        source_refs: ["raw-vault://codex/ack"],
        source_hashes: ["sha256:ack"],
        source_count: 2,
        evidence_ids: ["capture_ack_1"],
        confidence: 0.91,
        maturity: "draft",
        provenance: [{ source_ref: "raw-vault://codex/ack", source_hash: "sha256:ack" }],
        review_hint: { why_review: "ambiguous merge target", suggested_decision: "edit", risk_notes: [] },
        guards: [],
        related_pages: [{ slug: "openclaw-ack-timing", path: "kb/known-fixes/openclaw-ack-timing.md", title: "OpenClaw ACK timing" }],
        required_links: [{ slug: "openclaw-ack-timing", label: "OpenClaw ACK timing", path: "kb/known-fixes/openclaw-ack-timing.md", reason: "shared_source_hash" }],
        suggested_links: [{ slug: "openclaw-stdin-closed", label: "OpenClaw stdin closed", path: "kb/known-fixes/openclaw-stdin-closed.md", reason: "entity_overlap" }],
        merge_candidates: [{ title: "OpenClaw ACK timing", path: "kb/known-fixes/openclaw-ack-timing.md", reason: "shared_source_hash" }],
        relationship_reasons: ["shared_source_hash", "entity_overlap"],
        created_at: "2026-05-22T13:00:00.000Z",
      }),
      "utf8",
    );

    await buildWikiSite(root);

    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Required links"));
    assert.ok(index.includes("Orphan risk after plan"));
    assert.match(index, /<strong>2<\/strong>/);

    const review = await readFile(join(root, "dist/review.html"), "utf8");
    assert.ok(review.includes("Required links"));
    assert.ok(review.includes("Suggested links"));
    assert.ok(review.includes("Merge candidates"));
    assert.ok(review.includes("Relationship reasons"));
    assert.ok(review.includes("shared_source_hash"));
    assert.ok(review.includes("openclaw-ack-timing"));
  });

  it("Review metric Human required stays 0 when latest curation report has input_counts.human_required=57 but no exception records and no needs_human candidates", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-curation-human-required-"));
    await mkdir(join(root, ".praxisbase/reports/wiki-curation"), { recursive: true });
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await mkdir(join(root, ".praxisbase/exceptions/human-required"), { recursive: true });
    await writeFile(
      join(root, ".praxisbase/reports/wiki-curation/wiki-curation-report_hr.json"),
      JSON.stringify({
        id: "wiki-curation-report_hr",
        protocol_version: "0.1",
        type: "wiki_curation_report",
        created_at: "2026-05-22T14:00:00.000Z",
        mode: "review",
        ai: { configured: true, mode: "production", model: "gpt-4.1" },
        input_counts: { evidence_items: 100, filtered_noise: 20, human_required: 57, rejected: 10, clusters: 6 },
        output_counts: { curated_proposals: 5, written_proposals: 5, conflicts: 0 },
        compiler_counts: {
          observations: 30,
          topics: 6,
          page_plans_by_action: { create: 4, update: 1, merge: 0, supersede: 0, archive: 0 },
          duplicate_source_hash_groups: 0,
          hard_blocks: 0,
          human_required_quality: 3,
        },
        proposals: [],
        warnings: [],
      }),
      "utf8",
    );
    // Also write a pending candidate that is NOT needs_human
    await writeFile(
      join(root, ".praxisbase/inbox/proposals/wiki-proposal_safe.json"),
      JSON.stringify({
        id: "wiki-proposal_safe",
        protocol_version: "0.1",
        type: "wiki_proposal_candidate",
        source_id: "capture:safe",
        source_kind: "capture",
        source_hash: "sha256:safe",
        patch: {
          path: "kb/notes/safe.md",
          content: "---\nid: safe\ntype: note\nscope: personal\n---\n# Safe\n\nBody.\n",
        },
        created_at: "2026-05-22T14:00:00.000Z",
      }),
      "utf8",
    );

    await buildWikiSite(root);

    const review = await readFile(join(root, "dist/review.html"), "utf8");
    // The main "Human required" metric link should show 0
    const humanRequiredMatch = review.match(/href="#human-required"[^>]*><span>Human required<\/span><strong>(\d+)<\/strong>/);
    assert.ok(humanRequiredMatch, "Human required metric link should exist");
    assert.equal(humanRequiredMatch[1], "0", "Human required count should be 0 since no exception records exist");

    // Quality review needed should show 3 (from compiler_counts)
    assert.ok(review.includes("Quality review needed"));
    assert.match(review, /<strong>3<\/strong>/);

    // Input/privacy triage should show 57 (from input_counts.human_required)
    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Input/privacy triage"));
    assert.match(index, /<strong>57<\/strong>/);
  });

  it("curated proposal card exposes risk_notes and guard failure messages", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-risk-notes-"));
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await writeFile(
      join(root, ".praxisbase/inbox/proposals/wiki-curated_risk.json"),
      JSON.stringify({
        id: "wiki-curated_risk",
        protocol_version: "0.1",
        type: "wiki_curated_proposal",
        target_path: "kb/known-fixes/ack-timing.md",
        action: "create",
        page_kind: "known_fix",
        scope: "team",
        title: "ACK Timing Repair",
        summary: "Fix ACK timing issues in the pipeline.",
        body_markdown: "# ACK Timing Repair\n\nFix the ACK timing issue.",
        source_refs: ["raw-vault://codex/session-ack"],
        source_hashes: ["sha256:ack"],
        source_count: 3,
        evidence_ids: ["capture_ack_1"],
        confidence: 0.78,
        maturity: "draft",
        provenance: [{ source_ref: "raw-vault://codex/session-ack", source_hash: "sha256:ack" }],
        review_hint: {
          why_review: "Team scope requires human approval",
          suggested_decision: "approve",
          risk_notes: ["single source", "unresolved conflict in field X"],
        },
        guards: [
          { id: "path", ok: true, message: "allowed" },
          { id: "body_structure", ok: false, message: "Body lacks wiki structure: no headings found" },
          { id: "duplicate_hash", ok: false, message: "Duplicate source hash detected across proposals" },
        ],
        created_at: "2026-05-22T15:00:00.000Z",
      }),
      "utf8",
    );

    await buildWikiSite(root);

    const review = await readFile(join(root, "dist/review.html"), "utf8");
    // Risk notes should appear
    assert.ok(review.includes("Risk notes"));
    assert.ok(review.includes("single source"));
    assert.ok(review.includes("unresolved conflict in field X"));
    // Guard failures should appear
    assert.ok(review.includes("Guard failures"));
    assert.ok(review.includes("Body lacks wiki structure: no headings found"));
    assert.ok(review.includes("Duplicate source hash detected across proposals"));
    // Why review and suggested decision
    assert.ok(review.includes("Team scope requires human approval"));
    assert.ok(review.includes("approve"));
    // Source count and confidence
    assert.ok(review.includes("Sources"));
    assert.match(review, /<dd>3<\/dd>/);
    assert.ok(review.includes("Confidence"));
    assert.ok(review.includes("0.78"));

    // Also check index page pending candidates section
    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Risk notes"));
    assert.ok(index.includes("single source"));
    assert.ok(index.includes("Guard failures"));
    assert.ok(index.includes("Body lacks wiki structure"));
    assert.ok(index.includes("Sources"));
    assert.ok(index.includes("0.78"));
  });
});
