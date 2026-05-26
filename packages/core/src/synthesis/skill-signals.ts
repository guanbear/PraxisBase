import { computeHash } from "../protocol/id.js";
import type { DistilledExperience } from "../ai/distill.js";
import type { WikiPage } from "../wiki/resolver.js";

export type SkillSignalScope = "personal" | "project" | "team" | "org" | "global";
export type SkillCueFamily =
  | "explicit_user_correction"
  | "verified_fix"
  | "repeated_success"
  | "workflow_preference"
  | "tool_pattern"
  | "wiki_procedure";

export interface SkillSignalCandidate {
  id: string;
  scope: SkillSignalScope;
  trigger: string;
  procedure: string[];
  title: string;
  source_ref: string;
  source_hash: string;
  evidence_id: string;
  confidence: number;
  cue_family: SkillCueFamily;
  related_wiki_paths: string[];
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function lower(value: string): string {
  return normalizeText(value).toLowerCase();
}

function scopeFromHint(scope: DistilledExperience["scope_hint"]): SkillSignalScope {
  return scope === "personal" || scope === "project" || scope === "team" || scope === "org" || scope === "global"
    ? scope
    : "project";
}

function scopeFromValue(scope: unknown): SkillSignalScope {
  return scope === "personal" || scope === "project" || scope === "team" || scope === "org" || scope === "global"
    ? scope
    : "project";
}

function cueFamily(experience: DistilledExperience): SkillCueFamily {
  const text = lower(`${experience.summary} ${experience.problem ?? ""} ${experience.reusable_lessons.join(" ")} ${experience.actions.join(" ")}`);
  if (/user correction|用户纠正|explicit correction/.test(text)) return "explicit_user_correction";
  if (experience.suggested_wiki_kind === "preference") return "workflow_preference";
  if (/tool|cli|mcp|api|command/.test(text)) return "tool_pattern";
  if (experience.verification.length > 0) return "verified_fix";
  return "repeated_success";
}

function isBadOneOff(text: string): boolean {
  const normalized = lower(text);
  return /\b(pr|mr|issue|ticket|run|session|build|job)[-_ #]?\d{2,}\b/.test(normalized)
    || /\b[0-9a-f]{7,40}\b/.test(normalized)
    || /\b(error|exception|traceback):\s*["'`]?[^"'`]{20,}/.test(normalized);
}

function isTransientEnvironmentOnly(experience: DistilledExperience): boolean {
  const text = lower(`${experience.summary} ${experience.problem ?? ""} ${experience.actions.join(" ")} ${experience.reusable_lessons.join(" ")}`);
  const env = /\b(network|rate limit|timeout|disk full|permission denied|env var|api key|quota|install failed)\b/.test(text);
  const reusableFix = /\b(retry|fallback|cache|guard|verify|pin|configure|document|check)\b/.test(text);
  return env && !reusableFix;
}

function isNegativeToolClaim(experience: DistilledExperience): boolean {
  const text = lower(`${experience.summary} ${experience.reusable_lessons.join(" ")} ${experience.actions.join(" ")}`);
  return /\b(tool|cli|api|model|mcp)\b.*\b(broken|useless|bad|cannot work|不要用|坏了)\b/.test(text)
    && !/\b(fix|fallback|workaround|verify|retry)\b/.test(text);
}

export function collectSkillSignalsFromDistilledExperiences(
  experiences: DistilledExperience[],
  options: { authorityMode: "personal-local" | "team-git" },
): SkillSignalCandidate[] {
  const signals: SkillSignalCandidate[] = [];

  for (const experience of experiences) {
    if (experience.outcome !== "success") continue;
    if (!experience.skill_candidate.should_create) continue;
    const trigger = normalizeText(experience.skill_candidate.trigger ?? "");
    const procedure = (experience.skill_candidate.procedure ?? []).map(normalizeText).filter(Boolean);
    const title = normalizeText(experience.skill_candidate.title ?? trigger);
    if (!trigger || procedure.length === 0 || !title) continue;
    if (isBadOneOff(`${title} ${trigger}`)) continue;
    if (isTransientEnvironmentOnly(experience)) continue;
    if (isNegativeToolClaim(experience)) continue;
    const scope = scopeFromHint(experience.scope_hint);
    if (options.authorityMode === "team-git" && (scope === "personal" || scope === "project")) continue;

    signals.push({
      id: `skill_signal_${computeHash(`${experience.source_ref}:${experience.source_hash}:${trigger}`).slice(7, 19)}`,
      scope,
      trigger,
      procedure,
      title,
      source_ref: experience.source_ref,
      source_hash: experience.source_hash,
      evidence_id: experience.chunk_hashes[0] ?? experience.source_hash,
      confidence: experience.confidence,
      cue_family: cueFamily(experience),
      related_wiki_paths: [],
    });
  }

  return signals.sort((a, b) => a.id.localeCompare(b.id));
}

function section(body: string, names: string[]): string {
  const lines = body.split(/\r?\n/);
  let capture = false;
  const out: string[] = [];
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (capture) break;
      capture = names.some((name) => new RegExp(`^##\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line));
      continue;
    }
    if (capture) out.push(line);
  }
  return normalizeText(out.join(" "));
}

function procedureSteps(body: string): string[] {
  const raw = section(body, ["Procedure", "Steps", "What To Do", "Fix"]);
  return raw
    .split(/(?:^|\s)(?:\d+\.|[-*])\s+/)
    .map(normalizeText)
    .filter((item) => item.length >= 8)
    .slice(0, 8);
}

function stableWikiKind(kind: string | undefined): boolean {
  return kind === "procedure" || kind === "known_fix" || kind === "pitfall" || kind === "preference";
}

export function collectSkillSignalsFromStableWikiPages(
  pages: WikiPage[],
  options: { authorityMode: "personal-local" | "team-git" },
): SkillSignalCandidate[] {
  const signals: SkillSignalCandidate[] = [];
  for (const page of pages) {
    if (!stableWikiKind(page.page_kind)) continue;
    const scope = scopeFromValue(page.scope);
    if (options.authorityMode === "team-git" && (scope === "personal" || scope === "project")) continue;
    const body = page.body_markdown ?? "";
    const trigger = section(body, ["When To Use", "Applicability", "Symptoms", "Context"]);
    const procedure = procedureSteps(body);
    if (!trigger || procedure.length === 0) continue;
    if (isBadOneOff(`${page.title} ${trigger}`)) continue;
    const refs = (page.provenance_refs ?? []).filter((ref) => ref.uri && ref.hash);
    if (refs.length === 0) continue;
    for (const ref of refs) {
      signals.push({
        id: `skill_signal_${computeHash(`${page.id}:${ref.uri}:${ref.hash}:${trigger}`).slice(7, 19)}`,
        scope,
        trigger,
        procedure,
        title: page.title,
        source_ref: ref.uri,
        source_hash: ref.hash!,
        evidence_id: page.id,
        confidence: 0.84,
        cue_family: "wiki_procedure",
        related_wiki_paths: [page.path ?? page.slug],
      });
    }
  }
  return signals.sort((a, b) => a.id.localeCompare(b.id));
}
