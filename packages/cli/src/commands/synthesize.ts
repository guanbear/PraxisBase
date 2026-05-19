import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { IncidentEpisodeSchema } from "@praxisbase/core";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { generateSkillDraft } from "@praxisbase/core/synthesis/skill.js";

export async function synthesizeSkillCommand(
  root: string,
  options: { signature: string; minEpisodes?: number; json?: boolean },
): Promise<string> {
  const episodeDir = join(root, protocolPaths.inboxEpisodes);
  const files = await readdir(episodeDir).catch(() => []);

  const matchingEpisodes = [];

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const raw = JSON.parse(await readFile(join(episodeDir, file), "utf8"));
    const parsed = IncidentEpisodeSchema.safeParse(raw);
    if (!parsed.success) continue;
    const episode = parsed.data;
    if (episode.problem_signature === options.signature) {
      matchingEpisodes.push({
        summary: episode.evidence_summary,
        result: episode.result,
        used_skills: episode.used_skills,
        used_objects: episode.used_objects,
        source_refs: episode.source_refs,
      });
    }
  }

  const proposal = generateSkillDraft({
    signature: options.signature,
    episodes: matchingEpisodes,
    minEpisodes: options.minEpisodes,
  });

  return JSON.stringify(proposal, null, options.json ? 2 : undefined);
}
