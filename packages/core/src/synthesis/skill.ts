import { PROTOCOL_VERSION } from "../protocol/types.js";
import type { Proposal } from "../protocol/schemas.js";
import { makeId, slugifyId, computeHash } from "../protocol/id.js";

export interface SkillSynthesisInput {
  signature: string;
  episodes: Array<{
    summary: string;
    result: string;
    used_skills: string[];
    used_objects: string[];
    source_refs: string[];
  }>;
  minEpisodes?: number;
}

function generateSkillMd(input: SkillSynthesisInput): string {
  const confirmed = input.episodes.filter(
    (e) => e.result === "confirmed" || e.result === "success",
  );
  const allSkills = [...new Set(confirmed.flatMap((e) => e.used_skills))];
  const allRefs = [...new Set(confirmed.flatMap((e) => e.source_refs))];
  const steps = confirmed.map((e, i) => `${i + 1}. ${e.summary}`);

  const lines: string[] = [
    `# Skill: ${input.signature}`,
    "",
    "## When To Use",
    "",
    `Problem signature matches \`${input.signature}\`.`,
    "",
    "## Steps",
    "",
    ...steps,
    "",
    "## Verification",
    "",
    `Based on ${confirmed.length} confirmed episodes.`,
    "",
    "## Skills Used",
    "",
    ...allSkills.map((s) => `- ${s}`),
    "",
    "## Source Refs",
    "",
    ...allRefs.map((r) => `- ${r}`),
    "",
    "<!-- recommendation-only: this skill must be reviewed and promoted before use -->",
    "<!-- forbidden: do not execute destructive operations without explicit approval -->",
    "",
  ];

  return lines.join("\n");
}

export function generateSkillDraft(input: SkillSynthesisInput): Proposal {
  const minEpisodes = input.minEpisodes ?? 3;
  const confirmed = input.episodes.filter(
    (e) => e.result === "confirmed" || e.result === "success",
  );

  if (confirmed.length < minEpisodes) {
    throw new Error(
      `Not enough confirmed episodes for skill synthesis: ${confirmed.length} < ${minEpisodes}`,
    );
  }

  const slug = slugifyId(input.signature);
  const skillPath = `skills/synthesized/${slug}/SKILL.md`;
  const content = generateSkillMd(input);
  const now = new Date().toISOString();

  return {
    id: makeId("kp", `skill-${slug}-${Date.now()}`),
    protocol_version: PROTOCOL_VERSION,
    type: "knowledge_proposal",
    scope: "project",
    action: "create",
    target_type: "skill",
    target_id: `skill_${slug}`,
    agent_id: "synthesis-engine",
    agent_type: "curator",
    environment_id: "synthesis",
    run_id: `synthesis-${Date.now()}`,
    idempotency_key: `synthesis-${slug}`,
    evidence: {
      source_uri: confirmed[0].source_refs[0] ?? "synthesis",
      source_hash: computeHash(
        `${input.signature}\n${confirmed.map((e) => `${e.summary}|${e.source_refs.join(",")}`).join("\n")}`
      ),
      excerpt: `Synthesized from ${confirmed.length} confirmed episodes matching ${input.signature}`,
      repair_result: "success",
      verification: `At least ${minEpisodes} confirmed episodes with matching signature`,
    },
    patch: {
      path: skillPath,
      content,
    },
    created_at: now,
  };
}
