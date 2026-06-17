import { createHash, randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import matter from "gray-matter";
import { protocolPaths } from "../protocol/paths.js";
import { isStableKnowledgePath, readJson, readText, safePath, writeJson, writeText } from "../store/file-store.js";

export interface StableKnowledgeRevocationInput {
  path: string;
  reviewerId?: string;
  reason?: string;
  now?: string;
}

export interface StableKnowledgeRevocationResult {
  path: string;
  status: "archived";
  revocation_path: string;
}

interface RevocationRecord {
  id: string;
  protocol_version: "0.1";
  type: "stable_knowledge_revocation";
  path: string;
  reviewer_id: string;
  reason: string;
  previous_hash: string;
  status: "active";
  created_at: string;
}

function assertRevokablePath(path: string): void {
  safePath("/tmp/praxisbase-path-check", path);
  if (!isStableKnowledgePath(path) || !path.endsWith(".md")) {
    throw new Error(`REVOKE_UNSAFE_PATH: ${path} is not a stable markdown knowledge path.`);
  }
  if (path.startsWith("skills/") && !path.endsWith("/SKILL.md")) {
    throw new Error(`REVOKE_UNSAFE_PATH: only stable skill SKILL.md files can be revoked from skills/.`);
  }
}

function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

export async function revokeStableKnowledge(root: string, input: StableKnowledgeRevocationInput): Promise<StableKnowledgeRevocationResult> {
  assertRevokablePath(input.path);
  const now = input.now ?? new Date().toISOString();
  const reviewerId = input.reviewerId?.trim() || "praxisbase-local-review-ui";
  const reason = input.reason?.trim() || "manual_revocation";
  const raw = await readText(root, input.path);
  const parsed = matter(raw);
  const previousHash = sha256(raw);
  const data = {
    ...parsed.data,
    status: "archived",
    maturity: "archived",
    revoked_at: now,
    revoked_by: reviewerId,
    revocation_reason: reason,
  };
  await writeText(root, input.path, matter.stringify(parsed.content.trim(), data).trimEnd() + "\n");

  const id = `revocation_${randomUUID().slice(0, 8)}`;
  const revocationPath = `${protocolPaths.revocations}/${id}.json`;
  const record: RevocationRecord = {
    id,
    protocol_version: "0.1",
    type: "stable_knowledge_revocation",
    path: input.path,
    reviewer_id: reviewerId,
    reason,
    previous_hash: previousHash,
    status: "active",
    created_at: now,
  };
  await writeJson(root, revocationPath, record);
  return { path: input.path, status: "archived", revocation_path: revocationPath };
}

export async function isStableKnowledgeRevoked(root: string, path: string): Promise<boolean> {
  let entries: string[];
  try {
    entries = await readdir(safePath(root, protocolPaths.revocations));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  for (const file of entries.filter((name) => name.endsWith(".json"))) {
    const value = await readJson<Record<string, unknown>>(root, `${protocolPaths.revocations}/${file}`).catch(() => undefined);
    if (!value) continue;
    if (value.type === "stable_knowledge_revocation" && value.path === path && value.status !== "cleared") {
      return true;
    }
  }
  return false;
}
