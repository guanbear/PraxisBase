/**
 * Deterministic OpenClaw log signature detection.
 * Maps known log patterns to problem signatures.
 */
export function detectOpenClawProblemSignature(logs: string): string {
  const normalized = logs.toLowerCase();

  if (
    normalized.includes("authentication expired") ||
    normalized.includes("401 unauthorized") ||
    normalized.includes("refresh credentials")
  ) {
    return "openclaw:claude-auth-expired";
  }

  if (normalized.includes("workspace lock") || normalized.includes("lock file")) {
    return "openclaw:workspace-lock-stuck";
  }

  if (normalized.includes("node: command not found") || normalized.includes("node runtime")) {
    return "openclaw:node-runtime-missing";
  }

  return "openclaw:unknown";
}

/**
 * All known OpenClaw problem signatures for bundle generation.
 */
export const OPENCLAW_SIGNATURES = [
  "openclaw:claude-auth-expired",
  "openclaw:workspace-lock-stuck",
  "openclaw:node-runtime-missing",
] as const;
