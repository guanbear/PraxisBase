import { readdir } from "node:fs/promises";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { readJson } from "@praxisbase/core/store/file-store.js";
import { DistilledExperienceSchema, type DistilledExperience } from "@praxisbase/core/ai/distill.js";
import { createOpenAiCompatibleJsonClient, type AiJsonClient } from "@praxisbase/core/ai/client.js";
import { readAiProviderConfig } from "@praxisbase/core/ai/config.js";
import { promoteApprovedProposal } from "@praxisbase/core/promote/promote.js";
import { findApprovedSkillPromotionAudit } from "@praxisbase/core/synthesis/skill-audit.js";
import { skillCandidateToKnowledgeProposal, synthesizeSkillCandidates } from "@praxisbase/core/synthesis/skill.js";
import { SemanticSkillReviewSchema, SkillPromotionAuditSchema, SkillSynthesisCandidateSchema } from "@praxisbase/core/synthesis/skill-model.js";
import { buildWikiSite } from "@praxisbase/core/wiki/render-site.js";
import { PROTOCOL_VERSION } from "@praxisbase/core/protocol/types.js";
import type { AgentProfile } from "@praxisbase/core/protocol/types.js";
import { agentToolsCommand } from "./agent-tools.js";

export interface SkillCommandOptions {
  mode?: "personal" | "team" | "team-git";
  review?: boolean;
  dryRun?: boolean;
  json?: boolean;
  now?: string;
  maxClusters?: number;
  proposal?: string;
  agent?: AgentProfile;
  aiClient?: AiJsonClient;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

function authorityMode(mode?: "personal" | "team" | "team-git"): "personal-local" | "team-git" {
  return mode === "team" || mode === "team-git" ? "team-git" : "personal-local";
}

async function loadDistilledExperiences(root: string): Promise<DistilledExperience[]> {
  let files: string[];
  try {
    files = await readdir(`${root}/${protocolPaths.cacheAiDistill}`);
  } catch {
    return [];
  }
  const experiences: DistilledExperience[] = [];
  for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
    try {
      const value = await readJson<Record<string, unknown>>(root, `${protocolPaths.cacheAiDistill}/${file}`);
      if (value.type !== "ai_distill_cache_entry" || value.status !== "distilled") continue;
      const parsed = DistilledExperienceSchema.safeParse(value.experience);
      if (parsed.success) experiences.push(parsed.data);
    } catch {
      continue;
    }
  }
  return experiences;
}

async function configuredAiClient(root: string, options: SkillCommandOptions): Promise<AiJsonClient | undefined> {
  if (options.aiClient) return options.aiClient;
  const config = await readAiProviderConfig(root);
  if (!config) return undefined;
  return createOpenAiCompatibleJsonClient({
    config: { ...config, model: config.review_model ?? config.model },
    env: options.env,
    fetchImpl: options.fetchImpl,
  });
}

async function countReviewQueue(root: string): Promise<{
  candidates: number;
  semantic_reviews: number;
  approved_audits: number;
  promotion_ready: number;
}> {
  let proposalFiles: string[] = [];
  let reviewFiles: string[] = [];
  try {
    proposalFiles = await readdir(`${root}/${protocolPaths.inboxProposals}`);
  } catch {
    proposalFiles = [];
  }
  try {
    reviewFiles = await readdir(`${root}/${protocolPaths.inboxReviews}`);
  } catch {
    reviewFiles = [];
  }

  const candidates = [];
  for (const file of proposalFiles.filter((name) => name.endsWith(".json")).sort()) {
    try {
      const parsed = SkillSynthesisCandidateSchema.safeParse(await readJson<unknown>(root, `${protocolPaths.inboxProposals}/${file}`));
      if (parsed.success) candidates.push(parsed.data);
    } catch {
      continue;
    }
  }

  let semanticReviews = 0;
  let approvedAudits = 0;
  for (const file of reviewFiles.filter((name) => name.endsWith(".json")).sort()) {
    try {
      const value = await readJson<unknown>(root, `${protocolPaths.inboxReviews}/${file}`);
      const semantic = SemanticSkillReviewSchema.safeParse(value);
      if (semantic.success) semanticReviews++;
      const audit = SkillPromotionAuditSchema.safeParse(value);
      if (audit.success && audit.data.decision === "approved") approvedAudits++;
    } catch {
      continue;
    }
  }

  let promotionReady = 0;
  for (const candidate of candidates) {
    const audit = await findApprovedSkillPromotionAudit(root, skillCandidateToKnowledgeProposal(candidate));
    if (audit) promotionReady++;
  }

  return {
    candidates: candidates.length,
    semantic_reviews: semanticReviews,
    approved_audits: approvedAudits,
    promotion_ready: promotionReady,
  };
}

