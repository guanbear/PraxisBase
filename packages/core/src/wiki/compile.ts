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

const CANDIDATE_KINDS = new Set<WikiSource["kind"]>(["capture", "native_memory", "episode", "stable_kb"]);

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
  const candidateByPath = new Map<string, { source: WikiSource; analysis: WikiSourceAnalysis; candidateId: string }>();

  for (const source of sources) {
    if (!changedIds.has(source.id)) continue;
    const analysis = sourceAnalysisById.get(source.id) ?? analyzeWikiSource(source);
    if (!CANDIDATE_KINDS.has(source.kind)) {
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

    const candidateId = makeId("wiki-proposal", source.id + ":" + source.source_hash);
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
      const sharedSignatures = intersectStrings(existingCandidate.analysis.signatures, analysis.signatures);
      if (sharedSignatures.length === 0) {
        exceptions++;
        if (mode === "review") {
          await writeConflictException(root, source, now, {
            candidate_path: patchPath,
            prior_source_id: existingCandidate.source.id,
            prior_signatures: existingCandidate.analysis.signatures,
            current_signatures: analysis.signatures,
          });
        }
        continue;
      }

      if (mode === "review") {
        compiledEntries.push({
          id: source.id,
          source_hash: source.source_hash,
          candidate_ids: [existingCandidate.candidateId],
          page_ids: [],
        });
      }
      continue;
    }

    const patchContent = buildPatchContent(source, now);
    const shrinkCheck = validateBodyShrink(source.body ?? "", patchContent, source.kind === "stable_kb" ? "patch" : "create");
    if (!shrinkCheck.ok) {
      exceptions++;
      if (mode === "review") {
        await writeHumanRequiredException(root, source, now, "Wiki candidate body shrink exceeds safe threshold", shrinkCheck);
      }
      continue;
    }

    candidateIds.push(candidateId);
    candidateByPath.set(patchPath, { source, analysis, candidateId });

    if (mode === "review") {
      await writeJson(
        root,
        `${protocolPaths.inboxProposals}/${candidateId}.json`,
        {
          id: candidateId,
          protocol_version: PROTOCOL_VERSION,
          type: "wiki_proposal_candidate",
          source_id: source.id,
          source_kind: source.kind,
          source_hash: source.source_hash,
          changed_stable_knowledge: false,
          patch: {
            path: patchPath,
            content: patchContent,
          },
          created_at: now,
        }
      );

      compiledEntries.push({
        id: source.id,
        source_hash: source.source_hash,
        candidate_ids: [candidateId],
        page_ids: [],
      });
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

function buildPatchContent(source: WikiSource, now: string): string {
  const slug = makeWikiSlug(source.title);
  const frontmatter = [
    "---",
    `id: wiki-${slug}`,
    `protocol_version: "${PROTOCOL_VERSION}"`,
    "type: note",
    "knowledge_type: note",
    `scope: ${source.scope}`,
    "status: draft",
    "maturity: draft",
    "sources:",
    `  - uri: "${source.source_ref ?? source.id}"`,
    `    hash: "${source.source_hash}"`,
    "confidence: 0.5",
    `updated_at: "${now}"`,
    "---",
  ].join("\n");

  const body = source.summary || source.title;

  return `${frontmatter}\n# ${source.title}\n\n${body}\n`;
}
