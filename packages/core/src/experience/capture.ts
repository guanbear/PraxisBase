import { CaptureRecordSchema } from "../protocol/schemas.js";
import { makeId } from "../protocol/id.js";
import { PROTOCOL_VERSION, type AgentProfile, type CaptureResult } from "../protocol/types.js";
import { protocolPaths } from "../protocol/paths.js";
import { writeJson } from "../store/file-store.js";
import { validateRawArtifactRef } from "./raw-vault.js";

export interface FinishCaptureInput {
  agent: AgentProfile;
  workspace: string;
  result: CaptureResult;
  triggers: string[];
  signals?: string[];
  idempotencyKey?: string;
  artifact: {
    kind: string;
    sourceRef: string;
    sourceHash: string;
    redactedSummary: string;
  };
}

export interface FinishCaptureResult {
  id: string;
  path: string;
}

export async function finishCapture(root: string, input: FinishCaptureInput): Promise<FinishCaptureResult> {
  validateRawArtifactRef(input.artifact.sourceRef);

  const id = makeId("capture", input.idempotencyKey ?? `${input.agent}-${input.artifact.sourceHash}`);
  const record = CaptureRecordSchema.parse({
    id,
    protocol_version: PROTOCOL_VERSION,
    type: "capture_record",
    agent: input.agent,
    workspace: input.workspace,
    scope_hint: "personal",
    result: input.result,
    triggers: input.triggers,
    signals: input.signals ?? [],
    artifacts: [
      {
        kind: input.artifact.kind,
        source_ref: input.artifact.sourceRef,
        source_hash: input.artifact.sourceHash,
        redacted_summary: input.artifact.redactedSummary,
      },
    ],
    created_at: new Date().toISOString(),
  });

  const path = `${protocolPaths.outboxCaptures}/${id}.json`;
  await writeJson(root, path, record);
  return { id, path };
}
