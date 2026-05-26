import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import matter from "gray-matter";
import type { SkillSignalCluster } from "./skill-stability.js";
import type { SkillSignalScope } from "./skill-signals.js";

export interface StableSkillInventoryItem {
  path: string;
  slug: string;
  name: string;
  description: string;
  scope: SkillSignalScope;
  headings: string[];
  when_to_use: string;
  procedure: string;
  pitfalls: string;
  provenance: string;
  related_wiki_paths: string[];
}

export interface StableSkillMatch {
  skill: StableSkillInventoryItem;
  strength: "strong" | "medium" | "weak";
  score: number;
  reasons: string[];
}

async function walk(dir: string): Promise<string[]> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await readdir(dir, { withFileTypes: true }) as Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile() && entry.name === "SKILL.md") files.push(path);
  }
  return files;
}

function section(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|\\z)`, "im"));
  return match?.[1]?.trim() ?? "";
}

function headings(body: string): string[] {
  return Array.from(body.matchAll(/^##?\s+(.+)$/gm)).map((match) => match[1].trim());
}

function words(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter((word) => word.length >= 3));
}

function overlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const item of a) if (b.has(item)) count++;
  return count;
}

function scopeValue(value: unknown): SkillSignalScope {
  return value === "personal" || value === "project" || value === "team" || value === "org" || value === "global" ? value : "project";
}

export async function loadStableSkillInventory(root: string): Promise<StableSkillInventoryItem[]> {
  const files = await walk(join(root, "skills"));
  const items: StableSkillInventoryItem[] = [];
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const parsed = matter(raw);
    const rel = relative(root, file).replace(/\\/g, "/");
    const slug = rel.split("/").slice(-2, -1)[0] ?? rel;
    const content = parsed.content;
    items.push({
      path: rel,
      slug,
      name: typeof parsed.data.name === "string" ? parsed.data.name : slug,
      description: typeof parsed.data.description === "string" ? parsed.data.description : "",
      scope: scopeValue(parsed.data.scope),
      headings: headings(content),
      when_to_use: section(content, "When To Use"),
      procedure: section(content, "Procedure"),
      pitfalls: section(content, "Pitfalls"),
      provenance: section(content, "Provenance"),
      related_wiki_paths: Array.from(content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)).map((match) => match[1].trim()),
    });
  }
  return items.sort((a, b) => a.path.localeCompare(b.path));
}

export function matchStableSkills(cluster: SkillSignalCluster, inventory: StableSkillInventoryItem[]): StableSkillMatch[] {
  const cueWords = words(cluster.trigger);
  const triggerWords = words(`${cluster.title} ${cluster.trigger}`);
  const procedureWords = words(cluster.procedure.join(" "));
  const matches: StableSkillMatch[] = [];
  for (const skill of inventory) {
    const domain = skill.path.split("/")[1] ?? "";
    const skillWords = words(`${skill.slug} ${skill.name} ${skill.description} ${skill.when_to_use} ${skill.procedure}`);
    const cueShared = overlap(cueWords, skillWords);
    const triggerShared = overlap(triggerWords, skillWords);
    const procedureShared = overlap(procedureWords, skillWords);
    const domainHit = domain && cueWords.has(domain.toLowerCase());
    if (cueShared === 0) continue;
    const triggerScore = triggerShared / Math.max(4, triggerWords.size);
    const procedureScore = procedureShared / Math.max(6, procedureWords.size);
    const score = Math.min(1, triggerScore * 0.7 + procedureScore * 0.3 + (domainHit ? 0.15 : 0));
    if (score < 0.15) continue;
    const strength = score >= 0.52 && cueShared >= 2 ? "strong" : score >= 0.28 ? "medium" : "weak";
    matches.push({
      skill,
      strength,
      score,
      reasons: [
        `${cueShared} overlapping cue terms`,
        `${triggerShared} overlapping title/trigger terms`,
        `${procedureShared} overlapping procedure terms`,
        ...(domainHit ? [`same domain ${domain}`] : []),
      ],
    });
  }
  return matches.sort((a, b) => b.score - a.score || a.skill.path.localeCompare(b.skill.path));
}
