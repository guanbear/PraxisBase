import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { bootstrapCommand } from "./bootstrap.js";
import { deriveDailyNextActions, runDailyExperience, type DailyNextActions } from "@praxisbase/core/experience/daily.js";
import { addExperienceSource, listExperienceSources } from "@praxisbase/core/experience/source-config.js";
import { buildAgentToolManifest, writeAgentToolManifest } from "@praxisbase/core/agent-access/manifest.js";
import { generateSkill } from "@praxisbase/core/agent-access/skill.js";
import {
  applyPersonalFacetOverride,
  normalizePersonalFacets,
  personalFacetCandidatesFromDistilledExperience,
  personalFacetCandidatesFromManualInstruction,
  renderManagedPersonalProfile,
  scorePersonalFacet,
  type PersonalFacetCandidate,
} from "@praxisbase/core/experience/personal-learning.js";
import { DistilledExperienceSchema } from "@praxisbase/core/ai/distill.js";
import type { PersonalLearningFacet } from "@praxisbase/core/protocol/schemas.js";
import { readAiProviderConfig } from "@praxisbase/core/ai/config.js";
import { readGBrainConfig, gbrainExecutable } from "@praxisbase/core/experience/gbrain-config.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { writeText } from "@praxisbase/core/store/file-store.js";
import { diagnoseAgentMemorySource } from "./agentmemory-diagnostics.js";

const execFileAsync = promisify(execFile);

type PersonalTarget = "codex" | "openclaw" | "agentmemory" | "claude-code" | "opencode";
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
  profileAction?: "list" | "pin" | "forget" | "rebuild" | "add";
  profileKey?: string;
  profileValue?: string;
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
  if (target === "claude-code") return "~/.claude/transcripts";
  if (target === "opencode") return "~/.local/share/opencode/log";
  return undefined;
}

function parserForTarget(target: PersonalTarget): "codex-session" | "openclaw-log" | "claude-code-session" | "opencode-session" {
  if (target === "codex") return "codex-session";
  if (target === "openclaw") return "openclaw-log";
  if (target === "claude-code") return "claude-code-session";
  return "opencode-session";
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

  const agentForTarget: "codex" | "openclaw" | "claude-code" | "opencode" = target;

  return addExperienceSource(root, {
    name: options.name ?? `personal-${target}`,
    agent: agentForTarget,
    sourceType: "local",
    parser: parserForTarget(target),
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
    "praxisbase gbrain init --executable gbrain --source praxisbase --json",
    "gbrain serve",
    "GBrain MCP config: {\"command\":\"gbrain\",\"args\":[\"serve\"]}",
    "praxisbase personal run --open --json",
    `praxisbase context get --agent ${agent} --stage repair --query openclaw --with-agentmemory --json`,
  ];
}

function formatNextActions(nextActions: DailyNextActions): string {
  const lines = [
    `Next action: ${nextActions.status}`,
    ...nextActions.messages,
    ...nextActions.commands.map((command) => `Run: ${command}`),
  ];
  return lines.join("\n");
}

async function readPersonalFacets(root: string, now?: string): Promise<PersonalLearningFacet[]> {
  const path = join(root, protocolPaths.personalFacets);
  let raw = "";
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const facets: PersonalLearningFacet[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const value = JSON.parse(trimmed) as PersonalFacetCandidate;
    facets.push(scorePersonalFacet(value, { now }));
  }
  return normalizePersonalFacets(facets);
}

async function writePersonalFacets(root: string, facets: readonly PersonalLearningFacet[]): Promise<void> {
  const lines = facets.map((facet) => JSON.stringify(facet)).join("\n");
  const path = join(root, protocolPaths.personalFacets);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, lines ? `${lines}\n` : "", "utf8");
}

function facetHandle(facet: Pick<PersonalLearningFacet, "facet_class" | "key">): string {
  return `${facet.facet_class}/${facet.key}`;
}

async function rebuildPersonalProfile(root: string, facets: readonly PersonalLearningFacet[], now?: string): Promise<string> {
  let existing = "";
  try {
    existing = await readFile(join(root, protocolPaths.personalProfile), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const path = join(root, protocolPaths.personalProfile);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, renderManagedPersonalProfile(existing, facets, now), "utf8");
  return protocolPaths.personalProfile;
}

async function personalFacetsFromDistillCache(root: string, now?: string): Promise<PersonalLearningFacet[]> {
  let files: string[];
  try {
    files = await readdir(join(root, protocolPaths.cacheAiDistill));
  } catch {
    return [];
  }

  const facets: PersonalLearningFacet[] = [];
  for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
    try {
      const raw = JSON.parse(await readFile(join(root, protocolPaths.cacheAiDistill, file), "utf8")) as Record<string, unknown>;
      if (raw.type !== "ai_distill_cache_entry" || raw.status !== "distilled") continue;
      const parsed = DistilledExperienceSchema.safeParse(raw.experience);
      if (!parsed.success) continue;
      const candidates = personalFacetCandidatesFromDistilledExperience(parsed.data, { now });
      facets.push(...candidates.map((candidate) => scorePersonalFacet(candidate, { now })));
    } catch {
      continue;
    }
  }
  return facets;
}

