import { computeHash, slugifyId } from "../protocol/id.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import type { AiJsonClient } from "../ai/client.js";
import type { StableSkillMatch } from "./skill-inventory.js";
import { SkillSynthesisCandidateSchema, type SkillSynthesisCandidate, type SkillCauseClassification } from "./skill-model.js";
import type { SkillSignalCluster } from "./skill-stability.js";

const REQUIRED_SECTIONS = ["When To Use", "Procedure", "Verification", "Pitfalls", "Do Not Use When", "Related Wiki Pages", "Provenance"];

function requiredSections(body: string): string[] {
  return REQUIRED_SECTIONS.filter((heading) => !new RegExp(`^##\\s+${heading}\\s*$`, "im").test(body));
}

function normalizeFrontmatterLine(line: string): string {
  const match = line.match(/^(name|description|scope|status):\s*(.*)$/);
  if (!match) return line;
  const [, key, rawValue] = match;
  const value = rawValue.trim();
  if (!value || value.startsWith("\"") || value.startsWith("'") || /^(true|false|\d+(?:\.\d+)?)$/i.test(value)) return line;
  if (!/[#:,[\]{}]|^\s|\s$/.test(value)) return line;
  return `${key}: ${JSON.stringify(value)}`;
}

function normalizeSkillMarkdown(body: string): string {
  const lines = body.trim().split(/\r?\n/);
  let inFrontmatter = lines[0]?.trim() === "---";
  let frontmatterClosed = false;
  const normalized: string[] = [];

  for (const line of lines) {
    if (inFrontmatter && !frontmatterClosed) {
      if (line.trim() === "---" && normalized.length > 0) {
        frontmatterClosed = true;
        inFrontmatter = false;
        normalized.push(line);
        continue;
      }
      normalized.push(normalized.length === 0 ? line : normalizeFrontmatterLine(line));
      continue;
    }

    const embeddedHeading = line.match(/^(\s*)(\d+)\.\s+(#{2,6})\s+(.+?)\s+((?:check|inspect|verify|run|re-run|restart|update|patch|apply|confirm|review|audit|execute|send|ensure|validate)\b.*)$/i);
    if (embeddedHeading) {
      const [, indent, number, hashes, title, step] = embeddedHeading;
      normalized.push(`${indent}${hashes} ${title.trim()}`);
      normalized.push(`${indent}${number}. ${step.trim()}`);
      continue;
    }

    normalized.push(line);
  }

  return normalized.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function sectionBody(body: string, heading: string): string {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${heading}\\s*$`, "i").test(line));
  if (start < 0) return "";
  const collected: string[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    if (/^##\s+\S/.test(lines[index])) break;
    collected.push(lines[index]);
  }
  return collected.join("\n").trim();
}

function skillShapeRiskNotes(body: string): string[] {
  const notes: string[] = [];
  if (/^\s*\d+\.\s+#{2,}/m.test(body)) notes.push("skill_shape_invalid:malformed_procedure_heading");
  const procedure = sectionBody(body, "Procedure");
  const procedureSteps = procedure.split(/\r?\n/).filter((line) => /^\s*\d+\.\s+\S/.test(line)).length;
  if (procedureSteps < 3) notes.push("skill_shape_invalid:short_procedure");
  if (/^(?:#\s+)?(?:run|session|build|job|ticket|pr|issue)[-_: #]?\d{2,}\b/im.test(body)) notes.push("skill_shape_invalid:run_specific_body");
  return notes;
}

function classifyCause(cluster: SkillSignalCluster): SkillCauseClassification {
  const triggerLower = cluster.trigger.toLowerCase();
  const procedureText = cluster.procedure.join(" ").toLowerCase();
  const combined = `${triggerLower} ${procedureText}`;

  if (/(?:agent|model|mcp|llm)\s+(?:did not|failed to|ignored|misused|overflow|context overflow|hallucinat)/i.test(combined)) {
    return "agent_problem";
  }
  if (/(?:network|rate limit|timeout|disk full|permission denied|env var|api key|quota|install failed|credential|flaky|outage|temporary)/i.test(combined)) {
    const hasReusableFix = /(?:retry|fallback|cache|guard|verify|confirm|pin|configure|document|check|workaround)/i.test(combined);
    if (!hasReusableFix) return "environment_problem";
  }
  if (cluster.confidence < 0.5 || cluster.source_count < 2) {
    return "weak_signal";
  }
  return "skill_problem";
}

function defaultSkillBody(cluster: SkillSignalCluster, matches: StableSkillMatch[]): string {
  const related = cluster.related_wiki_paths.length > 0 ? cluster.related_wiki_paths.map((path) => `- [[${path}]]`) : ["- None yet"];
  const procedure = [
    "Confirm the current task matches the trigger and related wiki evidence.",
    ...cluster.procedure,
    "Verify the original workflow again and capture the result with provenance.",
  ];
  return [
    "---",
    `name: ${cluster.title}`,
    `description: ${cluster.trigger}`,
    `scope: ${cluster.scope}`,
    "status: draft",
    `source_count: ${cluster.source_count}`,
    "origin: praxisbase_synthesized",
    "generated_by: praxisbase",
    `source_refs:`,
    ...cluster.source_refs.map((ref) => `  - ${ref}`),
    `source_hashes:`,
    ...cluster.source_hashes.map((hash) => `  - ${hash}`),
    "---",
    `# ${cluster.title}`,
    "",
    "## When To Use",
    cluster.trigger,
    "",
    "## Procedure",
    ...procedure.map((step, index) => `${index + 1}. ${step}`),
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
  const causeClassification = classifyCause(cluster);

  const shouldSkip = causeClassification === "weak_signal"
    || causeClassification === "agent_problem"
    || causeClassification === "environment_problem";
  const rawAction = raw.action === "skill_update" || raw.action === "skill_support_file" || raw.action === "skill_create" || raw.action === "skill_optimize_description" || raw.action === "skip"
    ? raw.action
    : undefined;
  const action = rawAction === "skip" || shouldSkip ? "skip"
    : rawAction === "skill_optimize_description" ? "skill_optimize_description"
    : rawAction ?? (best ? "skill_update" : "skill_create");
  const targetPath = typeof raw.target_path === "string" && raw.target_path.trim()
    ? raw.target_path.trim()
    : action === "skill_create"
      ? `skills/${slug.split("-")[0] || "agent"}/${slug}/SKILL.md`
      : best?.skill.path ?? `skills/${slug.split("-")[0] || "agent"}/${slug}/SKILL.md`;

  if (action === "skip") {
    const skipRiskNotes: string[] = Array.isArray(raw.risk_notes) ? raw.risk_notes.map(String) : [];
    skipRiskNotes.push(`cause_classification:${causeClassification}`);
    if (causeClassification === "weak_signal") skipRiskNotes.push("skip_reason:weak_signal");
    if (causeClassification === "agent_problem") skipRiskNotes.push("skip_reason:agent_problem");
    if (causeClassification === "environment_problem") skipRiskNotes.push("skip_reason:environment_problem");

    return SkillSynthesisCandidateSchema.parse({
      id: typeof raw.id === "string" ? raw.id : `skill_candidate_${computeHash(`${cluster.id}:${targetPath}`).slice(7, 19)}`,
      protocol_version: PROTOCOL_VERSION,
      type: "skill_synthesis_candidate",
      action: "skip",
      cause_classification: causeClassification,
      scope: cluster.scope,
      target_path: targetPath,
      target_skill: title,
      title,
      summary: `Skipped: ${causeClassification.replace(/_/g, " ")}.`,
      body_markdown: "",
      source_refs: cluster.source_refs,
      source_hashes: cluster.source_hashes,
      evidence_ids: cluster.evidence_ids,
      source_count: cluster.source_count,
      confidence: cluster.confidence,
      ladder_choice: "skip",
      existing_skill_path: best?.skill.path ?? null,
      related_wiki_paths: cluster.related_wiki_paths,
      review_hint: {
        suggested_decision: "reject",
        risk_notes: skipRiskNotes,
      },
      created_at: now,
    });
  }

  let body = typeof raw.body_markdown === "string" && raw.body_markdown.trim()
    ? raw.body_markdown.trim()
    : defaultSkillBody(cluster, matches);
  body = normalizeSkillMarkdown(body);
  const missing = requiredSections(body);
  const riskNotes: string[] = Array.isArray(raw.risk_notes) ? raw.risk_notes.map(String) : [];
  if (missing.length > 0) {
    riskNotes.push(`shape_missing_sections:${missing.join(",")}`, `skill_shape_invalid:missing_sections:${missing.join(",")}`);
    body = `${body.trim()}\n\n${missing.map((heading) => `## ${heading}\n- Needs reviewer completion.`).join("\n\n")}\n`;
  }
  riskNotes.push(...skillShapeRiskNotes(body));
  if (strongMatches.length > 1) riskNotes.push("ambiguous_existing_skill_match");
  const hasShapeInvalid = riskNotes.some((note) => note.startsWith("skill_shape_invalid"));

  const ladderChoice = action === "skill_optimize_description" ? "skill_optimize_description"
    : best ? "skill_update_existing"
    : "skill_create";

  return SkillSynthesisCandidateSchema.parse({
    id: typeof raw.id === "string" ? raw.id : `skill_candidate_${computeHash(`${cluster.id}:${targetPath}`).slice(7, 19)}`,
    protocol_version: PROTOCOL_VERSION,
    type: "skill_synthesis_candidate",
    action,
    cause_classification: causeClassification,
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
    ladder_choice: ladderChoice,
    existing_skill_path: best?.skill.path ?? null,
    related_wiki_paths: cluster.related_wiki_paths,
    review_hint: {
      suggested_decision: hasShapeInvalid ? "edit" : strongMatches.length > 1 ? "merge" : "approve",
      risk_notes: riskNotes,
    },
    created_at: now,
  });
}

export function buildSkillProposerPrompt(cluster: SkillSignalCluster, matches: StableSkillMatch[]): string {
  return JSON.stringify({
    role: "PraxisBase skill proposer",
    ladder: ["skill_update_loaded", "skill_update_existing", "skill_support_file", "skill_optimize_description", "skill_create", "skip"],
    rules: [
      "Prefer updating an existing umbrella skill before creating a new skill.",
      "Create only durable class-level skills, never PR/run/error-string micro skills.",
      "Write synthesized instructions, not raw transcript.",
      "Include When To Use, Procedure, Verification, Pitfalls, Do Not Use When, Related Wiki Pages, and Provenance.",
      "Classify cause: skill_problem, agent_problem, environment_problem, or weak_signal.",
      "Skip when cause is agent_problem, environment_problem without reusable fix, or weak_signal.",
      "Use skill_optimize_description when the skill body is useful but matching is too broad or too narrow.",
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
