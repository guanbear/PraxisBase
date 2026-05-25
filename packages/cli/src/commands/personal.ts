import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import { bootstrapCommand } from "./bootstrap.js";
import { runDailyExperience } from "@praxisbase/core/experience/daily.js";
import { addExperienceSource, listExperienceSources } from "@praxisbase/core/experience/source-config.js";
import { buildAgentToolManifest, writeAgentToolManifest } from "@praxisbase/core/agent-access/manifest.js";
import { generateSkill } from "@praxisbase/core/agent-access/skill.js";
import { readAiProviderConfig } from "@praxisbase/core/ai/config.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { writeText } from "@praxisbase/core/store/file-store.js";
import { diagnoseAgentMemorySource } from "./agentmemory-diagnostics.js";

const execFileAsync = promisify(execFile);

type PersonalTarget = "codex" | "openclaw" | "agentmemory";
type PersonalAgent = "codex" | "opencode" | "claude-code" | "openclaw" | "hermes" | "openhuman" | "generic";

export interface PersonalCommandOptions {
  target?: PersonalTarget;
  agent?: PersonalAgent;
  name?: string;
  path?: string;
  url?: string;
  bearerTokenEnv?: string;
  runner?: "cron" | "launchd";
  print?: boolean;
  open?: boolean;
  json?: boolean;
  homeDir?: string;
  now?: string;
  limit?: number;
  degraded?: boolean;
  noAi?: boolean;
  maxAiChunks?: number;
  aiTimeoutMs?: number;
  aiConcurrency?: number;
  maxCurationProposals?: number;
  openImpl?: (path: string) => Promise<void>;
}

interface PersonalCheck {
  id: string;
  ok: boolean;
  severity: "info" | "warning" | "error";
  message: string;
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^([A-Z0-9_]+):/);
  return match?.[1] ?? "PERSONAL_COMMAND_FAILED";
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function writeAgentAccess(root: string, agent: PersonalAgent): Promise<{ manifest_path: string; skill_path: string }> {
  const manifest = buildAgentToolManifest(root, { agent });
  await writeAgentToolManifest(root, manifest);
  const skillPath = `${protocolPaths.agentToolsSkills}/praxisbase/SKILL.md`;
  await writeText(root, skillPath, generateSkill(manifest));
  return { manifest_path: protocolPaths.agentToolsManifest, skill_path: skillPath };
}

async function defaultOpen(path: string): Promise<void> {
  await execFileAsync("open", [path]);
}

function defaultPathFor(target: PersonalTarget): string | undefined {
  if (target === "codex") return "~/.codex/sessions";
  if (target === "openclaw") return "~/.openclaw/reports";
  return undefined;
}

async function connectPersonalSource(root: string, target: PersonalTarget, options: PersonalCommandOptions) {
  if (target === "agentmemory") {
    return addExperienceSource(root, {
      name: options.name ?? "personal-agentmemory",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: options.url ?? "http://localhost:3111",
      bearerTokenEnv: options.bearerTokenEnv,
      now: options.now,
    });
  }

  return addExperienceSource(root, {
    name: options.name ?? `personal-${target}`,
    agent: target,
    sourceType: "local",
    parser: target === "codex" ? "codex-session" : "openclaw-log",
    scopeDefault: "personal",
    path: options.path ?? defaultPathFor(target),
    now: options.now,
  });
}

function cronLine(root: string): string {
  return `0 8 * * * cd ${root} && praxisbase personal run --json`;
}

function launchdLine(root: string): string {
  return `launchd: run daily from ${root} with command: praxisbase personal run --json`;
}

function personalNext(agent: PersonalAgent): string[] {
  return [
    "praxisbase personal doctor --json",
    "praxisbase ai init --provider openai-compatible --model <model> --json",
    "praxisbase ai doctor --json",
    "praxisbase personal run --open --json",
    `praxisbase context get --agent ${agent} --stage repair --query openclaw --with-agentmemory --json`,
  ];
}

