import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import matter from "gray-matter";
import { protocolPaths } from "../protocol/paths.js";
import { PersonalReleaseAuditReportSchema } from "../protocol/schemas.js";

export type PersonalReleaseGateStatus = "pass" | "fail" | "warning" | "not_run";

export interface PersonalReleaseAuditGate {
  status: PersonalReleaseGateStatus;
  blockers: string[];
  warnings: string[];
  evidence_reports: string[];
  next_commands: string[];
}

export interface PersonalReleaseAuditInput {
  now?: string;
  latestDailyReportPath?: string;
  dailyReport?: Record<string, unknown>;
  promotedSkillPaths?: string[];
  gbrainRetrieval?: {
    available: boolean;
    source_id?: string;
    query?: string;
    hits?: number;
    report_ref?: string;
  };
}

export interface PersonalReleaseAuditReport {
  type: "personal_release_audit_report";
  ok: boolean;
  personal_ga: PersonalReleaseGateStatus;
  wiki_context_ga: PersonalReleaseGateStatus;
  skill_compiler_ga: PersonalReleaseGateStatus;
  gbrain_runtime_ga: PersonalReleaseGateStatus;
  gates: {
    wiki_context_ga: PersonalReleaseAuditGate;
    skill_compiler_ga: PersonalReleaseAuditGate;
    gbrain_runtime_ga: PersonalReleaseAuditGate;
  };
  blocking_reasons: string[];
  warnings: string[];
  evidence_reports: string[];
  next_commands: string[];
  latest_daily_report?: string;
  promoted_skills: string[];
  generated_at: string;
}

interface LatestJsonReport {
  path: string;
  value: Record<string, unknown>;
  sortKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function personalGaFromDaily(dailyReport?: Record<string, unknown>): Record<string, unknown> | undefined {
  const value = dailyReport?.personal_ga;
  return isRecord(value) ? value : undefined;
}

function gate(
  status: PersonalReleaseGateStatus,
  blockers: string[],
  warnings: string[],
  evidenceReports: string[],
  nextCommands: string[],
): PersonalReleaseAuditGate {
  return {
    status,
    blockers: Array.from(new Set(blockers)).sort(),
    warnings: Array.from(new Set(warnings)).sort(),
    evidence_reports: Array.from(new Set(evidenceReports)).sort(),
    next_commands: Array.from(new Set(nextCommands)),
  };
}

function buildWikiContextGate(input: PersonalReleaseAuditInput): PersonalReleaseAuditGate {
  const personalGa = personalGaFromDaily(input.dailyReport);
  const evidence = input.latestDailyReportPath ? [input.latestDailyReportPath] : [];
  if (!input.dailyReport) {
    return gate("not_run", ["daily_report_missing"], [], evidence, ["praxisbase personal run --json"]);
  }
  if (!personalGa) {
    return gate("fail", ["personal_ga_report_missing"], [], evidence, ["praxisbase personal run --json"]);
  }

  const blockers = stringArray(personalGa.blocking_reasons);
  const warnings = stringArray(personalGa.warnings);
  const productionReady = personalGa.production_ready === true;
  const queue = isRecord(personalGa.queue) ? personalGa.queue : undefined;
  if (!queue) {
    blockers.push("personal_queue_report_missing");
  } else {
    if (queue.full_run !== true) blockers.push("personal_queue_bounded_smoke");
    const remainingHighPriority = numberValue(queue.remaining_high_priority_items);
    if (remainingHighPriority > 0) blockers.push(`high_priority_queue_remaining:${remainingHighPriority}`);
  }
  if (!productionReady && blockers.length === 0) blockers.push("pb_wiki_context_not_ready");
  return gate(
    productionReady && blockers.length === 0 ? "pass" : "fail",
    blockers,
    warnings,
    evidence,
    productionReady && blockers.length === 0 ? [] : ["praxisbase personal run --json"],
  );
}

function buildSkillCompilerGate(input: PersonalReleaseAuditInput): PersonalReleaseAuditGate {
  const daily = input.dailyReport;
  const skillSynthesis = isRecord(daily?.skill_synthesis) ? daily.skill_synthesis : undefined;
  const skillValidation = isRecord(daily?.skill_validation) ? daily.skill_validation : undefined;
  const promotedFromReport = numberValue(skillSynthesis?.promoted);
  const promotedSkillPaths = input.promotedSkillPaths ?? [];
  const evidence = [
    ...(input.latestDailyReportPath ? [input.latestDailyReportPath] : []),
    ...promotedSkillPaths,
  ];

  const hasPromotedSkill = promotedSkillPaths.length > 0;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!skillSynthesis) {
    blockers.push("skill_synthesis_report_missing");
  }
  if (promotedSkillPaths.length === 0) {
    blockers.push("no_promoted_injectable_skill");
  }
  if (promotedSkillPaths.length > 0 && promotedFromReport === 0) {
    warnings.push("skill_synthesis_promoted_count_stale");
  }
  const candidatesWithoutPassing = numberValue(skillValidation?.candidates_without_passing);
  if (candidatesWithoutPassing > 0) warnings.push(`skill_candidates_without_passing_validation:${candidatesWithoutPassing}`);
  const needsHuman = numberValue(skillSynthesis?.needs_human);
  if (needsHuman > 0) warnings.push(`skill_candidates_need_human_review:${needsHuman}`);

