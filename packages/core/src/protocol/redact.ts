/**
 * Redact potentially sensitive content from evidence excerpts.
 * Strips common secret patterns and limits output length.
 */
export function redactExcerpt(text: string, maxLength: number = 500): string {
  let result = text;

  // Redact common secret patterns
  result = result.replace(/(?:sk-|pk_|key_|token_|Bearer\s+)[\w\-]{8,}/gi, "[REDACTED]");
  result = result.replace(/(?:password|passwd|secret)\s*[=:]\s*\S+/gi, "$1=[REDACTED]");
  result = result.replace(/(?:api[_-]?key)\s*[=:]\s*\S+/gi, "$1=[REDACTED]");

  // Strip ANSI escape codes
  result = result.replace(/\x1b\[[0-9;]*m/g, "");

  // Truncate if too long
  if (result.length > maxLength) {
    result = result.slice(0, maxLength) + "...[truncated]";
  }

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
