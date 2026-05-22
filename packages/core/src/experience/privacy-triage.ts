import { readdir } from "node:fs/promises";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { ExceptionRecordSchema, PrivacyTriageAiDecisionSchema, PrivacyTriageReportSchema, type PrivacyTriageReport } from "../protocol/schemas.js";
import { redactExcerpt } from "../protocol/redact.js";
import { readAiProviderConfig } from "../ai/config.js";
import { createOpenAiCompatibleJsonClient, type AiJsonClient } from "../ai/client.js";
import { readJson, safePath, writeJson } from "../store/file-store.js";

export interface RunPrivacyTriageInput {
  authorityMode: "personal-local" | "team-git";
  mode?: "dry-run" | "write";
  autoRelease?: boolean;
  limit?: number;
  now?: string;
  aiTimeoutMs?: number;
  aiClient?: AiJsonClient;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

type ExceptionRecord = ReturnType<typeof ExceptionRecordSchema.parse>;
type TriageAiDecision = ReturnType<typeof PrivacyTriageAiDecisionSchema.parse>;
type TriageDecision = PrivacyTriageReport["items"][number]["decision"];

function runSuffix(now: string): string {
  return now.replace(/[^a-z0-9]/gi, "-");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstStringValue(recordValue: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringValue(recordValue[key]);
    if (value) return value;
  }
  return undefined;
}

function firstValue(recordValue: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in recordValue) return recordValue[key];
  }
  return undefined;
}

