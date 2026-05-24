import { z } from "zod";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { makeId } from "../protocol/id.js";
import { makeWikiSlug } from "./model.js";
import {
  WikiObservationSchema,
  WikiTopicSchema,
  WikiPagePlanSchema,
  type WikiObservation,
  type WikiTopic,
  type WikiPagePlan,
  type WikiPagePlanAction,
} from "./curation-model.js";
import { ScopeSchema } from "../protocol/schemas.js";
import type { WikiRelationshipPlan } from "./relationship-planner.js";

type Scope = z.infer<typeof ScopeSchema>;

export interface ExistingWikiPage {
  path: string;
  title: string;
  slug: string;
  source_hashes: string[];
  entities: string[];
  signatures?: string[];
  body_text?: string;
  scope: Scope;
  frontmatter_sources: string[];
}

function normalizeText(text: string | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedTopicKey(parts: string[]): string {
  return parts
    .filter(Boolean)
    .map((p) =>
      p
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join("::");
}

function semanticTopicFamily(obs: WikiObservation): string | undefined {
  const text = [
    obs.problem,
    obs.action,
    obs.reusable_lesson,
    ...obs.topics,
    ...obs.entities,
  ].filter(Boolean).join(" ").toLowerCase();

  if (
    /\back(?:nowledg(?:e|ement|ement)?| timing)?\b/.test(text)
    && /\b(long|slow|tool|network|dispatch|delegat|first response|silent|before|先发|回复慢)\b/i.test(text)
  ) {
    return "ack-timing";
  }
  if (/\bstdin\b/.test(text) && /\b(closed|close|write|tty|interactive)\b/.test(text)) {
    return "stdin-closed";
  }
  if (/\b(task runner|runner)\b/.test(text) && /\b(missing|presence|hanging|status|verify)\b/.test(text)) {
    return "task-runner-presence";
  }
  if (/\bslack\b/.test(text) && /\b(replay|missing|artifact|footer|delivery)\b/.test(text)) {
    return "slack-replay-verification";
  }
  if (/\bdispatch|routing|stickyresult|idle queue\b/.test(text)) {
    return "dispatch-routing";
  }
  if (/\bgateway\b/.test(text) && /\b(restart|status|streaming|configuration|config)\b/.test(text)) {
    return "gateway-restart";
  }
  return undefined;
}

function titleForSemanticFamily(family: string): string {
  if (family === "ack-timing") return "ACK timing before long-running agent work";
  if (family === "stdin-closed") return "Subprocess stdin closed handling";
  if (family === "task-runner-presence") return "OpenClaw task runner presence checks";
  if (family === "slack-replay-verification") return "OpenClaw Slack replay and post-deploy stability failures";
  if (family === "dispatch-routing") return "OpenClaw dispatch routing failures";
  if (family === "gateway-restart") return "OpenClaw gateway restart after configuration changes";
  return "Untitled topic";
}

export function topicKeyForObservation(obs: WikiObservation): string {
  const family = semanticTopicFamily(obs);
  if (family) return normalizedTopicKey([`family:${family}`, obs.scope]);

  const semanticTopics = obs.topics.map(normalizeText).filter(Boolean).sort();
  const problem = semanticTopics.length > 0 ? semanticTopics.join(",") : normalizeText(obs.problem);
  const action = semanticTopics.length > 0 ? "" : normalizeText(obs.action);
  const entities = obs.entities.map(normalizeText).filter(Boolean).sort().join(",");
  const scope = obs.scope;
  return normalizedTopicKey([
    problem || "unknown-problem",
    action || "unknown-action",
    entities || "no-entities",
    scope,
  ]);
}

function uniqSorted(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean))).sort();
}

function confidenceForObservations(obs: WikiObservation[]): number {
  if (obs.length === 0) return 0;
  const avg = obs.reduce((sum, o) => sum + o.confidence, 0) / obs.length;
  const sourceBonus = Math.min(obs.length, 5) * 0.03;
  return Math.min(1, avg + sourceBonus);
}