  return gate(
    hasPromotedSkill ? "pass" : "fail",
    blockers,
    warnings,
    evidence,
    hasPromotedSkill
      ? []
      : [
        "praxisbase skill synthesize --mode personal --review --json",
        "praxisbase skill review --mode personal --json",
        "praxisbase skill inject-preview --query \"openclaw dispatch routing failure\" --json",
      ],
  );
}

function buildGBrainRuntimeGate(input: PersonalReleaseAuditInput): PersonalReleaseAuditGate {
  const gbrain = isRecord(input.dailyReport?.brain_backends)
    && isRecord(input.dailyReport.brain_backends.gbrain)
    ? input.dailyReport.brain_backends.gbrain
    : undefined;
  const evidence = [
    ...(input.latestDailyReportPath ? [input.latestDailyReportPath] : []),
    ...(input.gbrainRetrieval?.report_ref ? [input.gbrainRetrieval.report_ref] : []),
  ];
  const blockers: string[] = [];
  const warnings = [
    ...stringArray(gbrain?.warnings),
    ...stringArray(gbrain?.errors).map((error) => `gbrain_error:${error}`),
  ];

  if (!gbrain || gbrain.enabled !== true) {
    blockers.push("gbrain_publish_missing");
  } else {
    const publishStatus = typeof gbrain.publish_status === "string" ? gbrain.publish_status : "not_requested";
    if (publishStatus !== "completed" && publishStatus !== "partial") {
      blockers.push(publishStatus === "not_requested" ? "gbrain_publish_missing" : `gbrain_publish_${publishStatus}`);
    }
    if (numberValue(gbrain.exported) === 0) blockers.push("gbrain_export_empty");
    if (gbrain.doctor_status === "failed") blockers.push("gbrain_doctor_failed");
  }
  if (input.gbrainRetrieval?.available !== true) blockers.push("gbrain_retrieval_missing");

  return gate(
    blockers.length === 0 ? "pass" : "fail",
    blockers,
    warnings,
    evidence,
    blockers.length === 0
      ? []
      : [
        "praxisbase gbrain export --mode personal --write --json",
        "praxisbase context get --agent codex --stage repair --query \"openclaw dispatch routing failure\" --with-gbrain --json",
      ],
  );
}

function aggregatePersonalGaStatus(gates: PersonalReleaseAuditReport["gates"]): PersonalReleaseGateStatus {
  const statuses = Object.values(gates).map((item) => item.status);
  if (statuses.every((status) => status === "pass")) return "pass";
  if (statuses.some((status) => status === "fail" || status === "not_run")) return "fail";
  return "warning";
}

