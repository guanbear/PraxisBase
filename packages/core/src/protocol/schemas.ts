import { z } from "zod";
import { PROTOCOL_VERSION } from "./types.js";

export const ProtocolVersionSchema = z.literal(PROTOCOL_VERSION);
export const ScopeSchema = z.enum(["personal", "project", "team", "global", "org"]);
export const LayerSchema = z.enum(["preference", "convention", "technical", "domain", "project"]);
export const AgentProfileSchema = z.enum([
  "codex",
  "claude-code",
  "opencode",
  "openclaw",
  "hermes",
  "openhuman",
  "generic",
]);
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
export const CaptureResultSchema = z.enum(["success", "failed", "partial", "unknown"]);
export const RiskLevelSchema = z.enum(["low", "medium", "high"]);
export const ProposalActionSchema = z.enum(["create", "patch", "archive", "link"]);
export const TargetTypeSchema = z.enum(["note", "known_fix", "procedure", "skill", "policy", "decision", "pitfall"]);
export const ReviewDecisionSchema = z.enum(["approve", "reject", "needs_human", "conflict"]);
export const KnowledgeTypeSchema = z.enum([
  "known_fix", "procedure", "skill", "decision", "policy",
  "pitfall", "guideline", "model", "note"
]);
export const MaturitySchema = z.enum(["draft", "verified", "proven"]);
export const ContextStageSchema = z.enum(["diagnosis", "repair", "verification", "proposal"]);

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

export const ArtifactRefSchema = z.object({
  kind: z.string().min(1),
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  redacted_summary: z.string().min(1),
});

export const CaptureRecordSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("capture_record"),
  agent: AgentProfileSchema,
  workspace: z.string().min(1),
  scope_hint: ScopeSchema,
  result: CaptureResultSchema,
  triggers: NonEmptyStringArray,
  signals: z.array(z.string().min(1)).default([]),
  artifacts: z.array(ArtifactRefSchema).min(1),
  created_at: DateTimeSchema,
});

export const AdapterProfileSchema = z.object({
  agent: AgentProfileSchema,
  instruction_files: z.array(z.string().min(1)).default([]),
  transcript_paths: z.array(z.string().min(1)).default([]),
  raw_artifact_paths: z.array(z.string().min(1)).default([]),
  workspace_markers: z.array(z.string().min(1)).default([]),
  capture: z.object({
    default_triggers: NonEmptyStringArray,
  }),
  context: z.object({
    default_stages: z.array(ContextStageSchema).min(1),
  }),
  privacy: z.object({
    redaction_profile: z.string().min(1),
  }),
});

export const NativeMemoryKindSchema = z.enum([
  "memory",
  "skill_summary",
  "session_summary",
  "preference",
  "instruction",
]);

export const NativeMemorySourceSchema = z.object({
  agent: AgentProfileSchema,
  kind: NativeMemoryKindSchema,
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  redacted_summary: z.string().min(1),
  scope_hint: ScopeSchema.default("personal"),
  created_at: DateTimeSchema.optional(),
});

export const AgentMemoryAgentSchema = z.enum(["codex", "openclaw"]);
export const AgentMemoryKindSchema = z.enum(["codex_session", "openclaw_log", "openclaw_episode"]);

export const AgentMemoryCandidateSchema = z.object({
  id: z.string().min(1),
  agent: AgentMemoryAgentSchema,
  kind: AgentMemoryKindSchema,
  source_path: z.string().min(1),
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
  created_at: z.string().optional(),
  summary_hint: z.string().optional(),
  warnings: z.array(z.string()).default([]),
});

export const AgentMemoryIngestReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("agent_memory_ingest_report"),
  agent: AgentMemoryAgentSchema,
  mode: z.enum(["dry-run", "write"]),
  scanned: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  unsafe: z.number().int().nonnegative(),
  outputs: z.array(z.string()),
  warnings: z.array(z.string()).default([]),
  changed_stable_knowledge: z.literal(false),
  created_at: z.string(),
});

