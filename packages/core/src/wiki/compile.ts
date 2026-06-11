import { PROTOCOL_VERSION } from "../protocol/types.js";
import { makeId } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import { writeJson } from "../store/file-store.js";
import { makeWikiSlug } from "./model.js";
import type { WikiSource } from "./model.js";
import { collectWikiSources } from "./collect.js";
import { readWikiState, getChangedWikiSources, writeWikiState, markWikiSourcesCompiled } from "./state.js";
import { isAllowedWikiPatchPath, containsPrivateMaterial, validateBodyShrink } from "./lint.js";
import { analyzeWikiSource } from "./analyze.js";
import type { WikiSourceAnalysis } from "../protocol/schemas.js";

export interface CompileWikiOptions {
  mode: "dry-run" | "review";
  now?: string;
}

export interface WikiCompileReport {
  id: string;
  protocol_version: typeof PROTOCOL_VERSION;
  type: "wiki_compile_report";
  mode: "dry-run" | "review";
  sources_read: number;
  changed_sources: number;
  candidate_ids: string[];
  source_analysis: WikiSourceAnalysis[];
  exceptions: number;
  skipped_sources: number;
  changed_stable_knowledge: false;
  created_at: string;
}

const CANDIDATE_KINDS = new Set<WikiSource["kind"]>(["capture", "native_memory", "episode", "stable_kb", "external_ref"]);

interface CandidateGroupSource {
  source: WikiSource;
  analysis: WikiSourceAnalysis;
}

interface CandidateGroup {
  candidateId: string;
  patchPath: string;
  sources: CandidateGroupSource[];
}

function isCandidateSource(source: WikiSource): boolean {
  if (!CANDIDATE_KINDS.has(source.kind)) return false;
  if (source.kind === "external_ref") {
    return hasDistilledSections([source.summary, source.body].filter(Boolean).join("\n"));
  }
  return true;
}

