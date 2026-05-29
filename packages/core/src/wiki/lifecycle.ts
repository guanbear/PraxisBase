import { makeId, computeHash } from "../protocol/id.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { collectWikiPages } from "./render-site.js";
import type { WikiSitePage } from "./site-model.js";
import {
  LifecycleDecisionSchema,
  LifecycleObservationSchema,
  LifecycleProposalSchema,
  KnowledgeLifecycleReportSchema,
  type LifecycleObservation,
  type LifecycleProposal,
  type KnowledgeLifecycleReport,
} from "../protocol/schemas.js";

const STALE_THRESHOLD_MS = 180 * 24 * 60 * 60 * 1000;

interface LifecycleAnalysisOptions {
  now?: string;
}

function toObservation(page: WikiSitePage): LifecycleObservation {
  const sourceRefs = page.provenance_refs?.map((r) => r.uri).filter((u): u is string => Boolean(u)) ?? [];
  const sourceHashes = page.provenance_refs?.map((r) => r.hash).filter((h): h is string => Boolean(h)) ?? [];
  return LifecycleObservationSchema.parse({
    page_id: page.id,
    page_path: page.path,
    maturity: page.maturity ?? "draft",
    scope: page.scope,
    source_refs: sourceRefs,
    source_hashes: sourceHashes,
    reference_count: page.reference_count ?? 0,
    updated_at: page.updated_at,
    superseded_by: page.superseded_by ?? null,
  });
}

function analyzeObservation(obs: LifecycleObservation, nowMs: number, allObs: LifecycleObservation[]): LifecycleProposal | null {
  if (obs.superseded_by) {
    return LifecycleProposalSchema.parse({
      page_id: obs.page_id,
      page_path: obs.page_path,
      decision: "archive",
      reasons: [`Superseded by ${obs.superseded_by}`],
      current_maturity: obs.maturity,
      proposed_maturity: "archived",
      source_refs: obs.source_refs,
      source_hashes: obs.source_hashes,
    });
  }

  if (obs.maturity === "archived") {
    return LifecycleProposalSchema.parse({
      page_id: obs.page_id,
      page_path: obs.page_path,
      decision: "no_op",
      reasons: ["Archived knowledge is inactive."],
      current_maturity: obs.maturity,
      source_refs: [],
      source_hashes: [],
    });
  }

  if (obs.maturity === "draft") {
    if (obs.source_refs.length >= 2 || obs.reference_count > 0) {
      return LifecycleProposalSchema.parse({
        page_id: obs.page_id,
        page_path: obs.page_path,
        decision: "promote",
        reasons: [
          obs.source_refs.length >= 2
            ? `${obs.source_refs.length} provenance refs meet threshold.`
            : `Reference count ${obs.reference_count} indicates usage.`,
        ],
        current_maturity: obs.maturity,
        proposed_maturity: "verified",
        source_refs: obs.source_refs,
        source_hashes: obs.source_hashes,
      });
    }
    return LifecycleProposalSchema.parse({
      page_id: obs.page_id,
      page_path: obs.page_path,
      decision: "no_op",
      reasons: ["Draft without sufficient provenance."],
      current_maturity: obs.maturity,
      source_refs: [],
      source_hashes: [],
    });
  }

  if (obs.maturity === "verified" || obs.maturity === "proven") {
    const updatedMs = obs.updated_at ? Date.parse(obs.updated_at) : Number.NaN;
    const ageMs = Number.isFinite(updatedMs) ? nowMs - updatedMs : 0;
    const isStale = ageMs > STALE_THRESHOLD_MS;

    const contradiction = allObs.find((other) => {
      if (other.page_id === obs.page_id) return false;
      const refsOverlap = obs.source_hashes.some((h) => other.source_hashes.includes(h));
      return refsOverlap && other.superseded_by === obs.page_id;
    });

    if (isStale || obs.superseded_by) {
      return LifecycleProposalSchema.parse({
        page_id: obs.page_id,
        page_path: obs.page_path,
        decision: "decay",
        reasons: isStale
          ? [`Not updated in ${Math.round(ageMs / (24 * 60 * 60 * 1000))} days.`]
          : [`Superseded by ${obs.superseded_by}`],
        current_maturity: obs.maturity,
        proposed_maturity: "stale",
        source_refs: obs.source_refs,
        source_hashes: obs.source_hashes,
      });
    }

    if (contradiction) {
      return LifecycleProposalSchema.parse({
        page_id: obs.page_id,
        page_path: obs.page_path,
        decision: "conflict",
        reasons: [`Contradicts ${contradiction.page_id} via shared source hashes.`],
        current_maturity: obs.maturity,
        source_refs: obs.source_refs,
        source_hashes: obs.source_hashes,
      });
    }

    return LifecycleProposalSchema.parse({
      page_id: obs.page_id,
      page_path: obs.page_path,
      decision: "no_op",
      reasons: ["Active knowledge with no lifecycle signals."],
      current_maturity: obs.maturity,
      source_refs: [],
      source_hashes: [],
    });
  }

  if (obs.maturity === "stale") {
    const updatedMs = obs.updated_at ? Date.parse(obs.updated_at) : Number.NaN;
    const ageMs = Number.isFinite(updatedMs) ? nowMs - updatedMs : 0;
    if (ageMs > STALE_THRESHOLD_MS * 2) {
      return LifecycleProposalSchema.parse({
        page_id: obs.page_id,
        page_path: obs.page_path,
        decision: "archive",
        reasons: [`Stale for over ${Math.round(ageMs / (24 * 60 * 60 * 1000))} days; propose archival.`],
        current_maturity: obs.maturity,
        proposed_maturity: "archived",
        source_refs: obs.source_refs,
        source_hashes: obs.source_hashes,
      });
    }
    return LifecycleProposalSchema.parse({
      page_id: obs.page_id,
      page_path: obs.page_path,
      decision: "no_op",
      reasons: ["Stale but within review window."],
      current_maturity: obs.maturity,
      source_refs: [],
      source_hashes: [],
    });
  }

  return null;
}

export function buildKnowledgeLifecycleReport(pages: WikiSitePage[], options?: LifecycleAnalysisOptions): KnowledgeLifecycleReport {
  const now = options?.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);

  const observations = pages.map(toObservation);
  const proposals: LifecycleProposal[] = [];

  for (const obs of observations) {
    const proposal = analyzeObservation(obs, nowMs, observations);
    if (proposal) proposals.push(proposal);
  }

  return KnowledgeLifecycleReportSchema.parse({
    id: makeId("lifecycle", computeHash(JSON.stringify({ observations: observations.map((o) => o.page_id).sort(), now }))),
    protocol_version: PROTOCOL_VERSION,
    type: "knowledge_lifecycle_report",
    observations,
    proposals,
    changed_stable_knowledge: false,
    warnings: [],
    created_at: now,
  });
}

export async function analyzeKnowledgeLifecycle(root: string, options?: LifecycleAnalysisOptions): Promise<KnowledgeLifecycleReport> {
  const pages = await collectWikiPages(root);
  return buildKnowledgeLifecycleReport(pages, options);
}
