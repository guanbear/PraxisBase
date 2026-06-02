import type { PersonalLearningFacet } from "../protocol/schemas.js";
import type { DistilledExperience } from "../ai/distill.js";

export const MANAGED_PROFILE_START = "<!-- PRAXISBASE:PERSONAL_PROFILE:BEGIN -->";
export const MANAGED_PROFILE_END = "<!-- PRAXISBASE:PERSONAL_PROFILE:END -->";

export type PersonalFacetClass = PersonalLearningFacet["facet_class"];
export type PersonalFacetState = PersonalLearningFacet["state"];
export type PersonalFacetOverride = PersonalLearningFacet["user_override"];

export interface PersonalFacetCandidate {
  facet_class: PersonalFacetClass;
  key: string;
  value: string;
  cue_family?: "explicit" | "structural" | "behavioral" | "recurrence" | string;
  evidence_count?: number;
  evidence_refs?: readonly string[];
  first_seen?: string;
  last_seen?: string;
  user_override?: PersonalFacetOverride;
}

export interface PersonalFacetProducerInput {
  now?: string;
  existing?: readonly PersonalLearningFacet[];
}

export interface PersonalFacetScoreOptions {
  now?: string;
}

export const DEFAULT_PERSONAL_FACET_CLASS_BUDGETS: Record<PersonalFacetClass, number> = {
  style: 4,
  identity: 4,
  tooling: 5,
  veto: 3,
  goal: 3,
  channel: 1,
};

const CUE_WEIGHTS: Record<string, number> = {
  explicit: 1,
  structural: 0.9,
  behavioral: 0.7,
  recurrence: 0.6,
};

const HALF_LIFE_DAYS: Record<PersonalFacetClass, number> = {
  identity: 90,
  veto: 60,
  tooling: 30,
  goal: 30,
  style: 14,
  channel: 7,
};

function daysBetween(a: string, b: string): number {
  const start = Date.parse(a);
  const end = Date.parse(b);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, (end - start) / 86_400_000);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function stableId(candidate: PersonalFacetCandidate): string {
  return `facet-${candidate.facet_class}-${candidate.key}`.replace(/[^A-Za-z0-9._-]+/g, "-").toLowerCase();
}

function stateFromScore(stability: number): PersonalFacetState {
  if (stability >= 0.65) return "active";
  if (stability >= 0.05) return "provisional";
  return "candidate";
}

export function scorePersonalFacet(
  candidate: PersonalFacetCandidate,
  options: PersonalFacetScoreOptions = {},
): PersonalLearningFacet {
  const now = options.now ?? new Date().toISOString();
  const lastSeen = candidate.last_seen ?? now;
  const firstSeen = candidate.first_seen ?? lastSeen;
  const evidenceCount = Math.max(0, Math.floor(candidate.evidence_count ?? 1));
  const cueWeight = CUE_WEIGHTS[candidate.cue_family ?? "behavioral"] ?? 0.5;
  const halfLife = HALF_LIFE_DAYS[candidate.facet_class];
  const recency = Math.max(0.25, Math.pow(0.5, daysBetween(lastSeen, now) / halfLife));
  const explicitMultiplier = candidate.cue_family === "explicit" ? 1.35 : 1;
  const stability = clamp01(cueWeight * recency * Math.log1p(evidenceCount) * explicitMultiplier / 2);
  const override = candidate.user_override ?? "none";

  const facet: PersonalLearningFacet = {
    id: stableId(candidate),
    facet_class: candidate.facet_class,
    key: candidate.key,
    value: candidate.value,
    state: stateFromScore(stability),
    stability,
    evidence_count: evidenceCount,
    evidence_refs: [...(candidate.evidence_refs ?? [])],
    cue_family: candidate.cue_family,
    first_seen: firstSeen,
    last_seen: lastSeen,
    user_override: override,
  };

  if (override === "pinned") return { ...facet, state: "pinned", stability: 1 };
  if (override === "forgotten") return { ...facet, state: "forgotten", stability: 0 };
  return facet;
}

