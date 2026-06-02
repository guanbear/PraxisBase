import { z } from "zod";
import { ScopeSchema } from "../protocol/schemas.js";

export const SourceKindSchema = z.enum([
  "memory_file",
  "tools_file",
  "session",
  "report",
  "sqlite_memory",
  "skill",
  "sidecar_import",
  "generic_file",
]);

export type SourceKind = z.infer<typeof SourceKindSchema>;

export const EvidenceSpanSchema = z.object({
  source_item_id: z.string().min(1),
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  span_id: z.string().min(1),
  line_start: z.number().int().min(1),
  line_end: z.number().int().min(1),
  byte_start: z.number().int().min(0),
  byte_end: z.number().int().min(0),
  heading_path: z.array(z.string()).default([]),
  excerpt: z.string().min(1),
  excerpt_hash: z.string().min(1),
  span_kind: z.enum([
    "heading",
    "bullet",
    "paragraph",
    "json_message",
    "tool_call",
    "tool_result",
    "sqlite_row",
    "skill_section",
  ]),
});

export type EvidenceSpan = z.infer<typeof EvidenceSpanSchema>;

export const SourceInventoryItemSchema = z.object({
  source_item_id: z.string().min(1),
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  agent: z.enum([
    "codex",
    "openclaw",
    "claude-code",
    "opencode",
    "hermes",
    "openhuman",
    "generic",
  ]),
  source_kind: SourceKindSchema,
  authority_hint: z.enum([
    "agent_native_memory",
    "user_authored",
    "generated_report",
    "session_transcript",
    "external_sidecar",
  ]),
  scope_hint: ScopeSchema,
  origin: z.enum(["local", "trusted_personal_remote", "team_git", "external"]),
  mtime: z.string().optional(),
  size_bytes: z.number().int().min(0),
  parser_identity: z.string().min(1),
  content_spans: z.array(EvidenceSpanSchema).default([]),
  privacy_precheck: z.enum([
    "allow_for_ai",
    "local_only",
    "human_required",
    "reject",
  ]).default("allow_for_ai"),
});

export type SourceInventoryItem = z.infer<typeof SourceInventoryItemSchema>;

export const ExperienceLessonSchema = z.object({
  lesson_id: z.string().min(1),
  claim: z.string().min(1),
  safe_claim: z.string().min(1),
  problem: z.string().min(1),
  trigger: z.string().min(1),
  action: z.string().min(1),
  verification: z.string().optional(),
  negative_case: z.string().optional(),
  applies_to_agents: z.array(z.string()).default([]),
  applies_to_systems: z.array(z.string()).default([]),
  portability: z.enum([
    "universal",
    "agent_family",
    "project",
    "environment",
    "private_instance",
  ]),
  privacy_tier: z.enum([
    "safe",
    "personal_only",
    "team_allowed",
    "human_required",
    "reject",
  ]),
  scope: ScopeSchema,
  confidence: z.number().min(0).max(1),
  cue_family: z.enum([
    "explicit_user",
    "native_memory",
    "repeated_failure",
    "verified_fix",
    "tool_sequence",
    "reflection",
    "llm_inferred",
  ]),
  source_refs: z.array(z.string().min(1)).min(1),
  source_hashes: z.array(z.string().min(1)).min(1),
  evidence_spans: z.array(EvidenceSpanSchema).min(1),
  redaction_notes: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
});

export type ExperienceLesson = z.infer<typeof ExperienceLessonSchema>;
