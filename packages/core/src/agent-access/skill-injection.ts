import type { SkillInjectionDecision } from "../protocol/schemas.js";
import type { Scope } from "../protocol/types.js";
import { utf8ByteLength, utf8SafeSlice } from "../experience/context-juice.js";

export const DEFAULT_SKILL_INJECTION_BUDGET_BYTES = 8 * 1024;
export const SKILL_INJECTION_TRUNCATION_MARKER = "[... truncated by praxisbase_skill_injection ...]";

export interface PromotedSkill {
  id: string;
  path?: string;
  title?: string;
  origin?: string;
  status?: string;
  scope?: Scope;
  body: string;
  when_to_use?: string;
  triggers?: readonly string[];
  tags?: readonly string[];
  related_wiki_paths?: readonly string[];
  catalog_terms?: readonly string[];
  promotion_id?: string;
  audit_id?: string;
}

export interface SkillMatch {
  skill: PromotedSkill;
  score: number;
  explicitOrder: number | null;
  reason: string;
}

export interface SkillMatchInput {
  query: string;
  skills: readonly PromotedSkill[];
  includeCandidates?: boolean;
  includeExternal?: boolean;
}

export interface SkillMatchResult {
  matches: SkillMatch[];
  decisions: SkillInjectionDecision[];
}

export interface SkillInjectionBundleInput extends SkillMatchInput {
  budgetBytes?: number;
}

export interface SkillInjectionBundleResult {
  text: string;
  decisions: SkillInjectionDecision[];
  total_bytes: number;
  budget_bytes: number;
}

const EXPLICIT_SKILL_RE = /@skill(?:\/|-)([A-Za-z0-9._/-]+)/g;

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function includesNormalized(haystack: string, needle: string): boolean {
  const cleanNeedle = normalize(needle);
  return cleanNeedle.length > 0 && normalize(haystack).includes(cleanNeedle);
}

function tokenOverlapScore(query: string, values: readonly string[] = []): number {
  const queryText = normalize(query);
  let score = 0;
  for (const value of values) {
    const normalized = normalize(value);
    if (!normalized) continue;
    if (queryText.includes(normalized)) {
      score += 10;
      continue;
    }
    const tokens = normalized.split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
    for (const token of tokens) {
      if (queryText.includes(token)) score += 2;
    }
  }
  return score;
}

function isDefaultInjectableSkill(skill: PromotedSkill, input: SkillMatchInput): boolean {
  if (skill.origin !== "praxisbase_synthesized" && !input.includeExternal) return false;
  if (skill.status !== "promoted" && !input.includeCandidates) return false;
  return true;
}

export function extractSkillMentions(query: string): string[] {
  const mentions: string[] = [];
  for (const match of query.matchAll(EXPLICIT_SKILL_RE)) {
    mentions.push(match[1].replace(/[.,;:!?)]*$/u, ""));
  }
  return mentions;
}

function scoreSkill(query: string, skill: PromotedSkill, explicitOrder: number | null): SkillMatch | null {
  if (explicitOrder !== null) {
    return {
      skill,
      score: 1000 - explicitOrder,
      explicitOrder,
      reason: `explicit @skill mention matched ${skill.id}`,
    };
  }

  let score = 0;
  const reasons: string[] = [];
  const fields = [
    skill.id,
    skill.title ?? "",
    skill.when_to_use ?? "",
    ...(skill.triggers ?? []),
    ...(skill.tags ?? []),
    ...(skill.related_wiki_paths ?? []),
    ...(skill.catalog_terms ?? []),
  ];

  if (includesNormalized(query, skill.id)) {
    score += 50;
    reasons.push("skill id");
  }
  if (skill.title && tokenOverlapScore(query, [skill.title]) > 0) {
    score += tokenOverlapScore(query, [skill.title]);
    reasons.push("title");
  }
  if (skill.when_to_use && tokenOverlapScore(query, [skill.when_to_use]) > 0) {
    score += tokenOverlapScore(query, [skill.when_to_use]);
    reasons.push("when-to-use");
  }
  const tagScore = tokenOverlapScore(query, skill.tags);
  if (tagScore > 0) {
    score += tagScore;
    reasons.push("tags");
  }
  const wikiScore = tokenOverlapScore(query, skill.related_wiki_paths);
  if (wikiScore > 0) {
    score += wikiScore;
    reasons.push("wiki paths");
  }
  const triggerScore = tokenOverlapScore(query, skill.triggers);
  if (triggerScore > 0) {
    score += triggerScore;
    reasons.push("triggers");
  }
  const catalogScore = tokenOverlapScore(query, skill.catalog_terms);
  if (catalogScore > 0) {
    score += catalogScore;
    reasons.push("catalog");
  }

  if (score <= 0) {
    const fallbackScore = tokenOverlapScore(query, fields);
    if (fallbackScore <= 0) return null;
    score = fallbackScore;
    reasons.push("keyword overlap");
  }

  return {
    skill,
    score,
    explicitOrder: null,
    reason: `matched ${Array.from(new Set(reasons)).join(", ")}`,
  };
}

function decisionForSkill(skill: PromotedSkill, decision: "matched" | "skipped", reason: string, injectedBytes = 0, truncated = false): SkillInjectionDecision {
  return {
    skill_id: skill.id,
    decision,
    reason,
    injected_bytes: injectedBytes,
    truncated,
    scope: skill.scope ?? "personal",
    authority: skill.origin === "praxisbase_synthesized" && skill.status === "promoted" ? "pb_stable" : "pb_candidate",
    promotion_id: skill.promotion_id,
    audit_id: skill.audit_id,
  };
}

