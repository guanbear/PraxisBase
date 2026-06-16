import { mkdir, readdir, readFile, unlink } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  ProposalSchema, PROTOCOL_VERSION, wikiCandidateToKnowledgeProposal,
  CuratedWikiProposalSchema, curatedWikiProposalToKnowledgeProposal, ReviewSchema, buildWikiSite,
  writeReviewPolicy, readReviewPolicy, decideAutoReview, recordWikiSourceSummaryContributions,
} from "@praxisbase/core";
import type { Proposal, ReviewPolicy, CuratedWikiProposal, AutoReviewDecision, ExceptionRecord, RunRecord, ReviewDecision } from "@praxisbase/core";
import { reviewProposal } from "@praxisbase/core/review/reviewer.js";
import { writeJson } from "@praxisbase/core/store/file-store.js";
import { promoteApprovedProposal } from "@praxisbase/core/promote/promote.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { promoteAuto } from "./promote.js";

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

export async function writeManualReview(root: string, input: {
  proposalId: string;
  decision: Extract<ReviewDecision, "approve" | "reject" | "needs_human">;
  note?: string;
}): Promise<{ review_path: string; decision: string }> {
  const now = new Date().toISOString();
  const review = ReviewSchema.parse({
    id: `review_manual_${randomUUID().slice(0, 8)}`,
    protocol_version: PROTOCOL_VERSION,
    proposal_id: input.proposalId,
    reviewer_id: "praxisbase-local-review-ui",
    reviewer_model: "human-local-ui",
    prompt_version: "manual-review-v1",
    decision: input.decision,
    risk: input.decision === "approve" ? "low" : "medium",
    confidence: input.decision === "approve" ? 0.9 : 0.75,
    reasons: [input.note?.trim() || `manual_${input.decision}`],
    required_checks: [],
    created_at: now,
  });
  await mkdir(join(root, protocolPaths.inboxReviews), { recursive: true });
  const reviewPath = `${protocolPaths.inboxReviews}/${review.id}.json`;
  await writeJson(root, reviewPath, review);
  return { review_path: reviewPath, decision: review.decision };
}

function readJsonBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? JSON.parse(raw) as Record<string, unknown> : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export async function reviewServe(root: string, options: { port: number; host?: string }): Promise<void> {
  const port = options.port;
  const host = options.host ?? "127.0.0.1";
  const server = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === "OPTIONS") return send(204, {});
      if (req.method === "GET" && req.url === "/health") return send(200, { ok: true });
      if (req.method === "POST" && req.url === "/review") {
        const body = await readJsonBody(req);
        const proposalId = typeof body.proposal_id === "string" ? body.proposal_id : undefined;
        const decision = body.decision === "approve" || body.decision === "reject" || body.decision === "needs_human" ? body.decision : undefined;
        if (!proposalId || !decision) return send(400, { ok: false, error: "proposal_id and decision are required" });
        const review = await writeManualReview(root, {
          proposalId,
          decision,
          note: typeof body.note === "string" ? body.note : undefined,
        });
        const outputs = [review.review_path];
        if (body.promote === true && decision === "approve") {
          await promoteAuto(root);
          const site = await buildWikiSite(root);
          outputs.push(...site.outputs);
        }
        return send(200, { ok: true, ...review, outputs });
      }
      return send(404, { ok: false, error: "not_found" });
    } catch (error) {
      return send(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  console.log(`PraxisBase review server listening on http://${host}:${port}`);
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
            await recordWikiSourceSummaryContributions(root, curated);
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
