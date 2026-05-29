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
  "agentmemory",
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
export const MaturitySchema = z.enum(["draft", "verified", "proven", "stale", "archived"]);
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

export const PrivacyTriageClassificationSchema = z.enum([
  "safe_personal_experience",
  "needs_redaction",
  "real_private_material",
  "unclear",
]);

export const PrivacyTriageDecisionSchema = z.enum([
  "auto_released",
  "keep_human_required",
  "team_review_only",
]);

export const PrivacyTriageAiDecisionSchema = z.object({
  classification: PrivacyTriageClassificationSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  suggested_redactions: z.array(z.string().min(1)).default([]),
});

export const PrivacyTriageReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("privacy_triage_report"),
  authority_mode: z.enum(["personal-local", "team-git"]),
  mode: z.enum(["dry-run", "write"]),
  ai: z.object({
    configured: z.boolean(),
    provider: z.string().optional(),
    model: z.string().optional(),
  }),
  items: z.array(z.object({
    exception_id: z.string().min(1),
    exception_path: z.string().min(1),
    source_id: z.string().min(1),
    source_ref: z.string().optional(),
    source_hash: z.string().optional(),
    agent: z.string().optional(),
    scope: z.string().optional(),
    classification: PrivacyTriageClassificationSchema,
    confidence: z.number().min(0).max(1),
    rationale: z.string().min(1),
    suggested_redactions: z.array(z.string().min(1)).default([]),
    hard_block_reasons: z.array(z.string().min(1)).default([]),
    decision: PrivacyTriageDecisionSchema,
  })),
  summary: z.object({
    scanned: z.number().int().nonnegative(),
    skipped_already_triaged: z.number().int().nonnegative().default(0),
    skipped_non_privacy: z.number().int().nonnegative().default(0),
    auto_released: z.number().int().nonnegative(),
    keep_human_required: z.number().int().nonnegative(),
    team_review_only: z.number().int().nonnegative(),
  }),
  changed_stable_knowledge: z.literal(false),
  outputs: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
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

export const AgentMemoryAgentSchema = z.enum(["codex", "openclaw", "claude-code"]);
export const AgentMemoryKindSchema = z.enum([
  "codex_session",
  "openclaw_log",
  "openclaw_episode",
  "claude_code_repair_log",
]);

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

export const ExperienceSourceChannelSchema = z.enum([
  "local",
  "terminal",
  "feishu",
  "ci",
  "gitlab",
  "log-system",
  "unknown",
]);

export const ExperienceSourceParserSchema = z.enum([
  "codex-session",
  "openclaw-export",
  "openclaw-log",
  "claude-code-repair-log",
  "claude-code-session",
  "opencode-session",
  "agentmemory-memory",
  "gbrain-memory",
]);

export const ExperienceSourceAgentSchema = z.enum(["codex", "openclaw", "claude-code", "opencode", "agentmemory", "generic"]);
export const ExperienceSourceTypeSchema = z.enum(["local", "file", "git", "ssh", "http", "openclaw-api", "agentmemory", "gbrain"]);
export const ExperienceScopeHintSchema = z.enum(["personal", "project", "team", "org"]);
export const ExperienceSourcePrivacyTrustSchema = z.enum(["trusted_personal_remote"]);
export const ExperiencePrivacyVerdictSchema = z.enum(["allow", "reject", "human_required"]);
export const ExperienceOutcomeSchema = z.enum(["success", "failed", "partial", "unknown"]);

export const ExperienceSourceConfigSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("experience_source_config"),
  name: z.string().min(1),
  agent: ExperienceSourceAgentSchema,
  source_type: ExperienceSourceTypeSchema,
  channel: ExperienceSourceChannelSchema.default("unknown"),
  parser: ExperienceSourceParserSchema,
  scope_default: ExperienceScopeHintSchema,
  path: z.string().optional(),
  repo: z.string().optional(),
  ref: z.string().optional(),
  host: z.string().optional(),
  url: z.string().optional(),
  remote: z.string().optional(),
  bearer_token_env: z.string().min(1).optional(),
  privacy_trust: ExperienceSourcePrivacyTrustSchema.optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const TrajectoryStepSchema = z.object({
  goal: z.string().optional(),
  action: z.string().optional(),
  tool: z.string().optional(),
  outcome: z.string().optional(),
});

