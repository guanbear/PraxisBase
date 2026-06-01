import { PROTOCOL_VERSION } from "../protocol/types.js";
import type { Proposal } from "../protocol/schemas.js";
import { ProposalSchema } from "../protocol/schemas.js";
import { makeId, slugifyId, computeHash } from "../protocol/id.js";
import type { DistilledExperience } from "../ai/distill.js";
import type { AiJsonClient } from "../ai/client.js";
import { writeJson } from "../store/file-store.js";
import { protocolPaths } from "../protocol/paths.js";
import type { ClassifiedLesson } from "../experience/lesson-cache.js";
import {
  collectSkillSignalsFromDistilledExperiences,
  collectSkillSignalsFromLessons,
  collectSkillSignalsFromStableWikiPages,
  explainLessonSkillAuthority,
} from "./skill-signals.js";
import type { SkillSignalCandidate } from "./skill-signals.js";
import { clusterSkillSignals } from "./skill-stability.js";
import { loadStableSkillInventory, matchStableSkills } from "./skill-inventory.js";
import { proposeSkillCandidate } from "./skill-proposer.js";
import { reviewSkillCandidateSemanticallyDetailed } from "./skill-review.js";
import { decideSemanticSkillAction } from "./skill-review-policy.js";
import {
  SkillSynthesisReportSchema,
  type SkillSourceAuthorityEntry,
  type SkillSourceAuthorityReport,
  type SkillSynthesisCandidate,
  type SkillSynthesisReport,
} from "./skill-model.js";
import { collectWikiPages } from "../wiki/render-site.js";

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
  const sourceHashes = Array.from(new Set(experiences.map((experience) => experience.source_hash))).sort();
  const lessons = Array.from(new Set(experiences.flatMap((experience) => experience.reusable_lessons))).sort();
  const verification = Array.from(new Set(experiences.flatMap((experience) => experience.verification))).sort();

  return [
    "---",
    "origin: praxisbase_synthesized",
    "generated_by: praxisbase",
    `source_refs:`,
    ...sourceRefs.map((ref) => `  - ${ref}`),
    `source_hashes:`,
    ...sourceHashes.map((hash) => `  - ${hash}`),
    "---",
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

export interface SynthesizeSkillCandidatesInput {
  mode: "dry-run" | "review";
  authorityMode: "personal-local" | "team-git";
  experiences: DistilledExperience[];
  lessons?: ClassifiedLesson[];
  legacyDistillMode?: "compat" | "degraded" | "disabled";
  aiClient?: AiJsonClient;
  now?: string;
  maxClusters?: number;
}

export interface SynthesizeSkillCandidatesResult {
  report: SkillSynthesisReport;
  candidates: SkillSynthesisCandidate[];
}

function sourceAuthorityEntryId(entry: Omit<SkillSourceAuthorityEntry, "id">): string {
  return `skill_source_auth_${computeHash(JSON.stringify({
    kind: entry.source_kind,
    decision: entry.decision,
    reason: entry.reason,
    source_ref: entry.source_ref,
    source_hash: entry.source_hash ?? "",
    signal_id: entry.signal_id ?? "",
    evidence_id: entry.evidence_id ?? "",
  })).slice(7, 19)}`;
}

function authorityEntry(entry: Omit<SkillSourceAuthorityEntry, "id">): SkillSourceAuthorityEntry {
  return { id: sourceAuthorityEntryId(entry), ...entry };
}

function authorityEntriesFromSignals(
  sourceKind: SkillSourceAuthorityEntry["source_kind"],
  signals: SkillSignalCandidate[],
  decision: SkillSourceAuthorityEntry["decision"],
  reason: string,
): SkillSourceAuthorityEntry[] {
  return signals.map((signal) => authorityEntry({
    source_kind: sourceKind,
    decision,
    reason,
    stable_eligible: decision === "accepted",
    source_ref: signal.source_ref,
    source_hash: signal.source_hash,
    signal_id: signal.id,
    evidence_id: signal.evidence_id,
    scope: signal.scope,
  }));
}

function authorityEntriesFromLessons(
  lessons: ClassifiedLesson[],
  options: { authorityMode: "personal-local" | "team-git" },
): SkillSourceAuthorityEntry[] {
  return lessons.map((lesson) => {
    const decision = explainLessonSkillAuthority(lesson, options);
    return authorityEntry({
      source_kind: "lesson",
      decision: decision.accepted ? "accepted" : "rejected",
      reason: decision.reason,
      stable_eligible: decision.accepted,
      source_ref: lesson.source_refs[0],
      source_hash: lesson.source_hashes[0],
      evidence_id: lesson.lesson_id,
      scope: lesson.scope,
    });
  });
}

function buildSourceAuthorityReport(entries: SkillSourceAuthorityEntry[]): SkillSourceAuthorityReport {
  const bySourceKind: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  let accepted = 0;
  let rejected = 0;
  let degraded = 0;

  for (const entry of entries) {
    bySourceKind[entry.source_kind] = (bySourceKind[entry.source_kind] ?? 0) + 1;
    byReason[entry.reason] = (byReason[entry.reason] ?? 0) + 1;
    if (entry.decision === "accepted") accepted++;
    else if (entry.decision === "degraded") degraded++;
    else rejected++;
  }

  return {
    accepted,
    rejected,
    degraded,
    by_source_kind: bySourceKind,
    by_reason: byReason,
    entries: entries.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function skillCandidateToKnowledgeProposal(candidate: SkillSynthesisCandidate): Proposal {
  return ProposalSchema.parse({
    id: candidate.id,
    protocol_version: PROTOCOL_VERSION,
    type: "knowledge_proposal",
    scope: candidate.scope,
    action: candidate.action === "skill_update" ? "patch" : "create",
    target_type: "skill",
    target_id: candidate.target_skill,
    agent_id: "skill-synthesis",
    agent_type: "curator",
    environment_id: "local",
    run_id: `skill-synthesis-${candidate.created_at}`,
    idempotency_key: candidate.id,
    evidence: {
      source_uri: candidate.source_refs[0],
      source_hash: candidate.source_hashes[0],
      excerpt: candidate.summary,
      repair_result: "success",
      verification: `Semantic skill review required; evidence_count=${candidate.source_count}`,
      source_refs: candidate.source_refs.map((uri, index) => ({ uri, hash: candidate.source_hashes[index] ?? candidate.source_hashes[0] })),
      redacted_summary: candidate.summary,
    },
    patch: {
      path: candidate.target_path,
      content: candidate.body_markdown,
    },
    created_at: candidate.created_at,
  });
}

export async function synthesizeSkillCandidates(root: string, input: SynthesizeSkillCandidatesInput): Promise<SynthesizeSkillCandidatesResult> {
  const now = input.now ?? new Date().toISOString();
  const pages = await collectWikiPages(root);
  const legacyDistillMode = input.legacyDistillMode ?? "disabled";
  const lessonSignals = collectSkillSignalsFromLessons(input.lessons ?? [], { authorityMode: input.authorityMode });
  const wikiSignals = collectSkillSignalsFromStableWikiPages(pages, { authorityMode: input.authorityMode });
  const collectableLegacyDistillSignals = collectSkillSignalsFromDistilledExperiences(input.experiences, { authorityMode: input.authorityMode });
  const legacyDistillSignals = legacyDistillMode === "compat" ? collectableLegacyDistillSignals : [];
  const sourceAuthorityEntries: SkillSourceAuthorityEntry[] = [
    ...authorityEntriesFromLessons(input.lessons ?? [], { authorityMode: input.authorityMode }),
    ...authorityEntriesFromSignals("stable_wiki", wikiSignals, "accepted", "stable_wiki_procedure"),
    ...authorityEntriesFromSignals(
      "legacy_distill",
      collectableLegacyDistillSignals,
      legacyDistillMode === "compat" ? "accepted" : legacyDistillMode === "degraded" ? "degraded" : "rejected",
      legacyDistillMode === "compat"
        ? "legacy_distill_compat"
        : legacyDistillMode === "degraded"
          ? "legacy_distill_degraded_non_promotable"
          : "legacy_distill_not_stable_authority",
    ),
  ];
  const sourceAuthority = buildSourceAuthorityReport(sourceAuthorityEntries);
  const signals = [
    ...lessonSignals,
    ...legacyDistillSignals,
    ...wikiSignals,
  ];
  const clusters = clusterSkillSignals(signals, { maxClusters: input.maxClusters });
  const clusteredSignalCount = clusters.reduce((sum, cluster) => sum + cluster.source_count, 0);
  const rejectedSignals = Math.max(0, signals.length - clusteredSignalCount);
  const inventory = await loadStableSkillInventory(root);
  const candidates: SkillSynthesisCandidate[] = [];
  let reviewed = 0;
  let approved = 0;
  let rejected = 0;
  let needsHuman = 0;
  let skipped = 0;
  const outputs: string[] = [];
  const warnings: string[] = [];
  if (legacyDistillMode === "disabled" && collectableLegacyDistillSignals.length > 0) {
    warnings.push("legacy_distill_skill_signals_disabled:lesson_state_authority_required");
  }
  if (legacyDistillMode === "degraded" && collectableLegacyDistillSignals.length > 0) {
    warnings.push("legacy_distill_skill_signals_degraded:non_promotable");
  }
  if (legacyDistillMode === "compat" && collectableLegacyDistillSignals.length > 0) {
    warnings.push("legacy_distill_skill_signals_enabled:compat_mode_not_ga");
  }

  for (const cluster of clusters) {
    try {
      const matches = matchStableSkills(cluster, inventory);
      let candidate = await proposeSkillCandidate({ cluster, matches, aiClient: input.aiClient, now });
      if (candidate.action === "skip") {
        skipped++;
        const cause = candidate.cause_classification;
        warnings.push(`skill_synthesis_skipped:${cluster.id}:cause:${cause ?? "unclassified"}`);
        continue;
      }
      let reviewResult = await reviewSkillCandidateSemanticallyDetailed({ candidate, client: input.aiClient, now });
      let review = reviewResult.ok ? reviewResult.review : null;
      if (review) reviewed++;
      let decision = decideSemanticSkillAction(candidate, review ?? undefined, reviewResult.ok ? undefined : reviewResult.reason);
      let retryApplied = false;
      if (decision.action === "retry_synthesis") {
        retryApplied = true;
        candidate = await proposeSkillCandidate({ cluster, matches, now });
        reviewResult = await reviewSkillCandidateSemanticallyDetailed({ candidate, client: input.aiClient, now });
        review = reviewResult.ok ? reviewResult.review : null;
        if (review) reviewed++;
        decision = decideSemanticSkillAction(candidate, review ?? undefined, reviewResult.ok ? undefined : reviewResult.reason);
      }
      if (decision.action === "skip") {
        skipped++;
        warnings.push(`skill_synthesis_skipped:${cluster.id}:cause:${candidate.cause_classification ?? "unclassified"}`);
        continue;
      }
      const reviewedCandidate: SkillSynthesisCandidate = {
        ...candidate,
        review_hint: {
          suggested_decision: decision.action === "reject" ? "reject" : decision.action === "rewrite_as_update" ? "merge" : decision.action === "needs_human" ? "edit" : decision.action === "skill_optimize_description" ? "approve" : "approve",
          risk_notes: retryApplied ? ["skill_structural_retry:applied", ...decision.review_notes] : decision.review_notes,
        },
      };
      if (decision.action === "reject") rejected++;
      else if (decision.action === "needs_human" || decision.action === "rewrite_as_update" || decision.action === "retry_synthesis") needsHuman++;
      else approved++;
      candidates.push(reviewedCandidate);
      if (input.mode === "review" && decision.action !== "reject") {
        const path = `${protocolPaths.inboxProposals}/${reviewedCandidate.id}.json`;
        await writeJson(root, path, reviewedCandidate);
        outputs.push(path);
        if (review?.id) {
          const reviewPath = `${protocolPaths.inboxReviews}/${review.id}.json`;
          await writeJson(root, reviewPath, review);
          outputs.push(reviewPath);
        }
      }
    } catch (error) {
      warnings.push(`skill_synthesis_failed:${cluster.id}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const report = SkillSynthesisReportSchema.parse({
    id: makeId("skill-synthesis", now.replace(/[^0-9]/g, "").slice(0, 14) || "run"),
    protocol_version: PROTOCOL_VERSION,
    type: "skill_synthesis_report",
    authority_mode: input.authorityMode,
    mode: input.mode,
    enabled: true,
    signals: signals.length,
    rejected_signals: rejectedSignals,
    clusters: clusters.length,
    candidates: candidates.length,
    reviewed,
    approved,
    rejected,
    needs_human: needsHuman,
    skipped,
    promoted: 0,
    source_authority: sourceAuthority,
    outputs,
    warnings,
    created_at: now,
  });

  if (input.mode === "review") {
    const reportPath = `.praxisbase/reports/skill-synthesis/${report.id}.json`;
    await writeJson(root, reportPath, report);
    report.outputs.push(reportPath);
  }

  return { report, candidates };
}
