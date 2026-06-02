export interface OpenClawSignatureCandidate {
  signature: string;
  terms?: string[];
}

function signatureTerms(signature: string): string[] {
  return signature
    .replace(/^[a-z0-9-]+:/i, "")
    .split(/[^a-z0-9]+/i)
    .map((term) => term.toLowerCase())
    .filter((term) => term.length >= 3);
}

function matchesCandidate(normalizedLogs: string, candidate: OpenClawSignatureCandidate): boolean {
  const terms = Array.from(new Set([...(candidate.terms ?? []), ...signatureTerms(candidate.signature)]))
    .map((term) => term.toLowerCase())
    .filter((term) => term.length >= 3);
  if (terms.length === 0) return false;
  const matched = terms.filter((term) => normalizedLogs.includes(term));
  return matched.length >= Math.min(2, terms.length);
}

/**
 * Deterministic OpenClaw log signature detection.
 * Built-in patterns cover bootstrap signatures; repository candidates are
 * supplied from stable knowledge frontmatter `signatures:` metadata.
 */
export function detectOpenClawProblemSignature(logs: string, candidates: OpenClawSignatureCandidate[] = []): string {
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

  for (const candidate of candidates) {
    if (matchesCandidate(normalized, candidate)) return candidate.signature;
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
