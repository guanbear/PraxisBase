import { z } from "zod";
import { PROTOCOL_VERSION } from "./types.js";

export const ProtocolVersionSchema = z.literal(PROTOCOL_VERSION);
export const ScopeSchema = z.enum(["personal", "project", "team", "global"]);
export const AgentTypeSchema = z.enum([
  "temporary_repair_agent",
  "persistent_bot",
  "reviewer",
  "curator",
  "system_ingest",
  "live_incident_analyzer"
]);
export const RepairResultSchema = z.enum(["success", "failed", "partial", "unknown"]);
export const IncidentResultSchema = z.enum(["confirmed", "ruled_out", "inconclusive", "data_gap"]);
export const RiskLevelSchema = z.enum(["low", "medium", "high"]);
export const ProposalActionSchema = z.enum(["create", "patch", "archive", "link"]);
export const TargetTypeSchema = z.enum(["note", "known_fix", "procedure", "skill", "policy", "decision", "pitfall"]);
export const ReviewDecisionSchema = z.enum(["approve", "reject", "needs_human", "conflict"]);
export const KnowledgeTypeSchema = z.enum([
  "known_fix", "procedure", "skill", "decision", "policy",
  "pitfall", "guideline", "model", "note"
]);
export const MaturitySchema = z.enum(["draft", "verified", "proven"]);

const DateTimeSchema = z.string().datetime();
const NonEmptyStringArray = z.array(z.string().min(1)).min(1);

export const KnowledgeReferencePhaseSchema = z.enum(["diagnosis", "repair", "verification", "proposal"]);
export const KnowledgeReferenceEffectSchema = z.enum(["helped_fix", "guided_action"]);
export const KnowledgeReferenceOutcomeSchema = z.enum([
  "success", "failed", "partial", "unknown",
  "confirmed", "ruled_out", "inconclusive", "data_gap",
]);

export const KnowledgeReferenceSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  used_in_phase: KnowledgeReferencePhaseSchema,
  effect: KnowledgeReferenceEffectSchema,
  outcome: KnowledgeReferenceOutcomeSchema,
});

export const EvidenceSchema = z.object({
  source_uri: z.string().min(1),
  source_hash: z.string().min(1),
  excerpt: z.string().min(1),
  repair_result: RepairResultSchema,
  verification: z.string().min(1),
  source_refs: z.array(z.object({ uri: z.string().min(1), hash: z.string().min(1) })).optional(),
  redacted_summary: z.string().min(1).optional()
});

// Repair episode (OpenClaw)
export const EpisodeSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("repair_episode"),
  scope: ScopeSchema,
  agent_id: z.string().min(1),
  agent_type: AgentTypeSchema,
  environment_id: z.string().min(1),
  run_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  problem_signature: z.string().min(1),
  result: RepairResultSchema,
  used_skills: z.array(z.string()).default([]),
  used_objects: z.array(z.string()).default([]),
  source_refs: NonEmptyStringArray,
  knowledge_references: z.array(KnowledgeReferenceSchema).default([]),
  summary: z.string().min(1),
  created_at: DateTimeSchema
});

// Incident episode (K8s live incident)
export const IncidentEpisodeSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("incident_episode"),
  scope: ScopeSchema,
  agent_id: z.string().min(1),
  agent_type: AgentTypeSchema,
  environment_id: z.string().min(1),
  run_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  problem_signature: z.string().min(1),
  result: IncidentResultSchema,
  used_skills: z.array(z.string()).default([]),
  used_objects: z.array(z.string()).default([]),
  source_refs: NonEmptyStringArray,
  evidence_summary: z.string().min(1),
  knowledge_references: z.array(KnowledgeReferenceSchema).default([]),
  created_at: DateTimeSchema
});

// Union of all episode types for generic submit
export const AnyEpisodeSchema = z.discriminatedUnion("type", [EpisodeSchema, IncidentEpisodeSchema]);

export const ProposalSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("knowledge_proposal"),
  scope: ScopeSchema,
  action: ProposalActionSchema,
  target_type: TargetTypeSchema,
  target_id: z.string().min(1),
  agent_id: z.string().min(1),
  agent_type: AgentTypeSchema,
  environment_id: z.string().min(1),
  run_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  evidence: EvidenceSchema,
  patch: z.object({
    path: z.string().min(1),
    content: z.string().min(1)
  }),
  created_at: DateTimeSchema
});

export const ReviewSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  proposal_id: z.string().min(1),
  reviewer_id: z.string().min(1),
  reviewer_model: z.string().min(1),
  prompt_version: z.string().min(1),
  decision: ReviewDecisionSchema,
  risk: RiskLevelSchema,
  confidence: z.number().min(0).max(1),
  reasons: NonEmptyStringArray,
  required_checks: z.array(z.string()).default([]),
  created_at: DateTimeSchema
});

