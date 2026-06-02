import { readdir } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { AnyEpisodeSchema } from "../protocol/schemas.js";
import { readJson, readText, writeText } from "../store/file-store.js";

export interface GovernancePolicy {
  draft_to_verified_references: number;
  verified_to_proven_environments: number;
  verified_idle_days: number;
  proven_idle_days: number;
  draft_idle_days: number;
}

interface ReferenceStats {
  count: number;
  environments: Set<string>;
  latestReferencedAt: string;
}

export interface GovernanceApplyResult {
  referenced_objects: number;
  maturity_promotions: number;
  maturity_decays: number;
}

const DEFAULT_POLICY: GovernancePolicy = {
  draft_to_verified_references: 1,
  verified_to_proven_environments: 2,
  verified_idle_days: 180,
  proven_idle_days: 365,
  draft_idle_days: 365,
};

async function listFiles(root: string, dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(join(root, dir), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = join(dir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        results.push(...await listFiles(root, relativePath));
      } else {
        results.push(relativePath);
      }
    }
  } catch {
    // Optional directories may not exist.
  }
  return results;
}

async function readGovernancePolicy(root: string): Promise<GovernancePolicy> {
  try {
    const configured = await readJson<Partial<GovernancePolicy>>(root, ".praxisbase/policies/governance.json");
    return {
      ...DEFAULT_POLICY,
      ...Object.fromEntries(Object.entries(configured).filter(([, value]) => typeof value === "number" && Number.isFinite(value))),
    };
  } catch {
    return DEFAULT_POLICY;
  }
}

function successfulOutcome(value: string): boolean {
  return value === "success" || value === "confirmed";
}

async function collectReferenceStats(root: string): Promise<Map<string, ReferenceStats>> {
  const stats = new Map<string, ReferenceStats>();
  const episodeFiles = [
    ...(await listFiles(root, ".praxisbase/inbox/episodes")),
    ...(await listFiles(root, ".praxisbase/outbox/episodes")),
  ].filter((file) => file.endsWith(".json"));

  for (const file of episodeFiles) {
    const episode = AnyEpisodeSchema.safeParse(await readJson(root, file));
    if (!episode.success) continue;
    const data = episode.data;
    if (!successfulOutcome(data.result)) continue;
    for (const ref of data.knowledge_references) {
      if (!successfulOutcome(ref.outcome)) continue;
      const existing = stats.get(ref.path) ?? {
        count: 0,
        environments: new Set<string>(),
        latestReferencedAt: data.created_at,
      };
      existing.count += 1;
      existing.environments.add(data.environment_id);
      if (Date.parse(data.created_at) >= Date.parse(existing.latestReferencedAt)) {
        existing.latestReferencedAt = data.created_at;
      }
      stats.set(ref.path, existing);
    }
  }
  return stats;
}

function daysBetween(now: string, then: string | undefined): number {
  const nowMs = Date.parse(now);
  const thenMs = then ? Date.parse(then) : Number.NaN;
  if (!Number.isFinite(nowMs) || !Number.isFinite(thenMs)) return 0;
  return Math.max(0, Math.floor((nowMs - thenMs) / (24 * 60 * 60 * 1000)));
}

function nextMaturity(input: {
  current: string;
  stats?: ReferenceStats;
  policy: GovernancePolicy;
  now: string;
  lastReferencedAt?: string;
  updatedAt?: string;
}): { maturity: string; promoted: boolean; decayed: boolean } {
  const { current, stats, policy, now } = input;
  if (stats && stats.count > 0) {
    if (current === "verified" && stats.environments.size >= policy.verified_to_proven_environments) {
      return { maturity: "proven", promoted: true, decayed: false };
    }
    if ((current === "draft" && stats.count >= policy.draft_to_verified_references) || current === "stale" || current === "archived") {
      return { maturity: "verified", promoted: true, decayed: false };
    }
    return { maturity: current, promoted: false, decayed: false };
  }

  const idleSince = input.lastReferencedAt ?? input.updatedAt;
  const idleDays = daysBetween(now, idleSince);
  if (current === "proven" && idleDays >= policy.proven_idle_days) {
    return { maturity: "verified", promoted: false, decayed: true };
  }
  if (current === "verified" && idleDays >= policy.verified_idle_days) {
    return { maturity: "draft", promoted: false, decayed: true };
  }
  if (current === "draft" && idleDays >= policy.draft_idle_days) {
    return { maturity: "archived", promoted: false, decayed: true };
  }
  return { maturity: current, promoted: false, decayed: false };
}

export async function applyReferenceGovernance(root: string, options?: { now?: string }): Promise<GovernanceApplyResult> {
  const now = options?.now ?? new Date().toISOString();
  const policy = await readGovernancePolicy(root);
  const stats = await collectReferenceStats(root);
  const files = [
    ...(await listFiles(root, "kb/known-fixes")),
    ...(await listFiles(root, "kb/procedures")),
    ...(await listFiles(root, "kb/pitfalls")),
  ].filter((file) => file.endsWith(".md"));

  let referencedObjects = 0;
  let maturityPromotions = 0;
  let maturityDecays = 0;

  for (const file of files) {
    const raw = await readText(root, file);
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    const refStats = stats.get(file);
    const currentMaturity = typeof data.maturity === "string" ? data.maturity : "draft";
    const lifecycle = nextMaturity({
      current: currentMaturity,
      stats: refStats,
      policy,
      now,
      lastReferencedAt: typeof data.last_referenced_at === "string" ? data.last_referenced_at : undefined,
      updatedAt: typeof data.updated_at === "string" ? data.updated_at : undefined,
    });

    let changed = false;
    if (refStats) {
      data.reference_count = Math.max(typeof data.reference_count === "number" ? data.reference_count : 0, refStats.count);
      data.last_referenced_at = refStats.latestReferencedAt;
      referencedObjects++;
      changed = true;
    }
    if (lifecycle.maturity !== currentMaturity) {
      data.maturity = lifecycle.maturity;
      if (lifecycle.promoted) maturityPromotions++;
      if (lifecycle.decayed) maturityDecays++;
      changed = true;
    }
    if (changed) {
      await writeText(root, file, matter.stringify(parsed.content, data));
    }
  }

  return {
    referenced_objects: referencedObjects,
    maturity_promotions: maturityPromotions,
    maturity_decays: maturityDecays,
  };
}
