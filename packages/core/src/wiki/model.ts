import { createHash } from "node:crypto";
import { PROTOCOL_VERSION } from "../protocol/types.js";

export type WikiSourceKind =
  | "stable_kb"
  | "skill"
  | "episode"
  | "capture"
  | "native_memory"
  | "proposal"
  | "review"
  | "external_ref";

export interface WikiSource {
  id: string;
  kind: WikiSourceKind;
  path?: string;
  source_ref?: string;
  source_hash: string;
  title: string;
  summary: string;
  body?: string;
  scope: "personal" | "project" | "team" | "global" | "org";
  layer?: "preference" | "convention" | "technical" | "domain" | "project";
  knowledge_type?: string;
  maturity?: string;
  created_at?: string;
  updated_at?: string;
}

export interface WikiStateSource {
  source_hash: string;
  last_compiled_at: string;
  candidate_ids: string[];
  page_ids: string[];
}

export interface WikiState {
  protocol_version: typeof PROTOCOL_VERSION;
  sources: Record<string, WikiStateSource>;
}

export const MATURITY_ORDER: Record<string, number> = {
  proven: 4,
  verified: 3,
  draft: 2,
  stale: 1,
  archived: 0,
};

export const SCOPE_ORDER: Record<string, number> = {
  project: 4,
  team: 3,
  org: 2,
  global: 1,
  personal: 0,
};

/**
 * Create a deterministic URL-safe slug from a title.
 * CJK-only titles fall back to "wiki".
 */
export function makeWikiSlug(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "wiki";
}

/**
 * Compute a deterministic SHA-256 source hash prefixed with "sha256:".
 */
export function computeWikiSourceHash(input: string): string {
  const hex = createHash("sha256").update(input).digest("hex");
  return `sha256:${hex}`;
}