function isOperationalNoiseSource(source: WikiSource): boolean {
  const text = [source.summary, source.body].filter(Boolean).join("\n").trim();
  if (!text) return true;
  if (/^\s*\{[\s\S]*"type"\s*:\s*"session_meta"/.test(text)) return true;
  if (/^\s*\{[\s\S]*"base_instructions"\s*:/.test(text)) return true;
  if (/^\s*openclaw:unknown\s*$/i.test(text)) return true;
  if (/^#\s*Deep Sleep\b/i.test(text) && /\bPromoted\s+0\s+candidate\(s\)/i.test(text)) return true;
  return false;
}

function nonSourceSpecificSignatures(analysis: WikiSourceAnalysis): string[] {
  return analysis.signatures.filter((signature) => !/^(capture|native_memory|episode|stable_kb|external_ref|proposal|review|skill):/.test(signature));
}

export async function compileWiki(root: string, options: CompileWikiOptions): Promise<WikiCompileReport> {
  const now = options.now ?? new Date().toISOString();
  const mode = options.mode;

  const sources = await collectWikiSources(root);
  const sourcesRead = sources.length;
  const sourceAnalysis = sources.map((source) => analyzeWikiSource(source));
  const sourceAnalysisById = new Map(sourceAnalysis.map((analysis) => [analysis.source_id, analysis]));

  const state = await readWikiState(root);

  const incomingHashes = sources.map((s) => ({ id: s.id, source_hash: s.source_hash }));
  const changed = getChangedWikiSources(state, incomingHashes);
  const changedIds = new Set(changed.map((c) => c.id));

  const candidateIds: string[] = [];
  const compiledEntries: Array<{
    id: string;
    source_hash: string;
    candidate_ids: string[];
    page_ids: string[];
  }> = [];

  let exceptions = 0;
  let skippedSources = 0;
  const candidateByPath = new Map<string, CandidateGroup>();
  const candidateGroups: CandidateGroup[] = [];

  for (const source of sources) {
    if (!changedIds.has(source.id)) continue;
    const analysis = sourceAnalysisById.get(source.id) ?? analyzeWikiSource(source);
    if (!isCandidateSource(source)) {
      skippedSources++;
      continue;
    }

    if (isOperationalNoiseSource(source)) {
      skippedSources++;
      continue;
    }

    const privateScanText = [source.summary, source.body].filter(Boolean).join("\n");
    if (
      (privateScanText && containsPrivateMaterial(privateScanText))
      || analysis.risks.includes("private_material")
      || analysis.risks.includes("weak_provenance")
    ) {
      exceptions++;
      if (mode === "review") {
        await writeHumanRequiredException(root, source, now);
      }
      continue;
    }

    const patchPath = source.kind === "stable_kb" && source.path
      ? source.path
      : analysis.candidate_path ?? `kb/notes/wiki-${makeWikiSlug(source.title)}.md`;

    if (!isAllowedWikiPatchPath(patchPath)) {
      exceptions++;
      if (mode === "review") {
        await writeHumanRequiredException(root, source, now, "Unsafe wiki candidate path", { candidate_path: patchPath });
      }
      continue;
    }

    const existingCandidate = candidateByPath.get(patchPath);
    if (existingCandidate) {
      const existingSignatures = existingCandidate.sources.flatMap((entry) => nonSourceSpecificSignatures(entry.analysis));
      const sharedSignatures = intersectStrings(existingSignatures, nonSourceSpecificSignatures(analysis));
      if (sharedSignatures.length === 0) {
        exceptions++;
        if (mode === "review") {
          await writeConflictException(root, source, now, {
            candidate_path: patchPath,
            prior_source_id: existingCandidate.sources[0].source.id,
            prior_signatures: existingCandidate.sources.flatMap((entry) => entry.analysis.signatures),
            current_signatures: analysis.signatures,
          });
        }
        continue;
      }

      existingCandidate.sources.push({ source, analysis });
      continue;
    }

    const candidateId = makeId("wiki-proposal", `${patchPath}:${source.source_hash}`);
    const group: CandidateGroup = { candidateId, patchPath, sources: [{ source, analysis }] };
    candidateByPath.set(patchPath, group);
    candidateGroups.push(group);
  }

  for (const group of candidateGroups) {
    const primary = group.sources[0];
    const patchContent = buildPatchContent(group, now);
    const shrinkCheck = validateBodyShrink(primary.source.body ?? "", patchContent, primary.source.kind === "stable_kb" ? "patch" : "create");
    if (!shrinkCheck.ok) {
      exceptions++;
      if (mode === "review") {
        await writeHumanRequiredException(root, primary.source, now, "Wiki candidate body shrink exceeds safe threshold", shrinkCheck);
      }
      continue;
    }

    candidateIds.push(group.candidateId);

    if (mode === "review") {
      await writeJson(
        root,
        `${protocolPaths.inboxProposals}/${group.candidateId}.json`,
        {
          id: group.candidateId,
          protocol_version: PROTOCOL_VERSION,
          type: "wiki_proposal_candidate",
          source_id: primary.source.id,
          source_kind: primary.source.kind,
          source_hash: group.sources.map((entry) => entry.source.source_hash).join(","),
          changed_stable_knowledge: false,
          patch: {
            path: group.patchPath,
            content: patchContent,
          },
          created_at: now,
        }
      );

      for (const entry of group.sources) {
        compiledEntries.push({
          id: entry.source.id,
          source_hash: entry.source.source_hash,
          candidate_ids: [group.candidateId],
          page_ids: [],
        });
      }
    }
  }

  const reportId = makeId("wiki-compile-report", now);
  const report: WikiCompileReport = {
    id: reportId,
    protocol_version: PROTOCOL_VERSION,
    type: "wiki_compile_report",
    mode,
    sources_read: sourcesRead,
    changed_sources: changedIds.size,
    candidate_ids: candidateIds,
    source_analysis: sourceAnalysis,
    exceptions,
    skipped_sources: skippedSources,
    changed_stable_knowledge: false,
    created_at: now,
  };

  await writeJson(
    root,
    `${protocolPaths.reportsWikiCompile}/${reportId}.json`,
    report
  );

  if (mode === "review" && compiledEntries.length > 0) {
    const nextState = markWikiSourcesCompiled(state, compiledEntries, now);
    await writeWikiState(root, nextState);
  }

  return report;
}

function intersectStrings(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

async function writeHumanRequiredException(
  root: string,
  source: WikiSource,
  now: string,
  reason = "Private or raw material detected in wiki source",
  details: Record<string, unknown> = {}
): Promise<void> {
  const id = makeId("wiki-exception", source.id);
  await writeJson(
    root,
    `${protocolPaths.exceptionsHumanRequired}/${id}.json`,
    {
      id,
      protocol_version: PROTOCOL_VERSION,
      type: "exception_record",
      category: "human_required",
      source_id: source.id,
      reason,
      details: { source_kind: source.kind, source_title: source.title, ...details },
      created_at: now,
    }
  );
}

async function writeConflictException(
  root: string,
  source: WikiSource,
  now: string,
  details: Record<string, unknown>
): Promise<void> {
  const id = makeId("wiki-conflict", source.id);
  await writeJson(
    root,
    `${protocolPaths.exceptionsConflicts}/${id}.json`,
    {
      id,
      protocol_version: PROTOCOL_VERSION,
      type: "exception_record",
      category: "conflict",
      source_id: source.id,
      reason: "Duplicate wiki candidate path without shared signatures",
      details: { source_kind: source.kind, source_title: source.title, ...details },
      created_at: now,
    }
  );
}

function hasDistilledSections(text: string): boolean {
  return /^Suggested Wiki Kind:\s*/im.test(text) || /^##\s+(Problem|Actions|Verification|Reusable Lessons|Sources)\s*$/im.test(text);
}

function extractDistilledSummary(text: string): string | undefined {
  const match = text.match(/^Summary:\s*(.+)$/im);
  return match?.[1]?.trim();
}

function distilledBody(source: WikiSource): string | undefined {
  const text = [source.summary, source.body].filter(Boolean).join("\n").trim();
  if (!hasDistilledSections(text)) return undefined;

  const lines: string[] = [];
  const summary = extractDistilledSummary(text);
  if (summary) lines.push(summary, "");

  const sectionNames = ["Problem", "Context", "Actions", "Failed Attempts", "Verification", "Reusable Lessons", "Risks", "Sources"];
  const escaped = sectionNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`^##\\s+(${escaped})\\s*$([\\s\\S]*?)(?=^##\\s+(?:${escaped}|Skill Candidate)\\s*$|(?![\\s\\S]))`, "gim");

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const title = match[1].trim();
    const body = match[2].trim();
    if (!body) continue;
    lines.push(`## ${title}`, body, "");
  }

  if (!lines.some((line) => line === "## Sources")) {
    lines.push("## Sources", `- ${source.source_ref ?? source.id}`, `- ${source.source_hash}`, "");
  }

  return lines.join("\n").trim();
}

function buildPatchContent(group: CandidateGroup, now: string): string {
  const primary = group.sources[0];
  const source = primary.source;
  const analysis = primary.analysis;
  const title = curatedTitle(group);
  const slug = makeWikiSlug(title);
  const knowledgeType = analysis.suggested_page_kind === "skill_seed" ? "note" : analysis.suggested_page_kind;
  const frontmatter = [
    "---",
    `id: wiki-${slug}`,
    `protocol_version: "${PROTOCOL_VERSION}"`,
    `type: ${knowledgeType}`,
    `knowledge_type: ${knowledgeType}`,
    `scope: ${source.scope}`,
    "status: draft",
    "maturity: draft",
    "sources:",
    ...group.sources.flatMap((entry) => [
      `  - uri: "${entry.source.source_ref ?? entry.source.id}"`,
      `    hash: "${entry.source.source_hash}"`,
    ]),
    `source_count: ${group.sources.length}`,
    `confidence: ${curatedConfidence(group)}`,
    `updated_at: "${now}"`,
    "---",
  ].join("\n");

  const body = curatedBody(group);

  return `${frontmatter}\n# ${title}\n\n${body}\n`;
}

function curatedTitle(group: CandidateGroup): string {
  const pathSlug = group.patchPath.split("/").pop()?.replace(/\.md$/, "");
  const title = pathSlug ? pathSlug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : group.sources[0].source.title;
  return title || group.sources[0].source.title;
}

function curatedConfidence(group: CandidateGroup): number {
  const max = Math.max(...group.sources.map((entry) => entry.analysis.confidence));
  const evidenceBonus = Math.min(group.sources.length - 1, 3) * 0.04;
  return Math.round(Math.min(0.98, max + evidenceBonus) * 100) / 100;
}

function sourceSummary(source: WikiSource): string {
  return (distilledBody(source) ?? source.summary ?? source.title).trim();
}

function curatedBody(group: CandidateGroup): string {
  if (group.sources.length === 1) return sourceSummary(group.sources[0].source);

  const primaryBody = sourceSummary(group.sources[0].source);
  const evidence = group.sources
    .map((entry) => `- ${entry.source.source_ref ?? entry.source.id} (${entry.source.source_hash})`)
    .join("\n");
  const supporting = group.sources
    .map((entry) => `- ${entry.source.summary || entry.source.title}`)
    .join("\n");

  return [
    "## Synthesis",
    primaryBody,
    "",
    "## Supporting Evidence",
    supporting,
    "",
    "## Sources",
    evidence,
  ].join("\n");
}
