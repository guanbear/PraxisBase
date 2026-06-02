import { makeWikiSlug, type WikiSource } from "./model.js";
import { containsPrivateMaterial, isAllowedWikiPatchPath } from "./lint.js";
import { WikiSourceAnalysisSchema, type WikiSourceAnalysis, type WikiSourceSuggestedPageKind } from "../protocol/schemas.js";

const PAGE_KIND_BY_KNOWLEDGE_TYPE = new Set<WikiSourceSuggestedPageKind>([
  "known_fix",
  "procedure",
  "decision",
  "pitfall",
  "preference",
  "incident",
  "note",
]);

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "to", "by", "with", "when", "after", "before",
  "for", "from", "into", "using", "use", "fixed", "fix", "runbook", "procedure",
  "pitfall", "refreshing", "refresh", "repair", "reports", "reported",
]);

function normalizedText(source: WikiSource): string {
  return [source.title, source.summary, source.body].filter(Boolean).join("\n");
}

function distilledField(text: string, field: string): string | undefined {
  const match = text.match(new RegExp(`^${field}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function inferKind(source: WikiSource, text: string): WikiSourceSuggestedPageKind {
  const distilledKind = distilledField(text, "Suggested Wiki Kind");
  if (distilledKind && PAGE_KIND_BY_KNOWLEDGE_TYPE.has(distilledKind as WikiSourceSuggestedPageKind)) {
    return distilledKind as WikiSourceSuggestedPageKind;
  }
  if (source.knowledge_type && PAGE_KIND_BY_KNOWLEDGE_TYPE.has(source.knowledge_type as WikiSourceSuggestedPageKind)) {
    return source.knowledge_type as WikiSourceSuggestedPageKind;
  }
  if (source.kind === "skill") return "skill_seed";

  const lower = text.toLowerCase();
  if (/\b(decision|decided|chose|because)\b/.test(lower)) return "decision";
  if (/\b(pitfall|do not|don't|avoid|repeated|loop|failed repeatedly)\b/.test(lower)) return "pitfall";
  if (/\b(prefer|preference|local setting|editor layout)\b/.test(lower)) return "preference";
  if (/\b(runbook|procedure|steps?|kubectl|command|restart|rollback)\b/.test(lower)) return "procedure";
  if (/\b(incident|outage|sev[0-9]|production incident)\b/.test(lower)) return "incident";
  if (/\b(fixed|fix|resolved|workaround|auth expired|error|bug)\b/.test(lower)) return "known_fix";
  return "note";
}

function semanticSignature(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (lower.includes("openclaw") && lower.includes("auth") && lower.includes("expired")) {
    return "openclaw:auth-expired";
  }
  if (lower.includes("restart") && lower.includes("worker") && lower.includes("service")) {
    return undefined;
  }
  const words = lower
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, 5);
  if (words.length >= 2) return `text:${words.join("-")}`;
  return undefined;
}

function aliasFromSource(source: WikiSource, text: string): string[] {
  const aliases = [
    makeWikiSlug(source.title),
    source.path ? makeWikiSlug(source.path.replace(/\.md$/, "")) : undefined,
  ].filter((item): item is string => Boolean(item) && item !== "wiki");

  if (text.toLowerCase().includes("openclaw auth expired")) {
    aliases.push("openclaw-auth-expired");
  }

  return Array.from(new Set(aliases)).sort();
}

function candidateSlug(kind: WikiSourceSuggestedPageKind, text: string, source: WikiSource): string {
  const titleText = distilledField(text, "Summary") ?? distilledField(text, "Title") ?? text;
  const lower = titleText.toLowerCase();
  if (lower.includes("openclaw") && lower.includes("auth") && lower.includes("expired")) {
    return "openclaw-auth-expired";
  }
  if (lower.includes("restart") && lower.includes("worker") && lower.includes("service")) {
    return "restart-worker-service";
  }

  const words = lower
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, kind === "preference" ? 6 : 5);
  return makeWikiSlug(words.join(" ") || source.title || source.id);
}

function candidatePath(kind: WikiSourceSuggestedPageKind, slug: string): string {
  if (kind === "known_fix") return `kb/known-fixes/${slug}.md`;
  if (kind === "procedure") return `kb/procedures/${slug}.md`;
  if (kind === "decision") return `kb/decisions/${slug}.md`;
  if (kind === "pitfall") return `kb/pitfalls/${slug}.md`;
  if (kind === "skill_seed") return `skills/${slug}/SKILL.md`;
  if (kind === "preference") return `kb/memory/preferences-${slug}.md`;
  return `kb/notes/wiki-${slug}.md`;
}

function risksFor(source: WikiSource, text: string, path: string): string[] {
  const risks: string[] = [];
  const lower = text.toLowerCase();
  if (source.scope === "personal") risks.push("personal_scope");
  if (containsPrivateMaterial(text)) risks.push("private_material");
  if (/\b(repeated|loop|retry)\b/.test(lower)) risks.push("repeated_failure");
  if (!isAllowedWikiPatchPath(path)) risks.push("unsafe_path");
  if (!source.source_hash) risks.push("weak_provenance");
  return Array.from(new Set(risks)).sort();
}

export function analyzeWikiSource(source: WikiSource): WikiSourceAnalysis {
  const text = normalizedText(source);
  const suggestedKind = inferKind(source, text);
  const slug = candidateSlug(suggestedKind, text, source);
  const path = source.kind === "stable_kb" && source.path ? source.path : candidatePath(suggestedKind, slug);
  const semantic = semanticSignature(text);
  const signatures = Array.from(new Set([
    semantic,
    `${source.kind}:${makeWikiSlug(source.id)}`,
  ].filter((item): item is string => Boolean(item)))).sort();
  const risks = risksFor(source, text, path);
  const explicitConfidence = Number(distilledField(text, "Confidence"));
  const confidence = Number.isFinite(explicitConfidence)
    ? Math.max(0.2, Math.min(0.98, explicitConfidence))
    : Math.max(0.2, Math.min(0.9, 0.45 + (semantic ? 0.2 : 0) + (risks.length === 0 ? 0.15 : 0)));

  return WikiSourceAnalysisSchema.parse({
    source_id: source.id,
    source_hash: source.source_hash,
    source_kind: source.kind,
    suggested_page_kind: suggestedKind,
    signatures,
    aliases: aliasFromSource(source, text),
    scope: source.scope,
    confidence,
    risks,
    candidate_path: path,
  });
}
