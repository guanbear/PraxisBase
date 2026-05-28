import { readdir, rm } from "node:fs/promises";
import { makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import {
  ExperienceSourceConfigSchema,
  type ExperienceScopeHint,
  type ExperienceSourceAgent,
  type ExperienceSourceChannel,
  type ExperienceSourceConfig,
  type ExperienceSourceParser,
  type ExperienceSourceType,
} from "../protocol/schemas.js";
import { readJson, safePath, writeJson } from "../store/file-store.js";

export interface AddExperienceSourceInput {
  name: string;
  agent: ExperienceSourceAgent;
  sourceType: ExperienceSourceType;
  channel?: ExperienceSourceChannel;
  parser?: ExperienceSourceParser;
  scopeDefault: ExperienceScopeHint;
  path?: string;
  repo?: string;
  ref?: string;
  host?: string;
  url?: string;
  remote?: string;
  bearerTokenEnv?: string;
  now?: string;
}

function assertNoConfigCredential(input: AddExperienceSourceInput): void {
  const values = [input.repo, input.ref, input.path, input.host, input.url, input.remote].filter(Boolean);
  const joined = values.join(" ");
  if (/(?:token|secret|password|authorization|bearer|cookie)(?:\s*[:=]|\s+\S+)/i.test(joined) || /https?:\/\/[^/\s]+:[^@\s]+@/i.test(joined)) {
    throw new Error("SOURCE_CONFIG_CONTAINS_CREDENTIAL: source configs must not store credentials.");
  }
  if (input.bearerTokenEnv && !/^[A-Z_][A-Z0-9_]*$/i.test(input.bearerTokenEnv)) {
    throw new Error("SOURCE_CONFIG_CONTAINS_CREDENTIAL: source configs may store bearer token environment variable names only.");
  }
  if (input.bearerTokenEnv && /^(?:Bearer\s+|eyJ|[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/.test(input.bearerTokenEnv)) {
    throw new Error("SOURCE_CONFIG_CONTAINS_CREDENTIAL: source configs may store bearer token environment variable names only.");
  }
}

export function inferExperienceSourceParser(
  agent: ExperienceSourceAgent,
  sourceType: ExperienceSourceType,
  parser?: ExperienceSourceParser
): ExperienceSourceParser {
  if (parser) return parser;
  if (sourceType === "gbrain") return "gbrain-memory";
  if (agent === "agentmemory") return "agentmemory-memory";
  if (agent === "codex") return "codex-session";
  if (agent === "claude-code") return "claude-code-repair-log";
  if (agent === "openclaw" && sourceType === "local") return "openclaw-log";
  return "openclaw-export";
}

function sourcePath(name: string): string {
  return `${protocolPaths.experienceSources}/${makeId("source", name)}.json`;
}

export async function addExperienceSource(root: string, input: AddExperienceSourceInput): Promise<ExperienceSourceConfig> {
  assertNoConfigCredential(input);
  const now = input.now ?? new Date().toISOString();
  const config = ExperienceSourceConfigSchema.parse({
    id: makeId("source", input.name),
    protocol_version: PROTOCOL_VERSION,
    type: "experience_source_config",
    name: input.name,
    agent: input.agent,
    source_type: input.sourceType,
    channel: input.channel ?? (input.sourceType === "local" ? "local" : "unknown"),
    parser: inferExperienceSourceParser(input.agent, input.sourceType, input.parser),
    scope_default: input.scopeDefault,
    path: input.path,
    repo: input.repo,
    ref: input.ref,
    host: input.host,
    url: input.url,
    remote: input.remote,
    bearer_token_env: input.bearerTokenEnv,
    created_at: now,
    updated_at: now,
  });
  await writeJson(root, sourcePath(input.name), config);
  return config;
}

export async function readExperienceSource(root: string, name: string): Promise<ExperienceSourceConfig> {
  return ExperienceSourceConfigSchema.parse(await readJson(root, sourcePath(name)));
}

export async function listExperienceSources(root: string): Promise<ExperienceSourceConfig[]> {
  let files: string[];
  try {
    files = await readdir(safePath(root, protocolPaths.experienceSources));
  } catch {
    return [];
  }
  const configs: ExperienceSourceConfig[] = [];
  for (const file of files.sort()) {
    if (!file.endsWith(".json")) continue;
    configs.push(ExperienceSourceConfigSchema.parse(await readJson(root, `${protocolPaths.experienceSources}/${file}`)));
  }
  return configs;
}

export async function removeExperienceSource(root: string, name: string): Promise<void> {
  await rm(safePath(root, sourcePath(name)), { force: true });
}