export const ToolOutcomeSchema = z.object({
  tool: z.string().min(1),
  result_category: z.enum(["success", "failure", "partial", "unknown"]),
  failure_snippet: z.string().optional(),
  verification_marker: z.boolean().optional(),
});

export const SkillEffectivenessHintSchema = z.enum(["helped", "hurt", "missing", "stale", "ignored"]);

const ExperienceEnvelopeObjectSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("experience_envelope"),
  source_id: z.string().min(1),
  agent: ExperienceSourceAgentSchema,
  channel: ExperienceSourceChannelSchema,
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  scope_hint: ExperienceScopeHintSchema,
  signature: z.string().optional(),
  problem_signature: z.string().optional(),
  outcome: ExperienceOutcomeSchema.optional(),
  redacted_summary: z.string().min(1),
  trajectory_steps: z.array(TrajectoryStepSchema).optional(),
  tool_outcomes: z.array(ToolOutcomeSchema).optional(),
  read_skills: z.array(z.string().min(1)).optional(),
  modified_skills: z.array(z.string().min(1)).optional(),
  injected_context: z.array(z.string().min(1)).optional(),
  verification_events: z.array(z.string().min(1)).optional(),
  skill_effectiveness_hints: z.array(SkillEffectivenessHintSchema).optional(),
  created_at: z.string().optional(),
  fetched_at: z.string(),
  privacy: z.object({
    mode: HarvestAuthorityModeSchema,
    verdict: ExperiencePrivacyVerdictSchema,
    reasons: z.array(z.string()).default([]),
  }),
  warnings: z.array(z.string()).default([]),
});

export const ExperienceEnvelopeSchema = ExperienceEnvelopeObjectSchema
  .passthrough()
  .superRefine((value, ctx) => {
    if (Object.hasOwn(value, "raw_transcript")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["raw_transcript"],
        message: "raw_transcript is not allowed in experience envelopes",
      });
    }
    if (Object.hasOwn(value, "raw_log")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["raw_log"],
        message: "raw_log is not allowed in experience envelopes",
      });
    }
  })
  .transform((value) => {
    const stripped: Record<string, unknown> = { ...value };
    delete stripped.raw_transcript;
    delete stripped.raw_log;
    return stripped;
  })
  .pipe(ExperienceEnvelopeObjectSchema);

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

