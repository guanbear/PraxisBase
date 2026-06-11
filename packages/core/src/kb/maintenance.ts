import { readdir, rm } from "node:fs/promises";
import matter from "gray-matter";
import { dirname } from "node:path";
import { safePath, readText, writeText } from "../store/file-store.js";
import { isDirtyStableProvenanceRef, promotionTimeGuard } from "../wiki/promotion-quality.js";
import { normalizeStableSlug, uniqueStableSlugs } from "../protocol/slug.js";

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
  cleaned: string[];
  renamed: Array<{ from: string; to: string }>;
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

async function collectPromotedSkillMarkdownFiles(root: string, relativeDir = "skills"): Promise<string[]> {
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
      files.push(...await collectPromotedSkillMarkdownFiles(root, relativePath));
      continue;
    }
    if (entry.isFile() && entry.name === "SKILL.md") {
      files.push(relativePath);
    }
  }
  return files;
}

async function collectStableMarkdownFiles(root: string): Promise<string[]> {
  return [
    ...await collectKbMarkdownFiles(root),
    ...await collectPromotedSkillMarkdownFiles(root),
  ].sort();
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
  const files = await collectStableMarkdownFiles(root);

  for (const file of files) {
    if (deletedPathSet.has(file)) continue;
    const content = await readText(root, file);
    const updated = unlinkDeletedWikiRefs(content, deletedSlugs);
    if (updated !== content) {
      await writeText(root, file, updated);
    }
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sourceUri(source: unknown): string | undefined {
  if (!source || typeof source !== "object" || !("uri" in source)) return undefined;
  const uri = (source as { uri?: unknown }).uri;
  return typeof uri === "string" ? uri : undefined;
}

function sourceHash(source: unknown): string | undefined {
  if (!source || typeof source !== "object" || !("hash" in source)) return undefined;
  const hash = (source as { hash?: unknown }).hash;
  return typeof hash === "string" ? hash : undefined;
}

function hasValidProvenanceSource(content: string): boolean {
  const parsed = matter(content);
  const sources = Array.isArray(parsed.data.sources) ? parsed.data.sources : [];
  const refs = stringArray(parsed.data.source_refs);
  const allRefs = [
    ...sources.map(sourceUri).filter((uri): uri is string => Boolean(uri)),
    ...refs,
  ];
  return allRefs.some((ref) => !isDirtyStableProvenanceRef(ref));
}

function hasDirtyProvenanceSource(content: string): boolean {
  const parsed = matter(content);
  const sources = Array.isArray(parsed.data.sources) ? parsed.data.sources : [];
  const refs = stringArray(parsed.data.source_refs);
  const allRefs = [
    ...sources.map(sourceUri).filter((uri): uri is string => Boolean(uri)),
    ...refs,
  ];
  return allRefs.some(isDirtyStableProvenanceRef) || /^Candidate:\s*\S/im.test(parsed.content);
}

function stripDirtyProvenance(content: string): string | null {
  if (!hasDirtyProvenanceSource(content) || !hasValidProvenanceSource(content)) return null;

  const parsed = matter(content);
  const data = { ...parsed.data } as Record<string, unknown>;
  const sources = Array.isArray(data.sources) ? data.sources : [];
  const sourceRefs = stringArray(data.source_refs);
  const sourceHashes = stringArray(data.source_hashes);
  const dirtyHashes = new Set<string>();

  const keptSources = sources.filter((source) => {
    const uri = sourceUri(source);
    const hash = sourceHash(source);
    const dirty = uri ? isDirtyStableProvenanceRef(uri) : false;
    if (dirty && hash) dirtyHashes.add(hash);
    return !dirty;
  });

  const keptRefs: string[] = [];
  for (const [index, ref] of sourceRefs.entries()) {
    if (isDirtyStableProvenanceRef(ref)) {
      const hash = sourceHashes[index];
      if (hash) dirtyHashes.add(hash);
      continue;
    }
    keptRefs.push(ref);
  }

  if (Array.isArray(data.sources)) {
    data.sources = keptSources;
  }
  if (Array.isArray(data.source_refs)) {
    data.source_refs = keptRefs;
  }

  const keptHashes = [
    ...keptSources.map(sourceHash).filter((hash): hash is string => Boolean(hash)),
    ...sourceHashes.filter((hash) => !dirtyHashes.has(hash)),
  ];
  if (Array.isArray(data.source_hashes)) {
    data.source_hashes = Array.from(new Set(keptHashes));
  }

  const sourceCount = Array.isArray(data.sources) && data.sources.length > 0
    ? data.sources.length
    : Array.isArray(data.source_refs)
      ? data.source_refs.length
      : undefined;
  if (typeof sourceCount === "number") {
    data.source_count = sourceCount;
  }

  const body = parsed.content
    .split(/\r?\n/)
    .filter((line) => !isDirtyStableProvenanceRef(line) && !/^Candidate:\s*\S/i.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  return matter.stringify(`${body}\n`, data);
}

function stableSlugForPath(relativePath: string): string {
  const parts = relativePath.split("/");
  if (relativePath.startsWith("skills/") && parts.at(-1) === "SKILL.md") {
    return parts.at(-2) ?? "";
  }
  return (parts.at(-1) ?? relativePath).replace(/\.md$/i, "");
}

function targetPathForStableSlug(relativePath: string, slug: string): string {
  const parts = relativePath.split("/");
  if (relativePath.startsWith("skills/") && parts.at(-1) === "SKILL.md") {
    parts[parts.length - 2] = slug;
    return parts.join("/");
  }
  return `${dirname(relativePath)}/${slug}.md`;
}

function replacePathValues(value: unknown, renameMap: Map<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => replacePathValues(item, renameMap));
  }
  if (value && typeof value === "object") {
    const updated: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      updated[key] = replacePathValues(nested, renameMap);
    }
    return updated;
  }
  if (typeof value !== "string") return value;
  return renameMap.get(value) ?? value;
}

