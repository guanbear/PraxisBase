export type PersonalGaMode = "production_ai" | "degraded_no_ai" | "budget_exhausted";

export interface PersonalGaSourceCoverage {
  agent: string;
  source_kind: string;
  configured: boolean;
  available: boolean;
  items: number;
  content_spans?: number;
  origin?: string;
  trust?: string;
  privacy_scope?: string;
  blocking?: boolean;
}

export interface PersonalGaLessonRef {
  lesson_id: string;
}

export interface PersonalGaDispositionRef {
  lesson_id: string;
  decision?: string;
  blocking_reason?: string;
  privacy_tier?: string;
}

export interface PersonalGaReportInput {
  mode: PersonalGaMode;
  sourceCoverage: PersonalGaSourceCoverage[];
  lessons: PersonalGaLessonRef[];
  dispositions: PersonalGaDispositionRef[];
  goldenValidation: { matched: number; required: number; missed: string[] };
  leakageScan: { passed: boolean; findings: string[] };
  cache: { hits: number; misses: number; writes: number };
  html: { index?: string; review?: string };
  agentConsumption: Array<{ surface: string; available: boolean; authority: string[] }>;
}

export interface PersonalGaReport {
  type: "personal_ga_report";
  mode: PersonalGaMode;
  source_coverage: PersonalGaSourceCoverage[];
  lesson_count: number;
  disposition_count: number;
  golden_validation: { matched: number; required: number; missed: string[] };
  leakage_scan: { passed: boolean; findings: string[] };
  cache: { hits: number; misses: number; writes: number };
  html: { index?: string; review?: string };
  agent_consumption: Array<{ surface: string; available: boolean; authority: string[] }>;
  dispositions: PersonalGaDispositionRef[];
  production_ready: boolean;
  blocking_reasons: string[];
  warnings: string[];
}

function isOptionalSidecarSource(source: PersonalGaSourceCoverage): boolean {
  return source.agent === "agentmemory" || source.agent === "gbrain" || source.source_kind === "sidecar_import" || source.trust === "sidecar";
}

function hasUsablePbOutput(dispositions: PersonalGaDispositionRef[]): boolean {
  return dispositions.some((disposition) =>
    disposition.decision === "promoted_to_wiki" ||
    disposition.decision === "merged_into_existing_page" ||
    disposition.decision === "promoted_to_skill" ||
    disposition.decision === "active_personal_context",
  );
}

function hasPbContext(agentConsumption: PersonalGaReportInput["agentConsumption"]): boolean {
  return agentConsumption.some((surface) => surface.surface === "pb_context" && surface.available);
}

function isCurrentRunPrivacyHardBlocker(disposition: PersonalGaDispositionRef): boolean {
  return disposition.privacy_tier === "reject" || disposition.blocking_reason === "privacy_hard_blocker";
}

export function buildPersonalGaReport(input: PersonalGaReportInput): PersonalGaReport {
  const blocking = new Set<string>();
  const warnings = new Set<string>();
  if (input.mode === "degraded_no_ai") blocking.add("ai_lesson_extraction_disabled");
  if (input.mode === "budget_exhausted") blocking.add("ai_budget_exhausted");
  if (!input.leakageScan.passed) blocking.add("privacy_leakage_detected");

  for (const source of input.sourceCoverage) {
    if (source.configured && !source.available && isOptionalSidecarSource(source)) {
      warnings.add(`optional_sidecar_unavailable:${source.agent}:${source.source_kind}`);
      continue;
    }
    if (source.blocking && isOptionalSidecarSource(source)) {
      warnings.add(`optional_sidecar_unavailable:${source.agent}:${source.source_kind}`);
      continue;
    }
    if (source.configured && !source.available) {
      blocking.add(`required_source_unavailable:${source.agent}:${source.source_kind}`);
    }
    if (source.blocking) {
      blocking.add(`source_blocked:${source.agent}:${source.source_kind}`);
    }
  }

  const disposedIds = new Set(input.dispositions.map((disposition) => disposition.lesson_id));
  for (const lesson of input.lessons) {
    if (!disposedIds.has(lesson.lesson_id)) {
      blocking.add(`lesson_missing_disposition:${lesson.lesson_id}`);
    }
  }
  for (const disposition of input.dispositions) {
    if (isCurrentRunPrivacyHardBlocker(disposition)) {
      blocking.add("privacy_hard_blocker");
    } else if (disposition.decision === "blocked_by_privacy") {
      warnings.add(`privacy_review_required:${disposition.lesson_id}`);
    }
  }

  const usablePbOutput = hasUsablePbOutput(input.dispositions);
  if (!usablePbOutput) {
    blocking.add("no_personal_knowledge_output");
  }
  if (!hasPbContext(input.agentConsumption)) {
    blocking.add("agent_context_unavailable");
  }

  return {
    type: "personal_ga_report",
    mode: input.mode,
    source_coverage: input.sourceCoverage,
    lesson_count: input.lessons.length,
    disposition_count: input.dispositions.length,
    golden_validation: input.goldenValidation,
    leakage_scan: input.leakageScan,
    cache: input.cache,
    html: input.html,
    agent_consumption: input.agentConsumption,
    dispositions: input.dispositions,
    production_ready: blocking.size === 0 && input.mode === "production_ai",
    blocking_reasons: [...blocking].sort(),
    warnings: [...warnings].sort(),
  };
}