export const DailyExperienceReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("daily_experience_report"),
  authority_mode: HarvestAuthorityModeSchema,
  mode: z.enum(["dry-run", "write"]),
  ai_distill: z.object({
    configured: z.boolean(),
    mode: z.enum(["production", "degraded", "disabled"]),
    production_ready: z.boolean(),
    provider: z.string().optional(),
    model: z.string().optional(),
    chunks: z.number().int().nonnegative(),
    distilled: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    human_required: z.number().int().nonnegative(),
    privacy_required: z.number().int().nonnegative().default(0),
    review_required: z.number().int().nonnegative().default(0),
    rejected_low_signal: z.number().int().nonnegative().default(0),
    rejected_quality: z.number().int().nonnegative().default(0),
    cache_hits: z.number().int().nonnegative().default(0),
    budget_max_uncached: z.number().int().nonnegative().optional(),
    budget_used_uncached: z.number().int().nonnegative().default(0),
    skipped_by_budget: z.number().int().nonnegative().default(0),
    warnings: z.array(z.string()).default([]),
  }).default({
    configured: false,
    mode: "degraded",
    production_ready: false,
    chunks: 0,
    distilled: 0,
    failed: 0,
    human_required: 0,
    privacy_required: 0,
    review_required: 0,
    rejected_low_signal: 0,
    rejected_quality: 0,
    cache_hits: 0,
    budget_used_uncached: 0,
    skipped_by_budget: 0,
    warnings: [],
  }),
  sources: z.array(z.object({
    name: z.string().min(1),
    agent: ExperienceSourceAgentSchema,
    channel: ExperienceSourceChannelSchema,
    source_type: ExperienceSourceTypeSchema,
    status: z.enum(["completed", "partial", "failed"]),
    scanned: z.number().int().nonnegative(),
    fetched: z.number().int().nonnegative(),
    enveloped: z.number().int().nonnegative(),
    imported: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    human_required: z.number().int().nonnegative(),
    warnings: z.array(z.string()).default([]),
  })),
  proposal_candidates: z.number().int().nonnegative(),
  quality_findings: z.number().int().nonnegative().default(0),
  site_pages: z.number().int().nonnegative(),
  changed_stable_knowledge: z.boolean(),
  brain_backends: z.object({
    gbrain: z.object({
      enabled: z.boolean(),
      doctor_status: z.enum(["unknown", "ok", "warning", "failed"]).default("unknown"),
      publish_status: z.enum(["not_requested", "skipped", "completed", "partial", "failed", "blocked"]),
      pages: z.number().int().nonnegative(),
      exported: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative(),
      imported: z.number().int().nonnegative().default(0),
      warnings: z.array(z.string()).default([]),
      errors: z.array(z.string()).default([]),
    }).optional(),
  }).optional(),
  git: z.object({
    branch: z.string().optional(),
    committed: z.boolean(),
    pushed: z.boolean(),
    commit_sha: z.string().optional(),
  }).optional(),
  context_economy: z.object({
    enabled: z.boolean(),
    reducer_version: z.string().min(1),
    rule_set_hash: z.string().min(1),
    items_seen: z.number().int().nonnegative(),
    items_reduced: z.number().int().nonnegative(),
    items_passed_through: z.number().int().nonnegative(),
    input_bytes: z.number().int().nonnegative(),
    output_bytes: z.number().int().nonnegative(),
    saved_bytes: z.number().int().nonnegative(),
    report_ref: z.string().min(1).optional(),
    warnings: z.array(z.string()).default([]),
  }).optional(),
  context_juice: z.object({
    enabled: z.boolean(),
    context_juice_version: z.string().min(1),
    budget_id: z.string().min(1),
    items_seen: z.number().int().nonnegative(),
    items_budgeted: z.number().int().nonnegative(),
    items_microcompacted: z.number().int().nonnegative(),
    original_bytes: z.number().int().nonnegative(),
    kept_bytes: z.number().int().nonnegative(),
    saved_bytes: z.number().int().nonnegative(),
    presummary_summarized: z.number().int().nonnegative().default(0),
    presummary_saved_bytes: z.number().int().nonnegative().default(0),
    report_ref: z.string().min(1).optional(),
    warnings: z.array(z.string()).default([]),
  }).optional(),
	  semantic_review: z.object({
    enabled: z.boolean().default(false),
    reviewed: z.number().int().min(0).default(0),
    promote: z.number().int().min(0).default(0),
    merge: z.number().int().min(0).default(0),
    revise: z.number().int().min(0).default(0),
    reject: z.number().int().min(0).default(0),
    needs_human: z.number().int().min(0).default(0),
    unavailable: z.number().int().min(0).default(0),
	  }).default(() => ({
    enabled: false,
    reviewed: 0,
    promote: 0,
    merge: 0,
    revise: 0,
    reject: 0,
    needs_human: 0,
	    unavailable: 0,
	  })),
	  skill_synthesis: z.object({
	    enabled: z.boolean().default(false),
	    signals: z.number().int().min(0).default(0),
	    rejected_signals: z.number().int().min(0).default(0),
	    clusters: z.number().int().min(0).default(0),
	    candidates: z.number().int().min(0).default(0),
	    reviewed: z.number().int().min(0).default(0),
	    approved: z.number().int().min(0).default(0),
	    rejected: z.number().int().min(0).default(0),
	    needs_human: z.number().int().min(0).default(0),
	    skipped: z.number().int().min(0).default(0),
	    promoted: z.number().int().min(0).default(0),
	  }).default(() => ({
	    enabled: false,
	    signals: 0,
	    rejected_signals: 0,
	    clusters: 0,
	    candidates: 0,
	    reviewed: 0,
	    approved: 0,
	    rejected: 0,
	    needs_human: 0,
	    skipped: 0,
	    promoted: 0,
	  })),
	  lifecycle: z.object({
	    proposals_by_decision: z.record(z.string(), z.number().int().min(0)).default({}),
	  }).default(() => ({
	    proposals_by_decision: {},
	  })).optional(),
	  skill_validation: z.object({
	    total_reports: z.number().int().min(0).default(0),
	    by_decision: z.record(z.string(), z.number().int().min(0)).default({}),
	    candidates_without_passing: z.number().int().min(0).default(0),
	  }).default(() => ({
	    total_reports: 0,
	    by_decision: {},
	    candidates_without_passing: 0,
	  })).optional(),
	  lessons: z.object({
	    enabled: z.boolean().default(false),
	    source_items: z.number().int().min(0).default(0),
	    selected_spans: z.number().int().min(0).default(0),
	    deterministic_lessons: z.number().int().min(0).default(0),
	    ai_lessons: z.number().int().min(0).default(0),
	    active_personal: z.number().int().min(0).default(0),
	    wiki_ready: z.number().int().min(0).default(0),
	    skill_ready: z.number().int().min(0).default(0),
	    human_required: z.number().int().min(0).default(0),
	    rejected: z.number().int().min(0).default(0),
	    wiki_evidence: z.number().int().min(0).default(0),
	    golden_validation: z.array(z.object({
	      fixture: z.string().min(1),
	      matches: z.number().int().min(0),
	      privateLeakCount: z.number().int().min(0),
	    })).default([]),
	    report_ref: z.string().min(1).optional(),
	  }).default(() => ({
	    enabled: false,
	    source_items: 0,
	    selected_spans: 0,
	    deterministic_lessons: 0,
	    ai_lessons: 0,
	    active_personal: 0,
	    wiki_ready: 0,
	    skill_ready: 0,
	    human_required: 0,
	    rejected: 0,
	    wiki_evidence: 0,
	    golden_validation: [],
	  })),
	  outputs: z.array(z.string()),
  warnings: z.array(z.string()).default([]),
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
  source_rank: z.string().optional(),
  promotion_evidence: z.boolean().optional(),
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
    type: z.enum([
      "related",
      "uses",
      "depends_on",
      "fixes",
      "caused_by",
      "verified_by",
      "contradicts",
      "supersedes",
      "same_topic_as",
      "source_overlap",
    ]),
    weight: z.number(),
    confidence: z.number().min(0).max(1).optional(),
    source_refs: z.array(z.string()).optional(),
  })),
});