async function profile(root: string, options: PersonalCommandOptions): Promise<Record<string, unknown>> {
  const action = options.profileAction ?? "list";
  let facets = await readPersonalFacets(root, options.now);

  if (action === "list") {
    return {
      ok: true,
      facets,
      next: "Run praxisbase personal profile add <instruction>, praxisbase personal profile pin <class/key>, praxisbase personal profile forget <class/key>, or praxisbase personal profile rebuild --json.",
    };
  }

  if (action === "add") {
    const instruction = options.profileValue ?? options.profileKey;
    if (!instruction) {
      return {
        ok: false,
        code: "PROFILE_VALUE_REQUIRED",
        message: "personal profile add requires an instruction string.",
      };
    }
    const added = personalFacetCandidatesFromManualInstruction(instruction, { now: options.now })
      .map((candidate) => scorePersonalFacet(candidate, { now: options.now }));
    facets = normalizePersonalFacets([...facets, ...added]);
    await writePersonalFacets(root, facets);
    const profilePath = await rebuildPersonalProfile(root, facets, options.now);
    return {
      ok: true,
      added: added.length,
      facets_count: facets.length,
      profile_path: profilePath,
      next: "Run praxisbase context bundle --query <task> --mode personal --json to preview injection.",
    };
  }

  if (action === "rebuild") {
    facets = normalizePersonalFacets([...facets, ...await personalFacetsFromDistillCache(root, options.now)]);
    await writePersonalFacets(root, facets);
    const profilePath = await rebuildPersonalProfile(root, facets, options.now);
    return {
      ok: true,
      facets_count: facets.length,
      profile_path: profilePath,
      next: "Run praxisbase context bundle --query <task> --mode personal --json to preview personal runtime context.",
    };
  }

  if (!options.profileKey) {
    return {
      ok: false,
      code: "PROFILE_KEY_REQUIRED",
      message: `personal profile ${action} requires <class/key>.`,
    };
  }

  const index = facets.findIndex((facet) => facetHandle(facet) === options.profileKey);
  if (index < 0) {
    return {
      ok: false,
      code: "FACET_NOT_FOUND",
      message: `Personal facet not found: ${options.profileKey}`,
    };
  }

  const override = action === "pin" ? "pinned" : "forgotten";
  facets[index] = applyPersonalFacetOverride(facets[index], override);
  await writePersonalFacets(root, facets);
  const profilePath = await rebuildPersonalProfile(root, facets, options.now);
  return {
    ok: true,
    [action === "pin" ? "pinned" : "forgotten"]: options.profileKey,
    profile_path: profilePath,
    next: "Run praxisbase personal profile rebuild --json or praxisbase context bundle --query <task> --mode personal --json.",
  };
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

  const gbrainConfig = await readGBrainConfig(root);
  checks.push({
    id: "gbrain",
    ok: Boolean(gbrainConfig),
    severity: gbrainConfig ? "info" : "warning",
    message: gbrainConfig
      ? `GBrain configured via ${gbrainConfig.mode === "local" ? gbrainExecutable(gbrainConfig) : gbrainConfig.mcp_url}. Use GBrain MCP as the default broad brain lookup path.`
      : "GBrain is not configured. Run `praxisbase gbrain init --executable gbrain --source praxisbase --json`, then expose MCP with `gbrain serve`.",
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
      if (target !== "codex" && target !== "openclaw" && target !== "agentmemory" && target !== "claude-code" && target !== "opencode") {
        throw new Error("PERSONAL_CONNECT_INVALID: personal connect requires codex, openclaw, agentmemory, claude-code, or opencode.");
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
      const nextActions = deriveDailyNextActions(report);
      const result = { ok: true, report, next_actions: nextActions, agent_access: agentAccess, opened: options.open === true, site: "dist/index.html" };
      return options.json ? JSON.stringify(result, null, 2) : `Personal run complete: ${report.id}\n${sitePath}\n${formatNextActions(nextActions)}`;
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

    if (subcommand === "profile") {
      const result = await profile(root, options);
      return options.json ? JSON.stringify(result, null, 2) : String(result.next ?? JSON.stringify(result, null, 2));
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
