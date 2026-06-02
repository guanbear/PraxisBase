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

  it("keeps promoted skill pages distinct from related wiki pages and resolves path wikilinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-skill-namespace-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await mkdir(join(root, "skills/openclaw/openclaw-dispatch-routing-failures"), { recursive: true });
    await writeFile(join(root, "kb/known-fixes/openclaw-dispatch-routing-failures.md"), `---
id: openclaw-dispatch-routing-failures
type: known_fix
scope: personal
maturity: draft
sources: [{ uri: "raw-vault://codex/session-1", hash: "sha256:s1" }]
---
# OpenClaw dispatch routing failures

Verify runner execution before reporting dispatch success.
`);
    await writeFile(join(root, "skills/openclaw/openclaw-dispatch-routing-failures/SKILL.md"), `---
name: OpenClaw dispatch routing failures
origin: praxisbase_synthesized
status: promoted
scope: personal
maturity: draft
source_hashes: ["sha256:s1"]
related_wiki_paths:
  - kb/known-fixes/openclaw-dispatch-routing-failures.md
---
# OpenClaw dispatch routing failures

## When To Use
Use this for OpenClaw dispatch routing failures.

## Related Wiki Pages
- [[kb/known-fixes/openclaw-dispatch-routing-failures.md]]
`);

    const result = await buildWikiSite(root);

    assert.equal(result.health.broken_links, 0);
    assert.equal(result.health.duplicates, 0);
    assert.equal(result.health.quality_findings, 0);
    assert.ok(result.outputs.includes("dist/pages/openclaw-dispatch-routing-failures.html"));
    assert.ok(result.outputs.includes("dist/pages/skill-openclaw-openclaw-dispatch-routing-failures.html"));

    const graph = JSON.parse(await readFile(join(root, "dist/graph.json"), "utf8"));
    assert.equal(graph.nodes.some((node: { id: string }) => node.id === "openclaw-dispatch-routing-failures"), true);
    assert.equal(graph.nodes.some((node: { id: string }) => node.id === "skill-openclaw-openclaw-dispatch-routing-failures"), true);
    assert.equal(graph.links.some((link: { from: string; to: string }) =>
      link.from === "skill-openclaw-openclaw-dispatch-routing-failures"
      && link.to === "openclaw-dispatch-routing-failures"
    ), true);
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
        context_juice: {
          enabled: true,
          context_juice_version: "context-juice-v1",
          budget_id: "context-juice-v1:daily-session-tool-output-16384",
          items_seen: 5,
          items_budgeted: 5,
          items_microcompacted: 0,
          original_bytes: 30000,
          kept_bytes: 18000,
          saved_bytes: 12000,
          presummary_summarized: 1,
          presummary_saved_bytes: 4000,
          report_ref: ".praxisbase/reports/context-juice/context_juice_2026_05_21.json",
          warnings: [],
        },
        proposal_candidates: 3,
        quality_findings: 0,
        site_pages: 7,
        changed_stable_knowledge: false,
        brain_backends: {
          gbrain: {
            enabled: true,
            doctor_status: "warning",
            publish_status: "partial",
            pages: 2,
            exported: 1,
            skipped: 1,
            imported: 0,
            warnings: ["gbrain_capture_failed: retry later"],
            errors: [],
          },
        },
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
    assert.ok(index.includes("Context Juice"));
    assert.ok(index.includes("Budgeted items"));
    assert.ok(index.includes("12,000"));
    assert.ok(index.includes("Pre-summaries"));
    assert.ok(index.includes("AgentMemory"));
    assert.ok(index.includes("personal-agentmemory"));
    assert.ok(index.includes("agentmemory_health_failed: timeout"));
    assert.ok(index.includes("GBrain"));
    assert.ok(index.includes("partial / exported 1"));
    assert.ok(index.includes("gbrain_capture_failed: retry later"));
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

  it("renders Personal GA experience status without raw private refs", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-personal-ga-"));
    await mkdir(join(root, ".praxisbase/reports/daily"), { recursive: true });
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await mkdir(join(root, ".praxisbase/exceptions/human-required"), { recursive: true });
    await writeFile(
      join(root, ".praxisbase/reports/daily/daily_personal_ga.json"),
      JSON.stringify({
        id: "daily_personal_ga",
        protocol_version: "0.1",
        type: "daily_experience_report",
        created_at: "2026-05-30T10:00:00.000Z",
        authority_mode: "personal-local",
        sources: [],
        ai_distill: { privacy_required: 0, review_required: 0, rejected_low_signal: 0, rejected_quality: 0 },
        proposal_candidates: 0,
        site_pages: 2,
        personal_ga: {
          type: "personal_ga_report",
          mode: "budget_exhausted",
          source_coverage: [
            { agent: "openclaw", source_kind: "memory_file", configured: true, available: true, items: 4, content_spans: 8, origin: "local", privacy_scope: "personal" },
            { agent: "codex", source_kind: "session", configured: true, available: false, items: 0, content_spans: 0, origin: "local", privacy_scope: "personal", blocking: true },
          ],
          lesson_count: 4,
          disposition_count: 4,
          golden_validation: { matched: 2, required: 3, missed: ["codex_verified_repair"] },
          leakage_scan: { passed: true, findings: [] },
          cache: { hits: 6, misses: 2, writes: 2 },
          html: { index: "dist/index.html", review: "dist/review.html" },
          agent_consumption: [
            { surface: "pb_context", available: true, authority: ["stable_pb_page", "active_personal_lesson"] },
            { surface: "gbrain", available: false, authority: ["sidecar_after_pb"] },
          ],
          dispositions: [
            {
              lesson_id: "lesson-wiki",
              state: "wiki_ready",
              decision: "promoted_to_wiki",
              target: "kb/procedures/openclaw-target-confirmation.md",
              reason: "lesson_materialized_as_wiki_output",
              source_refs: ["ssh://root@guanzhicheng.com/Users/guanbear/private"],
              source_hashes: ["sha256:wiki"],
              privacy_tier: "personal_only",
              portability: "project",
              applies_to_agents: ["openclaw"],
              applies_to_systems: ["openclaw"],
            },
            {
              lesson_id: "lesson-queued",
              state: "wiki_ready",
              decision: "queued_for_next_run",
              reason: "lesson_ready_but_processing_limit_reached",
              blocking_reason: "proposal_or_processing_limit",
              source_refs: ["openclaw://macmini-ssh/private"],
              source_hashes: ["sha256:queued"],
              privacy_tier: "safe",
              portability: "universal",
              applies_to_agents: ["codex", "openclaw"],
              applies_to_systems: ["delegation"],
            },
            {
              lesson_id: "lesson-privacy",
              state: "human_required",
              decision: "blocked_by_privacy",
              reason: "privacy_abstraction_or_review_required",
              blocking_reason: "privacy_abstraction_required",
              source_refs: ["slack://U123SECRET"],
              source_hashes: ["sha256:privacy"],
              privacy_tier: "human_required",
              portability: "private_instance",
              applies_to_agents: ["openclaw"],
              applies_to_systems: ["slack"],
            },
            {
              lesson_id: "lesson-budget",
              state: "candidate",
              decision: "delayed_by_budget",
              reason: "uncached_ai_work_delayed_by_budget",
              blocking_reason: "ai_budget_exhausted",
              source_refs: ["codex://session/token=abc123456789"],
              source_hashes: ["sha256:budget"],
              privacy_tier: "safe",
              portability: "project",
              applies_to_agents: ["codex"],
              applies_to_systems: ["praxisbase"],
            },
          ],
          production_ready: false,
          blocking_reasons: ["ai_budget_exhausted", "source_blocked:codex:session"],
        },
        outputs: [],
        warnings: [],
      }),
      "utf8",
    );

    await buildWikiSite(root);

    const index = await readFile(join(root, "dist/index.html"), "utf8");
    const review = await readFile(join(root, "dist/review.html"), "utf8");
    for (const html of [index, review]) {
      assert.ok(html.includes("Personal GA"));
      assert.ok(html.includes("Experience Sources"));
      assert.ok(html.includes("openclaw / memory_file"));
      assert.ok(html.includes("codex / session"));
      assert.ok(html.includes("Lesson Disposition"));
      assert.ok(html.includes("queued_for_next_run"));
      assert.ok(html.includes("delayed_by_budget"));
      assert.ok(html.includes("Golden Validation"));
      assert.ok(html.includes("2 / 3"));
      assert.ok(html.includes("Privacy Review"));
      assert.ok(html.includes("privacy_abstraction_required"));
      assert.ok(html.includes("Agent Use"));
      assert.ok(html.includes("pb_context"));
      assert.ok(html.includes("source_blocked:codex:session"));
      assert.doesNotMatch(html, /root@guanzhicheng\.com/);
      assert.doesNotMatch(html, /macmini-ssh/);
      assert.doesNotMatch(html, /\/Users\/guanbear/);
      assert.doesNotMatch(html, /U123SECRET/);
      assert.doesNotMatch(html, /abc123456789/);
    }
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
    assert.ok(review.includes("praxisbase privacy triage --mode personal --auto-release --progress --json"));
    assert.ok(review.includes("praxisbase gbrain export --mode personal --write --json"));
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
          redacted_summary: "Refresh OpenClaw auth before retrying memory sync.",
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
    assert.ok(review.includes("Refresh OpenClaw auth before retrying memory sync."));
  });

  it("hides private human-required details until privacy triage releases them", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-privacy-hidden-"));
    await mkdir(join(root, ".praxisbase/exceptions/human-required"), { recursive: true });
    await writeFile(
      join(root, ".praxisbase/exceptions/human-required/exception_private.json"),
      JSON.stringify({
        id: "exception_private",
        protocol_version: "0.1",
        type: "exception_record",
        category: "human_required",
        source_id: "capture:private-remote",
        reason: "Experience privacy verdict human_required: private_material_detected",
        details: {
          agent: "openclaw",
          scope_hint: "personal",
          source_ref: "openclaw-ssh://remote/MEMORY.md:10:10",
          source_hash: "sha256:private-remote",
          redacted_summary: "Use private-host-wrapper with private network address and secret key.",
          triage: {
            classification: "private_material_detected",
            decision: "keep_human_required",
            confidence: 0.93,
            rationale: "Contains private host and key material.",
            suggested_redactions: ["private-host-wrapper", "secret key"],
          },
        },
        created_at: "2026-05-21T10:02:00.000Z",
      }),
      "utf8",
    );

    await buildWikiSite(root);

    const review = await readFile(join(root, "dist/review.html"), "utf8");
    assert.ok(review.includes("private_material_detected"));
    assert.ok(review.includes("keep_human_required"));
    assert.ok(review.includes("Sensitive details hidden until privacy triage releases this record."));
    assert.ok(!review.includes("private-host-wrapper"));
    assert.ok(!review.includes("secret key"));
    assert.ok(!review.includes("openclaw-ssh://remote/MEMORY.md:10:10"));
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
        proposal_limit: 3,
        limit_reason: "max_curation_proposals",
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
    assert.ok(index.includes("Proposal limit"));
    assert.ok(index.includes("Limit reason"));
    assert.ok(index.includes("max_curation_proposals"));
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
    assert.ok(review.includes("Proposal limit"));
    assert.ok(review.includes("max_curation_proposals"));
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
    // The current privacy metric should show 0. Historical curation input counts are reported
    // separately and should not inflate the actionable daily privacy queue.
    const currentPrivacyMatch = review.match(/href="#human-required"[^>]*><span>Current privacy<\/span><strong>(\d+)<\/strong>/);
    assert.ok(currentPrivacyMatch, "Current privacy metric link should exist");
    assert.equal(currentPrivacyMatch[1], "0", "Current privacy count should be 0 since no exception records exist");

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

  it("renders semantic review decision, score, and reason from risk_notes on proposal cards", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-semantic-review-"));
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await mkdir(join(root, ".praxisbase/exceptions/human-required"), { recursive: true });
    await writeFile(
      join(root, ".praxisbase/inbox/proposals/wiki-curated_semantic_reject.json"),
      JSON.stringify({
        id: "wiki-curated_semantic_reject",
        protocol_version: "0.1",
        type: "wiki_curated_proposal",
        target_path: "kb/known-fixes/openclaw-semantic-reject.md",
        action: "create",
        page_kind: "known_fix",
        scope: "personal",
        title: "OpenClaw Semantic Reject Test",
        summary: "A proposal with a rejected semantic review.",
        body_markdown: "# Semantic Reject Test\n\nBody.",
        source_refs: ["raw-vault://codex/sem"],
        source_hashes: ["sha256:sem"],
        source_count: 2,
        evidence_ids: ["capture_sem_1"],
        confidence: 0.70,
        maturity: "draft",
        provenance: [{ source_ref: "raw-vault://codex/sem", source_hash: "sha256:sem" }],
        review_hint: {
          why_review: "Semantic review rejected",
          suggested_decision: "edit",
          risk_notes: ["semantic_review:reject", "semantic_score:0.45", "semantic_reason:Low quality, insufficient evidence"],
        },
        guards: [{ id: "path", ok: true, message: "allowed" }],
        created_at: "2026-05-26T10:00:00.000Z",
      }),
      "utf8",
    );

    await buildWikiSite(root);

    const review = await readFile(join(root, "dist/review.html"), "utf8");
    assert.ok(review.includes("Semantic review"), "expected 'Semantic review' in review.html");
    assert.ok(review.includes("reject"), "expected 'reject' decision in review.html");
    assert.ok(review.includes("0.45"), "expected semantic score '0.45' in review.html");
    assert.ok(review.includes("Low quality, insufficient evidence"), "expected semantic reason in review.html");

    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Semantic review"), "expected 'Semantic review' in index.html");
    assert.ok(index.includes("reject"), "expected 'reject' decision in index.html");
    assert.ok(index.includes("0.45"), "expected semantic score '0.45' in index.html");
    assert.ok(index.includes("Low quality, insufficient evidence"), "expected semantic reason in index.html");
  });

  it("renders semantic review counts in dashboard when daily report has semantic_review data", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-semantic-counts-"));
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
      join(root, ".praxisbase/reports/daily/daily_semantic.json"),
      JSON.stringify({
        id: "daily_semantic",
        protocol_version: "0.1",
        type: "daily_experience_report",
        authority_mode: "personal-local",
        mode: "write",
        sources: [{ name: "codex", agent: "codex", channel: "local", source_type: "local", status: "completed", scanned: 5, fetched: 5, enveloped: 5, imported: 4, rejected: 0, human_required: 0, warnings: [] }],
        proposal_candidates: 3,
        quality_findings: 0,
        site_pages: 1,
        changed_stable_knowledge: false,
        semantic_review: {
          enabled: true,
          reviewed: 3,
          promote: 1,
          merge: 0,
          revise: 0,
          reject: 1,
          needs_human: 1,
          unavailable: 0,
        },
        outputs: [],
        warnings: [],
        created_at: "2026-05-26T12:00:00.000Z",
      }),
    );

    await buildWikiSite(root);

    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Semantic review"), "expected 'Semantic review' in dashboard");
    assert.ok(index.includes("3 reviewed"), "expected semantic reviewed count");
    assert.ok(index.includes("Semantic promote"), "expected 'Semantic promote' in dashboard");
    assert.match(index, /Semantic promote[\s\S]*?<strong>1<\/strong>/);
    assert.ok(index.includes("Semantic reject"), "expected 'Semantic reject' in dashboard");
    assert.ok(index.includes("Semantic needs human"), "expected 'Semantic needs human' in dashboard");
  });

  it("renders skill synthesis counts in dashboard when daily report has skill_synthesis data", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-skill-counts-"));
    await mkdir(join(root, ".praxisbase/reports/daily"), { recursive: true });
    await writeFile(join(root, ".praxisbase/reports/daily/daily_skill.json"), JSON.stringify({
      id: "daily_skill",
      protocol_version: "0.1",
      type: "daily_experience_report",
      authority_mode: "personal-local",
      mode: "write",
      sources: [],
      proposal_candidates: 0,
      quality_findings: 0,
      site_pages: 0,
      changed_stable_knowledge: false,
      skill_synthesis: {
        enabled: true,
        signals: 2,
        rejected_signals: 1,
        clusters: 1,
        candidates: 1,
        reviewed: 1,
        approved: 1,
        rejected: 0,
        needs_human: 0,
        skipped: 1,
        promoted: 0,
      },
      outputs: [],
      warnings: [],
      created_at: "2026-05-26T12:00:00.000Z",
    }), "utf8");

    await buildWikiSite(root);

    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Skill synthesis"));
    assert.match(index, /Skill candidates[\s\S]*?<strong>1<\/strong>/);
    assert.match(index, /Skill approved[\s\S]*?<strong>1<\/strong>/);
    assert.match(index, /Skill skipped[\s\S]*?<strong>1<\/strong>/);
    assert.match(index, /Skill rejected signals[\s\S]*?<strong>1<\/strong>/);
  });

  it("renders lifecycle and skill validation counts in dashboard when daily report includes governance summaries", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-governance-counts-"));
    await mkdir(join(root, ".praxisbase/reports/daily"), { recursive: true });
    await writeFile(join(root, ".praxisbase/reports/daily/daily_governance.json"), JSON.stringify({
      id: "daily_governance",
      protocol_version: "0.1",
      type: "daily_experience_report",
      authority_mode: "personal-local",
      mode: "write",
      sources: [],
      proposal_candidates: 0,
      quality_findings: 0,
      site_pages: 0,
      changed_stable_knowledge: false,
      lifecycle: { proposals_by_decision: { promote: 1, archive: 1 } },
      skill_validation: { total_reports: 3, by_decision: { pass: 1, fail: 1, needs_human: 1 }, candidates_without_passing: 2 },
      outputs: [],
      warnings: [],
      created_at: "2026-05-26T12:00:00.000Z",
    }), "utf8");

    await buildWikiSite(root);

    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.match(index, /Lifecycle proposals[\s\S]*?<strong>2<\/strong>/);
    assert.match(index, /Skill validation reports[\s\S]*?<strong>3<\/strong>/);
    assert.match(index, /Validation pass[\s\S]*?<strong>1<\/strong>/);
    assert.match(index, /Validation fail[\s\S]*?<strong>1<\/strong>/);
    assert.match(index, /Candidates needing validation[\s\S]*?<strong>2<\/strong>/);
  });

  it("renders skill synthesis candidates in the review queue", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-skill-candidates-"));
    await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });
    await writeFile(join(root, ".praxisbase/inbox/proposals/skill_candidate_1.json"), JSON.stringify({
      id: "skill_candidate_1",
      protocol_version: "0.1",
      type: "skill_synthesis_candidate",
      action: "skill_create",
      scope: "personal",
      target_path: "skills/openclaw/openclaw-memory-operations/SKILL.md",
      target_skill: "OpenClaw memory operations",
      title: "OpenClaw memory operations",
      summary: "Skill candidate synthesized from repeated stable signals.",
      body_markdown: "# OpenClaw memory operations\n\n## When To Use\nNeed to import OpenClaw memory.\n\n## Procedure\n1. Export memory JSON.\n\n## Verification\n- Test passed.\n\n## Pitfalls\n- Avoid raw logs.\n\n## Do Not Use When\n- One-off.\n\n## Related Wiki Pages\n- [[kb/procedures/openclaw-memory]]\n\n## Provenance\n- raw-vault://codex/session-1",
      source_refs: ["raw-vault://codex/session-1", "raw-vault://codex/session-2"],
      source_hashes: ["sha256:1", "sha256:2"],
      evidence_ids: ["sha256:e1", "sha256:e2"],
      source_count: 2,
      confidence: 0.91,
      ladder_choice: "skill_create",
      existing_skill_path: null,
      related_wiki_paths: ["kb/procedures/openclaw-memory"],
      review_hint: {
        suggested_decision: "approve",
        risk_notes: ["semantic_skill_review:approve_candidate", "semantic_skill_score:0.91", "semantic_skill_reason:Durable class-level skill."],
      },
      created_at: "2026-05-26T00:00:00.000Z",
    }), "utf8");

    await buildWikiSite(root);

    const review = await readFile(join(root, "dist/review.html"), "utf8");
    assert.ok(review.includes("OpenClaw memory operations"));
    assert.ok(review.includes("skill_create"));
    assert.ok(review.includes("0.91"));
    assert.ok(review.includes("praxisbase skill review --json"));
    assert.ok(review.includes("validation needed"));
  });

  it("separates latest daily privacy blockers from historical privacy backlog", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-privacy-backlog-"));
    await mkdir(join(root, ".praxisbase/reports/daily"), { recursive: true });
    await mkdir(join(root, ".praxisbase/reports/privacy-triage"), { recursive: true });
    await mkdir(join(root, ".praxisbase/exceptions/human-required"), { recursive: true });

    await writeFile(join(root, ".praxisbase/reports/daily/daily_privacy.json"), JSON.stringify({
      id: "daily_privacy",
      protocol_version: "0.1",
      type: "daily_experience_report",
      authority_mode: "personal-local",
      mode: "write",
      sources: [
        { name: "remote-openclaw", source_type: "openclaw", status: "partial", imported: 1, rejected: 0, human_required: 28, warnings: [] },
      ],
      proposal_candidates: 0,
      quality_findings: 0,
      site_pages: 0,
      changed_stable_knowledge: false,
      ai_distill: { privacy_required: 8, review_required: 0, rejected_low_signal: 0, rejected_quality: 0 },
      outputs: [],
      warnings: [],
      created_at: "2026-05-28T12:00:00.000Z",
    }), "utf8");

    await writeFile(join(root, ".praxisbase/reports/privacy-triage/privacy.json"), JSON.stringify({
      id: "privacy",
      protocol_version: "0.1",
      type: "privacy_triage_report",
      authority_mode: "personal-local",
      mode: "write",
      ai: { configured: true, provider: "openai-compatible", model: "test" },
      items: [],
      summary: {
        scanned: 5,
        skipped_already_triaged: 299,
        skipped_non_privacy: 780,
        auto_released: 0,
        keep_human_required: 5,
        team_review_only: 0,
      },
      changed_stable_knowledge: false,
      outputs: [],
      warnings: [],
      created_at: "2026-05-28T12:01:00.000Z",
    }), "utf8");

    for (let index = 0; index < 55; index += 1) {
      await writeFile(join(root, `.praxisbase/exceptions/human-required/privacy-${index}.json`), JSON.stringify({
        id: `privacy-${index}`,
        protocol_version: "0.1",
        type: "exception_record",
        category: "human_required",
        source_id: `source-${index}`,
        reason: "Experience privacy verdict human_required: private_material_detected",
        details: {
          agent: "openclaw",
          scope_hint: "personal",
          source_ref: `openclaw-ssh://host/memory/${index}.md`,
          redacted_summary: `Remote personal repair summary ${index}`,
          triage: { classification: "safe_personal_experience", decision: "keep_human_required", confidence: 0.9, rationale: "remote source requires review", suggested_redactions: [] },
        },
        created_at: `2026-05-28T11:${String(index).padStart(2, "0")}:00.000Z`,
      }), "utf8");
    }

    await buildWikiSite(root);

    const review = await readFile(join(root, "dist/review.html"), "utf8");
    assert.ok(review.includes("Current privacy"));
    assert.match(review, /Current privacy[\s\S]*?<strong>28<\/strong>/);
    assert.ok(review.includes("Privacy backlog"));
    assert.match(review, /Privacy backlog[\s\S]*?<strong>55<\/strong>/);
    assert.ok(review.includes("Latest daily blocked 28 item(s); historical backlog has 55 record(s)."));
    assert.ok(review.includes("Showing the latest 50 privacy records."));
    assert.ok(review.includes("Skipped already triaged"));
    assert.ok(review.includes("praxisbase privacy triage --mode personal --auto-release --progress --json"));
  });

  it("renders runtime context health without raw private facet evidence or sidecar bodies", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-runtime-context-"));
    await mkdir(join(root, ".praxisbase/reports/agent-bundles"), { recursive: true });
    await mkdir(join(root, ".praxisbase/personal"), { recursive: true });

    await writeFile(join(root, ".praxisbase/reports/agent-bundles/bundle.json"), JSON.stringify({
      id: "bundle",
      protocol_version: "0.1",
      type: "agent_context_bundle",
      mode: "personal",
      query: "OpenClaw auth",
      total_bytes: 1200,
      budget_bytes: 24576,
      sections: [],
      skill_decisions: [
        { skill_id: "openclaw-auth", decision: "matched", reason: "matched tags", injected_bytes: 512, truncated: false, scope: "personal", authority: "pb_stable" },
        { skill_id: "draft-skill", decision: "skipped", reason: "skill is not promoted", injected_bytes: 0, truncated: false, scope: "personal", authority: "pb_candidate" },
      ],
      trust_summary: { pb_stable: 1, gbrain_sidecar: 1 },
      omitted_item_count: 1,
      warnings: [],
      created_at: "2026-05-28T12:00:00.000Z",
    }), "utf8");
    await writeFile(join(root, ".praxisbase/personal/facets.jsonl"), `${JSON.stringify({
      id: "facet-style",
      facet_class: "style",
      key: "verbosity",
      value: "secret private facet evidence should not render",
      state: "active",
      stability: 0.9,
      evidence_count: 2,
      evidence_refs: ["raw-vault://private"],
      first_seen: "2026-05-28T00:00:00.000Z",
      last_seen: "2026-05-28T00:00:00.000Z",
      user_override: "none",
    })}\n`, "utf8");

    await buildWikiSite(root);

    const index = await readFile(join(root, "dist/index.html"), "utf8");
    assert.ok(index.includes("Runtime Context"));
    assert.ok(index.includes("pb_stable:1"));
    assert.ok(index.includes("gbrain_sidecar:1"));
    assert.ok(index.includes("draft-skill: skill is not promoted"));
    assert.ok(index.includes("Personal active"));
    assert.doesNotMatch(index, /secret private facet evidence/);
    assert.doesNotMatch(index, /raw-vault:\/\/private/);
  });
});