async function doctor(root: string): Promise<{ ok: boolean; checks: PersonalCheck[] }> {
  const checks: PersonalCheck[] = [];
  const ai = await readAiProviderConfig(root);
  checks.push({
    id: "ai-config",
    ok: Boolean(ai),
    severity: ai ? "info" : "warning",
    message: ai ? `AI config found for ${ai.model}.` : "AI config missing. Run `praxisbase ai init ...` before production daily runs.",
  });

  const sources = await listExperienceSources(root);
  checks.push({
    id: "sources",
    ok: sources.length > 0,
    severity: sources.length > 0 ? "info" : "warning",
    message: sources.length > 0 ? `${sources.length} source(s) configured.` : "No sources configured. Run `praxisbase personal connect ...`.",
  });

  const manifestReady = await exists(join(root, protocolPaths.agentToolsManifest));
  checks.push({
    id: "agent-tools",
    ok: manifestReady,
    severity: manifestReady ? "info" : "warning",
    message: manifestReady ? "Agent access manifest exists." : "Agent access manifest missing. Run `praxisbase personal init`.",
  });

  const siteReady = await exists(join(root, "dist/index.html"));
  checks.push({
    id: "site",
    ok: siteReady,
    severity: siteReady ? "info" : "warning",
    message: siteReady ? "Static site exists at dist/index.html." : "Static site missing. Run `praxisbase personal run --open`.",
  });

  for (const source of sources.filter((candidate) => candidate.source_type === "agentmemory")) {
    try {
      const agentMemoryChecks = await diagnoseAgentMemorySource(source, {
        authorityMode: "personal-local",
        fetchImpl: fetch,
        env: process.env as Record<string, string | undefined>,
      });
      checks.push(...agentMemoryChecks.map((check) => ({
        ...check,
        id: `agentmemory:${source.name}:${check.id.replace(/^agentmemory_/, "")}`,
      })));
    } catch (error) {
      checks.push({
        id: `agentmemory:${source.name}`,
        ok: false,
        severity: "warning",
        message: `AgentMemory daemon check failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { ok: checks.every((check) => check.ok || check.severity !== "error"), checks };
}

export async function personalCommand(root: string, subcommand: string, options: PersonalCommandOptions): Promise<string> {
  try {
    if (subcommand === "init") {
      const agent = options.agent ?? "codex";
      const bootstrap = JSON.parse(await bootstrapCommand(root, "personal", {
        agent,
        installSkill: true,
        json: true,
        homeDir: options.homeDir,
        now: options.now,
      }));
      const result = { ok: true, command: "personal init", bootstrap, next: personalNext(agent) };
      return options.json ? JSON.stringify(result, null, 2) : result.next.join("\n");
    }

    if (subcommand === "connect") {
      const target = options.target;
      if (target !== "codex" && target !== "openclaw" && target !== "agentmemory") {
        throw new Error("PERSONAL_CONNECT_INVALID: personal connect requires codex, openclaw, or agentmemory.");
      }
      const source = await connectPersonalSource(root, target, options);
      const result = { ok: true, command: `personal connect ${target}`, source };
      return options.json ? JSON.stringify(result, null, 2) : `Connected ${source.name}`;
    }

    if (subcommand === "doctor") {
      const result = await doctor(root);
      return options.json ? JSON.stringify(result, null, 2) : result.checks.map((check) => `${check.ok ? "OK" : "WARN"} ${check.id}: ${check.message}`).join("\n");
    }

    if (subcommand === "run") {
      const report = await runDailyExperience(root, {
        authorityMode: "personal-local",
        mode: "write",
        buildSite: true,
        limit: options.limit,
        now: options.now,
        degraded: options.degraded,
        noAi: options.noAi,
        maxAiChunks: options.maxAiChunks,
        aiTimeoutMs: options.aiTimeoutMs,
        aiConcurrency: options.aiConcurrency,
        maxCurationProposals: options.maxCurationProposals,
      });
      const agentAccess = await writeAgentAccess(root, options.agent ?? "codex");
      const sitePath = join(root, "dist/index.html");
      if (options.open) {
        await (options.openImpl ?? defaultOpen)(sitePath);
      }
      const result = { ok: true, report, agent_access: agentAccess, opened: options.open === true, site: "dist/index.html" };
      return options.json ? JSON.stringify(result, null, 2) : `Personal run complete: ${report.id}\n${sitePath}`;
    }

    if (subcommand === "schedule") {
      const result = {
        ok: true,
        installed: false,
        cron: cronLine(root),
        launchd: launchdLine(root),
      };
      return options.json ? JSON.stringify(result, null, 2) : (options.runner === "launchd" ? result.launchd : result.cron);
    }

    throw new Error(`PERSONAL_COMMAND_INVALID: Unknown subcommand "personal ${subcommand}".`);
  } catch (error) {
    if (!options.json) throw error;
    return JSON.stringify({
      ok: false,
      code: errorCode(error),
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
    }, null, 2);
  }
}
