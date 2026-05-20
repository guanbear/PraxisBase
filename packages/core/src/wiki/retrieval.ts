import { MATURITY_ORDER, SCOPE_ORDER } from "./model.js";

export interface WikiContextCandidate {
  id: string;
  path: string;
  kind: string;
  title: string;
  summary: string;
  body?: string;
  maturity?: string;
  scope?: string;
  source_ids?: string[];
  outbound_links?: string[];
}

export interface RankWikiContextOptions {
  query: string;
  stage: "diagnosis" | "repair" | "verification" | "proposal";
  maxItems: number;
}

interface ScoredCandidate {
  candidate: WikiContextCandidate;
  score: number;
  matched: boolean;
}

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function cjkBigrams(text: string): string[] {
  const matches = text.match(/[\u3400-\u9fff\uf900-\ufaff]+/g) ?? [];
  const tokens: string[] = [];
  for (const match of matches) {
    if (match.length === 1) {
      tokens.push(match);
      continue;
    }
    for (let index = 0; index < match.length - 1; index += 1) {
      tokens.push(match.slice(index, index + 2));
    }
  }
  return tokens;
}

export function tokenizeForWikiSearch(text: string): string[] {
  const lower = normalize(text);
  const english = lower.match(/[a-z0-9][a-z0-9:_./-]*/g) ?? [];
  return unique([...english, ...cjkBigrams(text)]);
}

function maturityWeight(value: string | undefined): number {
  return value ? (MATURITY_ORDER[value] ?? 0) : 0;
}

function scopeWeight(value: string | undefined): number {
  return value ? (SCOPE_ORDER[value] ?? 0) : 0;
}

function stageWeight(candidate: WikiContextCandidate, stage: RankWikiContextOptions["stage"]): number {
  const kind = normalize(candidate.kind);
  const text = normalize(`${candidate.title}\n${candidate.summary}\n${candidate.body ?? ""}`);

  if (stage === "diagnosis" && (kind === "known_fix" || kind === "pitfall")) return 10;
  if (stage === "repair" && (kind === "skill" || kind === "procedure")) return 10;
  if (stage === "verification") {
    if (kind === "procedure" || kind === "known_fix") return 10;
    if (text.includes("verification") || text.includes("rollback")) return 8;
  }
  if (stage === "proposal" && ["note", "decision", "review", "proposal"].includes(kind)) return 10;

  return 0;
}

function aliases(candidate: WikiContextCandidate): string[] {
  const pathStem = candidate.path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? candidate.path;
  return unique([
    candidate.id,
    candidate.path,
    pathStem,
    candidate.title,
    normalize(candidate.title).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
  ].filter(Boolean).map(normalize));
}

function matchesReference(candidate: WikiContextCandidate, target: string): boolean {
  const normalizedTarget = normalize(target);
  return aliases(candidate).includes(normalizedTarget);
}

function scoreCandidate(candidate: WikiContextCandidate, query: string, tokens: string[], stage: RankWikiContextOptions["stage"]): ScoredCandidate {
  const title = normalize(candidate.title);
  const summary = normalize(candidate.summary);
  const body = normalize(candidate.body ?? "");
  const path = normalize(candidate.path);
  const id = normalize(candidate.id);
  const exact = normalize(query);
  let score = maturityWeight(candidate.maturity) * 2 + scopeWeight(candidate.scope) + stageWeight(candidate, stage);
  let matched = exact.length === 0;

  if (exact) {
    if (id === exact || path === exact || title === exact) {
      score += 140;
      matched = true;
    } else if ([id, path, title, summary, body].some((field) => field.includes(exact))) {
      score += 100;
      matched = true;
    }
  }

  for (const token of tokens) {
    if (!token) continue;
    let tokenMatched = false;
    if (title.includes(token)) {
      score += CJK_RE.test(token) ? 26 : 20;
      tokenMatched = true;
    }
    if (summary.includes(token)) {
      score += CJK_RE.test(token) ? 18 : 12;
      tokenMatched = true;
    }
    if (body.includes(token)) {
      score += CJK_RE.test(token) ? 12 : 8;
      tokenMatched = true;
    }
    if (path.includes(token) || id.includes(token)) {
      score += 6;
      tokenMatched = true;
    }
    matched = matched || tokenMatched;
  }

  return { candidate, score: matched ? score : 0, matched };
}

export function rankWikiContextItems(
  candidates: WikiContextCandidate[],
  options: RankWikiContextOptions
): WikiContextCandidate[] {
  const tokens = tokenizeForWikiSearch(options.query);
  const scored = candidates.map((candidate) => scoreCandidate(candidate, options.query, tokens, options.stage));

  for (const seed of scored.filter((item) => item.matched)) {
    const outbound = seed.candidate.outbound_links ?? [];
    for (const target of outbound) {
      const linked = scored.find((item) => matchesReference(item.candidate, target));
      if (linked && !linked.matched) {
        linked.score += 70 + stageWeight(linked.candidate, options.stage);
      }
    }

    for (const sourceId of seed.candidate.source_ids ?? []) {
      for (const related of scored) {
        if (related.candidate.id === seed.candidate.id || related.matched) continue;
        if ((related.candidate.source_ids ?? []).includes(sourceId)) {
          related.score += 25;
        }
      }
    }
  }

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.path.localeCompare(b.candidate.path))
    .slice(0, options.maxItems)
    .map((item) => item.candidate);
}