export function matchPromotedSkills(input: SkillMatchInput): SkillMatchResult {
  const mentions = extractSkillMentions(input.query).map(normalize);
  const matches: SkillMatch[] = [];
  const decisions = new Map<string, SkillInjectionDecision>();

  for (const skill of input.skills) {
    if (!isDefaultInjectableSkill(skill, input)) {
      decisions.set(skill.id, decisionForSkill(skill, "skipped", "skill is not a promoted PraxisBase synthesized skill"));
      continue;
    }

    const explicitOrder = mentions.findIndex((mention) => mention === normalize(skill.id));
    const match = scoreSkill(input.query, skill, explicitOrder >= 0 ? explicitOrder : null);
    if (!match) {
      decisions.set(skill.id, decisionForSkill(skill, "skipped", "query did not match skill triggers, tags, wiki paths, or catalog terms"));
      continue;
    }

    matches.push(match);
    decisions.set(skill.id, decisionForSkill(skill, "matched", match.reason));
  }

  matches.sort((a, b) => {
    if (a.explicitOrder !== null || b.explicitOrder !== null) {
      if (a.explicitOrder === null) return 1;
      if (b.explicitOrder === null) return -1;
      return a.explicitOrder - b.explicitOrder;
    }
    if (b.score !== a.score) return b.score - a.score;
    return a.skill.id.localeCompare(b.skill.id);
  });

  return {
    matches,
    decisions: input.skills.map((skill) => decisions.get(skill.id) ?? decisionForSkill(skill, "skipped", "not evaluated")),
  };
}

function renderSkillBlock(skill: PromotedSkill, body: string): string {
  const title = skill.title ? ` ${skill.title}` : "";
  const citations = [
    skill.promotion_id ? `promotion_id=${skill.promotion_id}` : null,
    skill.audit_id ? `audit_id=${skill.audit_id}` : null,
  ].filter((value): value is string => value !== null).join(" ");
  const citationLine = citations ? `\nCitations: ${citations}` : "";
  return `[PB-SKILL:${skill.id}]${title}${citationLine}\n${body}\n[/PB-SKILL:${skill.id}]`;
}

function renderBoundedSkillBlock(skill: PromotedSkill, remainingBudget: number): { text: string; truncated: boolean } {
  if (remainingBudget <= 0) return { text: "", truncated: true };
  const fullBlock = renderSkillBlock(skill, skill.body);
  if (utf8ByteLength(fullBlock) <= remainingBudget) {
    return { text: fullBlock, truncated: false };
  }

  const emptyBlock = renderSkillBlock(skill, "");
  const overheadBytes = utf8ByteLength(emptyBlock);
  const minimumBlock = renderSkillBlock(skill, SKILL_INJECTION_TRUNCATION_MARKER);
  if (utf8ByteLength(minimumBlock) > remainingBudget) {
    return { text: "", truncated: true };
  }
  const availableBodyBytes = Math.max(0, remainingBudget - overheadBytes - utf8ByteLength(SKILL_INJECTION_TRUNCATION_MARKER) - 1);
  const bodyPrefix = utf8SafeSlice(skill.body, availableBodyBytes);
  const boundedBody = bodyPrefix ? `${bodyPrefix}\n${SKILL_INJECTION_TRUNCATION_MARKER}` : SKILL_INJECTION_TRUNCATION_MARKER;
  return {
    text: renderSkillBlock(skill, boundedBody),
    truncated: true,
  };
}

export function renderSkillInjectionBundle(input: SkillInjectionBundleInput): SkillInjectionBundleResult {
  const budgetBytes = Math.max(0, Math.floor(input.budgetBytes ?? DEFAULT_SKILL_INJECTION_BUDGET_BYTES));
  const matched = matchPromotedSkills(input);
  const decisions = new Map(matched.decisions.map((decision) => [decision.skill_id, decision]));
  const blocks: string[] = [];
  let usedBytes = 0;

  for (const match of matched.matches) {
    const remaining = Math.max(0, budgetBytes - usedBytes);
    const rendered = renderBoundedSkillBlock(match.skill, remaining);
    const renderedBytes = utf8ByteLength(rendered.text);
    if (renderedBytes === 0) {
      decisions.set(match.skill.id, decisionForSkill(match.skill, "skipped", "skill injection budget exhausted"));
      break;
    }
    usedBytes += renderedBytes;
    blocks.push(rendered.text);

    decisions.set(match.skill.id, {
      ...decisionForSkill(match.skill, "matched", match.reason, renderedBytes, rendered.truncated),
    });

    if (usedBytes >= budgetBytes) break;
  }

  for (const match of matched.matches) {
    if (!blocks.some((block) => block.startsWith(`[PB-SKILL:${match.skill.id}]`))) {
      decisions.set(match.skill.id, decisionForSkill(match.skill, "skipped", "skill injection budget exhausted"));
    }
  }

  const text = blocks.join("\n\n");
  return {
    text,
    decisions: input.skills.map((skill) => decisions.get(skill.id) ?? decisionForSkill(skill, "skipped", "not evaluated")),
    total_bytes: utf8ByteLength(text),
    budget_bytes: budgetBytes,
  };
}