export const RealWikiSmokeReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("real_wiki_smoke_report"),
  agent: AgentMemoryAgentSchema,
  scanned: z.number().int().nonnegative().default(0),
  imported: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative().default(0),
  unsafe: z.number().int().nonnegative(),
  proposal_candidates: z.number().int().nonnegative(),
  graph_nodes: z.number().int().nonnegative(),
  graph_broken_links: z.number().int().nonnegative(),
  quality_findings: z.number().int().nonnegative().default(0),
  graph_duplicates: z.number().int().nonnegative().default(0),
  graph_orphans: z.number().int().nonnegative().default(0),
  site_pages: z.number().int().nonnegative(),
  context_items: z.number().int().nonnegative(),
  outputs: z.array(z.string()),
  warnings: z.array(z.string()).default([]),
  changed_stable_knowledge: z.literal(false),
  created_at: z.string(),
});

export const OpenClawRemoteProviderSchema = z.enum(["exported-json", "openclaw-api", "openclaw-cli"]);
export const PraxisBaseCliRuntimeModeSchema = z.enum(["source", "installed", "ci", "unknown"]);

export const OpenClawRemoteMemoryEnvelopeSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("openclaw_remote_memory"),
  provider: OpenClawRemoteProviderSchema,
  remote_id: z.string().min(1),
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  redacted_summary: z.string().min(1),
  signature: z.string().optional(),
  created_at: z.string().optional(),
  fetched_at: z.string(),
  warnings: z.array(z.string()).default([]),
});

export const AgentMemoryFetchReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("agent_memory_fetch_report"),
  agent: z.literal("openclaw"),
  provider: OpenClawRemoteProviderSchema,
  runtime_mode: PraxisBaseCliRuntimeModeSchema,
  fetched: z.number().int().nonnegative(),
  staged: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  unsafe: z.number().int().nonnegative(),
  outputs: z.array(z.string()),
  warnings: z.array(z.string()).default([]),
  changed_stable_knowledge: z.literal(false),
  created_at: z.string(),
});

export const OpenClawRemoteDoctorReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("openclaw_remote_doctor_report"),
  provider: OpenClawRemoteProviderSchema,
  runtime_mode: PraxisBaseCliRuntimeModeSchema,
  ok: z.boolean(),
  checks: z.array(z.object({
    id: z.string().min(1),
    ok: z.boolean(),
    severity: z.enum(["info", "warning", "error"]),
    message: z.string().min(1),
  })),
  warnings: z.array(z.string()).default([]),
  created_at: z.string(),
});

export const RemoteSourceTypeSchema = z.enum(["file", "git", "ssh", "http", "openclaw-api"]);
export const HarvestAuthorityModeSchema = z.enum(["personal-local", "team-git"]);

export const RemoteSourceConfigSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("remote_source_config"),
  name: z.string().min(1),
  source_type: RemoteSourceTypeSchema,
  agent: z.literal("openclaw"),
  repo: z.string().optional(),
  ref: z.string().optional(),
  path: z.string().optional(),
  host: z.string().optional(),
  url: z.string().optional(),
  remote: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const HarvestReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("harvest_report"),
  authority_mode: HarvestAuthorityModeSchema,
  mode: z.enum(["dry-run", "write"]),
  sources: z.array(z.object({
    name: z.string().min(1),
    agent: z.enum(["codex", "openclaw"]),
    source_type: z.enum(["local", "file", "git", "ssh", "http", "openclaw-api"]),
    status: z.enum(["completed", "partial", "failed"]),
    scanned: z.number().int().nonnegative(),
    fetched: z.number().int().nonnegative(),
    imported: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    unsafe: z.number().int().nonnegative(),
    warnings: z.array(z.string()).default([]),
  })),
  proposal_candidates: z.number().int().nonnegative(),
  graph_nodes: z.number().int().nonnegative(),
  graph_broken_links: z.number().int().nonnegative(),
  quality_findings: z.number().int().nonnegative().default(0),
  site_pages: z.number().int().nonnegative(),
  context_items: z.number().int().nonnegative(),
  git: z.object({
    branch: z.string().optional(),
    committed: z.boolean(),
    pushed: z.boolean(),
    commit_sha: z.string().optional(),
    pr_url: z.string().optional(),
  }).optional(),
  outputs: z.array(z.string()),
  warnings: z.array(z.string()).default([]),
  changed_stable_knowledge: z.boolean(),
  created_at: z.string(),
});

