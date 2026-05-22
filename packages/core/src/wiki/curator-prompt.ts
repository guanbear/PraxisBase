import type { WikiEvidenceCluster, WikiEvidenceItem, WikiPagePlanAction } from "./curation-model.js";

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
  /** Wikilink targets the output must reference. */
  requiredLinks: ReadonlyArray<string>;
  /** Planned action (create/update/merge/supersede/archive). */
  pagePlanAction?: WikiPagePlanAction;
}

export function buildWikiCuratorPrompt(cluster: WikiEvidenceCluster, evidence: WikiEvidenceItem[], context?: SynthesisContext): { system: string; user: string } {
  const systemLines = [
    "You are the PraxisBase wiki curator.",
    "Return only JSON.",
    "Synthesize a durable wiki proposal from safe evidence.",
    "Do not copy raw transcripts, credentials, tokens, cookies, auth headers, or private keys.",
    "The page must include problem/context, fix or decision, verification, risks when useful, and provenance.",
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
    const compilerContext: Record<string, unknown> = {
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
      required_links: context.requiredLinks,
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