export function buildPersonalReleaseAuditReport(input: PersonalReleaseAuditInput): PersonalReleaseAuditReport {
  const wiki = buildWikiContextGate(input);
  const skill = buildSkillCompilerGate(input);
  const gbrain = buildGBrainRuntimeGate(input);
  const gates = {
    wiki_context_ga: wiki,
    skill_compiler_ga: skill,
    gbrain_runtime_ga: gbrain,
  };
  const personalGa = aggregatePersonalGaStatus(gates);
  const blockingReasons = Array.from(new Set(Object.values(gates).flatMap((item) => item.blockers))).sort();
  const warnings = Array.from(new Set(Object.values(gates).flatMap((item) => item.warnings))).sort();
  const evidenceReports = Array.from(new Set(Object.values(gates).flatMap((item) => item.evidence_reports))).sort();
  const nextCommands = Array.from(new Set(Object.values(gates).flatMap((item) => item.next_commands)));

  return PersonalReleaseAuditReportSchema.parse({
    type: "personal_release_audit_report",
    ok: personalGa === "pass",
    personal_ga: personalGa,
    wiki_context_ga: wiki.status,
    skill_compiler_ga: skill.status,
    gbrain_runtime_ga: gbrain.status,
    gates,
    blocking_reasons: blockingReasons,
    warnings,
    evidence_reports: evidenceReports,
    next_commands: nextCommands,
    latest_daily_report: input.latestDailyReportPath,
    promoted_skills: (input.promotedSkillPaths ?? []).sort(),
    generated_at: input.now ?? new Date().toISOString(),
  }) as PersonalReleaseAuditReport;
}

async function collectJsonFiles(root: string, relativeDir: string): Promise<string[]> {
  const absoluteDir = join(root, relativeDir);
  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await collectJsonFiles(root, relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

async function latestJsonReport(root: string, relativeDir: string): Promise<LatestJsonReport | undefined> {
  const candidates: LatestJsonReport[] = [];
  for (const path of await collectJsonFiles(root, relativeDir)) {
    try {
      const raw = JSON.parse(await readFile(join(root, path), "utf8")) as unknown;
      if (!isRecord(raw)) continue;
      const stats = await stat(join(root, path));
      const created = typeof raw.created_at === "string" ? raw.created_at : undefined;
      candidates.push({
        path,
        value: raw,
        sortKey: `${created ?? stats.mtime.toISOString()}|${path}`,
      });
    } catch {
      continue;
    }
  }
  return candidates.sort((a, b) => b.sortKey.localeCompare(a.sortKey))[0];
}

async function listFiles(root: string, relativeDir: string): Promise<string[]> {
  const absoluteDir = join(root, relativeDir);
  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await listFiles(root, relativePath));
    else if (entry.isFile()) files.push(relative(root, join(root, relativePath)).replace(/\\/g, "/"));
  }
  return files.sort();
}

async function listPromotedPraxisBaseSkills(root: string): Promise<string[]> {
  const skills: string[] = [];
  for (const path of await listFiles(root, "skills")) {
    if (!path.endsWith("/SKILL.md")) continue;
    try {
      const parsed = matter(await readFile(join(root, path), "utf8"));
      if (parsed.data.origin === "praxisbase_synthesized" && parsed.data.status === "promoted") {
        skills.push(path);
      }
    } catch {
      continue;
    }
  }
  return skills.sort();
}

async function latestGBrainContextEvidence(root: string): Promise<PersonalReleaseAuditInput["gbrainRetrieval"]> {
  const latest = await latestJsonReport(root, protocolPaths.reportsContext);
  if (!latest) return { available: false, source_id: "praxisbase" };
  const items = Array.isArray(latest.value.items) ? latest.value.items : [];
  const hits = items.filter((item) =>
    isRecord(item) &&
    (item.source_rank === "gbrain_sidecar" || (typeof item.path === "string" && item.path.startsWith("gbrain://")))
  ).length;
  return {
    available: hits > 0,
    source_id: "praxisbase",
    hits,
    query: typeof latest.value.query === "string" ? latest.value.query : undefined,
    report_ref: latest.path,
  };
}

export async function readPersonalReleaseAuditReport(
  root: string,
  options: { now?: string } = {},
): Promise<PersonalReleaseAuditReport> {
  const latestDaily = await latestJsonReport(root, protocolPaths.reportsDaily);
  return buildPersonalReleaseAuditReport({
    now: options.now,
    latestDailyReportPath: latestDaily?.path,
    dailyReport: latestDaily?.value,
    promotedSkillPaths: await listPromotedPraxisBaseSkills(root),
    gbrainRetrieval: await latestGBrainContextEvidence(root),
  });
}
