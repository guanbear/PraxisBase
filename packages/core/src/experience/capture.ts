import { join } from "node:path";
import { PROTOCOL_VERSION, type Scope } from "../protocol/types.js";
import { CaptureRecordSchema } from "../protocol/schemas.js";
import { protocolPaths } from "../protocol/paths.js";
import { writeJson } from "../store/file-store.js";
import { computeHash } from "../protocol/id.js";
import { PraxisBaseError } from "./errors.js";
import { validateRawRef } from "./raw-vault.js";

export interface FinishCaptureInput {
  agent: string;
  workspace: string;
  result: "success" | "failed" | "partial" | "unknown";
  triggers?: string[];
  artifact: {
    kind: string;
    sourceRef: string;
    sourceHash: string;
    redactedSummary: string;
  };
  scopeHint?: Scope;
  idempotencyKey?: string;
}

export interface FinishCaptureResult {
  id: string;
  path: string;
}

export async function finishCapture(
  root: string,
  input: FinishCaptureInput,
): Promise<FinishCaptureResult> {
  const refError = validateRawRef(input.artifact.sourceRef);
  if (refError) {
    throw new PraxisBaseError(refError);
  }

  const timestamp = new Date().toISOString();
  const idempotencyKey = input.idempotencyKey ?? `${input.agent}:${timestamp}:${input.artifact.sourceHash}`;
  const id = `capture_${computeHash(idempotencyKey).slice(7, 19)}`;

  const record = {
    id,
    protocol_version: PROTOCOL_VERSION,
    type: "capture_record" as const,
    agent: input.agent,
    workspace: input.workspace,
    scope_hint: input.scopeHint ?? "personal",
    result: input.result,
    triggers: input.triggers ?? [],
    signals: {},
    artifacts: [{
      kind: input.artifact.kind,
      source_ref: input.artifact.sourceRef,
      source_hash: input.artifact.sourceHash,
      redacted_summary: input.artifact.redactedSummary,
    }],
    created_at: timestamp,
  };

  CaptureRecordSchema.parse(record);

  const relativePath = `${protocolPaths.outboxCaptures}/${id}.json`;
  await writeJson(root, relativePath, record);

  return { id, path: relativePath };
}
