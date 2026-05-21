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
  created_at: z.string().datetime(),
});

export type CuratedWikiProposal = z.infer<typeof CuratedWikiProposalSchema>;

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
