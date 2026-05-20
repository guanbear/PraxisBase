import { readFile } from "node:fs/promises";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { protocolPaths } from "../protocol/paths.js";
import { writeJson, writeText, safePath } from "../store/file-store.js";
import { getAdapterProfile } from "./profiles.js";
import type { AdapterProfile } from "../protocol/schemas.js";
import type { AgentProfile } from "../protocol/types.js";

const MARKER_BEGIN = "<!-- PRAXISBASE:BEGIN -->";
const MARKER_END = "<!-- PRAXISBASE:END -->";

export interface PlannedWrite {
  path: string;
  description: string;
}

export interface PlanInstallResult {
  agent: string;
  dry_run: boolean;
  writes: PlannedWrite[];
  commands: string[];
}

export interface PlanInstallOptions {
  dryRun: boolean;
}

function generateSnippet(profile: AdapterProfile): string {
  const lines: string[] = [
    `# PraxisBase adapter instructions for ${profile.agent}`,
    ``,
    `This agent is configured to work with PraxisBase for durable knowledge capture.`,
    ``,
    `## Capture triggers`,
    ...profile.capture.default_triggers.map((t) => `- ${t}`),
    ``,
    `## Context stages`,
    ...profile.context.default_stages.map((s) => `- ${s}`),
    ``,
    `## Privacy`,
    `Redaction profile: ${profile.privacy.redaction_profile}`,
  ];
  return lines.join("\n");
}

async function readExistingContent(root: string, relativePath: string): Promise<string | null> {
  try {
    const absolute = safePath(root, relativePath);
    return await readFile(absolute, "utf8");
  } catch {
    return null;
  }
}

function replaceBetweenMarkers(existing: string, newSnippet: string): string {
  const beginIdx = existing.indexOf(MARKER_BEGIN);
  const endIdx = existing.indexOf(MARKER_END);

  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const before = existing.slice(0, beginIdx);
    const after = existing.slice(endIdx + MARKER_END.length);
    return `${before}${MARKER_BEGIN}\n${newSnippet}\n${MARKER_END}${after}`;
  }

  return `${existing}\n${MARKER_BEGIN}\n${newSnippet}\n${MARKER_END}\n`;
}

function wrapInMarkers(snippet: string): string {
  return `${MARKER_BEGIN}\n${snippet}\n${MARKER_END}\n`;
}

export async function planInstall(root: string, agent: AgentProfile, options: PlanInstallOptions): Promise<PlanInstallResult> {
  const profile = getAdapterProfile(agent);
  const snippet = generateSnippet(profile);

  const adapterPath = `${protocolPaths.adapters}/${agent}.json`;
  const adapterContent = {
    protocol_version: PROTOCOL_VERSION,
    type: "adapter_config" as const,
    agent,
    profile,
  };

  const writes: PlannedWrite[] = [
    { path: adapterPath, description: `Adapter config for ${agent}` },
  ];

  for (const instructionFile of profile.instruction_files) {
    writes.push({
      path: instructionFile,
      description: `PraxisBase instruction snippet for ${instructionFile}`,
    });
  }

  const commands = [
    `praxisbase install ${agent}`,
    `praxisbase context get --agent ${agent} --stage diagnosis --json`,
    `praxisbase capture finish --agent ${agent} --result success --json`,
  ];

  if (options.dryRun) {
    return { agent, dry_run: true, writes, commands };
  }

  await writeJson(root, adapterPath, adapterContent);

  for (const instructionFile of profile.instruction_files) {
    const existing = await readExistingContent(root, instructionFile);
    let content: string;

    if (existing !== null) {
      content = replaceBetweenMarkers(existing, snippet);
    } else {
      content = wrapInMarkers(snippet);
    }

    await writeText(root, instructionFile, content);
  }

  return { agent, dry_run: false, writes, commands };
}
