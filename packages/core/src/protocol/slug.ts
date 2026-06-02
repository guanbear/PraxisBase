import { createHash } from "node:crypto";

const DEFAULT_MAX_SLUG_LENGTH = 80;

function baseSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function capAtWordBoundary(slug: string, maxLength: number): string {
  if (slug.length <= maxLength) return slug;
  const capped = slug.slice(0, maxLength).replace(/-+$/g, "");
  const lastDash = capped.lastIndexOf("-");
  if (lastDash >= Math.floor(maxLength * 0.6)) {
    return capped.slice(0, lastDash).replace(/-+$/g, "");
  }
  return capped;
}

export function normalizeStableSlug(input: string, maxLength = DEFAULT_MAX_SLUG_LENGTH): string {
  const normalized = baseSlug(input) || "wiki";
  return capAtWordBoundary(normalized, Math.max(8, maxLength)) || "wiki";
}

function withSuffix(base: string, suffix: string, maxLength: number): string {
  const room = Math.max(1, maxLength - suffix.length - 1);
  return `${capAtWordBoundary(base, room)}-${suffix}`.replace(/^-+|-+$/g, "");
}

function deterministicCollisionSuffix(input: string, ordinal: number): string {
  if (ordinal === 2) return "2";
  return createHash("sha256").update(`${input}:${ordinal}`).digest("hex").slice(0, 6);
}

export function uniqueStableSlugs(inputs: string[], maxLength = DEFAULT_MAX_SLUG_LENGTH): string[] {
  const used = new Set<string>();
  const occurrences = new Map<string, number>();
  return inputs.map((input) => {
    const base = normalizeStableSlug(input, maxLength);
    const nextOccurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, nextOccurrence);
    if (!used.has(base)) {
      used.add(base);
      return base;
    }

    let ordinal = nextOccurrence;
    let candidate = withSuffix(base, deterministicCollisionSuffix(input, ordinal), maxLength);
    while (used.has(candidate)) {
      ordinal++;
      candidate = withSuffix(base, deterministicCollisionSuffix(input, ordinal), maxLength);
    }
    used.add(candidate);
    return candidate;
  });
}
