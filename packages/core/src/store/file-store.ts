import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";

/**
 * Resolve a relative path safely against a root directory.
 * Rejects paths that escape the root via traversal.
 */
export function safePath(root: string, relativePath: string): string {
  const resolved = resolve(root, relativePath);
  const normalizedRoot = resolve(root);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + sep)) {
    throw new Error(`Path traversal rejected: ${relativePath}`);
  }
  return resolved;
}

export async function writeText(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = safePath(root, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

export async function readText(root: string, relativePath: string): Promise<string> {
  const absolutePath = safePath(root, relativePath);
  return readFile(absolutePath, "utf8");
}

export async function writeJson(root: string, relativePath: string, value: unknown): Promise<void> {
  await writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson<T = unknown>(root: string, relativePath: string): Promise<T> {
  return JSON.parse(await readText(root, relativePath)) as T;
}

/**
 * Validate that a patch path is within stable knowledge directories.
 */
export function isStableKnowledgePath(relativePath: string): boolean {
  const normalized = normalize(relativePath);
  if (normalized.startsWith("..") || isAbsolute(normalized)) return false;
  return normalized.startsWith("kb" + sep) || normalized.startsWith("skills" + sep);
}
