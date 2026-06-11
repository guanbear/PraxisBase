import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ProposalSchema } from "@praxisbase/core";
import { writeJson } from "@praxisbase/core/store/file-store.js";

export async function submitProposal(
  root: string,
  inputPath: string,
  options: { offlineOk?: boolean } = {}
): Promise<void> {
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const proposal = ProposalSchema.parse(raw);

  const targetDir = options.offlineOk ? ".praxisbase/outbox/proposals" : ".praxisbase/inbox/proposals";
  await mkdir(join(root, targetDir), { recursive: true });
  await writeJson(root, `${targetDir}/${proposal.id}.json`, proposal);
}
