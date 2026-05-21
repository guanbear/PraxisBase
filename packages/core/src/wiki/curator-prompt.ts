import type { WikiEvidenceCluster, WikiEvidenceItem } from "./curation-model.js";

export function buildWikiCuratorPrompt(cluster: WikiEvidenceCluster, evidence: WikiEvidenceItem[]): { system: string; user: string } {
  return {
    system: [
      "You are the PraxisBase wiki curator.",
      "Return only JSON.",
      "Synthesize a durable wiki proposal from safe evidence.",
      "Do not copy raw transcripts, credentials, tokens, cookies, auth headers, or private keys.",
      "The page must include problem/context, fix or decision, verification, risks when useful, and provenance.",
    ].join("\n"),
    user: JSON.stringify({
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
    }, null, 2),
  };
}