export function applyPersonalFacetOverride(
  facet: PersonalLearningFacet,
  override: PersonalFacetOverride,
): PersonalLearningFacet {
  if (override === "pinned") return { ...facet, user_override: "pinned", state: "pinned", stability: 1 };
  if (override === "forgotten") return { ...facet, user_override: "forgotten", state: "forgotten", stability: 0 };
  return { ...facet, user_override: "none", state: facet.state === "pinned" || facet.state === "forgotten" ? "provisional" : facet.state };
}

function facetConflictRank(facet: PersonalLearningFacet): number {
  if (facet.user_override === "forgotten" || facet.state === "forgotten") return 1000;
  if (facet.user_override === "pinned" || facet.state === "pinned") return 900;
  if (facet.state === "active") return 700;
  if (facet.state === "provisional") return 500;
  if (facet.state === "candidate") return 300;
  return 100;
}

function mergeFacetGroup(facets: readonly PersonalLearningFacet[]): PersonalLearningFacet {
  const sorted = [...facets].sort((a, b) => {
    const rank = facetConflictRank(b) - facetConflictRank(a);
    if (rank !== 0) return rank;
    if (b.stability !== a.stability) return b.stability - a.stability;
    return b.last_seen.localeCompare(a.last_seen);
  });
  const winner = sorted[0];
  const evidenceRefs = Array.from(new Set(sorted.flatMap((facet) => facet.evidence_refs))).sort();
  const evidenceCount = sorted.reduce((sum, facet) => Math.max(sum, facet.evidence_count), 0);
  const firstSeen = sorted.map((facet) => facet.first_seen).sort()[0] ?? winner.first_seen;
  const lastSeen = sorted.map((facet) => facet.last_seen).sort().at(-1) ?? winner.last_seen;
  return {
    ...winner,
    evidence_count: evidenceCount,
    evidence_refs: evidenceRefs,
    first_seen: firstSeen,
    last_seen: lastSeen,
  };
}

export function resolvePersonalFacetConflicts(
  facets: readonly PersonalLearningFacet[],
): PersonalLearningFacet[] {
  const groups = new Map<string, PersonalLearningFacet[]>();
  for (const facet of facets) {
    const key = `${facet.facet_class}/${facet.key}`;
    groups.set(key, [...(groups.get(key) ?? []), facet]);
  }
  return Array.from(groups.values())
    .map(mergeFacetGroup)
    .sort((a, b) => a.facet_class.localeCompare(b.facet_class) || a.key.localeCompare(b.key));
}

export function applyPersonalFacetClassBudgets(
  facets: readonly PersonalLearningFacet[],
  budgets: Partial<Record<PersonalFacetClass, number>> = DEFAULT_PERSONAL_FACET_CLASS_BUDGETS,
): PersonalLearningFacet[] {
  const used = new Map<PersonalFacetClass, number>();
  const sorted = [...facets].sort((a, b) => {
    if (a.state === "forgotten" || b.state === "forgotten") return a.state === "forgotten" ? 1 : -1;
    if (a.state === "pinned" || b.state === "pinned") return a.state === "pinned" ? -1 : 1;
    if (b.stability !== a.stability) return b.stability - a.stability;
    return a.key.localeCompare(b.key);
  });

  return sorted.map((facet) => {
    if (facet.state === "forgotten" || facet.state === "pinned") return facet;
    const budget = budgets[facet.facet_class] ?? DEFAULT_PERSONAL_FACET_CLASS_BUDGETS[facet.facet_class];
    const count = used.get(facet.facet_class) ?? 0;
    if (count >= budget && facet.state === "active") {
      return { ...facet, state: "provisional" as PersonalFacetState };
    }
    if (facet.state === "active") used.set(facet.facet_class, count + 1);
    return facet;
  }).sort((a, b) => a.facet_class.localeCompare(b.facet_class) || a.key.localeCompare(b.key));
}

export function normalizePersonalFacets(
  facets: readonly PersonalLearningFacet[],
  budgets: Partial<Record<PersonalFacetClass, number>> = DEFAULT_PERSONAL_FACET_CLASS_BUDGETS,
): PersonalLearningFacet[] {
  return applyPersonalFacetClassBudgets(resolvePersonalFacetConflicts(facets), budgets);
}