// Context Economy — normalized reducer input
export const ReducerActionTypeSchema = z.enum([
  "strip_ansi",
  "drop_lines_matching",
  "dedupe_adjacent_lines",
  "collapse_whitespace",
  "head_tail",
  "preserve_sections_matching",
  "preserve_experience_fidelity",
  "truncate",
]);

export const NormalizedReducerInputSchema = z.object({
  command: z.string().optional(),
  cmd: z.string().optional(),
  argv: z.array(z.string()).optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  combined_text: z.string().optional(),
  exit_code: z.number().int().nullable().optional(),
  source_metadata: z.record(z.unknown()).optional(),
  source_ref: z.string().optional(),
  source_hash: z.string().optional(),
});

export const ContextReducerRuleActionSchema = z.object({
  type: ReducerActionTypeSchema,
  pattern: z.string().optional(),
  head_lines: z.number().int().nonnegative().optional(),
  tail_lines: z.number().int().nonnegative().optional(),
  max_bytes: z.number().int().positive().optional(),
  section_pattern: z.string().optional(),
  window_lines: z.number().int().nonnegative().optional(),
  max_sections: z.number().int().positive().optional(),
});

export const ContextReducerRuleSchema = z.object({
  id: z.string().min(1),
  family: z.string().min(1),
  priority: z.number().int().nonnegative().default(0),
  confidence: z.number().min(0).max(1).default(1),
  tool_match: z.string().optional(),
  requires_command: z.boolean().default(false),
  argv_include: z.array(z.string()).optional(),
  argv_exclude: z.array(z.string()).optional(),
  command_include: z.array(z.string()).optional(),
  command_exclude: z.array(z.string()).optional(),
  content_pattern: z.string().optional(),
  source_match: z.record(z.unknown()).optional(),
  actions: z.array(ContextReducerRuleActionSchema),
  min_input_bytes: z.number().int().nonnegative().optional(),
  pass_through_file_inspection: z.boolean().default(true),
  preserve_failure_tail: z.boolean().default(false),
  preserve_failure_tail_lines: z.number().int().nonnegative().default(30),
});

export const ContextReductionResultSchema = z.object({
  applied: z.boolean(),
  text: z.string(),
  original_bytes: z.number().int().nonnegative(),
  reduced_bytes: z.number().int().nonnegative(),
  saved_bytes: z.number().int().nonnegative(),
  saved_ratio: z.number().min(0).max(1),
  matched_rule_id: z.string().nullable(),
  matched_rule_family: z.string().nullable(),
  matched_rule_confidence: z.number().min(0).max(1).nullable(),
  reducer_version: z.string().min(1),
  rule_set_hash: z.string().min(1),
  reduction_hash: z.string().min(1),
  source_ref: z.string().optional(),
  source_hash: z.string().optional(),
  facts: z.record(z.unknown()).default({}),
  counters: z.record(z.number()).default({}),
  warnings: z.array(z.string()).default([]),
});

