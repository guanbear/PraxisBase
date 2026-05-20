import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { CaptureRecordSchema, type CaptureRecord } from "../protocol/schemas.js";
import { makeId } from "../protocol/id.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { protocolPaths } from "../protocol/paths.js";
import { readJson, writeJson } from "../store/file-store.js";

export interface RunDistillOptions {
  json?: boolean;
}

export interface DistillReport {
  id: string;
  protocol_version: typeof PROTOCOL_VERSION;
  type: "distill_report";
  captures_read: number;
  proposal_candidates: number;
  exceptions: number;
  changed_stable_knowledge: false;
  created_at: string;
}

async function listCaptureFiles(root: string): Promise<string[]> {
  try {
    return (await readdir(join(root, protocolPaths.outboxCaptures))).filter((entry) => entry.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function hasPrivacyUncertainty(capture: CaptureRecord): boolean {
  const summary = capture.artifacts.map((artifact) => artifact.redacted_summary).join("\n").toLowerCase();
  return /\b(token|cookie|secret|password|credential)\b/.test(summary);
}

function shouldPropose(capture: CaptureRecord): boolean {
  return capture.result === "success" && capture.artifacts.length > 0 && !hasPrivacyUncertainty(capture);
}

export async function runDistill(root: string, _options: RunDistillOptions = {}): Promise<DistillReport> {
  const createdAt = new Date().toISOString();
  const id = makeId("distill", createdAt);
  const captureFiles = await listCaptureFiles(root);
  let proposalCount = 0;
  let exceptionCount = 0;

  for (const file of captureFiles) {
    const capture = CaptureRecordSchema.parse(await readJson(root, `${protocolPaths.outboxCaptures}/${file}`));

    if (hasPrivacyUncertainty(capture)) {
      const exceptionId = makeId("human-required", `${capture.id}-privacy`);
      await writeJson(root, `${protocolPaths.exceptionsHumanRequired}/${exceptionId}.json`, {
        id: exceptionId,
        protocol_version: PROTOCOL_VERSION,
        type: "exception_record",
        category: "human_required",
        source_id: capture.id,
        reason: "privacy_uncertainty",
        details: {
          source_refs: capture.artifacts.map((artifact) => artifact.source_ref),
        },
        created_at: createdAt,
      });
      exceptionCount += 1;
      continue;
    }

    if (shouldPropose(capture)) {
      const proposalId = makeId("distill-proposal", capture.id);
      await writeJson(root, `${protocolPaths.inboxProposals}/${proposalId}.json`, {
        id: proposalId,
        protocol_version: PROTOCOL_VERSION,
        type: "distill_proposal_candidate",
        agent: capture.agent,
        capture_id: capture.id,
        scope_hint: "personal",
        source_refs: capture.artifacts.map((artifact) => artifact.source_ref),
        source_hashes: capture.artifacts.map((artifact) => artifact.source_hash),
        redacted_summary: capture.artifacts.map((artifact) => artifact.redacted_summary).join("\n"),
        changed_stable_knowledge: false,
        created_at: createdAt,
      });
      proposalCount += 1;
    }
  }

  const report: DistillReport = {
    id,
    protocol_version: PROTOCOL_VERSION,
    type: "distill_report",
    captures_read: captureFiles.length,
    proposal_candidates: proposalCount,
    exceptions: exceptionCount,
    changed_stable_knowledge: false,
    created_at: createdAt,
  };

  await writeJson(root, `${protocolPaths.reportsDistill}/${id}.json`, report);
  await writeJson(root, `${protocolPaths.runsDistill}/${id}.json`, {
    id,
    protocol_version: PROTOCOL_VERSION,
    command: "distill",
    status: "completed",
    started_at: createdAt,
    finished_at: createdAt,
    counts: {
      captures_read: report.captures_read,
      proposal_candidates: report.proposal_candidates,
      exceptions: report.exceptions,
    },
    errors: [],
  });

  return report;
}
