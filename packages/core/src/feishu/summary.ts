import { PROTOCOL_VERSION } from "../protocol/types.js";
import type { IncidentEpisode, Proposal } from "../protocol/schemas.js";
import { makeId, computeHash } from "../protocol/id.js";

export interface FeishuSummaryPayload {
  msg_type: "interactive";
  card: {
    header: {
      title: { tag: "plain_text"; content: string };
      template: string;
    };
    elements: Array<{
      tag: "div" | "markdown" | "action";
      text?: { tag: "plain_text" | "lark_md"; content: string };
    }>;
  };
}

function resultToTemplate(result: string): string {
  if (result === "confirmed") return "green";
  if (result === "inconclusive") return "yellow";
  return "red";
}

export function formatIncidentSummary(episode: IncidentEpisode): FeishuSummaryPayload {
  const template = resultToTemplate(episode.result);
  const refsText = episode.source_refs.join("\n- ");

  return {
    msg_type: "interactive",
    card: {
      header: {
        title: { tag: "plain_text", content: `Incident: ${episode.problem_signature}` },
        template,
      },
      elements: [
        {
          tag: "div",
          text: { tag: "plain_text", content: `Result: ${episode.result}` },
        },
        {
          tag: "div",
          text: { tag: "plain_text", content: `Environment: ${episode.environment_id}` },
        },
        {
          tag: "markdown",
          text: { tag: "lark_md", content: `**Evidence:**\n${episode.evidence_summary}` },
        },
        {
          tag: "markdown",
          text: { tag: "lark_md", content: `**Source refs:**\n- ${refsText}` },
        },
        {
          tag: "div",
          text: { tag: "plain_text", content: `Agent: ${episode.agent_id} | Run: ${episode.run_id}` },
        },
        {
          tag: "div",
          text: { tag: "plain_text", content: `Timestamp: ${episode.created_at}` },
        },
      ],
    },
  };
}

export function formatProposalDraft(
  episode: IncidentEpisode,
  proposalPath: string,
): FeishuSummaryPayload {
  return {
    msg_type: "interactive",
    card: {
      header: {
        title: { tag: "plain_text", content: `Knowledge Proposal: ${episode.problem_signature}` },
        template: "blue",
      },
      elements: [
        {
          tag: "div",
          text: { tag: "plain_text", content: `Type: knowledge_proposal` },
        },
        {
          tag: "markdown",
          text: { tag: "lark_md", content: `**Patch path:** ${proposalPath}` },
        },
        {
          tag: "markdown",
          text: { tag: "lark_md", content: `**Evidence:**\n${episode.evidence_summary}` },
        },
        {
          tag: "div",
          text: { tag: "plain_text", content: `Agent: ${episode.agent_id} | Run: ${episode.run_id}` },
        },
      ],
    },
  };
}

export function generateProposalDraft(
  episode: IncidentEpisode,
  patchPath: string,
  patchContent: string,
): Proposal {
  const now = new Date().toISOString();
  const proposalId = makeId("kp", `${episode.run_id}-${episode.problem_signature}-${Date.now()}`);

  return {
    id: proposalId,
    protocol_version: PROTOCOL_VERSION,
    type: "knowledge_proposal",
    scope: "project",
    action: "create",
    target_type: "known_fix",
    target_id: makeId("kf", episode.problem_signature),
    agent_id: episode.agent_id,
    agent_type: episode.agent_type,
    environment_id: episode.environment_id,
    run_id: episode.run_id,
    idempotency_key: `${episode.idempotency_key}-proposal`,
    evidence: {
      source_uri: episode.source_refs[0] ?? "unknown",
      source_hash: computeHash(
        `${episode.evidence_summary}\n${episode.source_refs.join(",")}`
      ),
      excerpt: episode.evidence_summary,
      repair_result: episode.result === "confirmed" ? "success" : "partial",
      verification: `Proposed from incident episode ${episode.id}`,
    },
    patch: {
      path: patchPath,
      content: patchContent,
    },
    created_at: now,
  };
}
