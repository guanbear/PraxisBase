type SensitiveReferenceRule = {
  pattern: RegExp;
  replacement: string;
  reason: string;
};

const SENSITIVE_REFERENCE_RULES: SensitiveReferenceRule[] = [
  {
    pattern: /(?:ssh\s+)?[\w.-]+@[\w.-]+\.\w{2,}/g,
    replacement: "[REDACTED_EMAIL]",
    reason: "email-like remote login",
  },
  {
    pattern: /[\w.-]+@[\w.-]+/g,
    replacement: "[REDACTED_USER_HOST]",
    reason: "user@host reference",
  },
  {
    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    replacement: "[REDACTED_IP]",
    reason: "IPv4 address",
  },
  {
    pattern: /(?<![a-z]:)\/(?:Users|home|etc|var|tmp|root|opt)\/[^\s,;)\]]+/g,
    replacement: "[REDACTED_PATH]",
    reason: "absolute Unix path",
  },
  {
    pattern: /~\/\.ssh\/[^\s,;)\]]+/g,
    replacement: "[REDACTED_KEY_PATH]",
    reason: "SSH key path",
  },
  {
    pattern: /(?:<U[A-Z0-9]{8,}>|\bU[A-Z0-9]{8,}\b)/g,
    replacement: "[REDACTED_SLACK_UID]",
    reason: "Slack raw user ID",
  },
  {
    pattern: /\b(?:[\w-]+\.)+(?:local|internal|lan|private|corp|home|vpn|tailnet|ts\.net)\b/gi,
    replacement: "[REDACTED_HOSTNAME]",
    reason: "private/internal hostname",
  },
  {
    pattern: /\b(?!ssh\b)[a-z0-9][a-z0-9._-]*(?:-ssh|ssh-|tailscale|vpn|proxy)[a-z0-9._-]*\b/gi,
    replacement: "[REDACTED_REMOTE_COMMAND]",
    reason: "private remote wrapper command",
  },
  {
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb|redis|mariadb):\/\/[^\s,;)\]]+/gi,
    replacement: "[REDACTED_DB_CONNECTION]",
    reason: "database connection string",
  },
];

export function redactSensitiveReferences(text: string): { value: string; changed: boolean; reasons: string[] } {
  let value = text;
  let changed = false;
  const reasons: string[] = [];

  const addReason = (reason: string): void => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  for (const rule of SENSITIVE_REFERENCE_RULES) {
    rule.pattern.lastIndex = 0;
    if (!rule.pattern.test(value)) continue;
    rule.pattern.lastIndex = 0;
    value = value.replace(rule.pattern, rule.replacement);
    changed = true;
    addReason(rule.reason);
  }

  return { value, changed, reasons };
}

/**
 * Redact potentially sensitive content from evidence excerpts.
 * Strips common secret and private-reference patterns and limits output length.
 */
export function redactExcerpt(text: string, maxLength: number = 500): string {
  let result = text;

  // Redact common secret patterns
  result = result.replace(/(?:sk-|pk_|key_|token_|Bearer\s+)[\w\-]{8,}/gi, "[REDACTED]");
  result = result.replace(/(?:password|passwd|secret)\s*[=:]\s*\S+/gi, "$1=[REDACTED]");
  result = result.replace(/(?:api[_-]?key)\s*[=:]\s*\S+/gi, "$1=[REDACTED]");

  // Strip ANSI escape codes
  result = result.replace(/\x1b\[[0-9;]*m/g, "");

  result = redactSensitiveReferences(result).value;

  // Truncate if too long
  if (result.length > maxLength) {
    result = result.slice(0, maxLength) + "...[truncated]";
  }

  return result;
}

export function redactSensitiveValues(text: string, maxLength: number = 500): string {
  let result = redactExcerpt(text, maxLength);
  result = result.replace(/\b(token|cookie|secret|password|passwd|credential|authorization|auth(?:entication)? header|api[_-]?key|access[_-]?token|secret[_-]?key)s?\b\s*(?:[:=]|is|was|as)?\s*["'`]?[^\s"'`,;]{4,}/gi, "$1=[REDACTED]");
  result = result.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
  return result;
}

/**
 * Check if content appears to contain raw logs that should not go into kb/.
 */
export function appearsToBeRawLog(text: string): boolean {
  const lines = text.split("\n").slice(0, 10);
  const logPatterns = [
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/,  // ISO timestamps
    /^\[[\d\-: ]+\]/,                        // Bracket timestamps
    /^INFO\s/, /^WARN\s/, /^ERROR\s/, /^DEBUG\s/,  // Log levels
    /^\d{2}:\d{2}:\d{2}/,                    // Time-only
  ];

  let logLineCount = 0;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    for (const pattern of logPatterns) {
      if (pattern.test(line.trim())) {
        logLineCount++;
        break;
      }
    }
  }

  return logLineCount >= 3;
}