export const ContextEconomyReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("context_economy_report"),
  reducer_version: z.string().min(1),
  rule_set_hash: z.string().min(1),
  items_seen: z.number().int().nonnegative(),
  items_reduced: z.number().int().nonnegative(),
  items_passed_through: z.number().int().nonnegative(),
  input_bytes: z.number().int().nonnegative(),
  output_bytes: z.number().int().nonnegative(),
  saved_bytes: z.number().int().nonnegative(),
  rule_hits: z.record(z.number().int().nonnegative()).default({}),
  family_hits: z.record(z.number().int().nonnegative()).default({}),
  warnings: z.array(z.string()).default([]),
  created_at: z.string(),
});

export const TrustTierSchema = z.enum([
  "pb_stable",
  "pb_personal_facet",
  "pb_candidate",
  "gbrain_sidecar",
  "agentmemory_sidecar",
  "remote_personal_agent",
  "external_untrusted",
]);

export const TrustBoundaryItemSchema = z.object({
  source_kind: z.string().min(1),
  authority: z.string().min(1),
  tier: TrustTierSchema,
  injectable: z.boolean(),
  source_hint: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).default({}),
}).strict();

export const ContextJuiceBudgetResultSchema = z.object({
  source_ref: z.string().min(1),
  source_hash: z.string().min(1).optional(),
  budget_id: z.string().min(1),
  original_bytes: z.number().int().nonnegative(),
  kept_bytes: z.number().int().nonnegative(),
  saved_bytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
  marker: z.string().optional(),
  full_body_available: z.boolean().default(true),
  warnings: z.array(z.string()).default([]),
}).strict();

export const TrajectoryMicrocompactResultSchema = z.object({
  source_ref: z.string().min(1),
  source_hash: z.string().min(1).optional(),
  budget_id: z.string().min(1),
  original_entries: z.number().int().nonnegative(),
  kept_entries: z.number().int().nonnegative(),
  cleared_entries: z.number().int().nonnegative(),
  protected_signal_count: z.number().int().nonnegative(),
  recent_results_kept: z.number().int().nonnegative(),
  idempotent: z.boolean(),
  warnings: z.array(z.string()).default([]),
}).strict();

export const ContextJuiceReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("context_juice_report"),
  budget_id: z.string().min(1),
  context_juice_version: z.string().min(1).default("context-juice-v1"),
  items_seen: z.number().int().nonnegative(),
  items_budgeted: z.number().int().nonnegative(),
  items_microcompacted: z.number().int().nonnegative(),
  original_bytes: z.number().int().nonnegative(),
  kept_bytes: z.number().int().nonnegative(),
  saved_bytes: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  protected_signal_count: z.number().int().nonnegative(),
  budget_results: z.array(ContextJuiceBudgetResultSchema).default([]),
  microcompact_results: z.array(TrajectoryMicrocompactResultSchema).default([]),
  created_at: z.string(),
}).strict();

export const SkillInjectionDecisionSchema = z.object({
  skill_id: z.string().min(1),
  decision: z.enum(["matched", "skipped"]),
  reason: z.string().min(1),
  injected_bytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
  scope: ScopeSchema,
  authority: TrustTierSchema,
  promotion_id: z.string().min(1).optional(),
  audit_id: z.string().min(1).optional(),
}).strict();

export const AgentContextBundleSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("agent_context_bundle"),
  mode: z.enum(["personal", "team"]),
  query: z.string().optional(),
  total_bytes: z.number().int().nonnegative(),
  budget_bytes: z.number().int().nonnegative(),
  sections: z.array(z.object({
    kind: z.enum([
      "safety",
      "personal_facets",
      "stable_knowledge",
      "promoted_skills",
      "runtime_lessons",
      "catalog",
      "graph_neighbors",
      "sidecar_hits",
      "citations",
      "omitted_summary",
    ]),
    tier: TrustTierSchema,
    items: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
  }).strict()).default([]),
  skill_decisions: z.array(SkillInjectionDecisionSchema).default([]),
  trust_summary: z.record(z.number().int().nonnegative()).default({}),
  omitted_item_count: z.number().int().nonnegative().default(0),
  warnings: z.array(z.string()).default([]),
  created_at: z.string(),
}).strict();

