import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ProposalSchema, ReviewSchema } from "@praxisbase/core";
import { promoteApprovedProposal } from "@praxisbase/core/promote/promote.js";
import { shouldAutoMergeReview } from "@praxisbase/core/review/risk.js";

export async function promoteAuto(root: string): Promise<void> {
  const proposalDir = join(root, ".praxisbase/inbox/proposals");
  const reviewDir = join(root, ".praxisbase/inbox/reviews");
  const proposalFiles = await readdir(proposalDir).catch(() => []);
  const reviewFiles = await readdir(reviewDir).catch(() => []);

  const proposals = new Map<string, ReturnType<typeof ProposalSchema.parse>>();
  for (const file of proposalFiles.filter((name) => name.endsWith(".json"))) {
    const proposal = ProposalSchema.parse(JSON.parse(await readFile(join(proposalDir, file), "utf8")));
    proposals.set(proposal.id, proposal);
  }

  for (const file of reviewFiles.filter((name) => name.endsWith(".json"))) {
    const review = ReviewSchema.parse(JSON.parse(await readFile(join(reviewDir, file), "utf8")));
    if (!shouldAutoMergeReview(review)) continue;
    const proposal = proposals.get(review.proposal_id);
    if (proposal) {
      await promoteApprovedProposal(root, { proposal, review });
    }
  }
}
