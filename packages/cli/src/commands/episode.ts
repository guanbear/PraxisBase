import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { AnyEpisodeSchema, ProposalSchema } from "@praxisbase/core";
import { writeJson } from "@praxisbase/core/store/file-store.js";

export async function submitEpisode(
  root: string,
  inputPath: string,
  options: { offlineOk?: boolean } = {}
): Promise<void> {
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const episode = AnyEpisodeSchema.parse(raw);

  const targetDir = options.offlineOk ? ".praxisbase/outbox/episodes" : ".praxisbase/inbox/episodes";
  await mkdir(join(root, targetDir), { recursive: true });
  await writeJson(root, `${targetDir}/${episode.id}.json`, episode);
}

export interface OutboxSyncResult {
  episodes: number;
  proposals: number;
  skipped: number;
}

async function existingIdempotencyKeys(root: string, dir: string): Promise<Set<string>> {
  const keys = new Set<string>();
  const files = await readdir(join(root, dir)).catch(() => [] as string[]);
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    try {
      const raw = JSON.parse(await readFile(join(root, dir, file), "utf8")) as { idempotency_key?: unknown };
      if (typeof raw.idempotency_key === "string") keys.add(raw.idempotency_key);
    } catch {
      // Invalid inbox records are ignored here; validation happens on submit/review.
    }
  }
  return keys;
}

export async function syncOutbox(root: string): Promise<OutboxSyncResult> {
  const episodeKeys = await existingIdempotencyKeys(root, ".praxisbase/inbox/episodes");
  const proposalKeys = await existingIdempotencyKeys(root, ".praxisbase/inbox/proposals");
  const result: OutboxSyncResult = { episodes: 0, proposals: 0, skipped: 0 };

  await mkdir(join(root, ".praxisbase/inbox/episodes"), { recursive: true });
  await mkdir(join(root, ".praxisbase/inbox/proposals"), { recursive: true });

  const episodeFiles = await readdir(join(root, ".praxisbase/outbox/episodes")).catch(() => [] as string[]);
  for (const file of episodeFiles.filter((name) => name.endsWith(".json")).sort()) {
    const episode = AnyEpisodeSchema.parse(JSON.parse(await readFile(join(root, ".praxisbase/outbox/episodes", file), "utf8")));
    if (episodeKeys.has(episode.idempotency_key)) {
      result.skipped++;
      continue;
    }
    await writeJson(root, `.praxisbase/inbox/episodes/${episode.id}.json`, episode);
    episodeKeys.add(episode.idempotency_key);
    result.episodes++;
  }

  const proposalFiles = await readdir(join(root, ".praxisbase/outbox/proposals")).catch(() => [] as string[]);
  for (const file of proposalFiles.filter((name) => name.endsWith(".json")).sort()) {
    const proposal = ProposalSchema.parse(JSON.parse(await readFile(join(root, ".praxisbase/outbox/proposals", file), "utf8")));
    if (proposalKeys.has(proposal.idempotency_key)) {
      result.skipped++;
      continue;
    }
    await writeJson(root, `.praxisbase/inbox/proposals/${proposal.id}.json`, proposal);
    proposalKeys.add(proposal.idempotency_key);
    result.proposals++;
  }

  return result;
}
