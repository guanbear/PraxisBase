import { stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { addExperienceSource } from "@praxisbase/core/experience/source-config.js";
import { buildAgentToolManifest, writeAgentToolManifest } from "@praxisbase/core/agent-access/manifest.js";
import { generateSkill } from "@praxisbase/core/agent-access/skill.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { writeText } from "@praxisbase/core/store/file-store.js";

type BootstrapAgent = "codex" | "opencode" | "claude-code" | "openclaw" | "hermes" | "openhuman" | "generic";

export interface BootstrapCommandOptions {
  agent?: BootstrapAgent;
  installSkill?: boolean;
  json?: boolean;
  homeDir?: string;
  now?: string;
}

interface SafeSourceCandidate {
  name: string;
  agent: "codex" | "openclaw";
  sourceType: "local" | "file";
  parser: "codex-session" | "openclaw-log";
  scope: "personal";
  displayPath: string;
  absolutePath: string;
}

function safeCandidates(home: string): SafeSourceCandidate[] {
  return [
    {
      name: "local-codex-sessions",
      agent: "codex",
      sourceType: "local",
      parser: "codex-session",
      scope: "personal",
      displayPath: "~/.codex/sessions",
      absolutePath: join(home, ".codex/sessions"),
    },
    {
      name: "local-codex-archived-sessions",
      agent: "codex",
      sourceType: "local",
      parser: "codex-session",
      scope: "personal",
      displayPath: "~/.codex/archived_sessions",
      absolutePath: join(home, ".codex/archived_sessions"),
    },
    {
      name: "local-codex-cliproxyapi-sessions",
      agent: "codex",
      sourceType: "local",
      parser: "codex-session",
      scope: "personal",
      displayPath: "~/.codex-cli-cliproxyapi/sessions",
      absolutePath: join(home, ".codex-cli-cliproxyapi/sessions"),
    },
    {
      name: "local-openclaw-memory",
      agent: "openclaw",
      sourceType: "file",
      parser: "openclaw-log",
      scope: "personal",
      displayPath: "~/.openclaw/memory/main.sqlite",
      absolutePath: join(home, ".openclaw/memory/main.sqlite"),
    },
    {
      name: "local-openclaw-reports",
      agent: "openclaw",
      sourceType: "local",
      parser: "openclaw-log",
      scope: "personal",
      displayPath: "~/.openclaw/reports",
      absolutePath: join(home, ".openclaw/reports"),
    },
  ];
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function nextCommands(agent: BootstrapAgent): string[] {
  return [
    "praxisbase ai init --provider openai-compatible --model <model> --json",
    "praxisbase ai doctor --json",
    "praxisbase daily run --mode personal --build-site --json",
    "open dist/index.html",
    `praxisbase context get --agent ${agent} --stage repair --query openclaw --json`,
  ];
}

export async function bootstrapCommand(root: string, subcommand: string, options: BootstrapCommandOptions): Promise<string> {
  if (subcommand !== "personal") {
    const message = `BOOTSTRAP_COMMAND_INVALID: Unknown subcommand "bootstrap ${subcommand}".`;
    if (options.json) return JSON.stringify({ ok: false, code: "BOOTSTRAP_COMMAND_INVALID", message }, null, 2);
    throw new Error(message);
  }

  const agent = options.agent ?? "codex";
  const home = options.homeDir ?? homedir();
  const now = options.now ?? new Date().toISOString();
  const discovered: SafeSourceCandidate[] = [];

  for (const candidate of safeCandidates(home)) {
    if (await exists(candidate.absolutePath)) {
      discovered.push(candidate);
      await addExperienceSource(root, {
        name: candidate.name,
        agent: candidate.agent,
        sourceType: candidate.sourceType,
        parser: candidate.parser,
        scopeDefault: candidate.scope,
        path: candidate.displayPath,
        now,
      });
    }
  }

  let skillPath: string | undefined;
  let manifestPath: string | undefined;
  if (options.installSkill) {
    const manifest = buildAgentToolManifest(root, { agent });
    await writeAgentToolManifest(root, manifest);
    skillPath = `${protocolPaths.agentToolsSkills}/praxisbase/SKILL.md`;
    manifestPath = protocolPaths.agentToolsManifest;
    await writeText(root, skillPath, generateSkill(manifest));
  }

  const result = {
    ok: true,
    mode: "personal",
    agent,
    sources_discovered: discovered.map((candidate) => ({
      name: candidate.name,
      agent: candidate.agent,
      path: candidate.displayPath,
    })),
    sources_added: discovered.length,
    skill_path: skillPath,
    manifest_path: manifestPath,
    next: nextCommands(agent),
  };

  if (options.json) return JSON.stringify(result, null, 2);
  return result.next.join("\n");
}
