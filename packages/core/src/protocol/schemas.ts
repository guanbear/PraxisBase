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
export const TargetTypeSchema = z.enum(["note", "known_fix", "procedure", "skill", "policy", "decision"]);
export const ReviewDecisionSchema = z.enum(["approve", "reject", "needs_human", "conflict"]);

const DateTimeSchema = z.string().datetime();
const NonEmptyStringArray = z.array(z.string().min(1)).min(1);

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
  scope: ScopeSchema,
  risk: RiskLevelSchema,
  status: z.enum(["draft", "published", "archived"]),
  signatures: NonEmptyStringArray,
  skills: z.array(z.string()).default([]),
  sources: z.array(z.object({ uri: z.string().min(1), hash: z.string().min(1) })).min(1),
  confidence: z.number().min(0).max(1),
  updated_at: DateTimeSchema
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

export type Episode = z.infer<typeof EpisodeSchema>;
export type IncidentEpisode = z.infer<typeof IncidentEpisodeSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type KnownFixFrontmatter = z.infer<typeof KnownFixFrontmatterSchema>;
export type K8sIncidentManifest = z.infer<typeof K8sIncidentManifestSchema>;
export type K8sIncidentManifestEntry = z.infer<typeof K8sIncidentManifestEntrySchema>;
