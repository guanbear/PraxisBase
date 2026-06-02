import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CuratedWikiProposal } from "./curation-model.js";
import { writeJson } from "../store/file-store.js";

const REPORTS_WIKI_SOURCE_SUMMARIES = ".praxisbase/reports/wiki-source-summaries";

export async function recordWikiSourceSummaryContributions(
  root: string,
  curated: CuratedWikiProposal,
): Promise<void> {
  const summaryDir = join(root, REPORTS_WIKI_SOURCE_SUMMARIES);
  const files = await readdir(summaryDir).catch(() => [] as string[]);
  if (files.length === 0) return;

  const evidenceIds = new Set(curated.evidence_ids);
  const sourceRefs = new Set(curated.source_refs);
  const sourceHashes = new Set(curated.source_hashes);

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const path = join(summaryDir, file);
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path, "utf8"));
    } catch {
      continue;
    }
    if (!raw || typeof raw !== "object") continue;
    const record = raw as {
      source_id?: unknown;
      source_ref?: unknown;
      source_hash?: unknown;
      contributed_to_pages?: unknown;
    };
    const matches = (typeof record.source_id === "string" && evidenceIds.has(record.source_id))
      || (typeof record.source_ref === "string" && sourceRefs.has(record.source_ref))
      || (typeof record.source_hash === "string" && sourceHashes.has(record.source_hash));
    if (!matches) continue;

    const contributedToPages = Array.isArray(record.contributed_to_pages)
      ? record.contributed_to_pages.filter((value): value is string => typeof value === "string")
      : [];
    const nextPages = Array.from(new Set([...contributedToPages, curated.target_path])).sort();
    await writeJson(root, `${REPORTS_WIKI_SOURCE_SUMMARIES}/${file}`, {
      ...record,
      contributed_to_pages: nextPages,
    });
  }
}
