import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { seedFiles } from "@praxisbase/core";
import { writeText } from "@praxisbase/core/store/file-store.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";

export type InitProfile = "all" | "openclaw" | "k8s";

export interface InitOptions {
  profile?: InitProfile;
}

function assertProfile(profile: string): asserts profile is InitProfile {
  if (!["all", "openclaw", "k8s"].includes(profile)) {
    throw new Error(`Unsupported init profile: ${profile}. Use all, openclaw, or k8s.`);
  }
}

function profileConfig(profile: InitProfile): string {
  const name = profile === "all" ? "praxisbase-knowledge" : `praxisbase-${profile}-kb`;
  return `protocol_version: "0.1"
name: ${name}
default_scope: team
profile: ${profile}
`;
}

function seedMatchesProfile(relativePath: string, profile: InitProfile): boolean {
  if (profile === "all") return true;
  if (relativePath === protocolPaths.config) return true;
  if (!relativePath.startsWith("skills/") && !relativePath.startsWith("kb/")) return true;

  const isOpenClawSeed = relativePath.includes("/openclaw/") || relativePath.includes("openclaw-");
  const isK8sSeed = relativePath.includes("/k8s/") || relativePath.includes("k8s-");

  if (profile === "openclaw") return isOpenClawSeed && !isK8sSeed;
  return isK8sSeed && !isOpenClawSeed;
}

async function ensureIgnoredPaths(root: string): Promise<void> {
  const gitignorePath = join(root, ".gitignore");
  let existing = "";
  try {
    existing = await readFile(gitignorePath, "utf8");
  } catch {
  }

  const lines = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
  const missing = [".praxisbase/staging/", ".praxisbase/cache/"].filter((line) => !lines.has(line));
  if (missing.length === 0) {
    return;
  }

  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  await writeFile(gitignorePath, `${existing}${prefix}${missing.join("\n")}\n`);
}

export async function initializeWorkspace(root: string, options: InitOptions = {}): Promise<void> {
  const profile = options.profile ?? "all";
  assertProfile(profile);

  const directories = [
    protocolPaths.inboxEpisodes,
    protocolPaths.inboxProposals,
    protocolPaths.inboxReviews,
    protocolPaths.outboxEpisodes,
    protocolPaths.outboxProposals,
    protocolPaths.outboxCaptures,
    protocolPaths.exceptionsHumanRequired,
    protocolPaths.exceptionsConflicts,
    protocolPaths.exceptionsFailedChecks,
    protocolPaths.runsReview,
    protocolPaths.runsPromote,
    protocolPaths.runsBuild,
    protocolPaths.runsCapture,
    protocolPaths.runsDistill,
    protocolPaths.runsMemoryImport,
    protocolPaths.runsMemoryFetch,
    protocolPaths.runsHarvest,
    protocolPaths.indexes,
    protocolPaths.bundles,
    protocolPaths.reportsDistill,
    protocolPaths.reportsContext,
    protocolPaths.reportsMemory,
    protocolPaths.reportsMemoryFetch,
    protocolPaths.reportsHarvest,
    protocolPaths.remotes,
    protocolPaths.adapters,
    protocolPaths.memoryRefresh,
    protocolPaths.stagingOpenClaw,
    protocolPaths.stagingRemoteImports,
    protocolPaths.cacheRemotes,
    protocolPaths.rawVaultRefs,
    protocolPaths.procedures,
    protocolPaths.notes,
    protocolPaths.memory,
    protocolPaths.sources,
    protocolPaths.pitfalls,
    protocolPaths.dist,
  ];

  await Promise.all(directories.map((dir) => mkdir(join(root, dir), { recursive: true })));

  for (const [relativePath, content] of Object.entries(seedFiles)) {
    if (!seedMatchesProfile(relativePath, profile)) continue;
    const seedContent = relativePath === protocolPaths.config ? profileConfig(profile) : content;
    await writeText(root, relativePath, seedContent);
  }

  await ensureIgnoredPaths(root);
}
