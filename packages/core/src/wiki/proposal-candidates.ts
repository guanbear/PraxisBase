import { readdir } from "node:fs/promises";
import { posix } from "node:path";
import matter from "gray-matter";
import { protocolPaths } from "../protocol/paths.js";
import { PROTOCOL_VERSION, type Scope, type TargetType } from "../protocol/types.js";
import { ProposalSchema, type Proposal } from "../protocol/schemas.js";
import { readJson } from "../store/file-store.js";
import { makeWikiSlug } from "./model.js";
import { CuratedWikiProposalSchema, curatedWikiProposalToKnowledgeProposal, type CuratedWikiProposal } from "./curation-model.js";

export interface PendingWikiProposalCandidate {
  id: string;
  anchor: string;
  title: string;
  summary: string;
  kind: TargetType;
  scope: Scope;
  confidence?: number;
  source_count?: number;
  review_hint?: {
    why_review: string;
    suggested_decision: string;
    risk_notes: string[];
  };
  guard_messages?: string[];
  related_pages?: Array<{ slug: string; path: string; title: string }>;
  required_links?: Array<{ slug: string; label: string; path: string; reason: string }>;
  suggested_links?: Array<{ slug: string; label: string; path: string; reason: string }>;
  merge_candidates?: Array<{ title: string; path: string; reason: string }>;
  relationship_reasons?: string[];
  patch_path: string;
  patch_content: string;
  source_id: string;
  source_kind: string;
  source_hash: string;
  created_at: string;
}

interface WikiProposalCandidateRecord {
  id: string;
  protocol_version: string;
  type: "wiki_proposal_candidate";
  source_id: string;
  source_kind: string;
  source_hash: string;
  patch: {
    path: string;
    content: string;
  };
  created_at: string;
}

type ReviewableWikiCandidateRecord = WikiProposalCandidateRecord | CuratedWikiProposal;

const SCOPES = new Set<Scope>(["personal", "project", "team", "global", "org"]);
const TARGET_TYPES = new Set<TargetType>(["note", "known_fix", "procedure", "skill", "policy", "decision", "pitfall"]);

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isWikiProposalCandidate(value: unknown): value is WikiProposalCandidateRecord {
  if (!isRecord(value)) return false;
  if (value.type !== "wiki_proposal_candidate") return false;
  if (!stringValue(value.id) || !stringValue(value.source_id) || !stringValue(value.source_hash) || !stringValue(value.created_at)) {
    return false;
  }
  if (!isRecord(value.patch)) return false;
  return Boolean(stringValue(value.patch.path) && stringValue(value.patch.content));
}

export function isCuratedWikiProposal(value: unknown): value is CuratedWikiProposal {
  return CuratedWikiProposalSchema.safeParse(value).success;
}

function scopeValue(value: unknown): Scope {
  const text = stringValue(value);
  return text && SCOPES.has(text as Scope) ? text as Scope : "project";
}

function frontmatterTargetType(value: unknown): TargetType | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  return TARGET_TYPES.has(text as TargetType) ? text as TargetType : undefined;
}

function targetTypeFromPath(path: string): TargetType {
  if (path.startsWith("skills/")) return "skill";
  if (path.startsWith("kb/known-fixes/")) return "known_fix";
  if (path.startsWith("kb/procedures/")) return "procedure";
  if (path.startsWith("kb/pitfalls/")) return "pitfall";
  if (path.startsWith("kb/policies/")) return "policy";
  if (path.startsWith("kb/decisions/")) return "decision";
  return "note";
}

function firstHeading(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function previewFromMarkdown(markdown: string): string {
  const lines: string[] = [];
  let inCode = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    const trimmed = line.trim();
    if (inCode || !trimmed || trimmed.startsWith("#")) continue;
    lines.push(trimmed.replace(/\s+/g, " "));
    if (lines.join(" ").length >= 260) break;
  }
  const text = lines.join(" ").trim();
  if (!text) return "Review the generated wiki draft before promotion.";
  return text.length > 280 ? `${text.slice(0, 277)}...` : text;
}