function repointWikilinks(content: string, renameMap: Map<string, string>): string {
  const slugMap = new Map<string, string>();
  for (const [from, to] of renameMap) {
    slugMap.set(slugFromKbPath(from), slugFromKbPath(to));
    slugMap.set(from.toLowerCase(), to);
  }

  return content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, rawTarget: string, label?: string) => {
    const target = rawTarget.trim();
    const replacement = slugMap.get(target.toLowerCase());
    if (!replacement) return match;
    return label === undefined ? `[[${replacement}]]` : `[[${replacement}|${label}]]`;
  });
}

async function renameOverlongStableSlugs(root: string): Promise<Array<{ from: string; to: string }>> {
  const files = await collectStableMarkdownFiles(root);
  const byParent = new Map<string, Array<{ path: string; currentSlug: string; desiredInput: string }>>();
  const contentByPath = new Map<string, string>();

  for (const file of files) {
    const content = await readText(root, file);
    contentByPath.set(file, content);
    const currentSlug = stableSlugForPath(file);
    const desiredInput = currentSlug;
    const parent = dirname(file);
    const bucket = byParent.get(parent) ?? [];
    bucket.push({ path: file, currentSlug, desiredInput });
    byParent.set(parent, bucket);
  }

  const renames: Array<{ from: string; to: string }> = [];
  for (const bucket of byParent.values()) {
    const desiredSlugs = uniqueStableSlugs(bucket.map((entry) => entry.desiredInput));
    bucket.forEach((entry, index) => {
      const nextSlug = desiredSlugs[index];
      if (entry.currentSlug !== nextSlug) {
        renames.push({ from: entry.path, to: targetPathForStableSlug(entry.path, nextSlug) });
      }
    });
  }

  if (renames.length === 0) return [];

  const renameMap = new Map(renames.map((rename) => [rename.from, rename.to]));
  for (const file of files) {
    const target = renameMap.get(file) ?? file;
    const oldContent = contentByPath.get(file) ?? await readText(root, file);
    const parsed = matter(repointWikilinks(oldContent, renameMap));
    const data = replacePathValues(parsed.data, renameMap) as Record<string, unknown>;
    const targetSlug = stableSlugForPath(target);
    if (target.startsWith("kb/")) {
      data.id = targetSlug;
    } else if (typeof data.id === "string") {
      data.id = targetSlug;
    }
    const nextContent = matter.stringify(`${parsed.content.trimEnd()}\n`, data);
    await writeText(root, target, nextContent);
    if (target !== file) {
      await rm(safePath(root, file), { force: true });
    }
  }

  return renames;
}

export async function auditKb(root: string): Promise<KbMaintenanceReport> {
  const files = await collectStableMarkdownFiles(root);
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
      continue;
    }
    const slug = stableSlugForPath(file);
    const normalized = normalizeStableSlug(slug);
    if (slug !== normalized) {
      findings.push({
        path: file,
        status: "fail",
        reason: `Stable knowledge slug is not normalized: ${slug} -> ${normalized}`,
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
    cleaned: [],
    renamed: [],
    dry_run: true,
  };
}

export async function pruneKb(root: string, options: PruneKbOptions = {}): Promise<KbMaintenanceReport> {
  const audit = await auditKb(root);
  const dryRun = options.yes !== true;
  const deleted: string[] = [];
  const cleaned: string[] = [];
  let renamed: Array<{ from: string; to: string }> = [];

  if (!dryRun) {
    for (const finding of audit.findings) {
      if (/Stable knowledge slug is not normalized/i.test(finding.reason)) continue;
      const content = await readText(root, finding.path);
      const stripped = stripDirtyProvenance(content);
      if (stripped) {
        await writeText(root, finding.path, stripped);
        cleaned.push(finding.path);
        continue;
      }
      if (!finding.path.startsWith("kb/") || !finding.path.endsWith(".md")) continue;
      await rm(safePath(root, finding.path), { force: true });
      deleted.push(finding.path);
    }
    await removeLinksToDeletedPages(root, deleted);
    renamed = await renameOverlongStableSlugs(root);
  }

  return {
    ...audit,
    mode: "prune",
    deleted,
    cleaned,
    renamed,
    dry_run: dryRun,
  };
}
