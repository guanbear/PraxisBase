import { readdir, rm } from "node:fs/promises";
import { safePath, readText, writeText } from "../store/file-store.js";
import { promotionTimeGuard } from "../wiki/promotion-quality.js";

export type KbMaintenanceMode = "audit" | "prune";

export interface KbMaintenanceFinding {
  path: string;
  status: "fail";
  reason: string;
}

export interface KbMaintenanceReport {
  type: "kb_audit_report";
  mode: KbMaintenanceMode;
  checked: number;
  passed: number;
  failed: number;
  findings: KbMaintenanceFinding[];
  deleted: string[];
  dry_run: boolean;
}

export interface PruneKbOptions {
  yes?: boolean;
}

async function collectKbMarkdownFiles(root: string, relativeDir = "kb"): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(safePath(root, relativeDir), { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await collectKbMarkdownFiles(root, relativePath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relativePath);
    }
  }
  return files;
}

function slugFromKbPath(relativePath: string): string {
  const filename = relativePath.split("/").at(-1) ?? relativePath;
  return filename.replace(/\.md$/i, "").toLowerCase();
}

function unlinkDeletedWikiRefs(content: string, deletedSlugs: Set<string>): string {
  return content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, rawSlug: string, label?: string) => {
    const slug = rawSlug.trim().toLowerCase();
    if (!deletedSlugs.has(slug)) return match;
    return (label ?? rawSlug).trim();
  });
}

async function removeLinksToDeletedPages(root: string, deletedPaths: string[]): Promise<void> {
  if (deletedPaths.length === 0) return;
  const deletedPathSet = new Set(deletedPaths);
  const deletedSlugs = new Set(deletedPaths.map(slugFromKbPath));
  const files = await collectKbMarkdownFiles(root);

  for (const file of files) {
    if (deletedPathSet.has(file)) continue;
    const content = await readText(root, file);
    const updated = unlinkDeletedWikiRefs(content, deletedSlugs);
    if (updated !== content) {
      await writeText(root, file, updated);
    }
  }
}

export async function auditKb(root: string): Promise<KbMaintenanceReport> {
  const files = await collectKbMarkdownFiles(root);
  const findings: KbMaintenanceFinding[] = [];

  for (const file of files) {
    const content = await readText(root, file);
    const reason = promotionTimeGuard(content);
    if (reason) {
      findings.push({
        path: file,
        status: "fail",
        reason,
      });
    }
  }

  return {
    type: "kb_audit_report",
    mode: "audit",
    checked: files.length,
    passed: files.length - findings.length,
    failed: findings.length,
    findings,
    deleted: [],
    dry_run: true,
  };
}

export async function pruneKb(root: string, options: PruneKbOptions = {}): Promise<KbMaintenanceReport> {
  const audit = await auditKb(root);
  const dryRun = options.yes !== true;
  const deleted: string[] = [];

  if (!dryRun) {
    for (const finding of audit.findings) {
      if (!finding.path.startsWith("kb/") || !finding.path.endsWith(".md")) continue;
      await rm(safePath(root, finding.path), { force: true });
      deleted.push(finding.path);
    }
    await removeLinksToDeletedPages(root, deleted);
  }

  return {
    ...audit,
    mode: "prune",
    deleted,
    dry_run: dryRun,
  };
}
