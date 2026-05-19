import { PROTOCOL_VERSION } from "../protocol/types.js";
import type { IncidentEpisode, Proposal } from "../protocol/schemas.js";
import { makeId, computeHash } from "../protocol/id.js";

export interface DirectionResultInput {
  problem_signature: string;
  environment_id: string;
  run_id: string;
  agent_id: string;
  confirmed: boolean;
  evidence_summary: string;
  source_refs: string[];
  proposal_patch_path?: string;
  proposal_patch_content?: string;
}

export interface AdapterOutput {
  episode: IncidentEpisode;
  proposal?: Proposal;
}

export function adaptDirectionResult(input: DirectionResultInput): AdapterOutput {
  const now = new Date().toISOString();
  const id = makeId("ie", `${input.run_id}-${input.problem_signature}-${Date.now()}`);

  const episode: IncidentEpisode = {
    id,
    protocol_version: PROTOCOL_VERSION,
    type: "incident_episode",
    scope: "project",
    agent_id: input.agent_id,
    agent_type: "live_incident_analyzer",
    environment_id: input.environment_id,
    run_id: input.run_id,
    idempotency_key: `${input.run_id}-${input.problem_signature}`,
    problem_signature: input.problem_signature,
    result: input.confirmed ? "confirmed" : "ruled_out",
    used_skills: [],
    used_objects: [],
    source_refs: input.source_refs,
    evidence_summary: input.evidence_summary,
    created_at: now,
  };

  let proposal: Proposal | undefined;
  if (input.proposal_patch_path && input.proposal_patch_content) {
    const proposalId = makeId("kp", `${input.run_id}-${input.problem_signature}-${Date.now()}`);
    proposal = {
      id: proposalId,
      protocol_version: PROTOCOL_VERSION,
      type: "knowledge_proposal",
      scope: "project",
      action: "create",
      target_type: "known_fix",
      target_id: makeId("kf", input.problem_signature),
      agent_id: input.agent_id,
      agent_type: "live_incident_analyzer",
      environment_id: input.environment_id,
      run_id: input.run_id,
      idempotency_key: `${input.run_id}-${input.problem_signature}-proposal`,
      evidence: {
        source_uri: input.source_refs[0] ?? "unknown",
        source_hash: computeHash(`${input.evidence_summary}\n${input.source_refs.join(",")}`),
        excerpt: input.evidence_summary,
        repair_result: "success",
        verification: `Confirmed via SRE-autopilot: ${input.evidence_summary}`,
      },
      patch: {
        path: input.proposal_patch_path,
        content: input.proposal_patch_content,
      },
      created_at: now,
    };
  }

  return { episode, proposal };
}
