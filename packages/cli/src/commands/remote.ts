import {
  addRemoteSource,
  listRemoteSources,
  readRemoteSource,
  removeRemoteSource,
} from "@praxisbase/core/experience/remote-sources.js";
import { doctorOpenClawRemote } from "@praxisbase/core/experience/openclaw-remote.js";
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
  envForTests?: Record<string, string | undefined>;
  json?: boolean;
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^([A-Z0-9_]+):/);
  return match?.[1] ?? "REMOTE_CONFIG_INVALID";
}

export async function remoteCommand(root: string, subcommand: string, options: RemoteCommandOptions): Promise<string> {
  try {
    if (subcommand === "add") {
      if (!options.name || !options.type) throw new Error("REMOTE_CONFIG_INVALID: remote add requires name and --type.");
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
      if (!options.name) throw new Error("REMOTE_CONFIG_INVALID: remote remove requires name.");
      await removeRemoteSource(root, options.name);
      return options.json ? JSON.stringify({ ok: true }, null, 2) : `Remote removed: ${options.name}`;
    }
    if (subcommand === "doctor") {
      if (!options.name) throw new Error("REMOTE_CONFIG_INVALID: remote doctor requires name.");
      const remote = await readRemoteSource(root, options.name);
      if (remote.source_type === "openclaw-api") {
        const doctor = await doctorOpenClawRemote(root, {
          provider: "openclaw-api",
          env: options.envForTests,
          writeReport: false,
        });
        return options.json
          ? JSON.stringify({ ok: true, remote, doctor }, null, 2)
          : `Remote ${doctor.ok ? "ok" : "needs attention"}: ${remote.name}`;
      }
      return options.json ? JSON.stringify({ ok: true, remote, checks: [] }, null, 2) : `Remote ok: ${remote.name}`;
    }
    throw new Error(`REMOTE_CONFIG_INVALID: Unknown subcommand "remote ${subcommand}".`);
  } catch (error) {
    if (!options.json) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ ok: false, code: errorCode(error), message, retryable: false }, null, 2);
  }
}
