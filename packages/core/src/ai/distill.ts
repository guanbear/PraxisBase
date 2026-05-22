import { z } from "zod";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { AgentProfileSchema, ExperienceOutcomeSchema, ExperienceScopeHintSchema } from "../protocol/schemas.js";
import { evaluatePostAiPrivacy } from "../experience/privacy-policy.js";
import type { AiJsonClient } from "./client.js";

const DistillAgentSchema = AgentProfileSchema;
const WikiKindSchema = z.enum(["known_fix", "procedure", "decision", "pitfall", "preference", "incident", "note"]);

export const DistillInputSchema = z.object({
  source_id: z.string().min(1),
  agent: DistillAgentSchema,
  channel: z.string().min(1),
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  scope_hint: ExperienceScopeHintSchema,
  chunk_id: z.string().min(1),
  chunk_hash: z.string().min(1),
  text: z.string().min(1),
  prior_context: z.array(z.string().min(1)).optional(),
});

export const DistilledExperienceSchema = z.object({
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  chunk_hashes: z.array(z.string().min(1)).min(1),
  agent: DistillAgentSchema,
  scope_hint: ExperienceScopeHintSchema,
  summary: z.string().min(1),
  problem: z.string().min(1).optional(),
  context: z.string().min(1).optional(),
  actions: z.array(z.string().min(1)),
  failed_attempts: z.array(z.string().min(1)),
  outcome: ExperienceOutcomeSchema,
  verification: z.array(z.string().min(1)),
  reusable_lessons: z.array(z.string().min(1)),
  risks: z.array(z.string().min(1)),
  suggested_tags: z.array(z.string().min(1)),
  suggested_wiki_kind: WikiKindSchema,
  skill_candidate: z.object({
    should_create: z.boolean(),
    title: z.string().min(1).optional(),
    trigger: z.string().min(1).optional(),
    procedure: z.array(z.string().min(1)).optional(),
  }),
  confidence: z.number().min(0).max(1),
}).strict();

export const AiDistillReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: z.literal(PROTOCOL_VERSION),
  type: z.literal("ai_distill_report"),
  chunks: z.number().int().nonnegative(),
  distilled: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  human_required: z.number().int().nonnegative(),
  warnings: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
});

export type DistillInput = z.infer<typeof DistillInputSchema>;
export type DistilledExperience = z.infer<typeof DistilledExperienceSchema>;
export type AiDistillReport = z.infer<typeof AiDistillReportSchema>;

export type DistillResult =
  | { ok: true; experience: DistilledExperience }
  | { ok: false; error: string; category: "ai_error" | "schema_error" | "privacy_error" };

export interface DistillExperienceOptions {
  client: AiJsonClient;
  maxOutputBytes?: number;
  authorityMode?: "personal-local" | "team-git";
}

export function buildDistillPrompt(input: DistillInput): { system: string; user: string } {
  const parsed = DistillInputSchema.parse(input);
  return {
    system: [
      "You distill agent work records into reusable PraxisBase experience.",
      "Return only JSON that matches the DistilledExperience schema.",
      "Do not include secrets, tokens, cookies, auth headers, private keys, or raw logs.",
      "Do not invent verification. Use unknown outcome when evidence is unclear.",
    ].join(" "),
    user: JSON.stringify({
      task: "Extract durable, reusable agent experience from this bounded chunk.",
      required_fields: [
        "source_ref",
        "source_hash",
        "chunk_hashes",
        "agent",
        "scope_hint",
        "summary",
        "problem",
        "context",
        "actions",
        "failed_attempts",
        "outcome",
        "verification",
        "reusable_lessons",
        "risks",
        "suggested_tags",
        "suggested_wiki_kind",
        "skill_candidate",
        "confidence",
      ],
      source: {
        source_ref: parsed.source_ref,
        source_hash: parsed.source_hash,
        chunk_hash: parsed.chunk_hash,
        agent: parsed.agent,
        scope_hint: parsed.scope_hint,
      },
      text: parsed.text,
      prior_context: parsed.prior_context ?? [],
    }, null, 2),
  };
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") return JSON.stringify(value);
  return undefined;
}

function stringArray(value: unknown, options: { splitComma?: boolean } = {}): string[] {
  if (Array.isArray(value)) {
    return value.map(stringValue).filter((item): item is string => Boolean(item));
  }
  const single = stringValue(value);
  if (!single) return [];
  if (options.splitComma) {
    return single.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [single];
}

function normalizeOutcome(value: unknown): z.infer<typeof ExperienceOutcomeSchema> {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (normalized === "success" || normalized === "failed" || normalized === "partial" || normalized === "unknown") {
    return normalized;
  }
  return "unknown";
}

function normalizeWikiKind(value: unknown): z.infer<typeof WikiKindSchema> {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/_/g, "-");
    if (normalized === "known-fix" || normalized === "known_fix") return "known_fix";
    if (normalized === "procedure" || normalized === "runbook" || normalized === "configuration" || normalized === "configuration-reference") return "procedure";
    if (normalized === "decision") return "decision";
    if (normalized === "pitfall") return "pitfall";
    if (normalized === "preference") return "preference";
    if (normalized === "incident") return "incident";
    if (normalized === "note" || normalized === "reference") return "note";
  }
  return "note";
}