export const PersonalLearningFacetSchema = z.object({
  id: z.string().min(1),
  facet_class: z.enum(["style", "tooling", "veto", "goal", "identity", "channel"]),
  key: z.string().min(1),
  value: z.string().min(1),
  state: z.enum(["active", "provisional", "candidate", "dropped", "pinned", "forgotten"]),
  stability: z.number().min(0).max(1),
  evidence_count: z.number().int().nonnegative(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  cue_family: z.string().min(1).optional(),
  first_seen: z.string(),
  last_seen: z.string(),
  user_override: z.enum(["none", "pinned", "forgotten"]).default("none"),
}).strict();

export const PersonalLearningReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("personal_learning_report"),
  active_count: z.number().int().nonnegative(),
  provisional_count: z.number().int().nonnegative(),
  candidate_count: z.number().int().nonnegative(),
  pinned_count: z.number().int().nonnegative(),
  forgotten_count: z.number().int().nonnegative(),
  facets: z.array(PersonalLearningFacetSchema).default([]),
  warnings: z.array(z.string()).default([]),
  created_at: z.string(),
}).strict();

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
export type ExperienceSourceAgent = z.infer<typeof ExperienceSourceAgentSchema>;
export type ExperienceSourceType = z.infer<typeof ExperienceSourceTypeSchema>;
export type ExperienceSourceChannel = z.infer<typeof ExperienceSourceChannelSchema>;
export type ExperienceSourcePrivacyTrust = z.infer<typeof ExperienceSourcePrivacyTrustSchema>;
export type ExperienceSourceParser = z.infer<typeof ExperienceSourceParserSchema>;
export type ExperienceScopeHint = z.infer<typeof ExperienceScopeHintSchema>;
export type ExperiencePrivacyVerdict = z.infer<typeof ExperiencePrivacyVerdictSchema>;
export type ExperienceOutcome = z.infer<typeof ExperienceOutcomeSchema>;
export type ExperienceSourceConfig = z.infer<typeof ExperienceSourceConfigSchema>;
export type ExperienceEnvelope = z.infer<typeof ExperienceEnvelopeSchema>;
export type DailyExperienceReport = z.infer<typeof DailyExperienceReportSchema>;
export type PrivacyTriageClassification = z.infer<typeof PrivacyTriageClassificationSchema>;
export type PrivacyTriageDecision = z.infer<typeof PrivacyTriageDecisionSchema>;
export type PrivacyTriageAiDecision = z.infer<typeof PrivacyTriageAiDecisionSchema>;
export type PrivacyTriageReport = z.infer<typeof PrivacyTriageReportSchema>;
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
export type ReducerActionType = z.infer<typeof ReducerActionTypeSchema>;
export type NormalizedReducerInput = z.infer<typeof NormalizedReducerInputSchema>;
export type ContextReducerRuleAction = z.infer<typeof ContextReducerRuleActionSchema>;
export type ContextReducerRule = z.input<typeof ContextReducerRuleSchema>;
export type ContextReductionResult = z.infer<typeof ContextReductionResultSchema>;
export type ContextEconomyReport = z.infer<typeof ContextEconomyReportSchema>;
export type TrustTier = z.infer<typeof TrustTierSchema>;
export type TrustBoundaryItem = z.infer<typeof TrustBoundaryItemSchema>;
export type ContextJuiceBudgetResult = z.infer<typeof ContextJuiceBudgetResultSchema>;
export type TrajectoryMicrocompactResult = z.infer<typeof TrajectoryMicrocompactResultSchema>;
export type ContextJuiceReport = z.infer<typeof ContextJuiceReportSchema>;
export type SkillInjectionDecision = z.infer<typeof SkillInjectionDecisionSchema>;
export type AgentContextBundle = z.infer<typeof AgentContextBundleSchema>;
export type PersonalLearningFacet = z.infer<typeof PersonalLearningFacetSchema>;
export type PersonalLearningReport = z.infer<typeof PersonalLearningReportSchema>;
export type SkillEffectivenessHint = z.infer<typeof SkillEffectivenessHintSchema>;
export type TrajectoryStep = z.infer<typeof TrajectoryStepSchema>;
export type ToolOutcome = z.infer<typeof ToolOutcomeSchema>;
export type LifecycleDecision = z.infer<typeof LifecycleDecisionSchema>;
export type LifecycleObservation = z.infer<typeof LifecycleObservationSchema>;
export type LifecycleProposal = z.infer<typeof LifecycleProposalSchema>;
export type KnowledgeLifecycleReport = z.infer<typeof KnowledgeLifecycleReportSchema>;
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type KnowledgeCatalog = z.infer<typeof KnowledgeCatalogSchema>;
export type SkillValidationMode = z.infer<typeof SkillValidationModeSchema>;
export type SkillValidationDecision = z.infer<typeof SkillValidationDecisionSchema>;
export type SkillValidationCheck = z.infer<typeof SkillValidationCheckSchema>;
export type SkillValidationReport = z.infer<typeof SkillValidationReportSchema>;

