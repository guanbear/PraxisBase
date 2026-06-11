import { stat } from "node:fs/promises";
import { protocolPaths } from "../protocol/paths.js";
import type { RemoteSourceConfig } from "../protocol/schemas.js";
import { safePath, writeText } from "../store/file-store.js";

export type ResolvedRemoteSource =
  | { kind: "exported-json"; name: string; sources: string[] }
  | { kind: "openclaw-api"; name: string; remote: string };

export type RemoteCommandRunner = (command: string, args: string[]) => Promise<string>;

export interface ResolveRemoteSourceOptions {
  fetchImpl?: typeof fetch;
  runCommand?: RemoteCommandRunner;
}

function stagedImportPath(name: string): string {
  return `${protocolPaths.stagingRemoteImports}/${name}.json`;
}

async function writeStagedImport(root: string, name: string, body: string): Promise<string> {
  const relativePath = stagedImportPath(name);
  await writeText(root, relativePath, body);
  return relativePath;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveRemoteSource(
  root: string,
  config: RemoteSourceConfig,
  options: ResolveRemoteSourceOptions = {}
): Promise<ResolvedRemoteSource> {
  if (config.source_type === "file") {
    if (!config.path) throw new Error("REMOTE_CONFIG_INVALID: file remote requires path.");
    return { kind: "exported-json", name: config.name, sources: [config.path] };
  }

  if (config.source_type === "http") {
    if (!config.url) throw new Error("REMOTE_CONFIG_INVALID: http remote requires url.");
    const response = await (options.fetchImpl ?? fetch)(config.url);
    if (!response.ok) throw new Error(`REMOTE_HTTP_FAILED: ${response.status} ${response.statusText}`);
    const relativePath = await writeStagedImport(root, config.name, await response.text());
    return { kind: "exported-json", name: config.name, sources: [relativePath] };
  }

  if (config.source_type === "ssh") {
    if (!config.host || !config.path) throw new Error("REMOTE_CONFIG_INVALID: ssh remote requires host and path.");
    if (!options.runCommand) throw new Error("REMOTE_SSH_RUNNER_REQUIRED");
    const body = await options.runCommand("ssh", [config.host, "cat", config.path]);
    const relativePath = await writeStagedImport(root, config.name, body);
    return { kind: "exported-json", name: config.name, sources: [relativePath] };
  }

  if (config.source_type === "git") {
    if (!config.repo || !config.path) throw new Error("REMOTE_CONFIG_INVALID: git remote requires repo and path.");
    if (!options.runCommand) throw new Error("REMOTE_GIT_RUNNER_REQUIRED");
    const cacheRelative = `${protocolPaths.cacheRemotes}/${config.name}`;
    const cacheAbsolute = safePath(root, cacheRelative);
    if (await pathExists(cacheAbsolute)) {
      await options.runCommand("git", ["-C", cacheAbsolute, "pull", "--ff-only"]);
    } else {
      await options.runCommand("git", ["clone", "--depth", "1", config.repo, cacheAbsolute]);
    }
    if (config.ref) {
      await options.runCommand("git", ["-C", cacheAbsolute, "checkout", config.ref]);
    }
    return { kind: "exported-json", name: config.name, sources: [`${cacheRelative}/${config.path}`] };
  }

  if (config.source_type === "openclaw-api") {
    if (!config.remote) throw new Error("REMOTE_CONFIG_INVALID: openclaw-api remote requires remote.");
    return { kind: "openclaw-api", name: config.name, remote: config.remote };
  }

  throw new Error(`REMOTE_ADAPTER_UNIMPLEMENTED: ${config.source_type satisfies never}`);
}
