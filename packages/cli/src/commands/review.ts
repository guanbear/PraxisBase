import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, unlink } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import {
  ProposalSchema, PROTOCOL_VERSION, wikiCandidateToKnowledgeProposal,
  CuratedWikiProposalSchema, curatedWikiProposalToKnowledgeProposal, ReviewSchema, buildWikiSite,
  writeReviewPolicy, readReviewPolicy, decideAutoReview, recordWikiSourceSummaryContributions,
  writeManualPrivacyReview,
} from "@praxisbase/core";
import type { Proposal, ReviewPolicy, CuratedWikiProposal, AutoReviewDecision, ExceptionRecord, RunRecord, ReviewDecision } from "@praxisbase/core";
import { reviewProposal } from "@praxisbase/core/review/reviewer.js";
import { writeJson } from "@praxisbase/core/store/file-store.js";
import { promoteApprovedProposal } from "@praxisbase/core/promote/promote.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { promoteAuto } from "./promote.js";

const execFileAsync = promisify(execFile);

export { writeManualPrivacyReview };

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

export interface ReviewWritebackOptions {
  mode?: "none" | "git";
  push?: boolean;
  message?: string;
  remote?: string;
  branch?: string;
}

export interface ReviewWritebackResult {
  committed: boolean;
  pushed: boolean;
  changed: string[];
  commit?: string;
}

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: root });
  return stdout.trim();
}

async function gitRaw(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: root });
  return stdout;
}

export async function syncReviewWriteback(root: string, options: ReviewWritebackOptions = {}): Promise<ReviewWritebackResult> {
  if ((options.mode ?? "none") !== "git") {
    return { committed: false, pushed: false, changed: [] };
  }
  const changedRaw = (await gitRaw(root, ["status", "--porcelain", ".praxisbase/inbox/reviews", ".praxisbase/exceptions"]))
    .split("\n")
    .filter((line) => line.trim());
  const changed = changedRaw.map((line) => line.trim());
  if (changed.length === 0) {
    return { committed: false, pushed: false, changed: [] };
  }

  const changedPaths = changedRaw.map((line) => line.replace(/^[ MADRCU?!]{1,2}\s+/, "").trim()).filter(Boolean);
  await git(root, ["add", "--", ...changedPaths]);
  await git(root, ["commit", "-m", options.message ?? "Record PraxisBase review decision"]);
  const commit = await git(root, ["rev-parse", "HEAD"]);

  let pushed = false;
  if (options.push) {
    const remote = options.remote ?? "origin";
    if (options.branch) {
      await git(root, ["push", remote, `HEAD:${options.branch}`]);
    } else {
      await git(root, ["push", remote, "HEAD"]);
    }
    pushed = true;
  }

  return { committed: true, pushed, changed, commit };
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
      if (req.method === "POST" && req.url === "/privacy-review") {
        const body = await readJsonBody(req);
        const exceptionId = typeof body.exception_id === "string" ? body.exception_id : undefined;
        const decision = body.decision === "auto_released" || body.decision === "rejected_low_signal" || body.decision === "team_review_only" || body.decision === "keep_human_required"
          ? body.decision
          : undefined;
        if (!exceptionId || !decision) return send(400, { ok: false, error: "exception_id and decision are required" });
        const result = await writeManualPrivacyReview(root, {
          exceptionId,
          decision,
          releaseSummary: typeof body.release_summary === "string" ? body.release_summary : undefined,
          note: typeof body.note === "string" ? body.note : undefined,
          reviewerId: "praxisbase-local-review-ui",
        });
        const site = await buildWikiSite(root);
        return send(200, { ok: true, ...result, outputs: site.outputs });
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
