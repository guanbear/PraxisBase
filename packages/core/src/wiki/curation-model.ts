import { z } from "zod";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { ProposalSchema, type Proposal, ScopeSchema, TargetTypeSchema } from "../protocol/schemas.js";
import { makeWikiSlug } from "./model.js";

export const WikiEvidenceKindSchema = z.enum([
  "capture",
  "episode",
  "native_memory",
  "distilled_experience",
  "proposal_candidate",
  "external_ref",
]);

export const WikiCurationPageKindSchema = z.enum([
  "known_fix",
  "procedure",
  "decision",
  "pitfall",
  "preference",
  "incident",
  "note",
  "skill",
]);

export const WikiEvidenceItemSchema = z.object({
  id: z.string().min(1),
  kind: WikiEvidenceKindSchema,
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  agent: z.enum(["codex", "openclaw", "claude-code", "opencode", "generic"]).optional(),
  scope: ScopeSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  problem: z.string().optional(),
  context: z.string().optional(),
  actions: z.array(z.string()).default([]),
  failed_attempts: z.array(z.string()).default([]),
  outcome: z.enum(["success", "failed", "partial", "unknown"]).optional(),
  verification: z.array(z.string()).default([]),
  reusable_lessons: z.array(z.string()).default([]),
  signatures: z.array(z.string()).default([]),
  suggested_wiki_kind: WikiCurationPageKindSchema.optional(),
  privacy_verdict: z.enum(["safe", "personal_only", "team_allowed", "human_required", "reject"]),
  created_at: z.string().optional(),
});

export type WikiEvidenceItem = z.infer<typeof WikiEvidenceItemSchema>;

export const WikiSourceSummarySchema = z.object({
  id: z.string().min(1),
  type: z.literal("wiki_source_summary"),
  source_id: z.string().min(1),
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  source_kind: WikiEvidenceKindSchema.or(z.literal("stable_kb")).or(z.literal("skill")).or(z.literal("review")),
  scope: ScopeSchema,
  summary: z.string().min(1),
  entities: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  observation_ids: z.array(z.string()).default([]),
  topic_keys: z.array(z.string()).default([]),
  privacy_verdict: z.enum(["safe", "personal_only", "team_allowed", "human_required", "reject"]),
  contributed_to_pages: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
});

export type WikiSourceSummary = z.infer<typeof WikiSourceSummarySchema>;

export const WikiRootArtifactSchema = z.object({
  id: z.string().min(1),
  type: z.literal("wiki_root_artifact"),
  kind: z.enum(["purpose", "schema", "index", "log", "overview"]),
  path: z.string().min(1),
  title: z.string().min(1),
  body_markdown: z.string().min(1),
  generated_at: z.string().datetime(),
});

export type WikiRootArtifact = z.infer<typeof WikiRootArtifactSchema>;

export const WikiRelationshipTypeSchema = z.enum([
  "related", "uses", "depends_on", "fixes", "caused_by",
  "verified_by", "contradicts", "supersedes", "same_topic_as", "source_overlap",
]);

export type WikiRelationshipType = z.infer<typeof WikiRelationshipTypeSchema>;

export const WikiTypedRelationshipSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: WikiRelationshipTypeSchema,
  confidence: z.number().min(0).max(1),
  source_refs: z.array(z.string()).default([]),
});

export type WikiTypedRelationship = z.infer<typeof WikiTypedRelationshipSchema>;

export const WikiEvidenceClusterSchema = z.object({
  id: z.string().min(1),
  cluster_key: z.string().min(1),
  target_path_hint: z.string().optional(),
  normalized_title: z.string().min(1),
  page_kind: WikiCurationPageKindSchema,
  scope: ScopeSchema,
  evidence_ids: z.array(z.string().min(1)).min(1),
  source_refs: z.array(z.string().min(1)).min(1),
  source_hashes: z.array(z.string().min(1)).min(1),
  source_count: z.number().int().min(1),
  signatures: z.array(z.string()).default([]),
  confidence_hint: z.number().min(0).max(1),
  reasons: z.array(z.string()).default([]),
  conflicts: z.array(z.object({
    field: z.string().min(1),
    values: z.array(z.string().min(1)),
    evidence_ids: z.array(z.string().min(1)),
  })).default([]),
});

export type WikiEvidenceCluster = z.infer<typeof WikiEvidenceClusterSchema>;

export const WikiRequiredLinkSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
  reason: z.string().min(1),
});

export type WikiRequiredLink = z.infer<typeof WikiRequiredLinkSchema>;

export const WikiSuggestedLinkSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
  reason: z.string().min(1),
});

export type WikiSuggestedLink = z.infer<typeof WikiSuggestedLinkSchema>;

export const WikiMergeCandidateSchema = z.object({
  title: z.string().min(1),
  path: z.string().min(1),
  reason: z.string().min(1),
});