// --- M23: Knowledge Lifecycle ---

export const LifecycleDecisionSchema = z.enum(["promote", "decay", "archive", "conflict", "no_op"]);

export const LifecycleObservationSchema = z.object({
  page_id: z.string().min(1),
  page_path: z.string().min(1),
  maturity: MaturitySchema,
  scope: ScopeSchema.optional(),
  source_refs: z.array(z.string().min(1)).default([]),
  source_hashes: z.array(z.string().min(1)).default([]),
  reference_count: z.number().int().nonnegative().default(0),
  updated_at: z.string().optional(),
  superseded_by: z.string().nullable().optional(),
});

export const LifecycleProposalSchema = z.object({
  page_id: z.string().min(1),
  page_path: z.string().min(1),
  decision: LifecycleDecisionSchema,
  reasons: z.array(z.string().min(1)),
  current_maturity: MaturitySchema,
  proposed_maturity: MaturitySchema.optional(),
  source_refs: z.array(z.string()).default([]),
  source_hashes: z.array(z.string()).default([]),
});

export const KnowledgeLifecycleReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("knowledge_lifecycle_report"),
  observations: z.array(LifecycleObservationSchema),
  proposals: z.array(LifecycleProposalSchema),
  changed_stable_knowledge: z.literal(false),
  warnings: z.array(z.string()).default([]),
  created_at: z.string(),
});

// --- M23: Knowledge Catalog ---

export const CatalogEntrySchema = z.object({
  page_id: z.string().min(1),
  page_path: z.string().min(1),
  title: z.string().min(1),
  scope: ScopeSchema.optional(),
  layer: LayerSchema.optional(),
  page_kind: z.string().optional(),
  maturity: MaturitySchema.optional(),
  related_skills: z.array(z.string()).default([]),
  source_refs: z.array(z.string()).default([]),
  source_hashes: z.array(z.string()).default([]),
  last_observed: z.string().optional(),
  last_validated: z.string().optional(),
});

export const KnowledgeCatalogSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("knowledge_catalog"),
  entries: z.array(CatalogEntrySchema),
  grouped_by_scope: z.record(z.array(z.string())).default({}),
  grouped_by_layer: z.record(z.array(z.string())).default({}),
  grouped_by_type: z.record(z.array(z.string())).default({}),
  grouped_by_maturity: z.record(z.array(z.string())).default({}),
  changed_stable_knowledge: z.literal(false),
  warnings: z.array(z.string()).default([]),
  created_at: z.string(),
});

// --- M23: Skill Validation ---

export const SkillValidationModeSchema = z.enum(["static", "evidence_simulation", "replay"]);
export const SkillValidationDecisionSchema = z.enum(["pass", "fail", "needs_human"]);

export const SkillValidationCheckSchema = z.object({
  check: z.string().min(1),
  passed: z.boolean(),
  details: z.string().optional(),
});

export const SkillValidationReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: ProtocolVersionSchema,
  type: z.literal("skill_validation_report"),
  candidate_id: z.string().min(1),
  target_path: z.string().min(1).optional(),
  source_hashes: z.array(z.string().min(1)).optional(),
  mode: SkillValidationModeSchema,
  evidence_ids: z.array(z.string().min(1)).default([]),
  checks: z.array(SkillValidationCheckSchema),
  decision: SkillValidationDecisionSchema,
  reason: z.string().min(1),
  created_at: z.string(),
});