function candidateFromInstruction(text: string, now: string, ref: string): PersonalFacetCandidate | undefined {
  const normalized = text.trim();
  if (!normalized) return undefined;
  const lower = normalized.toLowerCase();
  if (/(prefer|use|默认|以后|always|不要|never|avoid|禁用)/i.test(normalized) === false) return undefined;
  const facetClass: PersonalFacetClass = /不要|never|avoid|禁用|forbid/.test(lower) ? "veto" : /pnpm|npm|yarn|bun|cli|command|tool|工具/.test(lower) ? "tooling" : "style";
  const key = normalized
    .slice(0, 48)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, "-")
    .replace(/^-|-$/g, "") || "instruction";
  return {
    facet_class: facetClass,
    key,
    value: normalized,
    cue_family: "explicit",
    evidence_count: 1,
    evidence_refs: [ref],
    first_seen: now,
    last_seen: now,
  };
}

export function personalFacetCandidatesFromManualInstruction(
  instruction: string,
  input: PersonalFacetProducerInput = {},
): PersonalFacetCandidate[] {
  const now = input.now ?? new Date().toISOString();
  const candidate = candidateFromInstruction(instruction, now, "manual://personal-profile");
  return candidate ? [candidate] : [];
}

export function personalFacetCandidatesFromDistilledExperience(
  experience: DistilledExperience,
  input: PersonalFacetProducerInput = {},
): PersonalFacetCandidate[] {
  if (experience.scope_hint !== "personal") return [];
  const now = input.now ?? new Date().toISOString();
  const refs = [experience.source_ref, experience.source_hash].filter(Boolean);
  return [
    experience.summary,
    experience.context,
    ...experience.reusable_lessons,
  ].flatMap((text) => text ? personalFacetCandidatesFromManualInstruction(text, { now }) : [])
    .map((candidate) => ({
      ...candidate,
      cue_family: candidate.cue_family === "explicit" ? "behavioral" : candidate.cue_family,
      evidence_refs: refs,
      first_seen: now,
      last_seen: now,
    }));
}

export function personalFacetCandidatesFromImportedRecord(
  record: Record<string, unknown>,
  input: PersonalFacetProducerInput = {},
): PersonalFacetCandidate[] {
  const now = input.now ?? new Date().toISOString();
  const scope = typeof record.scope === "string" ? record.scope : typeof record.scope_hint === "string" ? record.scope_hint : "personal";
  if (scope !== "personal") return [];
  const text = typeof record.value === "string"
    ? record.value
    : typeof record.summary === "string"
      ? record.summary
      : typeof record.redacted_summary === "string"
        ? record.redacted_summary
        : "";
  const ref = typeof record.source_ref === "string"
    ? record.source_ref
    : typeof record.path === "string"
      ? record.path
      : "imported://personal-record";
  return personalFacetCandidatesFromManualInstruction(text, { now }).map((candidate) => ({
    ...candidate,
    cue_family: "structural",
    evidence_refs: [ref],
    first_seen: now,
    last_seen: now,
  }));
}

function stripManagedBlock(existing: string): string {
  const start = existing.indexOf(MANAGED_PROFILE_START);
  const end = existing.indexOf(MANAGED_PROFILE_END);
  if (start < 0 || end < start) return existing.trimEnd();
  return `${existing.slice(0, start)}${existing.slice(end + MANAGED_PROFILE_END.length)}`.trimEnd();
}

export function renderManagedPersonalProfile(
  existing: string,
  facets: readonly PersonalLearningFacet[],
  now = new Date().toISOString(),
): string {
  const preserved = stripManagedBlock(existing);
  const visible = facets
    .filter((facet) => facet.state === "active" || facet.state === "pinned" || facet.state === "provisional")
    .sort((a, b) => a.facet_class.localeCompare(b.facet_class) || a.key.localeCompare(b.key));
  const lines = [
    MANAGED_PROFILE_START,
    `Generated: ${now}`,
    "",
    "## Active Personal Facets",
    ...visible.map((facet) => `- ${facet.facet_class}.${facet.key}: ${facet.value} (${facet.state}, stability ${facet.stability.toFixed(2)})`),
    MANAGED_PROFILE_END,
  ];
  return [preserved, lines.join("\n")].filter(Boolean).join("\n\n").concat("\n");
}
