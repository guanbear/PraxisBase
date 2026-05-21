import { PROTOCOL_VERSION } from "../protocol/types.js";
import type { Proposal } from "../protocol/schemas.js";
import { makeId, slugifyId, computeHash } from "../protocol/id.js";
import type { DistilledExperience } from "../ai/distill.js";

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

export interface DistilledSkillSynthesisInput {
  experiences: DistilledExperience[];
  minEvidence?: number;
  now?: string;
}

function skillGroupKey(experience: DistilledExperience): string | undefined {
  if (!experience.skill_candidate.should_create || !experience.skill_candidate.trigger) return undefined;
  const procedure = experience.skill_candidate.procedure ?? [];
  if (procedure.length === 0) return undefined;
  return computeHash(JSON.stringify({
    trigger: experience.skill_candidate.trigger.trim().toLowerCase(),
    procedure: procedure.map((step) => step.trim().toLowerCase()),
  }));
}

function generateDistilledSkillMd(title: string, trigger: string, procedure: string[], experiences: DistilledExperience[]): string {
  const sourceRefs = Array.from(new Set(experiences.map((experience) => experience.source_ref))).sort();
  const lessons = Array.from(new Set(experiences.flatMap((experience) => experience.reusable_lessons))).sort();
  const verification = Array.from(new Set(experiences.flatMap((experience) => experience.verification))).sort();

  return [
    `# ${title}`,
    "",
    "## When To Use",
    "",
    trigger,
    "",
    "## Procedure",
    "",
    ...procedure.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## Reusable Lessons",
    "",
    ...lessons.map((lesson) => `- ${lesson}`),
    "",
    "## Verification",
    "",
    ...verification.map((item) => `- ${item}`),
    "",
    "## Evidence",
    "",
    `Based on ${experiences.length} distilled successful experiences.`,
    ...sourceRefs.map((ref) => `- ${ref}`),
    "",
    "<!-- recommendation-only: this skill must be reviewed and promoted before use -->",
    "<!-- forbidden: do not execute destructive operations without explicit approval -->",
    "",
  ].join("\n");
}

export function generateSkillDraftsFromDistilledExperiences(input: DistilledSkillSynthesisInput): Proposal[] {
  const minEvidence = input.minEvidence ?? 3;
  const groups = new Map<string, DistilledExperience[]>();

  for (const experience of input.experiences) {
    if (experience.outcome !== "success") continue;
    const key = skillGroupKey(experience);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(experience);
    groups.set(key, group);
  }

  const now = input.now ?? new Date().toISOString();
  const proposals: Proposal[] = [];
  for (const [key, group] of groups) {
    if (group.length < minEvidence) continue;
    const first = group[0];
    const title = first.skill_candidate.title ?? first.skill_candidate.trigger ?? `Distilled skill ${key.slice(7, 15)}`;
    const trigger = first.skill_candidate.trigger!;
    const procedure = first.skill_candidate.procedure!;
    const slug = slugifyId(title);
    const sourceHash = computeHash(JSON.stringify(group.map((experience) => ({
      source_ref: experience.source_ref,
      source_hash: experience.source_hash,
      chunk_hashes: experience.chunk_hashes,
      trigger: experience.skill_candidate.trigger,
      procedure: experience.skill_candidate.procedure,
    }))));

    proposals.push({
      id: makeId("kp", `skill-distilled-${slug}-${sourceHash.slice(7, 15)}`),
      protocol_version: PROTOCOL_VERSION,
      type: "knowledge_proposal",
      scope: first.scope_hint === "personal" ? "personal" : "project",
      action: "create",
      target_type: "skill",
      target_id: `skill_${slug}`,
      agent_id: "ai-distill-synthesis",
      agent_type: "curator",
      environment_id: "ai-distill",
      run_id: `ai-distill-synthesis-${now}`,
      idempotency_key: `ai-distill-skill-${key}`,
      evidence: {
        source_uri: first.source_ref,
        source_hash: sourceHash,
        excerpt: `Synthesized from ${group.length} distilled successful experiences for ${trigger}`,
        repair_result: "success",
        verification: `At least ${minEvidence} matching distilled experiences with the same trigger and procedure`,
      },
      patch: {
        path: `skills/synthesized/${slug}/SKILL.md`,
        content: generateDistilledSkillMd(title, trigger, procedure, group),
      },
      created_at: now,
    });
  }

  return proposals.sort((a, b) => a.patch.path.localeCompare(b.patch.path));
}
