import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { AnyEpisodeSchema } from "@praxisbase/core";
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
