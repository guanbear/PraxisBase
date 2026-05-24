import type { WikiEvidenceCluster, WikiEvidenceItem, WikiPagePlanAction } from "./curation-model.js";

/** A structured wiki link with slug, label, path, and reason for inclusion. */
export interface StructuredLink {
  slug: string;
  label: string;
  path: string;
  reason: string;
}

/** A merge candidate page identified by the relationship planner. */
export interface MergeCandidate {
  title: string;
  path: string;
  reason: string;
}

/** Compiler context passed to the AI curator so it can update/merge existing pages. */
export interface SynthesisContext {
  /** Canonical topic title from the topic planner. */
  topicTitle: string;
  /** Page kind from the topic planner (known_fix, procedure, etc.). */
  pageKind: string;
  /** All contributing observations with summaries and optional raw excerpts. */
  observations: ReadonlyArray<{
    summary: string;
    raw_excerpt?: string;
  }>;
  /** Existing stable page content when action is update or merge. */
  existingPageContent?: string;
  /** Related stable pages with titles and paths. */
  relatedPages: ReadonlyArray<{
    title: string;
    path: string;
  }>;
  /** Wikilink targets the output must reference. Accepts plain slugs/paths or structured link objects. */
  requiredLinks: ReadonlyArray<string | StructuredLink>;
  /** Suggested (not mandatory) links the curator may reference when relevant. */
  suggestedLinks?: ReadonlyArray<StructuredLink>;
  /** Pages identified as merge candidates by the relationship planner. */
  mergeCandidates?: ReadonlyArray<MergeCandidate>;
  /** Reasons for each relationship, derived from the relationship planner. */
  relationshipReasons?: ReadonlyArray<string>;
  /** Planned action (create/update/merge/supersede/archive). */
  pagePlanAction?: WikiPagePlanAction;
}

/** Normalize a required link (string or StructuredLink) into a StructuredLink. */
function normalizeRequiredLink(link: string | StructuredLink): StructuredLink {
  if (typeof link === "object") return link;
  const slug = link.split("/").pop()?.replace(/\.md$/i, "") ?? link;
  return { slug, label: slug, path: link, reason: "required_link" };
}

export function buildWikiCuratorPrompt(cluster: WikiEvidenceCluster, evidence: WikiEvidenceItem[], context?: SynthesisContext): { system: string; user: string } {
  const systemLines = [
    "You are the PraxisBase wiki curator.",
    "Return only JSON.",
    "Synthesize a compiled wiki article from safe evidence; do not summarize raw material.",
    "Do not copy raw transcripts, credentials, tokens, cookies, auth headers, or private keys.",
    "The page must include # Title, ## Problem or ## Context, an action section (## Fix, ## Procedure, ## Decision, or ## Operating Rule), ## Verification, ## Reusable Lessons, and ## Provenance.",
    "When relationship links are supplied, include a ## Related Wiki Pages section using exact [[slug|label]] wiki links.",
  ];

  const userObj: Record<string, unknown> = {
    expected_schema: {
      title: "string",
      summary: "string",
      page_kind: cluster.page_kind,
      target_path: cluster.target_path_hint,
      body_markdown: "markdown string",
      confidence: "number 0..1",
      risk_notes: ["string"],
    },
    cluster,
    evidence: evidence.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      actions: item.actions,
      failed_attempts: item.failed_attempts,
      outcome: item.outcome,
      verification: item.verification,
      reusable_lessons: item.reusable_lessons,
      source_ref: item.source_ref,
      source_hash: item.source_hash,
    })),
  };

  if (context) {
    const structuredRequiredLinks = context.requiredLinks.map(normalizeRequiredLink);
    const compilerContext: Record<string, unknown> = {
      required_sections: [
        "# Title",
        "## Problem or ## Context",
        "## Fix / ## Procedure / ## Decision / ## Operating Rule",
        "## Verification",
        "## Reusable Lessons",
        "## Provenance",
        "## Related Wiki Pages when links are supplied",
      ],
      topic_title: context.topicTitle,
      page_kind: context.pageKind,
      observations: context.observations.map((obs) => ({
        summary: obs.summary,
        ...(obs.raw_excerpt ? { raw_excerpt: obs.raw_excerpt } : {}),
      })),
      related_pages: context.relatedPages.map((page) => ({
        title: page.title,
        path: page.path,
      })),
      required_links: structuredRequiredLinks,
      suggested_links: context.suggestedLinks ?? [],
      merge_candidates: context.mergeCandidates ?? [],
      relationship_reasons: context.relationshipReasons ?? [],
      link_instruction: "Every required link MUST appear in the output body as a wiki link using the exact format [[slug|label]]. Suggested links may appear when useful. Do NOT invent wiki links to pages not listed in required_links or suggested_links.",
    };

    if (context.existingPageContent) {
      compilerContext.existing_page_content = context.existingPageContent;
    }

    if (context.pagePlanAction) {
      compilerContext.page_plan_action = context.pagePlanAction;
      if (context.pagePlanAction === "update" || context.pagePlanAction === "merge") {
        compilerContext.update_instruction = "An existing page already exists for this topic. You must UPDATE or MERGE into the existing page rather than creating a new page. Preserve existing valuable content, integrate new observations, and strengthen or clarify existing claims.";
      }
    }

    userObj.compiler_context = compilerContext;
  }

  return {
    system: systemLines.join("\n"),
    user: JSON.stringify(userObj, null, 2),
  };
}