function pageKindFromObservations(obs: WikiObservation[]): WikiTopic["page_kind"] {
  const kindHints = obs.map((o) => o.problem ?? o.action ?? "");
  for (const hint of kindHints) {
    if (/fix|resolved|repair|error/i.test(hint)) return "known_fix";
    if (/procedure|steps|how to/i.test(hint)) return "procedure";
    if (/decision|chose|prefer/i.test(hint)) return "decision";
    if (/pitfall|avoid|mistake/i.test(hint)) return "pitfall";
    if (/preference|config|setting/i.test(hint)) return "preference";
  }
  return "note";
}

function targetPathForFields(pageKind: WikiTopic["page_kind"], title: string): string {
  const slug = makeWikiSlug(title);
  const kind = pageKind;
  if (kind === "known_fix") return `kb/known-fixes/${slug}.md`;
  if (kind === "procedure") return `kb/procedures/${slug}.md`;
  if (kind === "decision") return `kb/decisions/${slug}.md`;
  if (kind === "pitfall") return `kb/pitfalls/${slug}.md`;
  if (kind === "skill") return `skills/${slug}/SKILL.md`;
  if (kind === "preference") return `kb/memory/preferences-${slug}.md`;
  return `kb/notes/wiki-${slug}.md`;
}

function targetPathForTopic(topic: WikiTopic): string {
  return targetPathForFields(topic.page_kind, topic.title);
}

function inferTitle(obs: WikiObservation[]): string {
  const first = obs[0];
  if (!first) return "Untitled topic";
  const problem = first.problem?.trim();
  if (problem && problem.length >= 8 && problem.length <= 120) return problem;
  const action = first.action?.trim();
  if (action && action.length >= 8 && action.length <= 120) return action;
  return "Untitled topic";
}

export function buildWikiTopics(observations: WikiObservation[]): WikiTopic[] {
  const filtered = observations.filter((o) => !o.filtered_out && o.privacy_verdict !== "reject");

  const buckets = new Map<string, WikiObservation[]>();
  for (const obs of filtered) {
    const key = topicKeyForObservation(obs);
    const bucket = buckets.get(key) ?? [];
    bucket.push(obs);
    buckets.set(key, bucket);
  }

  const topics: WikiTopic[] = [];
  for (const [key, bucket] of buckets) {
    const family = semanticTopicFamily(bucket[0]);
    const sourceRefs = uniqSorted(bucket.map((o) => o.source_ref));
    const sourceHashes = uniqSorted(bucket.map((o) => o.source_hash));
    const entities = uniqSorted(bucket.flatMap((o) => o.entities));
    const scope = bucket[0].scope;
    const pageKind = pageKindFromObservations(bucket);
    const title = family ? titleForSemanticFamily(family) : inferTitle(bucket);
    const topic = WikiTopicSchema.parse({
      id: makeId("wiki-topic", key),
      topic_key: key,
      title,
      observation_ids: bucket.map((o) => o.id).sort(),
      page_kind: pageKind,
      target_path: targetPathForFields(pageKind, title),
      scope,
      source_refs: sourceRefs,
      source_hashes: sourceHashes,
      source_count: sourceRefs.length,
      entities,
      related_topic_keys: [],
      confidence: confidenceForObservations(bucket),
      maturity: "draft",
      conflicts: [],
    });
    topics.push(topic);
  }

  return topics.sort((a, b) => a.topic_key.localeCompare(b.topic_key));
}