function containsConcretePrivateValue(text: string): boolean {
  const scanText = text
    .replace(/\b(?:token|cookie|secret|password|passwd|credential|authorization|auth(?:entication)? header|api[_-]?key|access[_-]?token|secret[_-]?key)s?\b\s*(?:[:=]|is|was|as)?\s*["'`]?\[REDACTED\]["'`]?/gi, "[REDACTED_PRIVATE_VALUE]")
    .replace(/\bBearer\s+\[REDACTED\]/gi, "[REDACTED_PRIVATE_VALUE]");
  return /BEGIN PRIVATE KEY/i.test(scanText)
    || /\bAKIA[A-Z0-9]{12,}\b/.test(scanText)
    || /\b(?:token|cookie|secret|password|passwd|credential|authorization|auth(?:entication)? header|api[_-]?key|access[_-]?token|secret[_-]?key)s?\b\s*(?:[:=]|is|was|as)\s*["'`]?[^\s"'`,;]{6,}/i.test(scanText)
    || /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i.test(scanText);
}

function redactForTriage(text: string): string {
  return redactExcerpt(text, 2000)
    .replace(/\b(token|cookie|secret|password|passwd|credential|authorization|api[_-]?key|access[_-]?token|secret[_-]?key)s?\b\s*[:=]\s*["'`]?[^\s"'`,;]+/gi, "$1=[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
}

function exceptionTriageText(exception: ExceptionRecord): string {
  return JSON.stringify({
    id: exception.id,
    reason: exception.reason,
    source_id: exception.source_id,
    details: exception.details ?? {},
  });
}

function buildPrompt(exception: ExceptionRecord): { system: string; user: string } {
  const details = record(exception.details);
  return {
    system: [
      "Classify a PraxisBase human-required privacy exception.",
      "Return only one top-level JSON object with exact keys: classification, confidence, rationale, suggested_redactions.",
      "Do not wrap the JSON in answer, result, markdown, or prose.",
      "Do not request raw logs or secrets.",
      "Prefer unclear when evidence is ambiguous.",
    ].join(" "),
    user: JSON.stringify({
      task: "Classify whether this redacted exception can be treated as safe personal/project agent experience.",
      allowed_classifications: ["safe_personal_experience", "needs_redaction", "real_private_material", "unclear"],
      required_output: {
        classification: "one of allowed_classifications",
        confidence: "number from 0 to 1",
        rationale: "short reason without raw private values",
        suggested_redactions: "array of strings",
      },
      release_policy: "Personal mode can auto-release only safe_personal_experience with high confidence and deterministic checks passing. Team mode is review-only.",
      exception: {
        id: exception.id,
        reason: redactForTriage(exception.reason),
        source_id: exception.source_id,
        agent: stringValue(details.agent),
        channel: stringValue(details.channel),
        scope: stringValue(details.scope_hint) ?? stringValue(details.scope),
        source_ref: redactForTriage(stringValue(details.source_ref) ?? ""),
        source_hash: stringValue(details.source_hash),
        redacted_summary: redactForTriage(stringValue(details.redacted_summary) ?? ""),
      },
    }, null, 2),
  };
}

function parseJsonObjectString(value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  try {
    return record(JSON.parse(trimmed));
  } catch {
    return undefined;
  }
}

function nestedDecisionCandidate(raw: Record<string, unknown>): Record<string, unknown> {
  for (const key of ["answer", "result", "triage", "privacy_triage", "decision", "output", "data"]) {
    const value = raw[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value === "string") {
      const parsed = parseJsonObjectString(value);
      if (parsed && Object.keys(parsed).length > 0) return parsed;
    }
  }
  return raw;
}

function normalizeClassification(value: unknown): unknown {
  const text = stringValue(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (!text) return value;
  if (["safe_personal_experience", "safe", "low_risk", "personal_safe", "reusable", "publishable", "auto_release", "auto_releasable"].includes(text)) {
    return "safe_personal_experience";
  }
  if (["needs_redaction", "redact", "redaction_required", "sanitize", "sanitization_required"].includes(text)) {
    return "needs_redaction";
  }
  if (["real_private_material", "private", "secret", "secrets", "sensitive", "contains_private_material", "high_risk"].includes(text)) {
    return "real_private_material";
  }
  if (["unclear", "uncertain", "unknown", "ambiguous", "needs_review", "review_required"].includes(text)) {
    return "unclear";
  }
  return value;
}

function normalizeConfidence(value: unknown): unknown {
  if (typeof value === "number") return value;
  const text = stringValue(value);
  if (!text) return value;
  const number = Number.parseFloat(text.replace(/%$/, ""));
  if (!Number.isFinite(number)) return value;
  const normalized = text.endsWith("%") || number > 1 ? number / 100 : number;
  return Math.max(0, Math.min(1, normalized));
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const values = value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item));
    return values.length > 0 ? values : [];
  }
  const single = stringValue(value);
  return single ? [single] : undefined;
}

function normalizeAiDecision(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const candidate = nestedDecisionCandidate(raw as Record<string, unknown>);
  const classification = normalizeClassification(firstValue(candidate, ["classification", "category", "label", "risk", "verdict", "privacy_classification"]));
  const confidence = normalizeConfidence(firstValue(candidate, ["confidence", "confidence_score", "score", "probability"]));
  const rationale = firstStringValue(candidate, ["rationale", "reason", "explanation", "justification", "summary"]);
  const suggestedRedactions = normalizeStringArray(firstValue(candidate, ["suggested_redactions", "suggestedRedactions", "redactions", "redaction_suggestions"]));
  return {
    ...candidate,
    ...(classification === undefined ? {} : { classification }),
    ...(confidence === undefined ? {} : { confidence }),
    ...(rationale === undefined ? {} : { rationale }),
    ...(suggestedRedactions === undefined ? {} : { suggested_redactions: suggestedRedactions }),
  };
}

function shapeSummary(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return `type=${Array.isArray(value) ? "array" : typeof value}`;
  const keys = Object.keys(value as Record<string, unknown>).sort().slice(0, 12);
  return `keys=${keys.join(",") || "none"}`;
}

function fallbackAiDecision(reason: string): TriageAiDecision {
  return {
    classification: "unclear",
    confidence: 0,
    rationale: reason,
    suggested_redactions: [],
  };
}

function releaseDecision(input: {
  authorityMode: RunPrivacyTriageInput["authorityMode"];
  autoRelease: boolean;
  scope?: string;
  hardBlockReasons: string[];
  ai: TriageAiDecision;
}): TriageDecision {
  if (input.authorityMode === "team-git") return "team_review_only";
  const releasableScope = input.scope === "personal" || input.scope === "project" || !input.scope;
  if (
    input.autoRelease
    && input.ai.classification === "safe_personal_experience"
    && input.ai.confidence >= 0.75
    && input.hardBlockReasons.length === 0
    && releasableScope
  ) {
    return "auto_released";
  }
  return "keep_human_required";
}

async function listExceptionPaths(root: string, limit?: number): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(safePath(root, protocolPaths.exceptionsHumanRequired));
  } catch {
    return [];
  }
  const paths = entries
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => `${protocolPaths.exceptionsHumanRequired}/${name}`);
  return typeof limit === "number" && Number.isFinite(limit) && limit >= 0 ? paths.slice(0, Math.floor(limit)) : paths;
}

