import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { computeHash, finishCapture, getAdapterProfile } from "@praxisbase/core";
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

function resolveWatchPath(workspace: string, configuredPath: string): string {
  if (configuredPath === "~") return process.env.HOME ?? homedir();
  if (configuredPath.startsWith("~/")) {
    return join(process.env.HOME ?? homedir(), configuredPath.slice(2));
  }
  if (isAbsolute(configuredPath)) return configuredPath;
  return join(workspace, configuredPath);
}

async function candidateFiles(path: string): Promise<string[]> {
  const info = await stat(path);
  if (info.isFile()) return [path];
  if (!info.isDirectory()) return [];

  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(path, entry.name))
    .sort();
}

function summarize(content: string): string {
  const firstLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return (firstLine ?? "Captured local artifact via watch.").slice(0, 240);
}

export async function watchCommand(root: string, options: WatchCommandOptions): Promise<string> {
  if (!options.once) {
    throw new Error("watch currently supports --once only");
  }

  const profile = getAdapterProfile(options.agent);
  const workspace = options.workspace || root;
  const localPaths = [...profile.transcript_paths, ...profile.raw_artifact_paths].filter((path) => !path.includes("://"));
  const existing: string[] = [];
  for (const path of localPaths) {
    const resolved = resolveWatchPath(workspace, path);
    if (await pathExists(resolved)) existing.push(resolved);
  }

  const captures = [];
  for (const path of existing) {
    const files = await candidateFiles(path);
    for (const file of files) {
      const content = await readFile(file, "utf8");
      const sourceHash = computeHash(content);
      const capture = await finishCapture(root, {
        agent: options.agent,
        workspace,
        result: "unknown",
        triggers: ["watch_once"],
        signals: ["new_source"],
        idempotencyKey: `${options.agent}-${sourceHash}`,
        artifact: {
          kind: "transcript",
          sourceRef: `file-ref://${file}`,
          sourceHash,
          redactedSummary: summarize(content),
        },
      });
      captures.push(capture);
    }
  }

  const warnings = captures.length === 0 ? ["watch_path_unavailable"] : [];
  const result = {
    ok: true,
    agent: options.agent,
    workspace,
    mode: "once",
    captures,
    warnings,
  };

  if (options.json) {
    return JSON.stringify(result, null, 2);
  }
  return warnings.length > 0 ? warnings.join("\n") : "Watch completed.";
}