export type WikiMergeCandidate = z.infer<typeof WikiMergeCandidateSchema>;

export const RelatedWikiPageSchema = z.object({
  slug: z.string().min(1),
  path: z.string().min(1),
  title: z.string().min(1),
});

export type RelatedWikiPage = z.infer<typeof RelatedWikiPageSchema>;

export const CuratedWikiProposalSchema = z.object({
  id: z.string().min(1),
  protocol_version: z.literal(PROTOCOL_VERSION),
  type: z.literal("wiki_curated_proposal"),
  target_path: z.string().min(1),
  action: z.enum(["create", "update", "supersede", "archive", "skill_create", "skill_update"]),
  page_kind: WikiCurationPageKindSchema,
  scope: ScopeSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  body_markdown: z.string().min(1),
  source_refs: z.array(z.string().min(1)).min(1),
  source_hashes: z.array(z.string().min(1)).min(1),
  source_count: z.number().int().min(1),
  evidence_ids: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  maturity: z.enum(["draft", "reviewed", "proven", "deprecated"]),
  provenance: z.array(z.object({
    source_ref: z.string().min(1),
    source_hash: z.string().min(1),
    excerpt: z.string().optional(),
  })).min(1),
  review_hint: z.object({
    why_review: z.string().min(1),
    suggested_decision: z.enum(["approve", "edit", "reject", "split", "merge"]),
    risk_notes: z.array(z.string()).default([]),
  }),
  guards: z.array(z.object({
    id: z.string().min(1),
    ok: z.boolean(),
    message: z.string().min(1),
  })).default([]),
  related_pages: z.array(RelatedWikiPageSchema).optional(),
  required_links: z.array(WikiRequiredLinkSchema).optional(),
  suggested_links: z.array(WikiSuggestedLinkSchema).optional(),
  merge_candidates: z.array(WikiMergeCandidateSchema).optional(),
  relationship_reasons: z.array(z.string()).optional(),
  lifecycle: z.enum(["active", "stale", "superseded", "archived"]).default("active"),
  last_confirmed_at: z.string().datetime().optional(),
  supersedes: z.array(z.string()).default([]),
  superseded_by: z.string().nullable().default(null),
  relationship_types: z.array(WikiRelationshipTypeSchema).default([]),
  created_at: z.string().datetime(),
});

export type CuratedWikiProposal = z.infer<typeof CuratedWikiProposalSchema>;

const WikiRelationshipCountsSchema = z.object({
  required_links: z.number().int().min(0).default(0),
  suggested_links: z.number().int().min(0).default(0),
  merge_plans: z.number().int().min(0).default(0),
  ambiguous_merge_targets: z.number().int().min(0).default(0),
  isolated_topics: z.number().int().min(0).default(0),
  orphan_risk_after_plan: z.number().int().min(0).default(0),
}).default({
  required_links: 0,
  suggested_links: 0,
  merge_plans: 0,
  ambiguous_merge_targets: 0,
  isolated_topics: 0,
  orphan_risk_after_plan: 0,
});

export const WikiCurationReportSchema = z.object({
  id: z.string().min(1),
  protocol_version: z.literal(PROTOCOL_VERSION),
  type: z.literal("wiki_curation_report"),
  created_at: z.string().datetime(),
  mode: z.enum(["dry-run", "review"]),
  ai: z.object({
    configured: z.boolean(),
    mode: z.enum(["production", "degraded"]),
    model: z.string().optional(),
  }),
  input_counts: z.object({
    evidence_items: z.number().int().min(0),
    filtered_noise: z.number().int().min(0),
    human_required: z.number().int().min(0),
    rejected: z.number().int().min(0),
    clusters: z.number().int().min(0),
  }),
  output_counts: z.object({
    curated_proposals: z.number().int().min(0),
    written_proposals: z.number().int().min(0),
    conflicts: z.number().int().min(0),
  }),
  compiler_counts: z.object({
    observations: z.number().int().min(0).default(0),
    topics: z.number().int().min(0).default(0),
    page_plans_by_action: z.object({
      create: z.number().int().min(0).default(0),
      update: z.number().int().min(0).default(0),
      merge: z.number().int().min(0).default(0),
      supersede: z.number().int().min(0).default(0),
      archive: z.number().int().min(0).default(0),
    }).default({ create: 0, update: 0, merge: 0, supersede: 0, archive: 0 }),
    duplicate_source_hash_groups: z.number().int().min(0).default(0),
    hard_blocks: z.number().int().min(0).default(0),
    human_required_quality: z.number().int().min(0).default(0),
    relationship_counts: WikiRelationshipCountsSchema,
  }).default(() => ({
    observations: 0,
    topics: 0,
    page_plans_by_action: { create: 0, update: 0, merge: 0, supersede: 0, archive: 0 },
    duplicate_source_hash_groups: 0,
    hard_blocks: 0,
    human_required_quality: 0,
    relationship_counts: {
      required_links: 0,
      suggested_links: 0,
      merge_plans: 0,
      ambiguous_merge_targets: 0,
      isolated_topics: 0,
      orphan_risk_after_plan: 0,
    },
  })).optional(),
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
  })).optional(),
  proposals: z.array(z.object({
    id: z.string().min(1),
    target_path: z.string().min(1),
    title: z.string().min(1),
    source_count: z.number().int().min(1),
    confidence: z.number().min(0).max(1),
  })),
  warnings: z.array(z.string()).default([]),
});

