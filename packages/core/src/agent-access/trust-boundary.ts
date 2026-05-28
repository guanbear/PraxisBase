import type { TrustTier } from "../protocol/schemas.js";

export const TRUST_TIERS = [
  "pb_stable",
  "pb_personal_facet",
  "pb_candidate",
  "gbrain_sidecar",
  "agentmemory_sidecar",
  "remote_personal_agent",
  "external_untrusted",
] as const satisfies readonly TrustTier[];

export interface TrustClassificationOptions {
  trustPersonalRemotes?: boolean;
}

export interface ClassifiedContent {
  tier: TrustTier;
  content: string;
  injectable: boolean;
}

const PB_STABLE_KINDS = new Set([
  "pb_stable",
  "pb_stable_page",
  "pb_promoted_skill",
  "stable_wiki",
  "promoted_skill",
]);

const PB_CANDIDATE_KINDS = new Set([
  "pb_candidate",
  "wiki_candidate",
  "skill_candidate",
  "review_candidate",
]);

export function classifyTrust(sourceKind: string, options: TrustClassificationOptions = {}): TrustTier {
  const normalized = sourceKind.trim().toLowerCase();

  if (PB_STABLE_KINDS.has(normalized)) return "pb_stable";
  if (normalized === "pb_personal_facet" || normalized === "personal_facet") return "pb_personal_facet";
  if (PB_CANDIDATE_KINDS.has(normalized)) return "pb_candidate";
  if (normalized === "gbrain_sidecar" || normalized === "gbrain") return "gbrain_sidecar";
  if (normalized === "agentmemory_sidecar" || normalized === "agentmemory") return "agentmemory_sidecar";
  if (
    normalized === "remote_openclaw" ||
    normalized === "remote_codex" ||
    normalized === "remote_claude_code" ||
    normalized === "remote_opencode" ||
    normalized === "remote_personal_agent"
  ) {
    return options.trustPersonalRemotes ? "remote_personal_agent" : "external_untrusted";
  }

  return "external_untrusted";
}

export function isInjectable(tier: TrustTier): boolean {
  return tier === "pb_stable" || tier === "pb_personal_facet" || tier === "remote_personal_agent";
}

export function escapeWrapperContent(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function capSourceHint(sourceHint: string, maxLength = 120): string {
  if (sourceHint.length <= maxLength) return sourceHint;
  if (maxLength <= 3) return ".".repeat(Math.max(0, maxLength));
  return `${sourceHint.slice(0, maxLength - 3)}...`;
}

export function wrapUntrusted(content: string, sourceKind: string, authority: string): string {
  const safeSource = escapeWrapperContent(capSourceHint(sourceKind));
  const safeAuthority = escapeWrapperContent(capSourceHint(authority));
  return `<untrusted-source source="${safeSource}" authority="${safeAuthority}">\n${escapeWrapperContent(content)}\n</untrusted-source>`;
}

export function classifyAndWrap(
  content: string,
  sourceKind: string,
  authority: string,
  options: TrustClassificationOptions = {},
): ClassifiedContent {
  const tier = classifyTrust(sourceKind, options);
  const injectable = isInjectable(tier);

  return {
    tier,
    injectable,
    content: injectable ? content : wrapUntrusted(content, sourceKind, authority),
  };
}