function candidateAnchor(id: string): string {
  return `pending-${id.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function candidateMetadata(record: WikiProposalCandidateRecord): PendingWikiProposalCandidate {
  const parsed = matter(record.patch.content);
  const data = parsed.data as Record<string, unknown>;
  const title = stringValue(data.title) ?? firstHeading(parsed.content) ?? record.patch.path;
  const kind = frontmatterTargetType(data.knowledge_type) ?? frontmatterTargetType(data.type) ?? targetTypeFromPath(record.patch.path);
  return {
    id: record.id,
    anchor: candidateAnchor(record.id),
    title,
    summary: previewFromMarkdown(parsed.content),
    kind,
    scope: scopeValue(data.scope),
    confidence: numberValue(data.confidence),
    patch_path: record.patch.path,
    patch_content: record.patch.content,
    source_id: record.source_id,
    source_kind: record.source_kind,
    source_hash: record.source_hash,
    created_at: record.created_at,
  };
}

function curatedCandidateMetadata(record: CuratedWikiProposal): PendingWikiProposalCandidate {
  const failedGuards = record.guards.filter((g) => !g.ok).map((g) => g.message);
  return {
    id: record.id,
    anchor: candidateAnchor(record.id),
    title: record.title,
    summary: record.summary,
    kind: record.page_kind === "skill" ? "skill" : record.page_kind === "preference" || record.page_kind === "incident" ? "note" : record.page_kind,
    scope: record.scope,
    confidence: record.confidence,
    source_count: record.source_count,
    review_hint: {
      why_review: record.review_hint.why_review,
      suggested_decision: record.review_hint.suggested_decision,
      risk_notes: record.review_hint.risk_notes,
    },
    guard_messages: failedGuards.length > 0 ? failedGuards : undefined,
    related_pages: record.related_pages,
    required_links: record.required_links,
    suggested_links: record.suggested_links,
    merge_candidates: record.merge_candidates,
    relationship_reasons: record.relationship_reasons,
    patch_path: record.target_path,
    patch_content: record.body_markdown,
    source_id: record.source_refs.join(", "),
    source_kind: "curated",
    source_hash: record.source_hashes.join(","),
    created_at: record.created_at,
  };
}

export async function collectPendingWikiProposalCandidates(root: string): Promise<PendingWikiProposalCandidate[]> {
  const dir = posix.resolve(root, protocolPaths.inboxProposals);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const candidates: PendingWikiProposalCandidate[] = [];
  for (const file of entries.filter((name) => name.endsWith(".json")).sort()) {
    try {
      const value = await readJson<unknown>(root, `${protocolPaths.inboxProposals}/${file}`);
      if (isCuratedWikiProposal(value)) {
        candidates.push(curatedCandidateMetadata(value));
      } else if (isWikiProposalCandidate(value)) {
        candidates.push(candidateMetadata(value));
      }
    } catch {
      continue;
    }
  }

  return candidates.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.patch_path.localeCompare(b.patch_path));
}

export function wikiCandidateToKnowledgeProposal(value: unknown): Proposal | undefined {
  if (isCuratedWikiProposal(value)) return curatedWikiProposalToKnowledgeProposal(value);
  if (!isWikiProposalCandidate(value)) return undefined;
  const record: ReviewableWikiCandidateRecord = value;
  if (!isWikiProposalCandidate(record)) return undefined;
  const metadata = candidateMetadata(record);
  const targetId = stringValue((matter(record.patch.content).data as Record<string, unknown>).id) ?? makeWikiSlug(metadata.title);
  return ProposalSchema.parse({
    id: record.id,
    protocol_version: PROTOCOL_VERSION,
    type: "knowledge_proposal",
    scope: metadata.scope,
    action: "create",
    target_type: metadata.kind,
    target_id: targetId,
    agent_id: "praxisbase-wiki-compiler",
    agent_type: "system_ingest",
    environment_id: "local",
    run_id: record.source_id,
    idempotency_key: record.id,
    evidence: {
      source_uri: record.source_id,
      source_hash: record.source_hash,
      excerpt: metadata.summary,
      repair_result: "unknown",
      verification: "Wiki compiler generated this draft from a hashed source. Inspect the pending candidate and run praxisbase check after promotion.",
      source_refs: [{ uri: record.source_id, hash: record.source_hash }],
      redacted_summary: metadata.summary,
    },
    patch: record.patch,
    created_at: record.created_at,
  });
}
