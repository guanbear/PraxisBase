import { z } from "zod";
import type { CuratedWikiProposal } from "./curation-model.js";
import {
  WikiHardBlockReasonSchema,
  WikiHumanRequiredReasonSchema,
  type WikiPromotionQualityAssessment,
} from "./curation-model.js";
import { isAllowedWikiPatchPath, containsPrivateMaterial } from "./lint.js";
import { assessBodyProvenanceConsistency } from "./provenance-consistency.js";
import { appearsToBeRawLog } from "../protocol/redact.js";

/** Context for quality assessment beyond the proposal itself. */
export interface PromotionQualityContext {
  /** Other pending proposals, used for duplicate source hash detection across creates. */
  otherProposals?: CuratedWikiProposal[];
  /** Whether an existing stable page was found matching this topic. */
  existingPageFound?: boolean;
  /** Related stable page paths that exist in kb/ or skills/. */
  relatedPaths?: string[];
  /** Related pages with slug/title/path detail. */
  relatedPages?: Array<{ slug: string; path: string; title: string }>;
  /** Required wikilinks that must appear in the proposal body. */
  requiredLinks?: Array<{ slug: string; label: string; path: string; reason: string }>;
  /** Merge candidate pages for ambiguous merge detection. */
  mergeCandidates?: Array<{ title: string; path: string; reason: string }>;
  /** Relationship reasons from the relationship planner. */
  relationshipReasons?: string[];
  /** Conflicts detected during topic planning. */
  conflicts?: Array<{ claim: string; source_refs: string[]; reason: string }>;
  /** Minimum confidence threshold for auto-promote (default 0.82). */
  minConfidence?: number;
  /** Minimum source count for auto-promote (default 2). */
  minSourceCount?: number;
}

// Template fallback sentences that should never appear in promoted pages.

const TEMPLATE_FALLBACK_SENTENCES = [
  "Re-run the failing workflow and confirm the original symptom is gone",
  "Keep this page updated when the same signature appears again",
  "Review the provenance and apply the repeated successful action",
];

// Reference-only detection helpers.

function isReferenceOnlyBody(body: string): boolean {
  const referenceTerms = /\b(official documentation|official docs|api reference|reference documentation|session initialization metadata|session boot|boot configuration|skill registry|sandbox mode|approval policy|provider config|system prompt)\b/i;
  const experienceTerms = /\b(fixed|resolved|verified|workaround|pitfall|decision|user preference|repair|lesson learned|failed attempt|success|error recovered|bug fix)\b/i;
  return referenceTerms.test(body) && !experienceTerms.test(body);
}

function isReferenceOnlyEvidence(proposal: CuratedWikiProposal): boolean {
  const text = [
    proposal.title,
    proposal.summary,
    proposal.body_markdown,
    ...proposal.provenance.map((p) => p.excerpt ?? ""),
  ].join("\n");
  return isReferenceOnlyBody(text);
}

// Raw JSON detection.

function containsRawJson(body: string): boolean {
  // Detect lines that look like raw JSON objects or arrays (not inside markdown code blocks)
  const lines = body.split("\n");
  let inCodeBlock = false;
  let jsonLineCount = 0;
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const trimmed = line.trim();
    if (/^\{["\w]/.test(trimmed) && /"\w+"\s*:/.test(trimmed)) {
      jsonLineCount++;
    }
    if (/^\[["\{]/.test(trimmed) && trimmed.endsWith("]") && trimmed.length > 20) {
      jsonLineCount++;
    }
  }
  return jsonLineCount >= 2;
}

// Raw transcript/log detection.

function containsRawTranscript(body: string): boolean {
  return appearsToBeRawLog(body);
}

// Template fallback detection.

function containsTemplateFallback(body: string): boolean {
  for (const sentence of TEMPLATE_FALLBACK_SENTENCES) {
    if (body.includes(sentence)) return true;
  }
  return false;
}

// Wiki structure detection.

function hasWikiStructure(body: string): boolean {
  const hasH1 = /^#\s+.+/m.test(body);
  const hasH2 = /^##\s+/m.test(body);
  return hasH1
    && hasH2
    && hasSection(body, ["Problem", "Context", "Symptoms", "When to Use"])
    && hasSection(body, ["Fix", "Steps", "Procedure", "Decision", "Operating Rule", "Applicability", "What To Do"])
    && hasSection(body, ["Verification", "Verify"])
    && hasSection(body, ["Reusable Lessons"])
    && hasSection(body, ["Provenance", "Sources"]);
}

function hasPromotableMarkdownShape(body: string): boolean {
  return /^#\s+.+/m.test(body);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasSection(body: string, names: string[]): boolean {
  return names.some((name) => new RegExp(`^##\\s+${escapeRegExp(name)}\\b`, "im").test(body));
}

function extractSection(body: string, names: string[]): string | undefined {
  const lines = body.split(/\r?\n/);
  let capturing = false;
  const captured: string[] = [];
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (capturing) break;
      capturing = names.some((name) => new RegExp(`^##\\s+${escapeRegExp(name)}\\b`, "i").test(line));
      continue;
    }
    if (capturing) captured.push(line);
  }
  const section = captured.join("\n").trim();
  return section.length > 0 ? section : undefined;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, " ").trim();
}

