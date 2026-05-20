import type { StructuredError } from "../protocol/schemas.js";

export function structuredError(
  code: string,
  message: string,
  options: { retryable?: boolean; details?: Record<string, unknown> } = {},
): StructuredError {
  return {
    ok: false,
    code,
    message,
    retryable: options.retryable ?? false,
    details: options.details,
  };
}

export class PraxisBaseError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(error: StructuredError) {
    super(error.message);
    this.name = "PraxisBaseError";
    this.code = error.code;
    this.retryable = error.retryable;
    this.details = error.details;
  }
}
