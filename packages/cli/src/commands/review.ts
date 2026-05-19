import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { ProposalSchema, PROTOCOL_VERSION } from "@praxisbase/core";
import type { ExceptionRecord, RunRecord } from "@praxisbase/core";
import { reviewProposal } from "@praxisbase/core/review/reviewer.js";
import { writeJson } from "@praxisbase/core/store/file-store.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";

export async function reviewAuto(root: string): Promise<void> {
  const startedAt = new Date().toISOString();
  const proposalDir = join(root, ".praxisbase/inbox/proposals");
  const files = await readdir(proposalDir).catch(() => []);

  await mkdir(join(root, ".praxisbase/inbox/reviews"), { recursive: true });
  await mkdir(join(root, protocolPaths.exceptionsHumanRequired), { recursive: true });

  let reviewed = 0;
  let approved = 0;
  let needsHuman = 0;
  const errors: string[] = [];

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const raw = JSON.parse(await readFile(join(proposalDir, file), "utf8"));
    const proposal = ProposalSchema.parse(raw);
    const review = reviewProposal(proposal);
    await writeJson(root, `.praxisbase/inbox/reviews/${review.id}.json`, review);
    reviewed++;

    if (review.decision === "approve") {
      approved++;
    }

    if (review.decision === "needs_human" || review.risk === "high" || review.confidence < 0.75) {
      needsHuman++;
      const exception: ExceptionRecord = {
        id: `exc_${randomUUID().slice(0, 8)}`,
        protocol_version: PROTOCOL_VERSION,
        type: "exception_record",
        category: "human_required",
        source_id: review.id,
        reason: `Review decision=${review.decision} risk=${review.risk} confidence=${review.confidence}`,
        details: { proposal_id: proposal.id, review_decision: review.decision, risk: review.risk, confidence: review.confidence },
        created_at: new Date().toISOString(),
      };
      await writeJson(root, `${protocolPaths.exceptionsHumanRequired}/${exception.id}.json`, exception);
    }
  }

  const finishedAt = new Date().toISOString();
  const runRecord: RunRecord = {
    id: `run_review_${randomUUID().slice(0, 8)}`,
    protocol_version: PROTOCOL_VERSION,
    command: "review",
    status: errors.length > 0 ? "partial" : "completed",
    started_at: startedAt,
    finished_at: finishedAt,
    counts: { reviewed, approved, needs_human: needsHuman },
    errors,
  };

  await mkdir(join(root, protocolPaths.runsReview), { recursive: true });
  await writeJson(root, `${protocolPaths.runsReview}/${runRecord.id}.json`, runRecord);
}
