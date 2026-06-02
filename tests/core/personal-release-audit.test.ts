import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildPersonalReleaseAuditReport,
  readPersonalReleaseAuditReport,
  type PersonalReleaseAuditInput,
} from "@praxisbase/core";

function baseInput(overrides: Partial<PersonalReleaseAuditInput> = {}): PersonalReleaseAuditInput {
  return {
    now: "2026-06-01T00:00:00.000Z",
    latestDailyReportPath: ".praxisbase/reports/daily/daily-good.json",
    dailyReport: {
      id: "daily-good",
      personal_ga: {
        type: "personal_ga_report",
        mode: "production_ai",
        production_ready: true,
        queue: {
          type: "personal_queue_report",
          run_kind: "full",
          full_run: true,
          bounded_smoke: false,
          planned_source_items: 4,
          selected_spans: 4,
          processed_spans: 4,
          cache_hits: 2,
          uncached_ai_calls: 0,
          skipped_low_priority_items: 0,
          remaining_high_priority_items: 0,
          resume_state: "complete",
          high_priority_sources: [{
            role: "local_openclaw",
            source_name: "local-openclaw-memory",
            agent: "openclaw",
            configured: true,
            planned_items: 2,
            processed_items: 2,
            remaining_high_priority_items: 0,
            blocking: false,
          }],
        },
        blocking_reasons: [],
        warnings: [],
        source_coverage: [{ agent: "openclaw", source_kind: "memory_file", configured: true, available: true, items: 2 }],
        lesson_count: 2,
        disposition_count: 2,
        golden_validation: { matched: 0, required: 0, missed: [] },
        leakage_scan: { passed: true, findings: [] },
        cache: { hits: 2, misses: 0, writes: 0 },
        html: { index: "dist/index.html", review: "dist/review.html" },
        agent_consumption: [{ surface: "pb_context", available: true, authority: ["stable_pb_page", "active_personal_lesson"] }],
        dispositions: [{
          lesson_id: "lesson-1",
          state: "active_personal",
          decision: "active_personal_context",
          reason: "usable personal context",
          source_refs: ["source://openclaw/MEMORY.md"],
          source_hashes: ["sha256:lesson-1"],
          privacy_tier: "personal_only",
          portability: "agent_family",
          applies_to_agents: ["openclaw", "codex"],
          applies_to_systems: ["openclaw"],
        }],
      },
      skill_synthesis: {
        enabled: true,
        signals: 4,
        rejected_signals: 0,
        clusters: 1,
        candidates: 1,
        reviewed: 1,
        approved: 0,
        rejected: 0,
        needs_human: 1,
        skipped: 0,
        promoted: 0,
      },
      skill_validation: {
        total_reports: 0,
        by_decision: {},
        candidates_without_passing: 1,
      },
      brain_backends: {},
    },
    promotedSkillPaths: [],
    gbrainRetrieval: { available: false, source_id: "praxisbase" },
    ...overrides,
  };
}

test("release audit separates PB wiki/context readiness from final personal GA", () => {
  const report = buildPersonalReleaseAuditReport(baseInput());

  assert.equal(report.wiki_context_ga, "pass");
  assert.equal(report.skill_compiler_ga, "fail");
  assert.equal(report.gbrain_runtime_ga, "fail");
  assert.equal(report.personal_ga, "fail");
  assert.equal(report.ok, false);
  assert.ok(report.blocking_reasons.includes("no_promoted_injectable_skill"));
  assert.ok(report.blocking_reasons.includes("gbrain_publish_missing"));
  assert.ok(report.evidence_reports.includes(".praxisbase/reports/daily/daily-good.json"));
  assert.ok(report.next_commands.includes("praxisbase skill synthesize --mode personal --review --json"));
});

test("release audit blocks Gate 1 when old PB readiness lacks full queue evidence", () => {
  const dailyReport = baseInput().dailyReport as Record<string, unknown>;
  const personalGa = { ...(dailyReport.personal_ga as Record<string, unknown>) };
  delete personalGa.queue;
  const report = buildPersonalReleaseAuditReport(baseInput({
    dailyReport: {
      ...dailyReport,
      personal_ga: personalGa,
    },
  }));

  assert.equal(report.wiki_context_ga, "fail");
  assert.ok(report.blocking_reasons.includes("personal_queue_report_missing"));
});

