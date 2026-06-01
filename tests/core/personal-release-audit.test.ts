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
