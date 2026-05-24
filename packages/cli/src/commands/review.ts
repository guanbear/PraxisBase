import { mkdir, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  ProposalSchema, PROTOCOL_VERSION, wikiCandidateToKnowledgeProposal,
  CuratedWikiProposalSchema, curatedWikiProposalToKnowledgeProposal,
  writeReviewPolicy, readReviewPolicy, decideAutoReview,
} from "@praxisbase/core";
import type { Proposal, ReviewPolicy, CuratedWikiProposal, AutoReviewDecision, ExceptionRecord, RunRecord } from "@praxisbase/core";
import { reviewProposal } from "@praxisbase/core/review/reviewer.js";
import { writeJson } from "@praxisbase/core/store/file-store.js";
import { promoteApprovedProposal } from "@praxisbase/core/promote/promote.js";
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
    try {
      const raw = JSON.parse(await readFile(join(proposalDir, file), "utf8"));
      const proposal = parseReviewableProposal(raw);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${file}: ${message}`);
    }
  }

  const finishedAt = new Date().toISOString();
  const runRecord: RunRecord = {
    id: `run_review_${randomUUID().slice(0, 8)}`,
    protocol_version: PROTOCOL_VERSION,
    command: "review",
    status: errors.length > 0 && reviewed === 0 ? "failed" : errors.length > 0 ? "partial" : "completed",
    started_at: startedAt,
    finished_at: finishedAt,
    counts: { reviewed, approved, needs_human: needsHuman },
    errors,
  };

  await mkdir(join(root, protocolPaths.runsReview), { recursive: true });
  await writeJson(root, `${protocolPaths.runsReview}/${runRecord.id}.json`, runRecord);
}

function parseReviewableProposal(value: unknown): Proposal {
  const proposal = ProposalSchema.safeParse(value);
  if (proposal.success) return proposal.data;

  const wikiCandidate = wikiCandidateToKnowledgeProposal(value);
  if (wikiCandidate) return wikiCandidate;

  return ProposalSchema.parse(value);
}

async function updateWikiSourceSummaryContributions(
  root: string,
  curated: CuratedWikiProposal,
): Promise<void> {
  const summaryDir = join(root, ".praxisbase/reports/wiki-source-summaries");
  const files = await readdir(summaryDir).catch(() => [] as string[]);
  if (files.length === 0) return;

  const evidenceIds = new Set(curated.evidence_ids);
  const sourceRefs = new Set(curated.source_refs);
  const sourceHashes = new Set(curated.source_hashes);

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const path = join(summaryDir, file);
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path, "utf8"));
    } catch {
      continue;
    }
    if (!raw || typeof raw !== "object") continue;
    const record = raw as {
      source_id?: unknown;
      source_ref?: unknown;
      source_hash?: unknown;
      contributed_to_pages?: unknown;
    };
    const matches = (typeof record.source_id === "string" && evidenceIds.has(record.source_id))
      || (typeof record.source_ref === "string" && sourceRefs.has(record.source_ref))
      || (typeof record.source_hash === "string" && sourceHashes.has(record.source_hash));
    if (!matches) continue;

    const contributedToPages = Array.isArray(record.contributed_to_pages)
      ? record.contributed_to_pages.filter((value): value is string => typeof value === "string")
      : [];
    const nextPages = Array.from(new Set([...contributedToPages, curated.target_path])).sort();
    await writeJson(root, `.praxisbase/reports/wiki-source-summaries/${file}`, {
      ...record,
      contributed_to_pages: nextPages,
    });
  }
}

export async function reviewPolicyInit(root: string, mode: "personal" | "team"): Promise<ReviewPolicy> {
  return writeReviewPolicy(root, mode);
}

export interface ReviewAutoPolicyResult {
  ok: true;
  reviewed: number;
  approved_by_policy: number;
  auto_promoted: number;
  needs_human: number;
  errors: string[];
}

export async function reviewAutoWithPolicy(
  root: string,
  options?: { promoteApproved?: boolean },
): Promise<ReviewAutoPolicyResult> {
  const policy = await readReviewPolicy(root);
  const proposalDir = join(root, ".praxisbase/inbox/proposals");
  const files = await readdir(proposalDir).catch(() => [] as string[]);

  await mkdir(join(root, ".praxisbase/inbox/reviews"), { recursive: true });
  await mkdir(join(root, protocolPaths.exceptionsHumanRequired), { recursive: true });

  const startedAt = new Date().toISOString();
  let reviewed = 0;
  let approvedByPolicy = 0;
  let autoPromoted = 0;
  let needsHuman = 0;
  const errors: string[] = [];

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    try {
      const raw = JSON.parse(await readFile(join(proposalDir, file), "utf8"));

      if (raw.type === "wiki_curated_proposal") {
        const curated = CuratedWikiProposalSchema.parse(raw);
        const decision = decideAutoReview(curated, policy);
        const proposal = curatedWikiProposalToKnowledgeProposal(curated);
        const review = reviewProposal(proposal);
        await writeJson(root, `.praxisbase/inbox/reviews/${review.id}.json`, review);
        reviewed++;

        if (decision.human_required) {
          needsHuman++;
          const exception: ExceptionRecord = {
            id: `exc_${randomUUID().slice(0, 8)}`,
            protocol_version: PROTOCOL_VERSION,
            type: "exception_record",
            category: "human_required",
            source_id: review.id,
            reason: decision.reason,
            details: {
              proposal_id: curated.id,
              auto_promote: decision.auto_promote,
              human_reasons: decision.required_human_reasons,
            },
            created_at: new Date().toISOString(),
          };
          await writeJson(root, `${protocolPaths.exceptionsHumanRequired}/${exception.id}.json`, exception);
        } else if (decision.auto_promote && options?.promoteApproved) {
          try {
            await promoteApprovedProposal(root, { proposal, review });
            await updateWikiSourceSummaryContributions(root, curated);
            await unlink(join(proposalDir, file));
            autoPromoted++;
            approvedByPolicy++;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`${file}: ${message}`);
          }
        } else {
          approvedByPolicy++;
        }
      } else {
        const proposal = parseReviewableProposal(raw);
        const review = reviewProposal(proposal);
        await writeJson(root, `.praxisbase/inbox/reviews/${review.id}.json`, review);
        reviewed++;

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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${file}: ${message}`);
    }
  }

  const finishedAt = new Date().toISOString();
  const runRecord: RunRecord = {
    id: `run_review_policy_${randomUUID().slice(0, 8)}`,
    protocol_version: PROTOCOL_VERSION,
    command: "review" as const,
    status: errors.length > 0 && reviewed === 0 ? "failed" : errors.length > 0 ? "partial" : "completed",
    started_at: startedAt,
    finished_at: finishedAt,
    counts: { reviewed, approved_by_policy: approvedByPolicy, auto_promoted: autoPromoted, needs_human: needsHuman },
    errors,
  };

  await mkdir(join(root, protocolPaths.runsReview), { recursive: true });
  await writeJson(root, `${protocolPaths.runsReview}/${runRecord.id}.json`, runRecord);

  return {
    ok: true,
    reviewed,
    approved_by_policy: approvedByPolicy,
    auto_promoted: autoPromoted,
    needs_human: needsHuman,
    errors,
  };
}