test("release audit treats resumable backlog as a warning when personal PB context is production-ready", () => {
  const dailyReport = baseInput().dailyReport as Record<string, unknown>;
  const personalGa = { ...(dailyReport.personal_ga as Record<string, unknown>) };
  personalGa.queue = {
    ...((personalGa.queue as Record<string, unknown>)),
    run_kind: "bounded_smoke",
    full_run: false,
    bounded_smoke: true,
    remaining_high_priority_items: 2,
    resume_state: "resumable",
  };
  const report = buildPersonalReleaseAuditReport(baseInput({
    dailyReport: {
      ...dailyReport,
      personal_ga: personalGa,
    },
  }));

  assert.equal(report.wiki_context_ga, "pass");
  assert.equal(report.blocking_reasons.includes("personal_queue_bounded_smoke"), false);
  assert.equal(report.blocking_reasons.includes("high_priority_queue_remaining:2"), false);
  assert.ok(report.warnings.includes("personal_queue_resumable_backlog:2"));
  assert.equal(report.next_commands.includes("praxisbase personal run --json"), false);
});

test("release audit passes only when all personal GA gates pass", () => {
  const report = buildPersonalReleaseAuditReport(baseInput({
    promotedSkillPaths: ["skills/openclaw/openclaw-dispatch-routing/SKILL.md"],
    gbrainRetrieval: {
      available: true,
      source_id: "praxisbase",
      query: "openclaw dispatch routing failure",
      hits: 1,
    },
    dailyReport: {
      ...(baseInput().dailyReport as Record<string, unknown>),
      skill_synthesis: {
        ...((baseInput().dailyReport as Record<string, unknown>).skill_synthesis as Record<string, unknown>),
        approved: 1,
        needs_human: 0,
        promoted: 1,
      },
      skill_validation: {
        total_reports: 1,
        by_decision: { pass: 1 },
        candidates_without_passing: 0,
      },
      brain_backends: {
        gbrain: {
          enabled: true,
          doctor_status: "ok",
          publish_status: "completed",
          pages: 3,
          exported: 3,
          skipped: 0,
          imported: 0,
          warnings: [],
          errors: [],
        },
      },
    },
  }));

  assert.equal(report.wiki_context_ga, "pass");
  assert.equal(report.skill_compiler_ga, "pass");
  assert.equal(report.gbrain_runtime_ga, "pass");
  assert.equal(report.personal_ga, "pass");
  assert.equal(report.ok, true);
  assert.deepEqual(report.blocking_reasons, []);
  assert.deepEqual(report.next_commands, []);
});

test("release audit accepts external GBrain export evidence when latest daily skipped publish because stable knowledge did not change", () => {
  const dailyReport = baseInput().dailyReport as Record<string, unknown>;
  const report = buildPersonalReleaseAuditReport(baseInput({
    promotedSkillPaths: ["skills/openclaw/openclaw-dispatch-routing/SKILL.md"],
    dailyReport: {
      ...dailyReport,
      skill_synthesis: {
        ...(dailyReport.skill_synthesis as Record<string, unknown>),
        approved: 1,
        needs_human: 0,
        promoted: 0,
      },
      skill_validation: {
        total_reports: 1,
        by_decision: { pass: 1 },
        candidates_without_passing: 0,
      },
      brain_backends: {
        gbrain: {
          enabled: true,
          doctor_status: "unknown",
          publish_status: "skipped",
          pages: 0,
          exported: 0,
          skipped: 0,
          imported: 0,
          warnings: ["gbrain_publish_skipped:no_stable_changes"],
          errors: [],
        },
      },
    },
    gbrainPublish: {
      available: true,
      ok: true,
      exported: 14,
      skipped: 0,
      errors: [],
      warnings: [],
      report_ref: ".praxisbase/reports/gbrain-export/gbrain-export_latest.json",
    },
    gbrainRetrieval: {
      available: true,
      source_id: "praxisbase",
      query: "openclaw dispatch routing failure",
      hits: 2,
      report_ref: ".praxisbase/reports/context/context_latest.json",
    },
  }));

  assert.equal(report.gbrain_runtime_ga, "pass");
  assert.equal(report.personal_ga, "pass");
  assert.equal(report.blocking_reasons.includes("gbrain_publish_skipped"), false);
  assert.equal(report.blocking_reasons.includes("gbrain_export_empty"), false);
  assert.ok(report.warnings.includes("gbrain_publish_skipped:no_stable_changes"));
});

