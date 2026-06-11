import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildAgentToolManifest, writeAgentToolManifest } from "@praxisbase/core/agent-access/manifest.js";
import { generateSkill } from "@praxisbase/core/agent-access/skill.js";
import { writeJson, writeText } from "@praxisbase/core/store/file-store.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import type { AgentProfile } from "@praxisbase/core/protocol/types.js";

export interface AgentToolsOptions {
  agent?: AgentProfile;
  json?: boolean;
}

export async function agentToolsCommand(
  root: string,
  subcommand: string,
  options: AgentToolsOptions
): Promise<string> {
  if (subcommand === "generate") {
    if (!options.agent) {
      throw new Error("agent-tools generate requires --agent <agent>");
    }
    return generate(root, options.agent, options.json ?? false);
  }

  if (subcommand === "manifest") {
    return manifest(root, options.json ?? false);
  }

  throw new Error(
    `Unknown subcommand "agent-tools ${subcommand}". Use "agent-tools generate" or "agent-tools manifest".`
  );
}

async function generate(
  root: string,
  agent: AgentProfile,
  json: boolean
): Promise<string> {
  const manifest = buildAgentToolManifest(root, { agent });
  await writeAgentToolManifest(root, manifest);

  const skillContent = generateSkill(manifest);
  const skillRelativePath = `${protocolPaths.agentToolsSkills}/praxisbase/SKILL.md`;
  await writeText(root, skillRelativePath, skillContent);

  if (json) {
    return JSON.stringify({
      ok: true,
      manifest,
      skill_path: skillRelativePath,
    }, null, 2);
  }

  return `Generated agent tools: ${manifest.tools.length} tools, Skill at ${skillRelativePath}`;
}

async function manifest(root: string, json: boolean): Promise<string> {
  const manifestPath = join(root, protocolPaths.agentToolsManifest);
  let content: string;
  try {
    content = await readFile(manifestPath, "utf8");
  } catch {
    throw new Error(`No agent tool manifest found. Run "praxisbase agent-tools generate --agent <agent>" first.`);
  }

  const manifest = JSON.parse(content);

  if (json) {
    return JSON.stringify({ ok: true, manifest }, null, 2);
  }

  return `Agent tool manifest: ${manifest.tools?.length ?? 0} tools`;
}
