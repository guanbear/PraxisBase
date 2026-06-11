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
  type ExperienceSourcePrivacyTrust,
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
  feishuAppIdEnv?: string;
  feishuAppSecretEnv?: string;
  feishuTarget?: string;
  feishuCliPath?: string;
  privacyTrust?: ExperienceSourcePrivacyTrust;
  now?: string;
}

function isEnvName(value: string): boolean {
  return /^[A-Z_][A-Z0-9_]*$/.test(value);
}

function looksLikeLiteralSecret(value: string): boolean {
  return /^(?:Bearer\s+|eyJ|[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/.test(value)
    || /(?:token|secret|password|authorization|bearer|cookie|credential|app[_-]?secret|cli_a_)(?:\s*[:=]|\s+\S+|[_-])/i.test(value);
}

export function assertNoConfigCredential(input: AddExperienceSourceInput): void {
  const values = [input.repo, input.ref, input.path, input.host, input.url, input.remote, input.feishuTarget, input.feishuCliPath].filter(Boolean);
  const joined = values.join(" ");
  if (/(?:token|secret|password|authorization|bearer|cookie)(?:\s*[:=]|\s+\S+)/i.test(joined) || /https?:\/\/[^/\s]+:[^@\s]+@/i.test(joined)) {
    throw new Error("SOURCE_CONFIG_CONTAINS_CREDENTIAL: source configs must not store credentials.");
  }
  if (input.bearerTokenEnv && !isEnvName(input.bearerTokenEnv)) {
    throw new Error("SOURCE_CONFIG_CONTAINS_CREDENTIAL: source configs may store bearer token environment variable names only.");
  }
  if (input.bearerTokenEnv && looksLikeLiteralSecret(input.bearerTokenEnv)) {
    throw new Error("SOURCE_CONFIG_CONTAINS_CREDENTIAL: source configs may store bearer token environment variable names only.");
  }
  for (const [label, value] of [
    ["Feishu app id", input.feishuAppIdEnv],
    ["Feishu app secret", input.feishuAppSecretEnv],
  ] as const) {
    if (!value) continue;
    if (!isEnvName(value) || looksLikeLiteralSecret(value)) {
      throw new Error(`SOURCE_CONFIG_CONTAINS_CREDENTIAL: ${label} may be stored as an environment variable name only.`);
    }
  }
  if ((input.sourceType === "feishu" || input.channel === "feishu") && input.privacyTrust === "trusted_personal_remote") {
    throw new Error("SOURCE_CONFIG_INVALID: Feishu sources cannot use trusted_personal_remote.");
  }
}

export function inferExperienceSourceParser(
  agent: ExperienceSourceAgent,
  sourceType: ExperienceSourceType,
  parser?: ExperienceSourceParser
): ExperienceSourceParser {
  if (parser) return parser;
  if (sourceType === "feishu") return "feishu-doc";
  if (sourceType === "gbrain") return "gbrain-memory";
  if (agent === "agentmemory") return "agentmemory-memory";
  if (agent === "codex") return "codex-session";
  if (agent === "claude-code") return "claude-code-session";
  if (agent === "opencode") return "opencode-session";
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
    feishu_app_id_env: input.feishuAppIdEnv,
    feishu_app_secret_env: input.feishuAppSecretEnv,
    feishu_target: input.feishuTarget,
    feishu_cli_path: input.feishuCliPath,
    privacy_trust: input.privacyTrust,
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
