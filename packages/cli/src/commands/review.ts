import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { ProposalSchema } from "@praxisbase/core";
import { reviewProposal } from "@praxisbase/core/review/reviewer.js";
import { writeJson } from "@praxisbase/core/store/file-store.js";

export async function reviewAuto(root: string): Promise<void> {
  const proposalDir = join(root, ".praxisbase/inbox/proposals");
  const files = await readdir(proposalDir).catch(() => []);

  await mkdir(join(root, ".praxisbase/inbox/reviews"), { recursive: true });

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const raw = JSON.parse(await readFile(join(proposalDir, file), "utf8"));
    const proposal = ProposalSchema.parse(raw);
    const review = reviewProposal(proposal);
    await writeJson(root, `.praxisbase/inbox/reviews/${review.id}.json`, review);
  }
}
