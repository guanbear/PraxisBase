export function slugifyId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makeId(prefix: string, value: string): string {
  const slug = slugifyId(value);
  if (!slug) {
    throw new Error("Cannot create id from empty value");
  }
  return `${prefix}_${slug}`;
}
