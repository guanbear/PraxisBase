import { readdir } from "node:fs/promises";
import { makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import {
  RemoteSourceConfigSchema,
  type RemoteSourceConfig,
  type RemoteSourceType,
} from "../protocol/schemas.js";
import { readJson, safePath, writeJson } from "../store/file-store.js";

export interface AddRemoteSourceInput {
  name: string;
  sourceType: RemoteSourceType;
  agent: "openclaw";
  repo?: string;
  ref?: string;
  path?: string;
  host?: string;
  url?: string;
  remote?: string;
  now?: string;
}

function assertNoConfigSecret(input: AddRemoteSourceInput): void {
  const values = [input.repo, input.ref, input.path, input.host, input.url, input.remote].filter(Boolean);
  const joined = values.join(" ");
  if (/(?:token|secret|password|authorization|bearer|cookie)(?:\s*[:=]|\s+\S+)/i.test(joined) || /https?:\/\/[^/\s]+:[^@\s]+@/i.test(joined)) {
    throw new Error("REMOTE_CONFIG_SECRET_REJECTED: remote configs must not store credentials.");
  }
}

function remotePath(name: string): string {
  return `${protocolPaths.remotes}/${makeId("remote", name)}.json`;
}

export async function addRemoteSource(root: string, input: AddRemoteSourceInput): Promise<RemoteSourceConfig> {
  assertNoConfigSecret(input);
  const now = input.now ?? new Date().toISOString();
  const config = RemoteSourceConfigSchema.parse({
    id: makeId("remote", input.name),
    protocol_version: PROTOCOL_VERSION,
    type: "remote_source_config",
    name: input.name,
    source_type: input.sourceType,
    agent: input.agent,
    repo: input.repo,
    ref: input.ref,
    path: input.path,
    host: input.host,
    url: input.url,
    remote: input.remote,
    created_at: now,
    updated_at: now,
  });
  await writeJson(root, remotePath(input.name), config);
  return config;
}

export async function readRemoteSource(root: string, name: string): Promise<RemoteSourceConfig> {
  return RemoteSourceConfigSchema.parse(await readJson(root, remotePath(name)));
}

export async function listRemoteSources(root: string): Promise<RemoteSourceConfig[]> {
  let files: string[];
  try {
    files = await readdir(safePath(root, protocolPaths.remotes));
  } catch {
    return [];
  }
  const configs: RemoteSourceConfig[] = [];
  for (const file of files.sort()) {
    if (!file.endsWith(".json")) continue;
    configs.push(RemoteSourceConfigSchema.parse(await readJson(root, `${protocolPaths.remotes}/${file}`)));
  }
  return configs;
}

export async function removeRemoteSource(root: string, name: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(safePath(root, remotePath(name)), { force: true });
}
