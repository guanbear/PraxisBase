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
}

export function buildPersonalGaReport(input: PersonalGaReportInput): PersonalGaReport {
  const blocking = new Set<string>();
  if (input.mode === "degraded_no_ai") blocking.add("ai_lesson_extraction_disabled");
  if (input.mode === "budget_exhausted") blocking.add("ai_budget_exhausted");
  if (!input.leakageScan.passed) blocking.add("privacy_leakage_detected");

  for (const source of input.sourceCoverage) {
    if (source.configured && !source.available) {
      blocking.add(`source_unavailable:${source.agent}:${source.source_kind}`);
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
  };
}