export const MemoryImportReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("memory_import_report"),
  agent: AgentProfileSchema,
  imported_sources: z.number().int().min(0),
  proposal_candidates: z.array(z.string().min(1)).default([]),
  capture_candidates: z.array(z.string().min(1)).default([]),
  default_scope: ScopeSchema,
  changed_stable_knowledge: z.literal(false),
  warnings: z.array(z.string()).default([]),
  created_at: DateTimeSchema,
});

export const MemoryRefreshTargetSchema = z.enum(["context", "instruction-snippet", "patch-proposal"]);

export const MemoryRefreshOutputSchema = z.object({
  kind: z.enum(["context_bundle", "install_snippet", "patch_proposal"]),
  target_path: z.string().min(1).optional(),
  source_refs: z.array(z.string().min(1)).default([]),
  content: z.string().optional(),
});

export const MemoryRefreshPlanSchema = z.object({
  agent: AgentProfileSchema,
  target: MemoryRefreshTargetSchema,
  writes_native_memory: z.literal(false),
  outputs: z.array(MemoryRefreshOutputSchema),
  created_at: DateTimeSchema.optional(),
});

export const ContextRequestSchema = z.object({
  agent: AgentProfileSchema,
  workspace: z.string().min(1),
  stage: ContextStageSchema,
  query: z.string().default(""),
  max_bytes: z.number().int().positive().optional(),
});

export const ContextCitationSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
});

export const ContextItemSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  kind: z.string().min(1),
  summary: z.string().optional(),
  body: z.string().optional(),
});

export const ContextResponseSchema = z.object({
  agent: AgentProfileSchema,
  stage: ContextStageSchema,
  items: z.array(ContextItemSchema),
  citations: z.array(ContextCitationSchema),
  warnings: z.array(z.string()).default([]),
  truncated: z.boolean(),
  budget: z.object({
    max_bytes: z.number().int().positive(),
    used_bytes: z.number().int().min(0),
  }),
});

export const ToolMutatesSchema = z.enum(["none", "reports", "inbox", "outbox", "staging", "proposals", "stable_knowledge"]);
export const AgentToolDescriptorSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  command: z.array(z.string().min(1)),
  input_schema: z.record(z.unknown()),
  mutates: ToolMutatesSchema,
  dry_run_supported: z.boolean(),
  requires_human_review: z.boolean(),
});

export const AgentToolManifestSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("agent_tool_manifest"),
  workspace: z.string().min(1),
  generated_at: DateTimeSchema,
  tools: z.array(AgentToolDescriptorSchema),
});

export const McpToolManifestSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("mcp_tool_manifest"),
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()),
  tools: z.array(z.string().min(1)),
  generated_at: DateTimeSchema,
});

export const WikiSourceSuggestedPageKindSchema = z.enum([
  "known_fix",
  "procedure",
  "decision",
  "pitfall",
  "skill_seed",
  "preference",
  "incident",
  "note",
]);

export const WikiSourceAnalysisSchema = z.object({
  source_id: z.string().min(1),
  source_hash: z.string().min(1),
  source_kind: z.string().min(1),
  suggested_page_kind: WikiSourceSuggestedPageKindSchema,
  signatures: z.array(z.string().min(1)),
  aliases: z.array(z.string().min(1)),
  scope: ScopeSchema,
  confidence: z.number().min(0).max(1),
  risks: z.array(z.string().min(1)),
  candidate_path: z.string().min(1).optional(),
});

export const WikiQualityRuleSchema = z.enum([
  "missing_source_hash",
  "missing_citation",
  "duplicate_signature",
  "broken_link",
  "orphan_page",
  "stale_page",
  "unsafe_path",
  "private_material",
]);

export const WikiQualityFindingSchema = z.object({
  rule: WikiQualityRuleSchema,
  severity: z.enum(["error", "warning"]),
  path: z.string().min(1),
  message: z.string().min(1),
  page_id: z.string().min(1).optional(),
  signature: z.string().min(1).optional(),
  details: z.record(z.unknown()).optional(),
});

export const WikiQualityReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("wiki_quality_report"),
  findings: z.array(WikiQualityFindingSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    by_rule: z.record(z.number().int().nonnegative()),
  }),
  changed_stable_knowledge: z.literal(false),
  created_at: DateTimeSchema,
});

