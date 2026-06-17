import { readdir } from "node:fs/promises";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { ExceptionRecordSchema, PrivacyTriageAiDecisionSchema, PrivacyTriageReportSchema, type PrivacyTriageReport } from "../protocol/schemas.js";
import { redactExcerpt } from "../protocol/redact.js";
import { readAiProviderConfig } from "../ai/config.js";
import { createOpenAiCompatibleJsonClient, type AiJsonClient } from "../ai/client.js";
import { listExperienceSources } from "./source-config.js";
import { readJson, safePath, writeJson } from "../store/file-store.js";
import type { ExperienceSourceConfig } from "../protocol/schemas.js";
import { containsPrivateMaterial } from "../wiki/lint.js";
import { z } from "zod";

export interface RunPrivacyTriageInput {
  authorityMode: "personal-local" | "team-git";
  mode?: "dry-run" | "write";
  autoRelease?: boolean;
  teamAutoReview?: boolean;
  limit?: number;
  aiConcurrency?: number;
  includeTriaged?: boolean;
  now?: string;
  aiTimeoutMs?: number;
  onProgress?: (event: PrivacyTriageProgressEvent) => void | Promise<void>;
  aiClient?: AiJsonClient;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

export interface PrivacyTriageProgressEvent {
  status: "running" | "completed";
  total: number;
  completed: number;
  skipped_already_triaged: number;
  skipped_non_privacy: number;
  current_exception_id?: string;
  summary: {
    auto_released: number;
    keep_human_required: number;
    team_review_only: number;
    rejected_low_signal: number;
  };
  warnings: string[];
}

type ExceptionRecord = ReturnType<typeof ExceptionRecordSchema.parse>;
type TriageAiDecision = ReturnType<typeof PrivacyTriageAiDecisionSchema.parse>;
type TriageDecision = PrivacyTriageReport["items"][number]["decision"];

export interface ManualPrivacyReviewInput {
  exceptionId: string;
  decision: TriageDecision;
  releaseSummary?: string;
  reviewerId?: string;
  note?: string;
  now?: string;
}

export interface ManualPrivacyReviewResult {
  exception_path: string;
  decision: TriageDecision;
}

const TeamReleaseSummarySchema = z.object({
  release_summary: z.string().min(20).max(1200),
  reusable_lesson: z.string().min(10).max(800).optional(),
  residual_risk: z.string().max(500).optional(),
});

type TeamReleaseSummary = z.infer<typeof TeamReleaseSummarySchema>;

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

function containsFeishuPrivateIdentifier(text: string): boolean {
  const scanText = text
    .replace(/\[REDACTED(?:_[A-Z_]+)?\]/g, "[REDACTED]")
    .replace(/\b(?:user_id|open_id|union_id|chat_id)\s*[:=]\s*["']?\[REDACTED\]["']?/gi, "[REDACTED_FEISHU_FIELD]");
  return /\b(?:ou|on|un|oc)_[A-Za-z0-9_]{8,}\b/.test(scanText)
    || /\b(?:user_id|open_id|union_id|chat_id)\s*[:=]\s*["']?[^"'\s,;}]{4,}/i.test(scanText);
}

function redactFeishuPrivateIdentifiers(text: string): string {
  return text
    .replace(/\b(?:ou|on|un|oc)_[A-Za-z0-9_]{8,}\b/g, "[REDACTED_FEISHU_ID]")
    .replace(/\b(?:user_id|open_id|union_id|chat_id)\s*[:=]\s*["']?[^"'\s,;}]{4,}/gi, (match) => {
      const key = match.split(/[:=]/)[0]?.trim() || "feishu_id";
      return `${key}=[REDACTED_FEISHU_ID]`;
    });
}

function redactForTriage(text: string): string {
  return redactFeishuPrivateIdentifiers(redactExcerpt(text, 2000))
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
      release_policy: "Personal mode can auto-release only safe_personal_experience with high confidence and deterministic checks passing. Team mode may auto-release a sanitized summary only when AI redaction succeeds and deterministic leak checks pass; raw private material must never be copied into the release summary.",
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

function buildTeamReleasePrompt(exception: ExceptionRecord, ai: TriageAiDecision): { system: string; user: string } {
  const details = record(exception.details);
  return {
    system: [
      "You are sanitizing a team-scope repair-bot memory for an internal reusable experience wiki.",
      "Return only one top-level JSON object with exact keys: release_summary, reusable_lesson, residual_risk.",
      "Do not include names, user IDs, chat IDs, URLs, hostnames, IPs, tokens, credentials, hashes, exact paths, exact timestamps, or raw log lines.",
      "Keep only the reusable operational lesson and verification signal.",
    ].join(" "),
    user: JSON.stringify({
      task: "Create a sanitized release summary suitable for automated team review.",
      required_output: {
        release_summary: "2-4 sentences, sanitized, reusable, no private values",
        reusable_lesson: "one concise actionable lesson",
        residual_risk: "short note, or empty string if none",
      },
      triage: {
        classification: ai.classification,
        confidence: ai.confidence,
        rationale: ai.rationale,
        suggested_redactions: ai.suggested_redactions,
      },
      exception: {
        id: exception.id,
        reason: redactForTriage(exception.reason),
        source_id: exception.source_id,
        agent: stringValue(details.agent),
        channel: stringValue(details.channel),
        scope: stringValue(details.scope_hint) ?? stringValue(details.scope),
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

function sanitizeTeamReleaseText(text: string): string {
  return redactFeishuPrivateIdentifiers(redactForTriage(text))
    .replace(/https?:\/\/[^\s,;)\]]+/gi, "[REDACTED_URL]")
    .replace(/\b(?:openclaw|feishu|ssh|git|file):\/\/[^\s,;)\]]+/gi, "[REDACTED_SOURCE_REF]")
    .replace(/\bsha256:[a-f0-9]{16,}\b/gi, "[REDACTED_HASH]")
    .replace(/\b[0-9a-f]{32,}\b/gi, "[REDACTED_HASH]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[REDACTED_ID]")
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, "[REDACTED_TIMESTAMP]")
    .trim();
}

function isSafeTeamReleaseText(text: string): boolean {
  const sanitized = sanitizeTeamReleaseText(text);
  if (!sanitized || sanitized.length < 20) return false;
  if (containsConcretePrivateValue(sanitized)) return false;
  if (containsFeishuPrivateIdentifier(sanitized)) return false;
  if (containsPrivateMaterial(sanitized)) return false;
  if (/https?:\/\//i.test(sanitized)) return false;
  if (/\b(?:openclaw|feishu|ssh|git|file):\/\//i.test(sanitized)) return false;
  return true;
}

function isLowSignalTeamReleaseText(text: string): boolean {
  return /\b(?:generic|benign) greetings?\b/i.test(text)
    || /\bgreeting-only\b/i.test(text)
    || /\bonly a generic greeting\b/i.test(text)
    || /\bpreferred display names?\b/i.test(text)
    || /\bnicknames?\b/i.test(text)
    || /\bno operational, personal, or sensitive details\b/i.test(text);
}

function isGreetingOnlyLowSignalText(text: string): boolean {
  return /\b(?:generic|benign) greetings?\b/i.test(text)
    || /\bgreeting-only\b/i.test(text)
    || /\bonly a generic greeting\b/i.test(text)
    || /\bcontains only a generic greeting\b/i.test(text);
}

function isLowSignalTeamTriage(input: {
  exception: ExceptionRecord;
  ai: TriageAiDecision;
}): boolean {
  if (input.ai.classification !== "safe_personal_experience" || input.ai.confidence < 0.85) return false;
  const exceptionSummary = (input.exception as unknown as { summary?: unknown }).summary;
  const summary = typeof exceptionSummary === "string"
    ? exceptionSummary
    : "";
  const combined = [summary, input.ai.rationale].filter(Boolean).join("\n");
  return isGreetingOnlyLowSignalText(combined);
}

function teamAutoReviewThreshold(ai: TriageAiDecision): number | undefined {
  if (ai.classification === "safe_personal_experience") return 0.82;
  if (ai.classification === "needs_redaction") return 0.78;
  if (ai.classification === "real_private_material") return 0.85;
  return undefined;
}

function teamAutoReviewEligible(input: {
  enabled: boolean;
  authorityMode: RunPrivacyTriageInput["authorityMode"];
  scope?: string;
  hardBlockReasons: string[];
  ai: TriageAiDecision;
}): boolean {
  if (!input.enabled || input.authorityMode !== "team-git") return false;
  if (input.scope === "personal") return false;
  const threshold = teamAutoReviewThreshold(input.ai);
  if (threshold === undefined || input.ai.confidence < threshold) return false;
  const allowedHardBlocks = new Set(["remote_source_requires_review", "feishu_private_identifier_detected"]);
  if (["needs_redaction", "safe_personal_experience", "real_private_material"].includes(input.ai.classification)) {
    allowedHardBlocks.add("private_material_detected");
  }
  const blockingReasons = input.hardBlockReasons.filter((reason) => !allowedHardBlocks.has(reason));
  return blockingReasons.length === 0;
}

async function generateTeamReleaseSummary(input: {
  exception: ExceptionRecord;
  ai: TriageAiDecision;
  aiClient: AiJsonClient;
  warnings: string[];
}): Promise<TeamReleaseSummary | undefined> {
  const prompt = buildTeamReleasePrompt(input.exception, input.ai);
  const result = await input.aiClient.generateJson({
    ...prompt,
    schemaName: "TeamPrivacyReleaseSummary",
    maxOutputBytes: 2048,
  });
  if (!result.ok) {
    input.warnings.push(`privacy_triage_team_auto_review_error:${input.exception.id}:${result.error}`);
    return undefined;
  }
  const parsed = TeamReleaseSummarySchema.safeParse(result.json);
  if (!parsed.success) {
    input.warnings.push(`privacy_triage_team_auto_review_schema_error:${input.exception.id}:${shapeSummary(result.json)}:${parsed.error.message}`);
    return undefined;
  }
  const releaseSummary = sanitizeTeamReleaseText(parsed.data.release_summary);
  const reusableLesson = sanitizeTeamReleaseText(parsed.data.reusable_lesson ?? "");
  const residualRisk = sanitizeTeamReleaseText(parsed.data.residual_risk ?? "");
  const combined = [releaseSummary, reusableLesson, residualRisk].filter(Boolean).join("\n");
  if (!isSafeTeamReleaseText(combined)) {
    input.warnings.push(`privacy_triage_team_auto_review_unsafe_summary:${input.exception.id}`);
    return undefined;
  }
  if (isLowSignalTeamReleaseText(combined)) {
    input.warnings.push(`privacy_triage_team_auto_review_low_signal:${input.exception.id}`);
    return undefined;
  }
  return {
    release_summary: releaseSummary,
    ...(reusableLesson ? { reusable_lesson: reusableLesson } : {}),
    ...(residualRisk ? { residual_risk: residualRisk } : {}),
  };
}

function releaseDecision(input: {
  authorityMode: RunPrivacyTriageInput["authorityMode"];
  autoRelease: boolean;
  teamAutoReview: boolean;
  teamLowSignal?: boolean;
  scope?: string;
  hardBlockReasons: string[];
  ai: TriageAiDecision;
  teamReleaseSummary?: TeamReleaseSummary;
}): TriageDecision {
  if (input.authorityMode === "team-git") {
    if (input.teamLowSignal) {
      return "rejected_low_signal";
    }
    return input.teamAutoReview && input.teamReleaseSummary ? "auto_released" : "team_review_only";
  }
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

function remoteSourceNeedsReview(details: Record<string, unknown>): boolean {
  const channel = stringValue(details.channel)?.toLowerCase();
  const sourceRef = stringValue(details.source_ref)?.toLowerCase() ?? "";
  return Boolean(channel && channel !== "local")
    || sourceRef.startsWith("ssh://")
    || sourceRef.startsWith("http://")
    || sourceRef.startsWith("https://")
    || sourceRef.includes("openclaw-api://");
}

function isFeishuException(details: Record<string, unknown>): boolean {
  return stringValue(details.channel)?.toLowerCase() === "feishu"
    || stringValue(details.agent)?.toLowerCase() === "feishu"
    || (stringValue(details.source_ref)?.toLowerCase() ?? "").includes("feishu");
}

function sourceRefAliases(source: ExperienceSourceConfig): string[] {
  const values = [source.id, source.name, source.host, source.remote, source.url, source.path, source.repo]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.toLowerCase());
  if (source.host?.includes("@")) {
    values.push(source.host.split("@").slice(1).join("@").toLowerCase());
  }
  return values;
}

function trustedPersonalRemoteSourceMatches(details: Record<string, unknown>, sources: ExperienceSourceConfig[]): boolean {
  const sourceId = stringValue(details.source_id)?.toLowerCase() ?? "";
  const sourceRef = stringValue(details.source_ref)?.toLowerCase() ?? "";
  const agent = stringValue(details.agent);
  const scope = stringValue(details.scope_hint) ?? stringValue(details.scope);
  if (scope && scope !== "personal") return false;

  return sources.some((source) => {
    if (source.privacy_trust !== "trusted_personal_remote") return false;
    if (source.scope_default !== "personal") return false;
    if (!["ssh", "http", "openclaw-api", "file"].includes(source.source_type)) return false;
    if (agent && source.agent !== agent) return false;
    return sourceRefAliases(source).some((alias) => alias.length > 0 && (sourceId.includes(alias) || sourceRef.includes(alias)));
  });
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

function normalizeConcurrency(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, Math.min(16, parsed));
}

function alreadyTriaged(exception: ExceptionRecord): boolean {
  const triage = record(record(exception.details).triage);
  return Boolean(stringValue(triage.decision) || stringValue(triage.classification));
}

function isPrivacyTriageCandidate(rawException: Record<string, unknown>): boolean {
  const reason = stringValue(rawException.reason) ?? "";
  const details = record(rawException.details);
  const privacy = record(details.privacy);
  return /^Experience privacy verdict human_required\b/i.test(reason)
    || stringValue(privacy.verdict) === "human_required"
    || stringValue(details.privacy_verdict) === "human_required";
}

export async function writeManualPrivacyReview(root: string, input: ManualPrivacyReviewInput): Promise<ManualPrivacyReviewResult> {
  const now = input.now ?? new Date().toISOString();
  const paths = await listExceptionPaths(root);
  for (const exceptionPath of paths) {
    const raw = record(await readJson(root, exceptionPath));
    const exception = ExceptionRecordSchema.parse(raw);
    if (exception.id !== input.exceptionId && exception.source_id !== input.exceptionId) continue;
    if (!isPrivacyTriageCandidate(raw)) {
      throw new Error(`PRIVACY_REVIEW_NOT_PRIVACY_EXCEPTION: ${input.exceptionId} is not a privacy review item.`);
    }
    const details = record(exception.details);
    const fallbackSummary = stringValue(details.redacted_summary) ?? stringValue(details.summary) ?? exception.reason;
    const releaseSummary = sanitizeTeamReleaseText(input.releaseSummary ?? fallbackSummary ?? "");
    if (input.decision === "auto_released" && !isSafeTeamReleaseText(releaseSummary)) {
      throw new Error(`PRIVACY_REVIEW_UNSAFE_RELEASE: manual release requires a sanitized release summary.`);
    }
    const previousTriage = record(details.triage);
    await writeJson(root, exceptionPath, {
      ...exception,
      details: {
        ...details,
        triage: {
          ...previousTriage,
          classification: input.decision === "auto_released" ? "needs_redaction" : stringValue(previousTriage.classification) ?? "unclear",
          confidence: input.decision === "auto_released" ? 0.9 : typeof previousTriage.confidence === "number" ? previousTriage.confidence : 0.75,
          rationale: input.note ?? `manual_privacy_${input.decision}`,
          suggested_redactions: Array.isArray(previousTriage.suggested_redactions) ? previousTriage.suggested_redactions : [],
          hard_block_reasons: Array.isArray(previousTriage.hard_block_reasons) ? previousTriage.hard_block_reasons : [],
          decision: input.decision,
          ...(input.decision === "auto_released" ? {
            release_summary: releaseSummary,
            auto_review_policy: "human-privacy-release-v1",
          } : {}),
          reviewer_id: input.reviewerId ?? "praxisbase-local-review-ui",
          triaged_at: now,
        },
      },
    });
    return { exception_path: exceptionPath, decision: input.decision };
  }
  throw new Error(`PRIVACY_REVIEW_NOT_FOUND: ${input.exceptionId}`);
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
  const sources = await listExperienceSources(root);
  const paths = await listExceptionPaths(root);
  const queued: Array<{ exceptionPath: string; exception: ExceptionRecord }> = [];
  let skippedAlreadyTriaged = 0;
  let skippedNonPrivacy = 0;
  const processLimit = typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit >= 0
    ? Math.floor(input.limit)
    : Number.POSITIVE_INFINITY;

  for (const exceptionPath of paths) {
    let exception: ExceptionRecord;
    try {
      const rawException = record(await readJson(root, exceptionPath));
      if (!isPrivacyTriageCandidate(rawException)) {
        skippedNonPrivacy++;
        continue;
      }
      exception = ExceptionRecordSchema.parse(rawException);
    } catch (error) {
      warnings.push(`privacy_triage_invalid_exception:${exceptionPath}:${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!input.includeTriaged && alreadyTriaged(exception)) {
      skippedAlreadyTriaged++;
      continue;
    }
    if (queued.length >= processLimit) continue;
    queued.push({ exceptionPath, exception });
  }

  const publishProgress = async (event: Omit<PrivacyTriageProgressEvent, "summary" | "warnings" | "skipped_already_triaged" | "skipped_non_privacy">): Promise<void> => {
    if (!input.onProgress) return;
    await input.onProgress({
      ...event,
      skipped_already_triaged: skippedAlreadyTriaged,
      skipped_non_privacy: skippedNonPrivacy,
      summary: {
        auto_released: items.filter((item) => item.decision === "auto_released").length,
        keep_human_required: items.filter((item) => item.decision === "keep_human_required").length,
        team_review_only: items.filter((item) => item.decision === "team_review_only").length,
        rejected_low_signal: items.filter((item) => item.decision === "rejected_low_signal").length,
      },
      warnings,
    });
  };

  await publishProgress({
    status: "running",
    total: queued.length,
    completed: 0,
  });

  let nextTaskIndex = 0;
  const runTriageWorker = async (): Promise<void> => {
    while (nextTaskIndex < queued.length) {
      const taskIndex = nextTaskIndex;
      nextTaskIndex++;
      const { exceptionPath, exception } = queued[taskIndex];
      await publishProgress({
        status: "running",
        total: queued.length,
        completed: items.length,
        current_exception_id: exception.id,
      });
      const item = await triageException({
        root,
        exceptionPath,
        exception,
        now,
        mode,
        authorityMode: input.authorityMode,
        autoRelease: Boolean(input.autoRelease),
        teamAutoReview: Boolean(input.teamAutoReview),
        aiClient,
        warnings,
        trustedRemoteSource: trustedPersonalRemoteSourceMatches(record(exception.details), sources),
      });
      items.push(item);
      await publishProgress({
        status: "running",
        total: queued.length,
        completed: items.length,
        current_exception_id: exception.id,
      });
    }
  };

  const concurrency = normalizeConcurrency(input.aiConcurrency);
  await Promise.all(Array.from({ length: Math.min(concurrency, queued.length) }, () => runTriageWorker()));
  items.sort((left, right) => left.exception_path.localeCompare(right.exception_path));

  await publishProgress({
    status: "completed",
    total: queued.length,
    completed: items.length,
  });

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
      skipped_already_triaged: skippedAlreadyTriaged,
      skipped_non_privacy: skippedNonPrivacy,
      auto_released: items.filter((item) => item.decision === "auto_released").length,
      keep_human_required: items.filter((item) => item.decision === "keep_human_required").length,
      team_review_only: items.filter((item) => item.decision === "team_review_only").length,
      rejected_low_signal: items.filter((item) => item.decision === "rejected_low_signal").length,
    },
    changed_stable_knowledge: false,
    outputs,
    warnings,
    created_at: now,
  });

  if (mode === "write") await writeJson(root, reportPath, report);
  return report;
}

async function triageException(input: {
  root: string;
  exceptionPath: string;
  exception: ExceptionRecord;
  now: string;
  mode: "dry-run" | "write";
  authorityMode: RunPrivacyTriageInput["authorityMode"];
  autoRelease: boolean;
  teamAutoReview: boolean;
  aiClient: AiJsonClient;
  warnings: string[];
  trustedRemoteSource: boolean;
}): Promise<PrivacyTriageReport["items"][number]> {
    const { exceptionPath, exception } = input;
    const details = record(exception.details);
    const scope = stringValue(details.scope_hint) ?? stringValue(details.scope);
    const triageText = exceptionTriageText(exception);
    const hardBlockReasons = [
      ...(containsConcretePrivateValue(triageText) ? ["private_material_detected"] : []),
      ...(isFeishuException(details) && containsFeishuPrivateIdentifier(triageText) ? ["feishu_private_identifier_detected"] : []),
      ...(remoteSourceNeedsReview(details) && !input.trustedRemoteSource ? ["remote_source_requires_review"] : []),
    ];
    const prompt = buildPrompt(exception);
    const aiResult = await input.aiClient.generateJson({
      ...prompt,
      schemaName: "PrivacyTriageDecision",
      maxOutputBytes: 2048,
    });
    let ai: TriageAiDecision;
    if (!aiResult.ok) {
      ai = fallbackAiDecision(aiResult.error);
      input.warnings.push(`privacy_triage_ai_error:${exception.id}:${aiResult.error}`);
    } else {
      const parsedAi = PrivacyTriageAiDecisionSchema.safeParse(normalizeAiDecision(aiResult.json));
      if (parsedAi.success) {
        ai = parsedAi.data;
      } else {
        ai = fallbackAiDecision("AI triage output did not match schema.");
        input.warnings.push(`privacy_triage_schema_error:${exception.id}:${shapeSummary(normalizeAiDecision(aiResult.json))}:${parsedAi.error.message}`);
      }
    }

    const teamReleaseSummary = teamAutoReviewEligible({
      enabled: input.teamAutoReview,
      authorityMode: input.authorityMode,
      scope,
      hardBlockReasons,
      ai,
    })
      ? await generateTeamReleaseSummary({ exception, ai, aiClient: input.aiClient, warnings: input.warnings })
      : undefined;
    const teamAutoReviewPolicy = teamReleaseSummary
      ? ai.classification === "real_private_material" ? "team-ai-redacted-sensitive-v1" : "team-ai-sanitized-v1"
      : undefined;
    let teamLowSignal = input.warnings.includes(`privacy_triage_team_auto_review_low_signal:${exception.id}`);
    if (!teamLowSignal && isLowSignalTeamTriage({ exception, ai })) {
      input.warnings.push(`privacy_triage_team_auto_review_low_signal:${exception.id}`);
      teamLowSignal = true;
    }

    const decision = releaseDecision({
      authorityMode: input.authorityMode,
      autoRelease: input.autoRelease,
      teamAutoReview: input.teamAutoReview,
      teamLowSignal,
      scope,
      hardBlockReasons,
      ai,
      teamReleaseSummary,
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
      ...(teamReleaseSummary ? { release_summary: teamReleaseSummary.release_summary } : {}),
    };

    if (input.mode === "write") {
      await writeJson(input.root, exceptionPath, {
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
            ...(teamReleaseSummary ? {
              release_summary: teamReleaseSummary.release_summary,
              reusable_lesson: teamReleaseSummary.reusable_lesson,
              residual_risk: teamReleaseSummary.residual_risk,
              auto_review_policy: teamAutoReviewPolicy,
            } : {}),
            triaged_at: input.now,
          },
        },
      });
    }
  return item;
}
