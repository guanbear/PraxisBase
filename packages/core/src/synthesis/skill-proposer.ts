import { computeHash, slugifyId } from "../protocol/id.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import type { AiJsonClient } from "../ai/client.js";
import type { StableSkillMatch } from "./skill-inventory.js";
import { SkillSynthesisCandidateSchema, type SkillSynthesisCandidate } from "./skill-model.js";
import type { SkillSignalCluster } from "./skill-stability.js";

function requiredSections(body: string): string[] {
  return ["When To Use", "Procedure", "Verification", "Pitfalls", "Do Not Use When", "Related Wiki Pages", "Provenance"]
    .filter((heading) => !new RegExp(`^##\\s+${heading}\\s*$`, "im").test(body));
}

function defaultSkillBody(cluster: SkillSignalCluster, matches: StableSkillMatch[]): string {
  const related = cluster.related_wiki_paths.length > 0 ? cluster.related_wiki_paths.map((path) => `- [[${path}]]`) : ["- None yet"];
  return [
    "---",
    `name: ${cluster.title}`,
    `description: ${cluster.trigger}`,
    `scope: ${cluster.scope}`,
    "status: draft",
    `source_count: ${cluster.source_count}`,
    "---",
    `# ${cluster.title}`,
    "",
    "## When To Use",
    cluster.trigger,
    "",
    "## Procedure",
    ...cluster.procedure.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## Verification",
    "- Re-run the workflow that produced the verified experiences.",
    "",
    "## Pitfalls",
    "- Do not apply this outside the trigger without checking the related wiki evidence.",
    "",
    "## Do Not Use When",
    "- The situation is a one-off run, private incident, or raw transcript summary.",
    "",
    "## Related Wiki Pages",
    ...related,
    "",
    "## Provenance",
    ...cluster.source_refs.map((ref, index) => `- ${ref} (${cluster.source_hashes[index] ?? "hash unknown"})`),
    ...(matches.length > 0 ? ["", `Existing skill context: ${matches.map((match) => match.skill.path).join(", ")}`] : []),
    "",
  ].join("\n");
}

function normalizeCandidate(raw: Record<string, unknown>, cluster: SkillSignalCluster, matches: StableSkillMatch[], now: string): SkillSynthesisCandidate {
  const strongMatches = matches.filter((match) => match.strength === "strong");
  const best = matches.find((match) => match.strength === "strong" || match.strength === "medium");
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : cluster.title;
  const slug = slugifyId(title);
  const action = (raw.action === "skill_update" || raw.action === "skill_support_file" || raw.action === "skill_create")
    ? raw.action
    : best
      ? "skill_update"
      : "skill_create";
  const targetPath = typeof raw.target_path === "string" && raw.target_path.trim()
    ? raw.target_path.trim()
    : action === "skill_create"
      ? `skills/${slug.split("-")[0] || "agent"}/${slug}/SKILL.md`
      : best?.skill.path ?? `skills/${slug.split("-")[0] || "agent"}/${slug}/SKILL.md`;
  let body = typeof raw.body_markdown === "string" && raw.body_markdown.trim()
    ? raw.body_markdown.trim()
    : defaultSkillBody(cluster, matches);
  const missing = requiredSections(body);
  const riskNotes: string[] = Array.isArray(raw.risk_notes) ? raw.risk_notes.map(String) : [];
  if (missing.length > 0) {
    riskNotes.push(`shape_missing_sections:${missing.join(",")}`);
    body = `${body.trim()}\n\n${missing.map((heading) => `## ${heading}\n- Needs reviewer completion.`).join("\n\n")}\n`;
  }
  if (strongMatches.length > 1) riskNotes.push("ambiguous_existing_skill_match");

  return SkillSynthesisCandidateSchema.parse({
    id: typeof raw.id === "string" ? raw.id : `skill_candidate_${computeHash(`${cluster.id}:${targetPath}`).slice(7, 19)}`,
    protocol_version: PROTOCOL_VERSION,
    type: "skill_synthesis_candidate",
    action,
    scope: cluster.scope,
    target_path: targetPath,
    target_skill: typeof raw.target_skill === "string" ? raw.target_skill : title,
    title,
    summary: typeof raw.summary === "string" ? raw.summary : `Skill candidate synthesized from ${cluster.source_count} stable signals.`,
    body_markdown: body,
    source_refs: cluster.source_refs,
    source_hashes: cluster.source_hashes,
    evidence_ids: cluster.evidence_ids,
    source_count: cluster.source_count,
    confidence: cluster.confidence,
    ladder_choice: best ? "skill_update_existing" : "skill_create",
    existing_skill_path: best?.skill.path ?? null,
    related_wiki_paths: cluster.related_wiki_paths,
    review_hint: {
      suggested_decision: strongMatches.length > 1 ? "merge" : "approve",
      risk_notes: riskNotes,
    },
    created_at: now,
  });
}

export function buildSkillProposerPrompt(cluster: SkillSignalCluster, matches: StableSkillMatch[]): string {
  return JSON.stringify({
    role: "PraxisBase skill proposer",
    ladder: ["skill_update_loaded", "skill_update_existing", "skill_support_file", "skill_create"],
    rules: [
      "Prefer updating an existing umbrella skill before creating a new skill.",
      "Create only durable class-level skills, never PR/run/error-string micro skills.",
      "Write synthesized instructions, not raw transcript.",
      "Include When To Use, Procedure, Verification, Pitfalls, Do Not Use When, Related Wiki Pages, and Provenance.",
    ],
    cluster,
    existing_matches: matches,
  });
}

export async function proposeSkillCandidate(input: {
  cluster: SkillSignalCluster;
  matches: StableSkillMatch[];
  aiClient?: AiJsonClient;
  now: string;
}): Promise<SkillSynthesisCandidate> {
  let raw: Record<string, unknown> = {};
  if (input.aiClient) {
    const generated = await input.aiClient.generateJson({
      schemaName: "skill_synthesis_candidate",
      system: "You synthesize audited PraxisBase agent skills.",
      user: buildSkillProposerPrompt(input.cluster, input.matches),
      maxOutputBytes: 8192,
    });
    if (generated.ok && generated.json && typeof generated.json === "object" && !Array.isArray(generated.json)) raw = generated.json as Record<string, unknown>;
  }
  return normalizeCandidate(raw, input.cluster, input.matches, input.now);
}