function isReusableTopicTitle(title: string, targetPath?: string): boolean {
  const normalized = normalizeText([title, targetPath].filter(Boolean).join(" "));
  if (normalized.length < 8) return false;
  const processStatus = /\b(successfully fixed|re approved|subsequent commit|follow up commit|approval passed|review passed|fixed and approved|staged sign off|signoff program|automated pr inspection run|run id|specific prs)\b/i;
  const sourceArtifact = /\b(sha256|raw vault|raw ref|wiki curated|candidate|capture codex|capture openclaw|text capture|source summary|agent distilled dreaming candidates|dreaming candidates)\b/i;
  const oneOffRunStatus = /\b(test run|smoke report|acceptance test run)\b.*\b(occurred|completed|interacted|recorded|tracking)\b/i;
  const runSpecificTitle = /\brun\s+[a-z0-9][a-z0-9 ]*\d[a-z0-9 ]{5,}\b/i;
  const mostlyHashOrRun = /\b[0-9a-f]{7,}\b/i.test(title) && /\b(commit|sha|run|id)\b/i.test(title);
  return !processStatus.test(normalized) && !sourceArtifact.test(normalized) && !oneOffRunStatus.test(normalized) && !runSpecificTitle.test(normalized) && !mostlyHashOrRun;
}

function hasConcreteApplicability(body: string, title: string): boolean {
  const section = extractSection(body, ["When to Use", "Applicability"]);
  if (!section) return true;
  const normalized = normalizeText(section);
  const normalizedTitle = normalizeText(title);
  if (/\bappears in agent work\b/i.test(section)) return false;
  if (/\btext[:_-]?capture\b|\bsource[_-]?summary\b|\bwiki[_-]?curated\b|\bsha256\b/i.test(section)) return false;
  const genericTitleTrigger = normalizedTitle.length > 0
    && normalized.replace(/^use this when\s+/, "").replace(/\s+appears$/, "") === normalizedTitle;
  if (genericTitleTrigger) return false;
  const meaningfulTrigger = /\b(after|before|when|if|during|fails?|failure|error|timeout|stuck|change|restart|repair|verify|login|auth|routing|configuration|配置|失败|超时|重启|修复|验证)\b/i;
  return meaningfulTrigger.test(section);
}

function hasSpecificAction(body: string, title: string): boolean {
  const section = extractSection(body, ["What To Do", "Fix", "Steps", "Procedure", "Decision", "Operating Rule"]);
  if (!section) return false;
  const lines = section
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  const normalizedTitle = normalizeText(title);
  const specificVerb = /\b(add|added|implement|implemented|apply|use|send|record|fix|fixed|refreshing|restart|run|check|verify|confirm|update|change|refresh|remove|route|merge|split|write|open|review|promote|fallback|rollback|重启|使用|应用|发送|记录|检查|验证|确认|更新|修改|刷新|回滚)\b/i;
  return lines.some((line) => {
    const normalizedLine = normalizeText(line);
    if (normalizedLine === normalizedTitle) return false;
    if (normalizedLine.length < 10) return false;
    return specificVerb.test(line);
  });
}

// Missing wikilinks detection.

function hasWikilinksOrRelated(body: string): boolean {
  return /\[\[[^\]]+\]\]/.test(body) || /^related:/m.test(body);
}

function extractWikilinkSlugs(body: string): Set<string> {
  const slugs = new Set<string>();
  for (const match of body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
    slugs.add(match[1].trim().toLowerCase());
  }
  return slugs;
}

// Duplicate source hash across create proposals.

function hasDuplicateSourceHashAcrossCreates(
  proposal: CuratedWikiProposal,
  others: CuratedWikiProposal[],
): boolean {
  if (proposal.action !== "create" && proposal.action !== "skill_create") return false;
  for (const hash of proposal.source_hashes) {
    for (const other of others) {
      if (other.id === proposal.id) continue;
      if (other.action !== "create" && other.action !== "skill_create") continue;
      if (other.source_hashes.includes(hash)) return true;
    }
  }
  return false;
}