export async function runPrivacyTriage(root: string, input: RunPrivacyTriageInput): Promise<PrivacyTriageReport> {
  const mode = input.mode ?? "write";
  const now = input.now ?? new Date().toISOString();
  const aiConfig = await readAiProviderConfig(root);
  if (!aiConfig && !input.aiClient) {
    throw new Error(`PRIVACY_TRIAGE_NOT_CONFIGURED: AI provider config is missing at ${protocolPaths.aiConfig}.`);
  }
  if (aiConfig && !input.aiClient && !((input.env ?? process.env)[aiConfig.api_key_env])) {
    throw new Error(`PRIVACY_TRIAGE_NOT_CONFIGURED: ${aiConfig.api_key_env} is not set.`);
  }
  const runtimeAiConfig = aiConfig && typeof input.aiTimeoutMs === "number" && Number.isFinite(input.aiTimeoutMs) && input.aiTimeoutMs > 0
    ? { ...aiConfig, ai_timeout_ms: input.aiTimeoutMs }
    : aiConfig;
  const aiClient = input.aiClient ?? createOpenAiCompatibleJsonClient({
    config: runtimeAiConfig!,
    env: input.env,
    fetchImpl: input.fetchImpl,
  });

  const items: PrivacyTriageReport["items"] = [];
  const outputs: string[] = [];
  const warnings: string[] = [];
  const paths = await listExceptionPaths(root, input.limit);

  for (const exceptionPath of paths) {
    let exception: ExceptionRecord;
    try {
      exception = ExceptionRecordSchema.parse(await readJson(root, exceptionPath));
    } catch (error) {
      warnings.push(`privacy_triage_invalid_exception:${exceptionPath}:${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const details = record(exception.details);
    const scope = stringValue(details.scope_hint) ?? stringValue(details.scope);
    const hardBlockReasons = containsConcretePrivateValue(exceptionTriageText(exception))
      ? ["private_material_detected"]
      : [];
    const prompt = buildPrompt(exception);
    const aiResult = await aiClient.generateJson({
      ...prompt,
      schemaName: "PrivacyTriageDecision",
      maxOutputBytes: 2048,
    });
    let ai: TriageAiDecision;
    if (!aiResult.ok) {
      ai = fallbackAiDecision(aiResult.error);
      warnings.push(`privacy_triage_ai_error:${exception.id}:${aiResult.error}`);
    } else {
      const parsedAi = PrivacyTriageAiDecisionSchema.safeParse(normalizeAiDecision(aiResult.json));
      if (parsedAi.success) {
        ai = parsedAi.data;
      } else {
        ai = fallbackAiDecision("AI triage output did not match schema.");
        warnings.push(`privacy_triage_schema_error:${exception.id}:${shapeSummary(normalizeAiDecision(aiResult.json))}:${parsedAi.error.message}`);
      }
    }
    const decision = releaseDecision({
      authorityMode: input.authorityMode,
      autoRelease: Boolean(input.autoRelease),
      scope,
      hardBlockReasons,
      ai,
    });

    const item: PrivacyTriageReport["items"][number] = {
      exception_id: exception.id,
      exception_path: exceptionPath,
      source_id: exception.source_id,
      source_ref: stringValue(details.source_ref),
      source_hash: stringValue(details.source_hash),
      agent: stringValue(details.agent),
      scope,
      classification: ai.classification,
      confidence: ai.confidence,
      rationale: ai.rationale,
      suggested_redactions: ai.suggested_redactions,
      hard_block_reasons: hardBlockReasons,
      decision,
    };
    items.push(item);

    if (mode === "write") {
      await writeJson(root, exceptionPath, {
        ...exception,
        details: {
          ...record(exception.details),
          triage: {
            classification: item.classification,
            confidence: item.confidence,
            rationale: item.rationale,
            suggested_redactions: item.suggested_redactions,
            hard_block_reasons: item.hard_block_reasons,
            decision: item.decision,
            triaged_at: now,
          },
        },
      });
    }
  }

  const reportId = makeId("privacy-triage", runSuffix(now));
  const reportPath = `${protocolPaths.reportsPrivacyTriage}/${reportId}.json`;
  if (mode === "write") outputs.push(reportPath);

  const report = PrivacyTriageReportSchema.parse({
    id: reportId,
    protocol_version: PROTOCOL_VERSION,
    type: "privacy_triage_report",
    authority_mode: input.authorityMode,
    mode,
    ai: {
      configured: Boolean(aiConfig || input.aiClient),
      provider: aiConfig?.provider,
      model: runtimeAiConfig?.model,
    },
    items,
    summary: {
      scanned: items.length,
      auto_released: items.filter((item) => item.decision === "auto_released").length,
      keep_human_required: items.filter((item) => item.decision === "keep_human_required").length,
      team_review_only: items.filter((item) => item.decision === "team_review_only").length,
    },
    changed_stable_knowledge: false,
    outputs,
    warnings,
    created_at: now,
  });

  if (mode === "write") await writeJson(root, reportPath, report);
  return report;
}