function parseFrontmatter(content: string): {
  id?: string;
  title: string;
  source_hashes: string[];
  scope: Scope;
  frontmatter_sources: string[];
  signatures: string[];
} {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
    return { title: h1, source_hashes: [], scope: "project", frontmatter_sources: [], signatures: [] };
  }
  const fm = fmMatch[1];
  const idMatch = fm.match(/^id:\s*(.+)$/m);
  const id = idMatch ? idMatch[1].trim().replace(/^["']|["']$/g, "") : undefined;
  const titleMatch = fm.match(/^title:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim().replace(/^["']|["']$/g, "") : "";
  const hashes: string[] = [];
  const sources: string[] = [];
  const signatures: string[] = [];
  let inSources = false;
  let inSignatures = false;
  for (const line of fm.split("\n")) {
    const trimmed = line.trim();
    if (/^sources:/.test(trimmed)) {
      inSources = true;
      inSignatures = false;
      continue;
    }
    if (/^signatures:/.test(trimmed)) {
      inSignatures = true;
      inSources = false;
      continue;
    }
    if (inSources && (/^\s+-\s+/.test(line) || /^\s+uri:/.test(line) || /^\s+hash:/.test(line))) {
      const hashMatch = trimmed.match(/^hash:\s*(.+)/);
      if (hashMatch) hashes.push(hashMatch[1].trim().replace(/^["']|["']$/g, ""));
      const uriMatch = trimmed.match(/^uri:\s*(.+)/);
      if (uriMatch) sources.push(uriMatch[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    if (inSources && /^\S/.test(line)) {
      inSources = false;
    }
    if (inSignatures && /^\s+-\s+/.test(line)) {
      signatures.push(trimmed.replace(/^-\s+/, "").replace(/^["']|["']$/g, ""));
      continue;
    }
    if (inSignatures && /^\S/.test(line)) {
      inSignatures = false;
    }
  }
  const scopeMatch = fm.match(/^scope:\s*(.+)/m);
  const scope = (scopeMatch?.[1]?.trim() ?? "project") as Scope;
  return { id, title, source_hashes: hashes, scope, frontmatter_sources: sources, signatures };
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function extractExistingPageEntities(input: { title: string; body: string; signatures: string[] }): string[] {
  const entities = new Set<string>();
  for (const signature of input.signatures) {
    const colonIndex = signature.indexOf(":");
    if (colonIndex > 0) {
      entities.add(signature.slice(0, colonIndex).toLowerCase());
    }
  }
  const text = `${input.title}\n${input.body}`;
  if (/\bopenclaw\b/i.test(text)) entities.add("openclaw");
  if (/\bcodex\b/i.test(text)) entities.add("codex");
  if (/\back\b/i.test(text)) entities.add("ack");
  if (/\bstdin\b/i.test(text)) entities.add("stdin");
  if (/\bauth\b/i.test(text)) entities.add("auth");
  if (/\bdelegat(?:ion|ed|ing)\b/i.test(text)) entities.add("delegation");
  return Array.from(entities).sort();
}

function targetIdFromPath(path: string, title: string): string {
  const parts = path.split("/");
  const leaf = parts[parts.length - 1] ?? title;
  const withoutExtension = leaf === "SKILL.md" ? parts[parts.length - 2] ?? title : leaf.replace(/\.md$/i, "");
  return makeWikiSlug(withoutExtension || title);
}

async function collectMdFiles(dir: string, root: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await collectMdFiles(full, root));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(relative(root, full));
    }
  }
  return results;
}

export async function loadExistingWikiPages(root: string): Promise<ExistingWikiPage[]> {
  const pages: ExistingWikiPage[] = [];
  const dirs = ["kb", "skills"];
  for (const dir of dirs) {
    const fullDir = join(root, dir);
    const files = await collectMdFiles(fullDir, root);
    for (const file of files) {
      const fullPath = join(root, file);
      let content: string;
      try {
        content = await readFile(fullPath, "utf-8");
      } catch {
        continue;
      }
      const fm = parseFrontmatter(content);
      const bodyText = stripFrontmatter(content);
      const fallbackTitle = bodyText.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? file.replace(/\.md$/i, "");
      const title = fm.title || fallbackTitle;
      pages.push({
        path: file,
        title,
        slug: makeWikiSlug(fm.id ?? targetIdFromPath(file, title)),
        source_hashes: fm.source_hashes,
        entities: extractExistingPageEntities({ title, body: bodyText, signatures: fm.signatures }),
        signatures: fm.signatures,
        body_text: bodyText,
        scope: fm.scope,
        frontmatter_sources: fm.frontmatter_sources,
      });
    }
  }
  return pages;
}

function findMatchingPage(
  topic: WikiTopic,
  existingPages: ExistingWikiPage[],
): ExistingWikiPage | undefined {
  const targetPath = topic.target_path;
  const byPath = existingPages.find((p) => p.path === targetPath);
  if (byPath) return byPath;

  const slug = makeWikiSlug(topic.title);
  const bySlug = existingPages.find((p) => {
    const pSlug = p.path
      .replace(/^kb\/(known-fixes|procedures|decisions|pitfalls|memory|notes)\//, "")
      .replace(/^skills\//, "")
      .replace(/\/SKILL\.md$/i, "")
      .replace(/\.md$/i, "");
    return pSlug === slug;
  });
  if (bySlug) return bySlug;

  const byHash = existingPages.find((p) =>
    p.source_hashes.some((h) => topic.source_hashes.includes(h)),
  );
  if (byHash) return byHash;

  return undefined;
}

export function planWikiPages(
  topics: WikiTopic[],
  existingPages: ExistingWikiPage[],
  options?: { relationships?: WikiRelationshipPlan[] },
): WikiPagePlan[] {
  const relationships = options?.relationships ?? [];
  const plans: WikiPagePlan[] = [];
  const usedTopics = new Set<string>();
  const seenCreateHashes = new Set<string>();

  for (const topic of topics) {
    if (usedTopics.has(topic.topic_key)) continue;
    usedTopics.add(topic.topic_key);

    const topicRelPlans = relationships.filter((rp) => rp.topic_id === topic.id);
    const canonical = topicRelPlans.filter((rp) => rp.strength === "canonical");
    const strong = topicRelPlans.filter((rp) => rp.strength === "strong");
    const related = topicRelPlans.filter((rp) => rp.strength === "related");

    let action: WikiPagePlanAction;
    let existingPagePath: string | undefined;
    let existingSourceHash: string | undefined;
    const reasons: string[] = [];
    const requiredLinks: string[] = [];
    const relatedPaths: string[] = [];

    if (canonical.length === 1) {
      action = "update";
      existingPagePath = canonical[0].target_path;
      reasons.push("canonical_relationship");
      const canonicalPage = existingPages.find((p) => p.path === canonical[0].target_path);
      if (canonicalPage) {
        const sharedHash = topic.source_hashes.find((h) => canonicalPage.source_hashes.includes(h));
        if (sharedHash) {
          existingSourceHash = sharedHash;
          reasons.push("source_hash_overlap");
        }
      }
    } else if (canonical.length >= 2) {
      action = "merge";
      existingPagePath = canonical[0].target_path;
      reasons.push("ambiguous_merge_target");
      reasons.push("multiple_canonical_targets");
    } else {
      const match = findMatchingPage(topic, existingPages);
      if (match) {
        const sameSourceHash = topic.source_hashes.some((h) =>
          match.source_hashes.includes(h),
        );
        if (sameSourceHash) {
          action = "update";
          existingSourceHash = topic.source_hashes.find((h) =>
            match.source_hashes.includes(h),
          );
          reasons.push("source_hash_overlap");
        } else {
          action = "update";
          reasons.push("existing_page_match");
        }
        existingPagePath = match.path;
      } else {
        action = "create";
        reasons.push("new_canonical_topic");
        if (topic.source_hashes.some((hash) => seenCreateHashes.has(hash))) {
          action = "merge";
          reasons.push("duplicate_source_hash");
        }
      }
    }

    for (const rp of strong) {
      requiredLinks.push(rp.target_slug);
    }
    for (const rp of related) {
      relatedPaths.push(rp.target_path);
    }

    const plan = WikiPagePlanSchema.parse({
      action,
      target_path: topic.target_path ?? targetPathForTopic(topic),
      existing_path: existingPagePath,
      canonical_title: topic.title,
      topic_key: topic.topic_key,
      reasons,
      related_paths: relatedPaths,
      required_links: requiredLinks,
      existing_source_hash: existingSourceHash,
    });
    plans.push(plan);

    if (plan.action === "create") {
      topic.source_hashes.forEach((hash) => seenCreateHashes.add(hash));
    }
  }

  return plans;
}
