import { stat } from "node:fs/promises";
import { getAdapterProfile } from "@praxisbase/core";
import type { AgentProfile } from "@praxisbase/core";

export interface WatchCommandOptions {
  agent: AgentProfile;
  workspace: string;
  once?: boolean;
  json?: boolean;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function watchCommand(root: string, options: WatchCommandOptions): Promise<string> {
  if (!options.once) {
    throw new Error("watch currently supports --once only");
  }

  const profile = getAdapterProfile(options.agent);
  const localPaths = [...profile.transcript_paths, ...profile.raw_artifact_paths].filter(
    (path) => !path.includes("://") && !path.startsWith("~")
  );
  const existing = [];
  for (const path of localPaths) {
    if (await pathExists(path)) existing.push(path);
  }

  const warnings = existing.length === 0 ? ["watch_path_unavailable"] : [];
  const result = {
    ok: true,
    agent: options.agent,
    workspace: options.workspace || root,
    mode: "once",
    captures: [],
    warnings,
  };

  if (options.json) {
    return JSON.stringify(result, null, 2);
  }
  return warnings.length > 0 ? warnings.join("\n") : "Watch completed.";
}
