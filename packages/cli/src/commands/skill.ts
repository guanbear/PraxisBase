import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { readJson } from "@praxisbase/core/store/file-store.js";
import { DistilledExperienceSchema, type DistilledExperience } from "@praxisbase/core/ai/distill.js";
import { createOpenAiCompatibleJsonClient, type AiJsonClient } from "@praxisbase/core/ai/client.js";
import { readAiProviderConfig } from "@praxisbase/core/ai/config.js";
import { promoteApprovedProposal } from "@praxisbase/core/promote/promote.js";
import { findApprovedSkillPromotionAudit } from "@praxisbase/core/synthesis/skill-audit.js";
import { skillCandidateToKnowledgeProposal, synthesizeSkillCandidates } from "@praxisbase/core/synthesis/skill.js";
import { SemanticSkillReviewSchema, SkillPromotionAuditSchema, SkillSynthesisCandidateSchema } from "@praxisbase/core/synthesis/skill-model.js";
import { validateSkillCandidateFromProposal, findFreshPassingValidationReport } from "@praxisbase/core/synthesis/skill-validation.js";
import { buildWikiSite } from "@praxisbase/core/wiki/render-site.js";
import { PROTOCOL_VERSION } from "@praxisbase/core/protocol/types.js";
import type { AgentProfile } from "@praxisbase/core/protocol/types.js";
import { renderSkillInjectionBundle, type PromotedSkill } from "@praxisbase/core/agent-access/skill-injection.js";
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
  query?: string;
  aiClient?: AiJsonClient;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  requireValidation?: boolean;
}

async function listFilesRecursively(root: string, relativeDir: string): Promise<string[]> {
  const dir = join(root, relativeDir);
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await listFilesRecursively(root, relativePath));
    else if (entry.isFile() && entry.name === "SKILL.md") files.push(relativePath);
  }
  return files.sort();
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

export async function loadPromotedSkills(root: string): Promise<PromotedSkill[]> {
  const paths = await listFilesRecursively(root, "skills");
  const skills: PromotedSkill[] = [];
  for (const path of paths) {
    const raw = await readFile(join(root, path), "utf8");
    const parsed = parseFrontmatter(raw);
    const data = parsed.data;
    const id = typeof data.name === "string" && data.name ? data.name : path.split("/").slice(-2, -1)[0] ?? path;
    skills.push({
      id,
      path,
      title: typeof data.description === "string" ? data.description : id,
      origin: typeof data.origin === "string" ? data.origin : "praxisbase_synthesized",
      status: typeof data.status === "string" ? data.status : "promoted",
      scope: data.scope === "team" || data.scope === "org" || data.scope === "project" ? data.scope : "personal",
      body: parsed.content.trim(),
      when_to_use: parsed.content.match(/## When To Use\s+([\s\S]*?)(?:\n## |\n# |$)/i)?.[1]?.trim(),
      tags: stringArray(data.tags),
      related_wiki_paths: stringArray(data.related_wiki_paths),
      promotion_id: typeof data.promotion_id === "string" ? data.promotion_id : undefined,
      audit_id: typeof data.audit_id === "string" ? data.audit_id : undefined,
    });
  }
  return skills;
}

function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  if (!raw.startsWith("---\n")) return { data: {}, content: raw };
  const end = raw.indexOf("\n---", 4);
  if (end < 0) return { data: {}, content: raw };
  const block = raw.slice(4, end).trim();
  const data: Record<string, unknown> = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value.slice(1, -1).split(",").map((item) => item.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      data[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return { data, content: raw.slice(end + 4).trimStart() };
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

    const requireValidation = options.requireValidation ?? true;
    if (requireValidation) {
      const validation = await findFreshPassingValidationReport(root, candidate);
      if (validation.status !== "pass") {
        const codeMap: Record<string, string> = {
          missing: "SKILL_PROMOTION_REQUIRES_VALIDATION",
          stale: "SKILL_PROMOTION_VALIDATION_STALE",
          mismatched: "SKILL_PROMOTION_VALIDATION_MISMATCHED",
          failing: "SKILL_PROMOTION_VALIDATION_FAILING",
        };
        const result = {
          ok: false,
          code: codeMap[validation.status],
          message: validation.status === "missing"
            ? "Stable skill promotion requires a fresh passing validation report. Run `praxisbase skill validate --proposal <id> --json` first."
            : `Stable skill promotion blocked: ${validation.reason}`,
        };
        return options.json ? JSON.stringify(result, null, 2) : result.message;
      }
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

  if (subcommand === "inject-preview") {
    const result = renderSkillInjectionBundle({
      query: options.query ?? "",
      skills: await loadPromotedSkills(root),
    });
    return options.json ? JSON.stringify({ ok: true, ...result }, null, 2) : result.text;
  }

  if (subcommand === "validate") {
    if (!options.proposal) throw new Error("skill validate requires --proposal <id>.");
    const { report, reportPath } = await validateSkillCandidateFromProposal(root, options.proposal, {
      now: options.now,
      write: !options.dryRun,
    });
    if (options.json) {
      return JSON.stringify({ ok: true, report, report_path: reportPath }, null, 2);
    }
    return reportPath
      ? `Validation ${report.decision}: ${report.reason}\nReport: ${reportPath}`
      : `Validation ${report.decision}: ${report.reason}`;
  }

  throw new Error(`Unknown subcommand "skill ${subcommand}". Use "skill synthesize", "skill curate", "skill review", "skill promote", "skill inject-preview", "skill validate", or "skill export".`);
}