export async function skillCommand(root: string, subcommand: string, options: SkillCommandOptions): Promise<string> {
  if (subcommand === "synthesize" || subcommand === "curate") {
    const mode = options.dryRun || !options.review ? "dry-run" as const : "review" as const;
    const result = await synthesizeSkillCandidates(root, {
      mode,
      authorityMode: authorityMode(options.mode),
      experiences: await loadDistilledExperiences(root),
      aiClient: await configuredAiClient(root, options),
      now: options.now,
      maxClusters: options.maxClusters,
    });
    return options.json ? JSON.stringify({ ok: true, report: result.report, candidates: result.candidates }, null, 2) : `Skill synthesis report: ${result.report.id}`;
  }

  if (subcommand === "review") {
    const site = await buildWikiSite(root);
    const queue = await countReviewQueue(root);
    const result = {
      ok: true,
      site,
      queue,
      next: queue.promotion_ready > 0
        ? "Run praxisbase skill promote --proposal <id> --json for promotion-ready candidates."
        : "Inspect dist/review.html and add a skill_promotion_audit after human approval.",
    };
    return options.json ? JSON.stringify(result, null, 2) : result.next;
  }

  if (subcommand === "promote") {
    if (!options.proposal) throw new Error("skill promote requires --proposal <id>.");
    const candidateValue = await readJson<unknown>(root, `${protocolPaths.inboxProposals}/${options.proposal}.json`);
    const candidate = SkillSynthesisCandidateSchema.parse(candidateValue);
    const proposal = skillCandidateToKnowledgeProposal(candidate);
    const audit = await findApprovedSkillPromotionAudit(root, proposal);
    if (!audit) {
      const result = {
        ok: false,
        code: "SKILL_PROMOTION_REQUIRES_AUDIT",
        message: "Stable skills/** promotion is blocked until an approved skill promotion audit is present.",
      };
      return options.json ? JSON.stringify(result, null, 2) : result.message;
    }
    await promoteApprovedProposal(root, {
      proposal,
      review: {
        id: `review_${audit.id}`,
        protocol_version: PROTOCOL_VERSION,
        proposal_id: proposal.id,
        reviewer_id: audit.reviewer.id,
        reviewer_model: audit.reviewer.kind,
        prompt_version: "skill-promotion-audit",
        decision: "approve",
        risk: "medium",
        confidence: 1,
        reasons: [`Approved by skill promotion audit ${audit.id}.`],
        required_checks: [],
        created_at: audit.created_at,
      },
    });
    const result = { ok: true, proposal_id: proposal.id, audit_id: audit.id, target_path: proposal.patch.path };
    return options.json ? JSON.stringify(result, null, 2) : `Skill promoted: ${proposal.patch.path}`;
  }

  if (subcommand === "export") {
    if (!options.agent) throw new Error("skill export requires --agent <agent>.");
    return agentToolsCommand(root, "generate", { agent: options.agent, json: options.json });
  }

  throw new Error(`Unknown subcommand "skill ${subcommand}". Use "skill synthesize", "skill curate", "skill review", "skill promote", or "skill export".`);
}
