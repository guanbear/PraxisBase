/**
 * Deterministic wiki relationship planner.
 *
 * Callers can pass WikiTopic/ExistingWikiPage-shaped data plus optional
 * enrichment signals from synthesis.
 */

// -- Input interfaces --------------------------------------------------------

/**
 * A topic produced by the topic planner (or an enriched superset).
 * Compatible with WikiTopic — extra fields (signatures, problem, action) are optional.
 */
export interface RelationshipTopic {
  id: string;
  topic_key?: string;
  title: string;
  page_kind?: string;
  scope?: string;
  observation_ids?: string[];
  source_refs?: string[];
  source_hashes: string[];
  signatures?: string[];
  entities: string[];
  problem?: string;
  action?: string;
  confidence?: number;
}

/**
 * An existing wiki page summary.
 * Compatible with ExistingWikiPage — enriched with optional id, signatures, body_text.
 */
export interface RelationshipWikiPage {
  id?: string;
  path: string;
  title: string;
  slug: string;
  page_kind?: string;
  scope?: string;
  source_hashes: string[];
  signatures?: string[];
  entities?: string[];
  body_text?: string;
}

// -- Output types ------------------------------------------------------------

export type WikiRelationshipStrength = "canonical" | "strong" | "related" | "weak";

export interface WikiRelationshipPlan {
  topic_id: string;
  target_page_id: string;
  target_path: string;
  target_title: string;
  target_slug: string;
  strength: WikiRelationshipStrength;
  reasons: string[];
  required_link: boolean;
  suggested_label: string;
  merge_candidate: boolean;
}

// -- Planner -----------------------------------------------------------------

/**
 * Build deterministic relationship plans between topics and existing pages.
 *
 * For each topic, scores every existing page, sorts by strength/title/path/id,
 * truncates to maxRelatedPerTopic, then globally sorts the result.
 */
export function buildWikiRelationshipPlans(input: {
  topics: RelationshipTopic[];
  existingPages: RelationshipWikiPage[];
  maxRelatedPerTopic?: number;
}): WikiRelationshipPlan[] {
  const limit = input.maxRelatedPerTopic ?? 5;
  const allPlans: WikiRelationshipPlan[] = [];

  for (const topic of input.topics) {
    const scored: WikiRelationshipPlan[] = [];

    for (const page of input.existingPages) {
      const reasons = computeReasons(topic, page);
      if (reasons.length === 0) continue;

      const strength = strengthFromReasons(reasons);
      scored.push({
        topic_id: topic.id,
        target_page_id: page.id ?? page.path,
        target_path: page.path,
        target_title: page.title,
        target_slug: page.slug,
        strength,
        reasons,
        required_link: strength === "canonical" || strength === "strong",
        suggested_label: page.title,
        merge_candidate: strength === "canonical",
      });
    }

    scored.sort(compareRelationshipPlans);
    allPlans.push(...scored.slice(0, limit));
  }

  return allPlans.sort(compareRelationshipPlans);
}

// -- Internal helpers --------------------------------------------------------

const STRENGTH_RANK: Record<WikiRelationshipStrength, number> = {
  canonical: 0,
  strong: 1,
  related: 2,
  weak: 3,
};

function strengthFromReasons(reasons: string[]): WikiRelationshipStrength {
  if (reasons.includes("shared_source_hash") || reasons.includes("same_title_or_slug")) {
    return "canonical";
  }
  if (reasons.includes("shared_signature") || reasons.includes("problem_action_overlap")) {
    return "strong";
  }
  if (reasons.includes("entity_overlap")) {
    return "related";
  }
  return "weak";
}

function compareRelationshipPlans(
  a: WikiRelationshipPlan,
  b: WikiRelationshipPlan,
): number {
  return (
    STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength]
    || a.target_title.localeCompare(b.target_title)
    || a.target_path.localeCompare(b.target_path)
    || a.target_page_id.localeCompare(b.target_page_id)
    || a.topic_id.localeCompare(b.topic_id)
  );
}

function computeReasons(
  topic: RelationshipTopic,
  page: RelationshipWikiPage,
): string[] {
  const reasons: string[] = [];

  if (setsIntersect(topic.source_hashes, page.source_hashes)) {
    reasons.push("shared_source_hash");
  }

  if (setsIntersect(topic.signatures ?? [], page.signatures ?? [])) {
    reasons.push("shared_signature");
  }

  if (
    normalize(topic.title) === normalize(page.title)
    || normalize(topic.title) === normalize(page.slug)
  ) {
    reasons.push("same_title_or_slug");
  }

  if (setsIntersect(topic.entities, page.entities ?? [])) {
    reasons.push("entity_overlap");
  }

  if (
    textOverlaps(topic.problem, page.body_text)
    && textOverlaps(topic.action, page.body_text)
  ) {
    reasons.push("problem_action_overlap");
  }

  return reasons;
}

function setsIntersect(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const leftSet = new Set(left.map(normalize).filter(Boolean));
  return right.some((item) => leftSet.has(normalize(item)));
}

function normalize(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function textOverlaps(needle: string | undefined, haystack: string | undefined): boolean {
  const tokens = normalize(needle).split(" ").filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;
  const haystackText = normalize(haystack);
  return tokens.some((token) => haystackText.includes(token));
}
