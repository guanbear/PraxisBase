import { computeHash, slugifyId } from "../protocol/id.js";
import type { SkillCueFamily, SkillSignalCandidate, SkillSignalScope } from "./skill-signals.js";

export interface SkillSignalCluster {
  id: string;
  cluster_key: string;
  title: string;
  trigger: string;
  procedure: string[];
  source_refs: string[];
  source_hashes: string[];
  evidence_ids: string[];
  source_count: number;
  confidence: number;
  scope: SkillSignalScope;
  related_wiki_paths: string[];
  cue_families: SkillCueFamily[];
}

function normalize(value: string): string {
  return value.toLowerCase()
    .replace(/\b(pr|mr|issue|ticket|run|session|build|job)[-_ #]?\d{2,}\b/g, "")
    .replace(/\b[0-9a-f]{7,40}\b/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clusterKey(signal: SkillSignalCandidate): string {
  const procedure = signal.procedure.map(normalize).join("|");
  return computeHash(`${normalize(signal.trigger)}|${procedure}`).slice(7, 23);
}

function isEligible(signals: SkillSignalCandidate[], confidence: number): boolean {
  const sourceCount = new Set(signals.map((signal) => signal.source_hash)).size;
  if (sourceCount >= 2 && confidence >= 0.78) return true;
  return signals.some((signal) => signal.cue_family === "explicit_user_correction" && signal.confidence >= 0.86);
}

export function clusterSkillSignals(
  signals: SkillSignalCandidate[],
  options: { maxClusters?: number } = {},
): SkillSignalCluster[] {
  const buckets = new Map<string, SkillSignalCandidate[]>();
  for (const signal of signals) {
    const key = clusterKey(signal);
    const bucket = buckets.get(key) ?? [];
    bucket.push(signal);
    buckets.set(key, bucket);
  }

  const clusters: SkillSignalCluster[] = [];
  for (const [key, bucket] of buckets) {
    const confidence = Math.min(1, bucket.reduce((sum, signal) => sum + signal.confidence, 0) / bucket.length + Math.min(0.08, (bucket.length - 1) * 0.03));
    if (!isEligible(bucket, confidence)) continue;
    const first = bucket.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))[0];
    const sourcePairs = Array.from(
      new Map(
        bucket.map((signal) => [
          `${signal.source_ref}\u0000${signal.source_hash}`,
          { ref: signal.source_ref, hash: signal.source_hash },
        ]),
      ).values(),
    ).sort((a, b) => a.ref.localeCompare(b.ref) || a.hash.localeCompare(b.hash));
    const sourceRefs = sourcePairs.map((pair) => pair.ref);
    const sourceHashes = sourcePairs.map((pair) => pair.hash);
    const evidenceIds = Array.from(new Set(bucket.map((signal) => signal.evidence_id))).sort();
    clusters.push({
      id: `skill_cluster_${key}`,
      cluster_key: key,
      title: first.title,
      trigger: first.trigger,
      procedure: first.procedure,
      source_refs: sourceRefs,
      source_hashes: sourceHashes,
      evidence_ids: evidenceIds,
      source_count: sourceHashes.length,
      confidence,
      scope: first.scope,
      related_wiki_paths: Array.from(new Set(bucket.flatMap((signal) => signal.related_wiki_paths))).sort(),
      cue_families: Array.from(new Set(bucket.map((signal) => signal.cue_family))).sort(),
    });
  }

  return clusters
    .sort((a, b) => b.confidence - a.confidence || slugifyId(a.title).localeCompare(slugifyId(b.title)))
    .slice(0, options.maxClusters ?? 8);
}