export type WikiCurationReport = z.infer<typeof WikiCurationReportSchema>;

export const WikiObservationKindSchema = z.enum([
  "fix",
  "procedure",
  "decision",
  "pitfall",
  "preference",
  "incident",
  "note",
]);

export type WikiObservationKind = z.infer<typeof WikiObservationKindSchema>;

/** A reusable observation extracted from evidence by the new compiler pipeline. */
export const WikiObservationSchema = z.object({
  id: z.string().min(1),
  evidence_id: z.string().min(1),
  source_ref: z.string().min(1),
  source_hash: z.string().min(1),
  agent: z.enum(["codex", "openclaw", "claude-code", "opencode", "generic"]).optional(),
  scope: ScopeSchema,
  kind: WikiObservationKindSchema,
  problem: z.string().optional(),
  action: z.string().optional(),
  outcome: z.enum(["success", "failed", "partial", "unknown"]).optional(),
  verification: z.string().optional(),
  reusable_lesson: z.string().optional(),
  entities: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  raw_excerpt: z.string().optional(),
  confidence: z.number().min(0).max(1),
  privacy_verdict: z.enum(["safe", "personal_only", "team_allowed", "human_required", "reject"]),
  filtered_out: z.boolean().default(false),
  filter_reason: z.string().optional(),
  created_at: z.string().optional(),
});

export type WikiObservation = z.infer<typeof WikiObservationSchema>;

/** A canonical topic that clusters related observations. */
export const WikiTopicSchema = z.object({
  id: z.string().min(1),
  topic_key: z.string().min(1),
  title: z.string().min(1),
  observation_ids: z.array(z.string().min(1)).min(1),
  page_kind: WikiCurationPageKindSchema,
  target_path: z.string().min(1),
  scope: ScopeSchema,
  source_refs: z.array(z.string().min(1)).min(1),
  source_hashes: z.array(z.string().min(1)).min(1),
  source_count: z.number().int().min(1),
  entities: z.array(z.string()).default([]),
  related_topic_keys: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  maturity: z.enum(["draft", "reviewed", "proven", "deprecated"]),
  conflicts: z.array(z.object({
    claim: z.string().min(1),
    source_refs: z.array(z.string().min(1)).min(1),
    reason: z.string().min(1),
  })).default([]),
});

export type WikiTopic = z.infer<typeof WikiTopicSchema>;

/** Action to take for a page in the plan. */
export const WikiPagePlanActionSchema = z.enum([
  "create",
  "update",
  "merge",
  "supersede",
  "archive",
]);

export type WikiPagePlanAction = z.infer<typeof WikiPagePlanActionSchema>;

/** A planned action (create/update/merge/supersede/archive) for a wiki page. */
export const WikiPagePlanSchema = z.object({
  action: WikiPagePlanActionSchema,
  target_path: z.string().min(1),
  existing_path: z.string().optional(),
  canonical_title: z.string().min(1),
  topic_key: z.string().min(1),
  reasons: z.array(z.string()).default([]),
  related_paths: z.array(z.string()).default([]),
  required_links: z.array(z.string()).default([]),
  existing_source_hash: z.string().optional(),
});

export type WikiPagePlan = z.infer<typeof WikiPagePlanSchema>;

/** Hard-block reason codes for the promotion quality gate. */
export const WikiHardBlockReasonSchema = z.enum([
  "unsafe_path",
  "missing_provenance",
  "private_material",
  "raw_json",
  "raw_transcript",
  "template_fallback",
  "reference_only",
  "duplicate_source_hash",
  "body_missing_wiki_structure",
  "create_with_existing_page",
  "non_reusable_topic",
  "generic_applicability",
  "non_specific_action",
  "incoherent_topic",
]);

/** Human-required reason codes for the promotion quality gate. */
export const WikiHumanRequiredReasonSchema = z.enum([
  "weak_single_source",
  "low_confidence",
  "unresolved_conflict",
  "missing_wikilinks",
  "team_or_global_scope",
  "skill_or_policy_target",
  "destructive_action",
  "ambiguous_merge_target",
  "multiple_canonical_targets",
  "one_off_run_report",
]);

