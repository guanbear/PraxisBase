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

  const parsedExperience = DistilledExperienceSchema.safeParse(ai.json);
  if (!parsedExperience.success) {
    return { ok: false, category: "schema_error", error: parsedExperience.error.message };
  }

  const privacy = evaluatePostAiPrivacy({
    mode: "personal-local",
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
