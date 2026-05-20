import {
  addRemoteSource,
  listRemoteSources,
  readRemoteSource,
  removeRemoteSource,
} from "@praxisbase/core/experience/remote-sources.js";
import type { RemoteSourceType } from "@praxisbase/core";

export interface RemoteCommandOptions {
  name?: string;
  type?: RemoteSourceType;
  repo?: string;
  ref?: string;
  path?: string;
  host?: string;
  url?: string;
  remote?: string;
  json?: boolean;
}

export async function remoteCommand(root: string, subcommand: string, options: RemoteCommandOptions): Promise<string> {
  if (subcommand === "add") {
    if (!options.name || !options.type) throw new Error("remote add requires name and --type.");
    const config = await addRemoteSource(root, {
      name: options.name,
      sourceType: options.type,
      agent: "openclaw",
      repo: options.repo,
      ref: options.ref,
      path: options.path,
      host: options.host,
      url: options.url,
      remote: options.remote,
    });
    return options.json ? JSON.stringify({ ok: true, remote: config }, null, 2) : `Remote added: ${config.name}`;
  }
  if (subcommand === "list") {
    const remotes = await listRemoteSources(root);
    return options.json ? JSON.stringify({ ok: true, remotes }, null, 2) : remotes.map((remote) => remote.name).join("\n");
  }
  if (subcommand === "remove") {
    if (!options.name) throw new Error("remote remove requires name.");
    await removeRemoteSource(root, options.name);
    return options.json ? JSON.stringify({ ok: true }, null, 2) : `Remote removed: ${options.name}`;
  }
  if (subcommand === "doctor") {
    if (!options.name) throw new Error("remote doctor requires name.");
    const remote = await readRemoteSource(root, options.name);
    return options.json ? JSON.stringify({ ok: true, remote, checks: [] }, null, 2) : `Remote ok: ${remote.name}`;
  }
  throw new Error(`Unknown subcommand "remote ${subcommand}".`);
}