function isOneOffRunReport(proposal: CuratedWikiProposal): boolean {
  const text = [
    proposal.target_path,
    proposal.title,
    proposal.summary,
    proposal.body_markdown,
    ...proposal.source_refs,
    ...proposal.provenance.map((p) => p.source_ref),
  ].join("\n");
  const hasExplicitRunId = /\brun[\s_-]?id\s*[:=]?\s*[a-z0-9][a-z0-9._-]{5,}\b/i.test(text);
  const hasReportTerm = /\b(?:acceptance[-_\s]?tests?|stability[-_\s]?smoke|smoke[-_\s]?tests?|run[-_\s]?report|test[-_\s]?report|replay[-_\s]?report|workflow[-_\s]?run|ci[-_\s]?run)\b/i.test(text);
  const hasSourceReportNamespace = /\b(?:report|reports|run|runs|workflow|job|build)[:/_-]+[a-z0-9._-]*\d[a-z0-9._-]{5,}\b/i.test(text);
  const hasMixedArtifactId = /\b[a-z][a-z0-9_-]*\d[a-z0-9_-]{5,}\b/i.test(text);
  const hasUuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(text);
  return hasExplicitRunId || (hasReportTerm && (hasMixedArtifactId || hasSourceReportNamespace || hasUuid));
}

// Main assessment function.

/**
 * Deterministic quality assessment for a wiki promotion proposal.
 *
 * Returns a WikiPromotionQualityAssessment with hard_blocks and human_required
 * reason arrays. The proposal may only auto-promote when both arrays are empty
 * and the review policy also allows it.
 */
