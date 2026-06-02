import { createHash } from "node:crypto";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { normalizeStableSlug } from "../protocol/slug.js";

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
  return normalizeStableSlug(title);
}

/**
 * Compute a deterministic SHA-256 source hash prefixed with "sha256:".
 */
export function computeWikiSourceHash(input: string): string {
  const hex = createHash("sha256").update(input).digest("hex");
  return `sha256:${hex}`;
}

export function inferWikiLifecycle(input: {
  maturity?: string;
  updated_at?: string;
  superseded_by?: string | null;
  now?: string;
}): "draft" | "reviewed" | "verified" | "stale" | "archived" {
  if (input.superseded_by) return "archived";

  const nowMs = Date.parse(input.now ?? new Date().toISOString());
  const updatedMs = input.updated_at ? Date.parse(input.updated_at) : Number.NaN;
  const ageMs = Number.isFinite(updatedMs) && Number.isFinite(nowMs) ? nowMs - updatedMs : 0;
  if (ageMs > 180 * 24 * 60 * 60 * 1000) return "stale";

  if (input.maturity === "proven" || input.maturity === "verified") return "verified";
  if (input.maturity === "draft") return "draft";
  return "reviewed";
}

export function inferWikiConfidence(input: {
  sourceCount: number;
  maturity?: string;
  referenceCount?: number;
  explicitConfidence?: number;
}): number {
  if (typeof input.explicitConfidence === "number" && Number.isFinite(input.explicitConfidence)) {
    return Math.max(0, Math.min(1, input.explicitConfidence));
  }

  const sourceScore = Math.min(input.sourceCount, 4) * 0.12;
  const maturityScore = input.maturity === "proven" ? 0.32
    : input.maturity === "verified" ? 0.24
      : input.maturity === "draft" ? 0.08
        : 0.12;
  const referenceScore = Math.min(input.referenceCount ?? 0, 5) * 0.06;
  return Math.max(0, Math.min(1, 0.2 + sourceScore + maturityScore + referenceScore));
}
