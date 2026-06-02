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

export const K8S_SIGNATURES = [
  "k8s:pod-oomkilled",
  "k8s:pod-crashloop-imagepull",
  "k8s:ingress-5xx-upstream-timeout",
  "k8s:pvc-pending",
  "k8s:node-notready",
  "k8s:dns-resolution-failure",
] as const;
export type K8sProblemSignature = typeof K8S_SIGNATURES[number];

const K8S_SIGNATURE_PATTERNS: Array<{ signature: K8sProblemSignature; patterns: RegExp[] }> = [
  {
    signature: "k8s:pod-oomkilled",
    patterns: [/\boomkilled\b/i, /\bexit code 137\b/i, /\bmemory limit\b/i],
  },
  {
    signature: "k8s:pod-crashloop-imagepull",
    patterns: [/\bcrashloopbackoff\b/i, /\bimagepullbackoff\b/i, /\berrimagepull\b/i, /\bfailed\b/i],
  },
  {
    signature: "k8s:ingress-5xx-upstream-timeout",
    patterns: [/\bingress\b/i, /\b5\d\d\b/i, /\bupstream (?:timed out|timeout)\b/i, /\b504\b/i],
  },
  {
    signature: "k8s:pvc-pending",
    patterns: [/\bpersistentvolumeclaim\b/i, /\bpvc\b/i, /\bpending\b/i, /\bwaiting for a volume\b/i],
  },
  {
    signature: "k8s:node-notready",
    patterns: [/\bnode(?:ready)?\b/i, /\bnotready\b/i, /\bstatus is false\b/i, /\bkubelet\b/i],
  },
  {
    signature: "k8s:dns-resolution-failure",
    patterns: [/\bcoredns\b/i, /\bdns\b/i, /\bnxdomain\b/i, /\bcannot resolve\b/i],
  },
];

export function detectK8sProblemSignature(logs: string, candidates: OpenClawSignatureCandidate[] = []): string {
  const normalized = logs.toLowerCase();

  for (const candidate of K8S_SIGNATURE_PATTERNS) {
    const matches = candidate.patterns.filter((pattern) => pattern.test(normalized)).length;
    if (matches >= Math.min(2, candidate.patterns.length)) return candidate.signature;
  }

  for (const candidate of candidates.filter((item) => item.signature.startsWith("k8s:"))) {
    if (matchesCandidate(normalized, candidate)) return candidate.signature;
  }

  return "k8s:unknown";
}