test("release audit treats stable promoted PB skills as skill gate authority across daily runs", () => {
  const report = buildPersonalReleaseAuditReport(baseInput({
    promotedSkillPaths: ["skills/openclaw/openclaw-dispatch-routing/SKILL.md"],
  }));

  assert.equal(report.wiki_context_ga, "pass");
  assert.equal(report.skill_compiler_ga, "pass");
  assert.equal(report.gbrain_runtime_ga, "fail");
  assert.equal(report.personal_ga, "fail");
  assert.ok(report.warnings.includes("skill_synthesis_promoted_count_stale"));
  assert.equal(report.blocking_reasons.includes("no_promoted_injectable_skill"), false);
});

test("release audit reads the newest daily report and promoted PraxisBase skills", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-release-audit-"));
  await mkdir(join(root, ".praxisbase/reports/daily"), { recursive: true });
  await writeFile(join(root, ".praxisbase/reports/daily/old.json"), JSON.stringify({
    id: "old",
    created_at: "2026-05-31T00:00:00.000Z",
    personal_ga: { production_ready: false, blocking_reasons: ["old"] },
  }), "utf8");
  await writeFile(join(root, ".praxisbase/reports/daily/new.json"), JSON.stringify({
    ...baseInput({
      dailyReport: {
        ...(baseInput().dailyReport as Record<string, unknown>),
        id: "new",
        created_at: "2026-06-01T00:00:00.000Z",
        skill_synthesis: {
          ...((baseInput().dailyReport as Record<string, unknown>).skill_synthesis as Record<string, unknown>),
          promoted: 1,
          approved: 1,
          needs_human: 0,
        },
      },
    }).dailyReport,
  }), "utf8");
  await mkdir(join(root, "skills/openclaw/openclaw-dispatch-routing"), { recursive: true });
  await writeFile(join(root, "skills/openclaw/openclaw-dispatch-routing/SKILL.md"), [
    "---",
    "name: OpenClaw Dispatch Routing",
    "origin: praxisbase_synthesized",
    "status: promoted",
    "scope: personal",
    "---",
    "# OpenClaw Dispatch Routing",
    "",
    "## When To Use",
    "Use when OpenClaw dispatch routing fails.",
    "",
    "## Procedure",
    "- Confirm dispatch evidence before reporting success.",
    "",
    "## Provenance",
    "- PB synthesized",
  ].join("\n"), "utf8");

  const report = await readPersonalReleaseAuditReport(root, { now: "2026-06-01T01:00:00.000Z" });

  assert.equal(report.latest_daily_report, ".praxisbase/reports/daily/new.json");
  assert.equal(report.wiki_context_ga, "pass");
  assert.equal(report.skill_compiler_ga, "pass");
  assert.equal(report.gbrain_runtime_ga, "fail");
  assert.deepEqual(report.promoted_skills, ["skills/openclaw/openclaw-dispatch-routing/SKILL.md"]);
});

