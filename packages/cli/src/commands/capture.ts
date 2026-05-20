import { finishCapture } from "@praxisbase/core/experience/capture.js";
import { PraxisBaseError } from "@praxisbase/core/experience/errors.js";

export async function captureFinishCommand(
  root: string,
  options: {
    agent: string;
    result: "success" | "failed" | "partial" | "unknown";
    sourceRef: string;
    sourceHash: string;
    summary: string;
    json?: boolean;
  },
): Promise<{ output: string; ok: boolean }> {
  try {
    const result = await finishCapture(root, {
      agent: options.agent,
      workspace: root,
      result: options.result,
      artifact: {
        kind: "transcript",
        sourceRef: options.sourceRef,
        sourceHash: options.sourceHash,
        redactedSummary: options.summary,
      },
    });

    return {
      ok: true,
      output: JSON.stringify({
        ok: true,
        id: result.id,
        path: result.path,
      }, null, options.json ? 2 : undefined),
    };
  } catch (err) {
    if (err instanceof PraxisBaseError) {
      return {
        ok: false,
        output: JSON.stringify({
          ok: false,
          code: err.code,
          message: err.message,
          retryable: err.retryable,
          details: err.details,
        }, null, options.json ? 2 : undefined),
      };
    }
    throw err;
  }
}