/** Promotion quality assessment result for a page plan. */
export const WikiPromotionQualityAssessmentSchema = z.object({
  topic_key: z.string().min(1),
  hard_blocks: z.array(WikiHardBlockReasonSchema).default([]),
  human_required: z.array(WikiHumanRequiredReasonSchema).default([]),
  passed: z.boolean(),
});

export type WikiPromotionQualityAssessment = z.infer<typeof WikiPromotionQualityAssessmentSchema>;

function targetTypeForPageKind(pageKind: CuratedWikiProposal["page_kind"]): Proposal["target_type"] {
  if (pageKind === "skill") return "skill";
  if (pageKind === "known_fix" || pageKind === "procedure" || pageKind === "decision" || pageKind === "pitfall") {
    return TargetTypeSchema.parse(pageKind);
  }
  return "note";
}

function proposalActionForCurated(action: CuratedWikiProposal["action"]): Proposal["action"] {
  if (action === "archive" || action === "supersede") return "archive";
  if (action === "update" || action === "skill_update") return "patch";
  return "create";
}

function targetIdFromPath(path: string, title: string): string {
  const parts = path.split("/");
  const leaf = parts[parts.length - 1] ?? title;
  const withoutExtension = leaf === "SKILL.md" ? parts[parts.length - 2] ?? title : leaf.replace(/\.md$/i, "");
  return makeWikiSlug(withoutExtension || title);
}

function knowledgeTypeForPageKind(pageKind: CuratedWikiProposal["page_kind"]): string {
  if (pageKind === "known_fix" || pageKind === "procedure" || pageKind === "decision" || pageKind === "pitfall" || pageKind === "skill") {
    return pageKind;
  }
  return "note";
}

function riskForPageKind(pageKind: CuratedWikiProposal["page_kind"]): string {
  if (pageKind === "decision") return "high";
  if (pageKind === "known_fix" || pageKind === "procedure" || pageKind === "pitfall" || pageKind === "skill") return "medium";
  return "low";
}

function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

function curatedMaturity(value: CuratedWikiProposal["maturity"]): string {
  if (value === "proven") return "proven";
  return "draft";
}

function withKnowledgeFrontmatter(proposal: CuratedWikiProposal, targetId: string): string {
  if (/^---\n/.test(proposal.body_markdown)) return proposal.body_markdown;
  const knowledgeType = knowledgeTypeForPageKind(proposal.page_kind);
  const frontmatter = [
    "---",
    `id: ${targetId}`,
    `title: ${yamlQuote(proposal.title)}`,
    `protocol_version: ${yamlQuote(PROTOCOL_VERSION)}`,
    `type: ${knowledgeType}`,
    `knowledge_type: ${knowledgeType}`,
    `scope: ${proposal.scope}`,
    `risk: ${riskForPageKind(proposal.page_kind)}`,
    "status: draft",
    `maturity: ${curatedMaturity(proposal.maturity)}`,
    "sources:",
    ...proposal.provenance.flatMap((entry) => [
      `  - uri: ${yamlQuote(entry.source_ref)}`,
      `    hash: ${yamlQuote(entry.source_hash)}`,
    ]),
    `source_count: ${proposal.source_count}`,
    `confidence: ${proposal.confidence}`,
    `updated_at: ${yamlQuote(proposal.created_at)}`,
    "---",
  ].join("\n");
  return `${frontmatter}\n${proposal.body_markdown.trim()}\n`;
}

export function curatedWikiProposalToKnowledgeProposal(value: unknown): Proposal {
  const proposal = CuratedWikiProposalSchema.parse(value);
  const targetId = targetIdFromPath(proposal.target_path, proposal.title);
  return ProposalSchema.parse({
    id: proposal.id,
    protocol_version: PROTOCOL_VERSION,
    type: "knowledge_proposal",
    scope: proposal.scope,
    action: proposalActionForCurated(proposal.action),
    target_type: targetTypeForPageKind(proposal.page_kind),
    target_id: targetId,
    agent_id: "praxisbase-wiki-curator",
    agent_type: "curator",
    environment_id: "local",
    run_id: proposal.evidence_ids[0],
    idempotency_key: proposal.id,
    evidence: {
      source_uri: proposal.source_refs[0],
      source_hash: proposal.source_hashes.join(","),
      excerpt: proposal.summary,
      repair_result: "unknown",
      verification: "Curated wiki proposal generated from safe evidence cluster. Inspect provenance before promotion.",
      source_refs: proposal.provenance.map((entry) => ({ uri: entry.source_ref, hash: entry.source_hash })),
      redacted_summary: proposal.summary,
    },
    patch: {
      path: proposal.target_path,
      content: withKnowledgeFrontmatter(proposal, targetId),
    },
    created_at: proposal.created_at,
  });
}
