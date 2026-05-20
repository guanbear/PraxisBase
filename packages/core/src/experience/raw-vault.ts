import { normalize } from "node:path";
import { structuredError } from "./errors.js";
import type { StructuredError } from "../protocol/schemas.js";

const ALLOWED_SCHEMES = [
  "raw-vault://",
  "log://",
  "artifact://",
  "file-ref://",
  "ci-artifact://",
];

const FORBIDDEN_SEGMENTS = [
  "kb/",
  "skills/",
  "dist/",
];

function stripScheme(ref: string): string {
  for (const scheme of ALLOWED_SCHEMES) {
    if (ref.startsWith(scheme)) {
      return ref.slice(scheme.length);
    }
  }
  return ref;
}

function hasStablePathSegment(path: string): boolean {
  const normalized = normalize(path).replace(/^\.\//, "");
  for (const segment of FORBIDDEN_SEGMENTS) {
    if (normalized.startsWith(segment) || normalized.includes("/" + segment)) {
      return true;
    }
  }
  return false;
}

export function validateRawRef(sourceRef: string): StructuredError | null {
  for (const prefix of FORBIDDEN_SEGMENTS) {
    if (sourceRef.startsWith(prefix)) {
      return structuredError("RAW_ARTIFACT_REJECTED", `Raw artifact ref must not point into stable knowledge path: ${sourceRef}`, {
        details: { path: sourceRef, forbidden_prefix: prefix },
      });
    }
  }

  const hasAllowedScheme = ALLOWED_SCHEMES.some((scheme) => sourceRef.startsWith(scheme));
  if (!hasAllowedScheme) {
    return structuredError("RAW_ARTIFACT_REJECTED", `Raw artifact ref must use an allowed scheme (${ALLOWED_SCHEMES.join(", ")}): ${sourceRef}`, {
      details: { path: sourceRef },
    });
  }

  const afterScheme = stripScheme(sourceRef);
  if (hasStablePathSegment(afterScheme)) {
    return structuredError("RAW_ARTIFACT_REJECTED", `Raw artifact ref must not point into stable knowledge path: ${sourceRef}`, {
      details: { path: sourceRef },
    });
  }

  return null;
}
