import { finishCapture } from "@praxisbase/core";

export interface CaptureFinishOptions {
  agent: "codex" | "claude-code" | "opencode" | "openclaw" | "hermes" | "openhuman" | "generic";
  result: "success" | "failed" | "partial" | "unknown";
  sourceRef: string;
  sourceHash: string;
  summary: string;
  json?: boolean;
}

export async function captureFinishCommand(root: string, options: CaptureFinishOptions): Promise<string> {
  const result = await finishCapture(root, {
    agent: options.agent,
    workspace: root,
    result: options.result,
    triggers: ["task_finish"],
    artifact: {
      kind: "transcript",
      sourceRef: options.sourceRef,
      sourceHash: options.sourceHash,
      redactedSummary: options.summary,
    },
  });

  if (options.json) {
    return JSON.stringify({ ok: true, id: result.id, path: result.path }, null, 2);
  }
  return `Capture written: ${result.path}`;
}
