import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildContext } from "@praxisbase/core";
import type { AgentProfile, ContextStage } from "@praxisbase/core";
import { buildAgentContextBundle } from "@praxisbase/core/agent-access/context-bundle.js";
import { renderSkillInjectionBundle } from "@praxisbase/core/agent-access/skill-injection.js";
import { applySourceItemBudget, DEFAULT_SOURCE_FILE_CAP_BYTES } from "@praxisbase/core/experience/context-juice.js";
import {
  normalizePersonalFacets,
  scorePersonalFacet,
  type PersonalFacetCandidate,
} from "@praxisbase/core/experience/personal-learning.js";
import type { PersonalLearningFacet } from "@praxisbase/core/protocol/schemas.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { writeJson } from "@praxisbase/core/store/file-store.js";
import { loadPromotedSkills } from "./skill.js";

export interface ContextCommandOptions {
  agent: AgentProfile;
  stage: ContextStage;
  query?: string;
  maxBytes?: string;
  withAgentMemory?: boolean;
  withGbrain?: boolean;
  withBackend?: string[];
  mode?: "personal" | "team";
  source?: string;
  json?: boolean;
}

async function readPersonalFacets(root: string, now?: string): Promise<PersonalLearningFacet[]> {
  let raw = "";
  try {
    raw = await readFile(join(root, protocolPaths.personalFacets), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const facets: PersonalLearningFacet[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    facets.push(scorePersonalFacet(JSON.parse(trimmed) as PersonalFacetCandidate, { now }));
  }
  return normalizePersonalFacets(facets);
}

export async function contextCommand(root: string, subcommand: string, options: ContextCommandOptions): Promise<string> {
  if (subcommand === "juice") {
    if (!options.source) throw new Error("context juice requires --source <path>.");
    const raw = await readFile(join(root, options.source), "utf8");
    const result = applySourceItemBudget(raw, {
      maxBytes: DEFAULT_SOURCE_FILE_CAP_BYTES,
      budgetId: "context-juice-v1:cli-source-file-64k",
      fullBodyAvailable: true,
    }, {
      sourceRef: options.source,
    });
    return options.json ? JSON.stringify({ ok: true, result }, null, 2) : result.text;
  }

  if (subcommand !== "get" && subcommand !== "bundle") {
    throw new Error(`Unknown subcommand "context ${subcommand}". Use "context get", "context bundle", or "context juice".`);
  }

  const context = await buildContext({
    root,
    agent: options.agent,
    workspace: root,
    stage: options.stage,
    query: options.query ?? "",
    maxBytes: options.maxBytes ? parseInt(options.maxBytes, 10) : undefined,
    withAgentMemory: options.withAgentMemory,
    withGbrain: options.withGbrain,
    withBackends: options.withBackend,
    fetchImpl: fetch,
    env: process.env as Record<string, string | undefined>,
  });

  if (subcommand === "bundle") {
    const mode = options.mode ?? "personal";
    const skills = await loadPromotedSkills(root);
    const injectedSkills = renderSkillInjectionBundle({
      query: options.query ?? "",
      skills,
    });
    const matchedSkillIds = new Set(injectedSkills.decisions
      .filter((decision) => decision.decision === "matched" && decision.injected_bytes > 0)
      .map((decision) => decision.skill_id));
    const skillItems = skills
      .filter((skill) => matchedSkillIds.has(skill.id))
      .map((skill) => ({
        id: skill.id,
        path: skill.path ?? `skills/${skill.id}/SKILL.md`,
        kind: "skill",
        summary: skill.when_to_use ?? skill.title ?? skill.id,
        body: skill.body,
        scope: skill.scope ?? mode,
      }));
    const bundle = buildAgentContextBundle({
      mode,
      query: options.query,
      items: [
        ...context.items.map((item) => ({
        id: item.id,
        path: item.path,
        kind: item.kind,
        summary: item.summary,
        body: item.body,
        scope: mode,
        })),
        ...skillItems,
      ],
      personalFacets: mode === "personal" ? await readPersonalFacets(root) : [],
      skillDecisions: injectedSkills.decisions,
      now: new Date().toISOString(),
    });
    await writeJson(root, `${protocolPaths.reportsAgentBundles}/${bundle.bundle.id}.json`, bundle.bundle);
    if (options.json) {
      return JSON.stringify({ ok: true, context, bundle: bundle.bundle, text: bundle.text, report_ref: `${protocolPaths.reportsAgentBundles}/${bundle.bundle.id}.json` }, null, 2);
    }
    return bundle.text;
  }

  if (options.json) {
    return JSON.stringify({ ok: true, context }, null, 2);
  }
  return JSON.stringify(context, null, 2);
}
