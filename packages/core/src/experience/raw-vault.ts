import { normalize, sep } from "node:path";
import { PraxisBaseError } from "./errors.js";

const ALLOWED_REF_PREFIXES = [
  "raw-vault://",
  "log://",
  "artifact://",
  "file-ref://",
  "ci-artifact://",
] as const;

const STABLE_KNOWLEDGE_PREFIXES = [`kb${sep}`, `skills${sep}`, `dist${sep}`];

export function validateRawArtifactRef(sourceRef: string): void {
  const normalized = normalize(sourceRef);
  const stablePath = STABLE_KNOWLEDGE_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
  const allowedScheme = ALLOWED_REF_PREFIXES.some((prefix) => sourceRef.startsWith(prefix));

  if (stablePath || !allowedScheme) {
    throw new PraxisBaseError(
      "RAW_ARTIFACT_REJECTED",
      "Raw artifacts must use external refs and must not point under kb/, skills/, or dist/.",
      { source_ref: sourceRef }
    );
  }
}