export const WikiGraphSliceModeSchema = z.enum(["overview", "ego"]);
export const WikiGraphSliceSchema = z.object({
  protocol_version: ProtocolVersionSchema,
  type: z.literal("wiki_graph_slice"),
  mode: WikiGraphSliceModeSchema,
  center: z.string().min(1).optional(),
  depth: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  types: z.array(z.string().min(1)).default([]),
  truncated: z.boolean(),
  truncated_node_count: z.number().int().nonnegative(),
  nodes: z.array(z.object({
    id: z.string().min(1),
    slug: z.string().min(1),
    title: z.string().min(1),
    kind: z.string().min(1),
    scope: z.string().min(1),
    maturity: z.string().min(1),
    source_ids: z.array(z.string()),
  })),
  links: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    type: z.enum(["wikilink", "source_overlap", "related"]),
    weight: z.number(),
  })),
});

export const StructuredErrorSchema = z.object({
  ok: z.literal(false),
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.record(z.unknown()).optional(),
});

export type Episode = z.infer<typeof EpisodeSchema>;
export type IncidentEpisode = z.infer<typeof IncidentEpisodeSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type KnownFixFrontmatter = z.infer<typeof KnownFixFrontmatterSchema>;
export type PitfallFrontmatter = z.infer<typeof PitfallFrontmatterSchema>;
export type KnowledgeReference = z.infer<typeof KnowledgeReferenceSchema>;
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export type CaptureRecord = z.infer<typeof CaptureRecordSchema>;
export type AdapterProfile = z.infer<typeof AdapterProfileSchema>;
export type NativeMemorySource = z.infer<typeof NativeMemorySourceSchema>;
export type AgentMemoryCandidate = z.infer<typeof AgentMemoryCandidateSchema>;
export type AgentMemoryIngestReport = z.infer<typeof AgentMemoryIngestReportSchema>;
export type RealWikiSmokeReport = z.infer<typeof RealWikiSmokeReportSchema>;
export type OpenClawRemoteProvider = z.infer<typeof OpenClawRemoteProviderSchema>;
export type PraxisBaseCliRuntimeMode = z.infer<typeof PraxisBaseCliRuntimeModeSchema>;
export type OpenClawRemoteMemoryEnvelope = z.infer<typeof OpenClawRemoteMemoryEnvelopeSchema>;
export type AgentMemoryFetchReport = z.infer<typeof AgentMemoryFetchReportSchema>;
export type OpenClawRemoteDoctorReport = z.infer<typeof OpenClawRemoteDoctorReportSchema>;
export type RemoteSourceType = z.infer<typeof RemoteSourceTypeSchema>;
export type RemoteSourceConfig = z.infer<typeof RemoteSourceConfigSchema>;
export type HarvestReport = z.infer<typeof HarvestReportSchema>;
export type MemoryImportReport = z.infer<typeof MemoryImportReportSchema>;
export type MemoryRefreshPlan = z.infer<typeof MemoryRefreshPlanSchema>;
export type ContextStage = z.infer<typeof ContextStageSchema>;
export type ContextRequest = z.infer<typeof ContextRequestSchema>;
export type ContextResponse = z.infer<typeof ContextResponseSchema>;
export type StructuredError = z.infer<typeof StructuredErrorSchema>;
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
export type AgentToolDescriptor = z.infer<typeof AgentToolDescriptorSchema>;
export type AgentToolManifest = z.infer<typeof AgentToolManifestSchema>;
export type McpToolManifest = z.infer<typeof McpToolManifestSchema>;
export type ToolMutates = z.infer<typeof ToolMutatesSchema>;
export type WikiSourceSuggestedPageKind = z.infer<typeof WikiSourceSuggestedPageKindSchema>;
export type WikiSourceAnalysis = z.infer<typeof WikiSourceAnalysisSchema>;
export type WikiQualityRule = z.infer<typeof WikiQualityRuleSchema>;
export type WikiQualityFinding = z.infer<typeof WikiQualityFindingSchema>;
export type WikiQualityReport = z.infer<typeof WikiQualityReportSchema>;
export type WikiGraphSliceMode = z.infer<typeof WikiGraphSliceModeSchema>;
export type WikiGraphSlice = z.infer<typeof WikiGraphSliceSchema>;