export const KnownFixFrontmatterSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("known_fix"),
  knowledge_type: z.literal("known_fix").default("known_fix"),
  scope: ScopeSchema,
  risk: RiskLevelSchema,
  status: z.enum(["draft", "published", "archived"]),
  maturity: MaturitySchema.default("draft"),
  signatures: NonEmptyStringArray,
  skills: z.array(z.string()).default([]),
  sources: z.array(z.object({ uri: z.string().min(1), hash: z.string().min(1) })).min(1),
  confidence: z.number().min(0).max(1),
  reference_count: z.number().int().min(0).default(0),
  last_referenced_at: z.string().datetime().nullable().default(null),
  supersedes: z.array(z.string()).default([]),
  superseded_by: z.string().nullable().default(null),
  updated_at: DateTimeSchema
});

export const PitfallFrontmatterSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("pitfall"),
  knowledge_type: z.literal("pitfall"),
  scope: ScopeSchema,
  risk: RiskLevelSchema,
  status: z.enum(["draft", "published", "archived"]),
  signatures: NonEmptyStringArray,
  summary: z.string().min(1),
  forbidden_actions: z.array(z.string().min(1)).min(1),
  maturity: MaturitySchema.default("draft"),
  reference_count: z.number().int().min(0).default(0),
  last_referenced_at: z.string().datetime().nullable().default(null),
  supersedes: z.array(z.string()).default([]),
  superseded_by: z.string().nullable().default(null),
  updated_at: DateTimeSchema
});

export const ExceptionCategorySchema = z.enum(["human_required", "conflict", "failed_check"]);

export const ExceptionRecordSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("exception_record"),
  category: ExceptionCategorySchema,
  source_id: z.string().min(1),
  reason: z.string().min(1),
  details: z.record(z.unknown()).optional(),
  created_at: DateTimeSchema,
});

export const RunCommandSchema = z.enum(["review", "promote", "build", "lint"]);
export const RunStatusSchema = z.enum(["completed", "partial", "failed"]);

export const RunRecordSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  command: RunCommandSchema,
  status: RunStatusSchema,
  started_at: DateTimeSchema,
  finished_at: DateTimeSchema,
  counts: z.record(z.number()).default({}),
  errors: z.array(z.string()).default([]),
});

export const K8sIncidentManifestEntrySchema = z.object({
  signature: z.string().min(1),
  path: z.string().min(1),
  checksum: z.string().min(1),
  risk: RiskLevelSchema,
});

export const K8sIncidentManifestSchema = z.object({
  protocol_version: ProtocolVersionSchema,
  bundle_id: z.literal("k8s-incident"),
  generated_at: z.string().min(1),
  commit_sha: z.string(),
  compatible_cli: z.string().min(1),
  entries: z.array(K8sIncidentManifestEntrySchema),
});

export const LintSeveritySchema = z.enum(["error", "warning"]);
export const LintRuleSchema = z.enum([
  "missing_frontmatter",
  "invalid_frontmatter",
  "missing_governance_metadata",
  "missing_evidence_source",
  "raw_log_content",
  "duplicate_id",
  "duplicate_source_hash",
  "duplicate_signature",
  "contradiction_action_forbidden",
  "superseded_active",
]);

export const LintFindingSchema = z.object({
  rule: LintRuleSchema,
  severity: LintSeveritySchema,
  path: z.string().min(1),
  message: z.string().min(1),
  object_id: z.string().optional(),
  signature: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export const LintReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("lint_report"),
  run_id: z.string().min(1),
  findings: z.array(LintFindingSchema),
  summary: z.object({
    errors: z.number().int().min(0),
    warnings: z.number().int().min(0),
  }),
  created_at: DateTimeSchema,
});

export type Episode = z.infer<typeof EpisodeSchema>;
export type IncidentEpisode = z.infer<typeof IncidentEpisodeSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type KnownFixFrontmatter = z.infer<typeof KnownFixFrontmatterSchema>;
export type PitfallFrontmatter = z.infer<typeof PitfallFrontmatterSchema>;
export type KnowledgeReference = z.infer<typeof KnowledgeReferenceSchema>;
export type ExceptionRecord = z.infer<typeof ExceptionRecordSchema>;
export type RunRecord = z.infer<typeof RunRecordSchema>;
export type K8sIncidentManifest = z.infer<typeof K8sIncidentManifestSchema>;
export type K8sIncidentManifestEntry = z.infer<typeof K8sIncidentManifestEntrySchema>;
export type KnowledgeReferencePhase = z.infer<typeof KnowledgeReferencePhaseSchema>;
export type KnowledgeReferenceEffect = z.infer<typeof KnowledgeReferenceEffectSchema>;
export type KnowledgeReferenceOutcome = z.infer<typeof KnowledgeReferenceOutcomeSchema>;
export type LintSeverity = z.infer<typeof LintSeveritySchema>;
export type LintRule = z.infer<typeof LintRuleSchema>;
export type LintFinding = z.infer<typeof LintFindingSchema>;
export type LintReport = z.infer<typeof LintReportSchema>;
