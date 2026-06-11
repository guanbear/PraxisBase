import { readFile } from "node:fs/promises";
import { IncidentEpisodeSchema } from "@praxisbase/core";
import { formatIncidentSummary, generateProposalDraft } from "@praxisbase/core/feishu/summary.js";
import { ProposalSchema } from "@praxisbase/core/protocol/schemas.js";

export async function feishuSummaryCommand(
  inputPath: string,
  options: { json?: boolean },
): Promise<string> {
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const episode = IncidentEpisodeSchema.parse(raw);
  const payload = formatIncidentSummary(episode);
  return JSON.stringify(payload, null, options.json ? 2 : undefined);
}

export async function feishuProposalDraftCommand(
  inputPath: string,
  patchPath: string,
  patchContent: string,
  options: { json?: boolean },
): Promise<string> {
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const episode = IncidentEpisodeSchema.parse(raw);
  const proposal = generateProposalDraft(episode, patchPath, patchContent);
  ProposalSchema.parse(proposal);
  return JSON.stringify(proposal, null, options.json ? 2 : undefined);
}