export function assessWikiPromotionQuality(
  proposal: CuratedWikiProposal,
  context?: PromotionQualityContext,
): WikiPromotionQualityAssessment {
  const hardBlocks: z.infer<typeof WikiHardBlockReasonSchema>[] = [];
  const humanRequired: z.infer<typeof WikiHumanRequiredReasonSchema>[] = [];
  const body = proposal.body_markdown;
  const ctx = context ?? {};

  // Hard blocks cannot be auto-promoted under any circumstances.

  // 1. Missing provenance
  if (proposal.source_refs.length === 0 || proposal.source_hashes.length === 0 || proposal.provenance.length === 0) {
    hardBlocks.push("missing_provenance");
  }

  const provenanceConsistency = assessBodyProvenanceConsistency(
    body,
    proposal.provenance.map((item) => ({
      uri: item.source_ref,
      hash: item.source_hash,
    })),
  );
  if (!provenanceConsistency.ok) {
    hardBlocks.push("provenance_mismatch");
  }

  // 2. Unsafe target path
  if (!isAllowedWikiPatchPath(proposal.target_path)) {
    hardBlocks.push("unsafe_path");
  }

  // 3. Private material
  if (containsPrivateMaterial(body)) {
    hardBlocks.push("private_material");
  }

  // 4. Raw JSON in body
  if (containsRawJson(body)) {
    hardBlocks.push("raw_json");
  }

  // 5. Raw transcript/log body
  if (containsRawTranscript(body)) {
    hardBlocks.push("raw_transcript");
  }

  // 6. Template fallback text
  if (containsTemplateFallback(body)) {
    hardBlocks.push("template_fallback");
  }

  // 7. Reference-only / official-doc-only content
  if (isReferenceOnlyEvidence(proposal)) {
    hardBlocks.push("reference_only");
  }

  // 8. Duplicate source hash across multiple create proposals
  if (ctx.otherProposals && hasDuplicateSourceHashAcrossCreates(proposal, ctx.otherProposals)) {
    hardBlocks.push("duplicate_source_hash");
  }

  // 9. Body missing wiki structure (no H1 or no H2)
  if (!hasWikiStructure(body)) {
    hardBlocks.push("body_missing_wiki_structure");
  }

  // 10. Create action when existing page was found
  if (
    (proposal.action === "create" || proposal.action === "skill_create")
    && ctx.existingPageFound === true
  ) {
    hardBlocks.push("create_with_existing_page");
  }

  // 11. Semantic wiki quality: stable pages must be reusable guidance, not
  // process status or source-id-driven summaries.
  if (!isReusableTopicTitle(proposal.title, proposal.target_path)) {
    hardBlocks.push("non_reusable_topic");
  }
  if (!hasConcreteApplicability(body, proposal.title)) {
    hardBlocks.push("generic_applicability");
  }
  if (!hasSpecificAction(body, proposal.title)) {
    hardBlocks.push("non_specific_action");
  }

  // Human-required gates can be promoted only after human review.

  // 1. Weak single source
  const minSourceCount = ctx.minSourceCount ?? 2;
  if (proposal.source_count < minSourceCount) {
    const hasStrongSignal = proposal.guards.some(
      (g) => g.id === "experience_signal" && g.ok,
    ) && proposal.guards.some(
      (g) => g.id === "verification_or_lesson" && g.ok,
    );
    if (!hasStrongSignal) {
      humanRequired.push("weak_single_source");
    }
  }

  // 1b. One-off run/report pages are evidence, not stable agent guidance.
  if (proposal.source_count < 2 && isOneOffRunReport(proposal)) {
    humanRequired.push("one_off_run_report");
  }

  // 2. Low confidence
  const minConfidence = ctx.minConfidence ?? 0.82;
  if (proposal.confidence < minConfidence) {
    humanRequired.push("low_confidence");
  }

  // 3. Unresolved conflict
  if (ctx.conflicts && ctx.conflicts.length > 0) {
    humanRequired.push("unresolved_conflict");
  }

  // 4. Missing required wikilinks (precise check when requiredLinks is populated)
  const bodySlugs = extractWikilinkSlugs(body);
  if (ctx.requiredLinks && ctx.requiredLinks.length > 0) {
    const missing = ctx.requiredLinks.filter(
      (link) => !bodySlugs.has(link.slug.toLowerCase()),
    );
    if (missing.length > 0) {
      humanRequired.push("missing_wikilinks");
    }
  } else if (ctx.relatedPages && ctx.relatedPages.length > 0) {
    const relatedSlugs = new Set(ctx.relatedPages.map((page) => page.slug.toLowerCase()));
    const hasResolvableRelatedLink = Array.from(bodySlugs).some((slug) => relatedSlugs.has(slug));
    if (!hasResolvableRelatedLink) {
      humanRequired.push("missing_wikilinks");
    }
  } else if (ctx.relatedPaths && ctx.relatedPaths.length > 0 && !hasWikilinksOrRelated(body)) {
    humanRequired.push("missing_wikilinks");
  }

  // 5. Team/org/global scope
  if (proposal.scope === "team" || proposal.scope === "org" || proposal.scope === "global") {
    humanRequired.push("team_or_global_scope");
  }

  // 6. Skill or policy target
  if (proposal.page_kind === "skill") {
    humanRequired.push("skill_or_policy_target");
  }

  // 7. Destructive action (archive/supersede)
  if (proposal.action === "archive" || proposal.action === "supersede") {
    humanRequired.push("destructive_action");
  }
  if (proposal.lifecycle !== undefined && proposal.lifecycle !== "active") {
    humanRequired.push("destructive_action");
  }

  // 8. Ambiguous merge target
  if (ctx.mergeCandidates && ctx.mergeCandidates.length > 1) {
    humanRequired.push("ambiguous_merge_target");
  }
  if (ctx.relationshipReasons) {
    if (ctx.relationshipReasons.includes("ambiguous_merge_target")) {
      humanRequired.push("ambiguous_merge_target");
    }
    if (ctx.relationshipReasons.includes("multiple_canonical_targets")) {
      humanRequired.push("multiple_canonical_targets");
    }
  }

  return {
    topic_key: proposal.id,
    hard_blocks: hardBlocks,
    human_required: [...new Set(humanRequired)],
    passed: hardBlocks.length === 0 && humanRequired.length === 0,
  };
}

// Promote-time guard helpers.

function markdownTitle(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  const title = match?.[1]?.trim();
  return title && title.length > 0 ? title : undefined;
}

/**
 * Final promote-time guard. Rejects content that has raw JSON, template
 * fallback text, or missing wiki shape even if an old proposal bypassed
 * the review policy. Returns an error message or null if the content passes.
 */
export function promotionTimeGuard(content: string): string | null {
  if (containsRawJson(content)) {
    return "Refusing to promote content containing raw JSON into stable knowledge.";
  }
  if (containsTemplateFallback(content)) {
    return "Refusing to promote content containing template fallback text into stable knowledge.";
  }
  if (!hasPromotableMarkdownShape(content)) {
    return "Refusing to promote content missing wiki structure (H1 heading) into stable knowledge.";
  }
  const title = markdownTitle(content);
  if (!title || normalizeText(title) === "title" || !isReusableTopicTitle(title)) {
    return "Refusing to promote content whose title is not a reusable wiki topic.";
  }
  if (!hasConcreteApplicability(content, title)) {
    return "Refusing to promote content with generic applicability instead of a concrete trigger.";
  }
  if (!hasSpecificAction(content, title)) {
    return "Refusing to promote content without a specific reusable action.";
  }
  return null;
}
