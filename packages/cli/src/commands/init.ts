import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { seedFiles } from "@praxisbase/core";
import { writeText } from "@praxisbase/core/store/file-store.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";

export async function initializeWorkspace(root: string): Promise<void> {
  const directories = [
    protocolPaths.inboxEpisodes,
    protocolPaths.inboxProposals,
    protocolPaths.inboxReviews,
    protocolPaths.outboxEpisodes,
    protocolPaths.outboxProposals,
    protocolPaths.indexes,
    protocolPaths.bundles,
    protocolPaths.procedures,
    protocolPaths.notes,
    protocolPaths.memory,
    protocolPaths.sources,
    protocolPaths.dist,
  ];

  await Promise.all(directories.map((dir) => mkdir(join(root, dir), { recursive: true })));

  for (const [relativePath, content] of Object.entries(seedFiles)) {
    await writeText(root, relativePath, content);
  }
}
