import { readdir } from "node:fs/promises";
import { posix } from "node:path";
import matter from "gray-matter";
import {
  AnyEpisodeSchema,
  CaptureRecordSchema,
  MemoryImportReportSchema,
  NativeMemorySourceSchema,
  ProposalSchema,
  ReviewSchema,
  ScopeSchema,
} from "../protocol/schemas.js";
import { protocolPaths } from "../protocol/paths.js";
import { safePath, readText } from "../store/file-store.js";
import { computeWikiSourceHash } from "./model.js";
import type { WikiSource, WikiSourceKind } from "./model.js";

export interface CollectWikiSourcesOptions {
  includePersonal?: boolean;
}

async function listFiles(root: string, dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(safePath(root, dir), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await listFiles(root, relativePath));
      } else {
        results.push(relativePath);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return results;
}

function extractTitle(content: string, frontmatter: Record<string, unknown>, fallback: string): string {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  if (typeof frontmatter.id === "string" && frontmatter.id) return frontmatter.id;
  return fallback;
}

function parseScope(value: unknown, fallback: WikiSource["scope"] = "project"): WikiSource["scope"] {
  const parsed = ScopeSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function fileId(relativePath: string): string {
  return relativePath.split("/").pop()!.replace(/\.json$/, "");
}

async function readJsonSource(root: string, relativePath: string): Promise<{ rawText: string; value: unknown } | undefined> {
  const rawText = await readText(root, relativePath);
  try {
    return { rawText, value: JSON.parse(rawText) as unknown };
  } catch {
    return undefined;
  }
}

async function collectMarkdownSources(
  root: string,
  dir: string,
  kind: WikiSourceKind,
  idPrefix: string,
  globFilter: (relativePath: string) => boolean
): Promise<WikiSource[]> {
  const files = await listFiles(root, dir);
  const sources: WikiSource[] = [];

  for (const relativePath of files) {
    if (!relativePath.endsWith(".md") || !globFilter(relativePath)) continue;

    let raw: string;
    try {
      raw = await readText(root, relativePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }

    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    const body = parsed.content.trim();
    const title = extractTitle(parsed.content, data, relativePath.split("/").pop()!.replace(/\.md$/, ""));
    const scope = parseScope(data.scope);
    const knowledgeType = typeof data.knowledge_type === "string" ? data.knowledge_type : undefined;
    const maturity = typeof data.maturity === "string" ? data.maturity : undefined;
    const updatedAt = typeof data.updated_at === "string" ? data.updated_at : undefined;

    sources.push({
      id: `${idPrefix}${relativePath}`,
      kind,
      path: relativePath,
      source_hash: computeWikiSourceHash(raw),
      title,
      summary: body.slice(0, 200),
      body,
      scope,
      knowledge_type: knowledgeType,
      maturity,
      updated_at: updatedAt,
    });
  }

  return sources;
}

async function collectEpisodeSources(root: string): Promise<WikiSource[]> {
  const files = await listFiles(root, protocolPaths.inboxEpisodes);
  const sources: WikiSource[] = [];

  for (const relativePath of files) {
    if (!relativePath.endsWith(".json")) continue;

    const source = await readJsonSource(root, relativePath);
    if (!source) continue;

    const parsed = AnyEpisodeSchema.safeParse(source.value);
    if (!parsed.success) continue;

    const record = parsed.data;
    const summary = record.type === "repair_episode" ? record.summary : record.evidence_summary;
    const sourceRef = record.source_refs[0];
    sources.push({
      id: `episode:${record.id}`,
      kind: "episode",
      path: relativePath,
      source_ref: sourceRef,
      source_hash: computeWikiSourceHash(source.rawText),
      title: record.type === "repair_episode" ? record.problem_signature : record.id,
      summary,
      scope: record.scope,
      created_at: record.created_at,
    });
  }

  return sources;
}

async function collectCaptureSources(root: string): Promise<WikiSource[]> {
  const files = await listFiles(root, protocolPaths.outboxCaptures);
  const sources: WikiSource[] = [];

  for (const relativePath of files) {
    if (!relativePath.endsWith(".json")) continue;

    const source = await readJsonSource(root, relativePath);
    if (!source) continue;

    const parsed = CaptureRecordSchema.safeParse(source.value);
    if (!parsed.success) continue;

    const record = parsed.data;
    const summaries = record.artifacts
      .map((a) => a.redacted_summary)
      .filter(Boolean);
    const artifactHashes = record.artifacts
      .map((a) => a.source_hash)
      .join(",");

    sources.push({
      id: `capture:${record.id}`,
      kind: "capture",
      source_hash: computeWikiSourceHash(artifactHashes),
      title: record.id,
      summary: summaries.join(" "),
      scope: record.scope_hint,
      created_at: record.created_at,
    });
  }

  return sources;
}

async function collectMemorySources(root: string): Promise<WikiSource[]> {
  const files = await listFiles(root, protocolPaths.reportsMemory);
  const sources: WikiSource[] = [];

  for (const relativePath of files) {
    if (!relativePath.endsWith(".json")) continue;

    const source = await readJsonSource(root, relativePath);
    if (!source) continue;

    const nativeMemory = NativeMemorySourceSchema.safeParse(source.value);
    if (nativeMemory.success) {
      const record = nativeMemory.data;
      const id = isRecord(source.value) ? stringValue(source.value.id) ?? fileId(relativePath) : fileId(relativePath);
      sources.push({
        id: `native_memory:${id}`,
        kind: "native_memory",
        path: relativePath,
        source_ref: record.source_ref,
        source_hash: record.source_hash,
        title: `${record.agent} ${record.kind}`,
        summary: record.redacted_summary,
        scope: record.scope_hint,
        created_at: record.created_at,
      });
      continue;
    }

    const report = MemoryImportReportSchema.safeParse(source.value);
    if (!report.success) continue;

    const record = report.data;
    const rawRecord = isRecord(source.value) ? source.value : {};
    const sourceHashes = stringArrayValue(rawRecord.source_hashes);
    sources.push({
      id: `native_memory:${record.id}`,
      kind: "native_memory",
      path: relativePath,
      source_hash: sourceHashes[0] ?? computeWikiSourceHash(source.rawText),
      title: `Native memory import ${record.agent}`,
      summary: `Imported ${record.imported_sources} ${record.agent} memory source(s).`,
      scope: record.default_scope,
      created_at: record.created_at,
    });
  }

  return sources;
}

async function collectProposalSources(root: string): Promise<WikiSource[]> {
  const files = await listFiles(root, protocolPaths.inboxProposals);
  const sources: WikiSource[] = [];

  for (const relativePath of files) {
    if (!relativePath.endsWith(".json")) continue;

    const source = await readJsonSource(root, relativePath);
    if (!source) continue;

    const proposal = ProposalSchema.safeParse(source.value);
    if (proposal.success) {
      const record = proposal.data;
      sources.push({
        id: `proposal:${record.id}`,
        kind: "proposal",
        path: relativePath,
        source_ref: record.evidence.source_uri,
        source_hash: record.evidence.source_hash,
        title: record.target_id,
        summary: record.evidence.redacted_summary ?? record.evidence.excerpt,
        scope: record.scope,
        created_at: record.created_at,
      });
      continue;
    }

    if (!isRecord(source.value)) continue;
    const id = stringValue(source.value.id);
    const summary = stringValue(source.value.redacted_summary);
    const sourceHash = stringValue(source.value.source_hash);
    if (!id || !summary || !sourceHash) continue;

    sources.push({
      id: `proposal:${id}`,
      kind: "proposal",
      path: relativePath,
      source_ref: stringValue(source.value.source_ref),
      source_hash: sourceHash,
      title: id,
      summary,
      scope: parseScope(source.value.scope_hint ?? source.value.scope),
      created_at: stringValue(source.value.created_at),
    });
  }

  return sources;
}

async function collectReviewSources(root: string): Promise<WikiSource[]> {
  const files = await listFiles(root, protocolPaths.inboxReviews);
  const sources: WikiSource[] = [];

  for (const relativePath of files) {
    if (!relativePath.endsWith(".json")) continue;

    const source = await readJsonSource(root, relativePath);
    if (!source) continue;

    const parsed = ReviewSchema.safeParse(source.value);
    if (!parsed.success) continue;

    const record = parsed.data;
    sources.push({
      id: `review:${record.id}`,
      kind: "review",
      path: relativePath,
      source_hash: computeWikiSourceHash(source.rawText),
      title: `Review ${record.proposal_id}`,
      summary: record.reasons.join(" "),
      scope: "project",
      created_at: record.created_at,
    });
  }

  return sources;
}

async function collectExternalRefSources(root: string): Promise<WikiSource[]> {
  const files = await listFiles(root, protocolPaths.rawVaultRefs);
  const sources: WikiSource[] = [];

  for (const relativePath of files) {
    if (!relativePath.endsWith(".json")) continue;

    const source = await readJsonSource(root, relativePath);
    if (!source || !isRecord(source.value)) continue;

    const sourceRef = stringValue(source.value.source_ref);
    const sourceHash = stringValue(source.value.source_hash);
    const summary = stringValue(source.value.redacted_summary);
    if (!sourceRef || !sourceHash || !summary) continue;

    const id = stringValue(source.value.id) ?? fileId(relativePath);
    sources.push({
      id: `external_ref:${id}`,
      kind: "external_ref",
      path: relativePath,
      source_ref: sourceRef,
      source_hash: sourceHash,
      title: id,
      summary,
      scope: parseScope(source.value.scope_hint ?? source.value.scope, "personal"),
      created_at: stringValue(source.value.created_at),
    });
  }

  return sources;
}

export async function collectWikiSources(
  root: string,
  options: CollectWikiSourcesOptions = {}
): Promise<WikiSource[]> {
  const [
    kbSources,
    skillSources,
    episodeSources,
    captureSources,
    memorySources,
    proposalSources,
    reviewSources,
    externalRefSources,
  ] = await Promise.all([
    collectMarkdownSources(root, "kb", "stable_kb", "stable_kb:", () => true),
    collectMarkdownSources(
      root,
      "skills",
      "skill",
      "skill:",
      (p) => p.endsWith("/SKILL.md")
    ),
    collectEpisodeSources(root),
    collectCaptureSources(root),
    collectMemorySources(root),
    collectProposalSources(root),
    collectReviewSources(root),
    collectExternalRefSources(root),
  ]);

  const includePersonal = options.includePersonal ?? true;
  const all = [
    ...kbSources,
    ...skillSources,
    ...episodeSources,
    ...captureSources,
    ...memorySources,
    ...proposalSources,
    ...reviewSources,
    ...externalRefSources,
  ].filter((source) => includePersonal || source.scope !== "personal");
  all.sort((a, b) => a.id.localeCompare(b.id));
  return all;
}
