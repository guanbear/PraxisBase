import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { ProposalSchema, ReviewSchema, PROTOCOL_VERSION, wikiCandidateToKnowledgeProposal } from "@praxisbase/core";
import type { ExceptionRecord, Proposal, RunRecord } from "@praxisbase/core";
import { promoteApprovedProposal } from "@praxisbase/core/promote/promote.js";
import { shouldAutoMergeReview } from "@praxisbase/core/review/risk.js";
import { writeJson } from "@praxisbase/core/store/file-store.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";

export async function promoteAuto(root: string): Promise<void> {
  const startedAt = new Date().toISOString();
  const proposalDir = join(root, ".praxisbase/inbox/proposals");
  const reviewDir = join(root, ".praxisbase/inbox/reviews");
  const proposalFiles = await readdir(proposalDir).catch(() => []);
  const reviewFiles = await readdir(reviewDir).catch(() => []);

  const proposals = new Map<string, Proposal>();
  for (const file of proposalFiles.filter((name) => name.endsWith(".json"))) {
    const proposal = parsePromotableProposal(JSON.parse(await readFile(join(proposalDir, file), "utf8")));
    proposals.set(proposal.id, proposal);
  }

  let promoted = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];
  let firstError: Error | null = null;

  for (const file of reviewFiles.filter((name) => name.endsWith(".json"))) {
    const review = ReviewSchema.parse(JSON.parse(await readFile(join(reviewDir, file), "utf8")));
    if (!shouldAutoMergeReview(review)) {
      skipped++;
      continue;
    }
    const proposal = proposals.get(review.proposal_id);
    if (proposal) {
      try {
        await promoteApprovedProposal(root, { proposal, review });
        promoted++;
      } catch (err) {
        failed++;
        const error = err as Error & { code?: string };
        const errorCode = (err as { code?: string }).code ?? "unknown";
        const errorMessage = error.message;
        errors.push(`${proposal.id}: ${errorCode}: ${errorMessage}`);

        const category = errorCode === "review_not_approved" ? "failed_check" as const : "conflict" as const;
        const exceptionDir = category === "failed_check"
          ? protocolPaths.exceptionsFailedChecks
          : protocolPaths.exceptionsConflicts;

        const exception: ExceptionRecord = {
          id: `exc_${randomUUID().slice(0, 8)}`,
          protocol_version: PROTOCOL_VERSION,
          type: "exception_record",
          category,
          source_id: proposal.id,
          reason: errorMessage,
          details: { review_id: review.id, error_code: errorCode, patch_path: proposal.patch.path },
          created_at: new Date().toISOString(),
        };
        await mkdir(join(root, exceptionDir), { recursive: true });
        await writeJson(root, `${exceptionDir}/${exception.id}.json`, exception);

        if (!firstError) firstError = error;
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const runRecord: RunRecord = {
    id: `run_promote_${randomUUID().slice(0, 8)}`,
    protocol_version: PROTOCOL_VERSION,
    command: "promote",
    status: failed > 0 ? "failed" : "completed",
    started_at: startedAt,
    finished_at: finishedAt,
    counts: { promoted, skipped, failed },
    errors,
  };

  await mkdir(join(root, protocolPaths.runsPromote), { recursive: true });
  await writeJson(root, `${protocolPaths.runsPromote}/${runRecord.id}.json`, runRecord);

  if (firstError) throw firstError;
}

function parsePromotableProposal(value: unknown): Proposal {
  const proposal = ProposalSchema.safeParse(value);
  if (proposal.success) return proposal.data;

  const wikiCandidate = wikiCandidateToKnowledgeProposal(value);
  if (wikiCandidate) return wikiCandidate;

  return ProposalSchema.parse(value);
}