function normalizeSkillCandidate(value: unknown): DistilledExperience["skill_candidate"] {
  if (typeof value === "boolean") return { should_create: value };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { should_create: false };

  const candidate = value as Record<string, unknown>;
  const shouldCreate = typeof candidate.should_create === "boolean"
    ? candidate.should_create
    : typeof candidate.shouldCreate === "boolean"
      ? candidate.shouldCreate
      : false;

  return {
    should_create: shouldCreate,
    title: stringValue(candidate.title),
    trigger: stringValue(candidate.trigger),
    procedure: stringArray(candidate.procedure),
  };
}

function normalizeConfidence(value: unknown): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
  if (Number.isNaN(numeric)) return 0.5;
  return Math.min(1, Math.max(0, numeric));
}

function hasSufficientDistillShape(record: Record<string, unknown>): boolean {
  const semanticKeys = [
    "actions",
    "failed_attempts",
    "outcome",
    "verification",
    "reusable_lessons",
    "risks",
    "suggested_tags",
    "suggested_wiki_kind",
    "skill_candidate",
    "confidence",
  ];
  return semanticKeys.filter((key) => key in record).length >= 4;
}

function normalizeDistilledExperience(raw: unknown, input: DistillInput): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const outerRecord = raw as Record<string, unknown>;
  const answer = outerRecord.answer;
  const record = !hasSufficientDistillShape(outerRecord)
    && answer
    && typeof answer === "object"
    && !Array.isArray(answer)
    && hasSufficientDistillShape(answer as Record<string, unknown>)
    ? answer as Record<string, unknown>
    : outerRecord;
  if (!hasSufficientDistillShape(record)) return raw;

  return {
    ...record,
    source_ref: stringValue(record.source_ref) ?? input.source_ref,
    source_hash: stringValue(record.source_hash) ?? input.source_hash,
    chunk_hashes: stringArray(record.chunk_hashes).length > 0 ? stringArray(record.chunk_hashes) : [input.chunk_hash],
    agent: DistillAgentSchema.safeParse(record.agent).success ? record.agent : input.agent,
    scope_hint: ExperienceScopeHintSchema.safeParse(record.scope_hint).success ? record.scope_hint : input.scope_hint,
    summary: stringValue(record.summary) ?? "No reusable experience summary was produced.",
    problem: stringValue(record.problem),
    context: stringValue(record.context),
    actions: stringArray(record.actions),
    failed_attempts: stringArray(record.failed_attempts),
    outcome: normalizeOutcome(record.outcome),
    verification: stringArray(record.verification),
    reusable_lessons: stringArray(record.reusable_lessons),
    risks: stringArray(record.risks),
    suggested_tags: stringArray(record.suggested_tags, { splitComma: true }),
    suggested_wiki_kind: normalizeWikiKind(record.suggested_wiki_kind),
    skill_candidate: normalizeSkillCandidate(record.skill_candidate),
    confidence: normalizeConfidence(record.confidence),
  };
}

function allExperienceText(experience: DistilledExperience): string {
  return [
    experience.summary,
    experience.problem,
    experience.context,
    ...experience.actions,
    ...experience.failed_attempts,
    ...experience.verification,
    ...experience.reusable_lessons,
    ...experience.risks,
    ...experience.suggested_tags,
    experience.skill_candidate.title,
    experience.skill_candidate.trigger,
    ...(experience.skill_candidate.procedure ?? []),
  ].filter((item): item is string => Boolean(item)).join("\n");
}

export async function distillExperience(
  input: DistillInput,
  options: DistillExperienceOptions,
): Promise<DistillResult> {
  const parsedInput = DistillInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, category: "schema_error", error: parsedInput.error.message };
  }

  const prompt = buildDistillPrompt(parsedInput.data);
  const ai = await options.client.generateJson({
    ...prompt,
    schemaName: "DistilledExperience",
    maxOutputBytes: options.maxOutputBytes ?? 8192,
  });
  if (!ai.ok) {
    return { ok: false, category: "ai_error", error: ai.error };
  }

  const parsedExperience = DistilledExperienceSchema.safeParse(normalizeDistilledExperience(ai.json, parsedInput.data));
  if (!parsedExperience.success) {
    return { ok: false, category: "schema_error", error: parsedExperience.error.message };
  }

  const privacy = evaluatePostAiPrivacy({
    mode: options.authorityMode ?? "personal-local",
    scopeHint: parsedExperience.data.scope_hint,
    text: allExperienceText(parsedExperience.data),
  });
  if (privacy.verdict !== "allow") {
    return {
      ok: false,
      category: "privacy_error",
      error: privacy.reasons.join(", ") || "privacy postcheck failed",
    };
  }

  return { ok: true, experience: parsedExperience.data };
}