test("release audit accepts standalone GBrain export and retrieval evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-release-audit-gbrain-standalone-"));
  await mkdir(join(root, ".praxisbase/reports/daily"), { recursive: true });
  await mkdir(join(root, ".praxisbase/reports/context"), { recursive: true });
  await mkdir(join(root, ".praxisbase/reports/gbrain-export"), { recursive: true });
  await writeFile(join(root, ".praxisbase/reports/daily/new.json"), JSON.stringify({
    ...baseInput({
      dailyReport: {
        ...(baseInput().dailyReport as Record<string, unknown>),
        id: "new",
        created_at: "2026-06-01T00:00:00.000Z",
        skill_synthesis: {
          ...((baseInput().dailyReport as Record<string, unknown>).skill_synthesis as Record<string, unknown>),
          promoted: 1,
          approved: 1,
          needs_human: 0,
        },
      },
    }).dailyReport,
  }), "utf8");
  await writeFile(join(root, ".praxisbase/reports/context/context.json"), JSON.stringify({
    id: "context",
    created_at: "2026-06-01T00:10:00.000Z",
    query: "openclaw dispatch routing failure",
    items: [{
      path: "gbrain://query/praxisbase%2Fkb%2Fknown-fixes%2Fopenclaw-dispatch-routing-failures",
      source_rank: "gbrain_sidecar",
      summary: "OpenClaw dispatch routing failures",
    }],
  }), "utf8");
  await writeFile(join(root, ".praxisbase/reports/gbrain-export/gbrain-export.json"), JSON.stringify({
    type: "gbrain_export_report",
    created_at: "2026-06-01T00:05:00.000Z",
    ok: true,
    mode: "personal",
    source_id: "praxisbase",
    pages: 1,
    exported: 1,
    skipped: 0,
    skills_exported: 1,
    catalog_exported: 1,
    errors: [],
    warnings: [],
  }), "utf8");
  await mkdir(join(root, "skills/openclaw/openclaw-dispatch-routing"), { recursive: true });
  await writeFile(join(root, "skills/openclaw/openclaw-dispatch-routing/SKILL.md"), [
    "---",
    "name: OpenClaw Dispatch Routing",
    "origin: praxisbase_synthesized",
    "status: promoted",
    "scope: personal",
    "---",
    "# OpenClaw Dispatch Routing",
    "",
    "## When To Use",
    "Use when OpenClaw dispatch routing fails.",
    "",
    "## Procedure",
    "- Confirm dispatch evidence before reporting success.",
  ].join("\n"), "utf8");

  const report = await readPersonalReleaseAuditReport(root, { now: "2026-06-01T01:00:00.000Z" });

  assert.equal(report.gbrain_runtime_ga, "pass");
  assert.equal(report.personal_ga, "pass");
  assert.equal(report.ok, true);
  assert.ok(report.evidence_reports.includes(".praxisbase/reports/gbrain-export/gbrain-export.json"));
});

test("release audit requires a promoted PraxisBase skill to be injectable", async () => {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-release-audit-noninjectable-skill-"));
  await mkdir(join(root, ".praxisbase/reports/daily"), { recursive: true });
  await writeFile(join(root, ".praxisbase/reports/daily/new.json"), JSON.stringify({
    ...baseInput({
      dailyReport: {
        ...(baseInput().dailyReport as Record<string, unknown>),
        id: "new",
        created_at: "2026-06-01T00:00:00.000Z",
        skill_synthesis: {
          ...((baseInput().dailyReport as Record<string, unknown>).skill_synthesis as Record<string, unknown>),
          promoted: 1,
          approved: 1,
          needs_human: 0,
        },
      },
    }).dailyReport,
  }), "utf8");
  await mkdir(join(root, "skills/misc/unmatched"), { recursive: true });
  await writeFile(join(root, "skills/misc/unmatched/SKILL.md"), [
    "---",
    "name: Unmatched",
    "origin: praxisbase_synthesized",
    "status: promoted",
    "scope: personal",
    "---",
    "# Unmatched",
    "",
    "## When To Use",
    "Use when preparing unrelated spreadsheet macros.",
    "",
    "## Procedure",
    "- This should not match the personal agent experience audit query.",
    "",
    "## Provenance",
    "- PB synthesized",
  ].join("\n"), "utf8");

  const report = await readPersonalReleaseAuditReport(root, { now: "2026-06-01T01:00:00.000Z" });

  assert.equal(report.skill_compiler_ga, "fail");
  assert.ok(report.blocking_reasons.includes("no_promoted_injectable_skill"));
  assert.deepEqual(report.promoted_skills, []);
});
