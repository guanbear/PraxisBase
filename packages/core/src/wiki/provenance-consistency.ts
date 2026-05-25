export interface ProvenanceRef {
  uri: string;
  hash?: string;
}

export interface ProvenanceConsistencyResult {
  ok: boolean;
  mismatches: Array<{
    uri: string;
    body_hash?: string;
    expected_hash?: string;
    reason: "unknown_body_ref" | "hash_mismatch";
  }>;
}

export function renderStructuredProvenanceSection(refs: ProvenanceRef[]): string {
  return [
    "## Provenance",
    ...refs.map((ref) => `- ${ref.uri} (${ref.hash ?? "unknown-hash"})`),
  ].join("\n");
}

export function replaceBodyProvenanceSection(body: string, refs: ProvenanceRef[]): string {
  const section = renderStructuredProvenanceSection(refs);
  const lines = body.trimEnd().split(/\r?\n/);
  const output: string[] = [];
  let replaced = false;
  let skipping = false;

  for (const line of lines) {
    if (/^##\s+(Provenance|Sources)\b/i.test(line)) {
      if (!replaced) {
        if (output.length > 0 && output[output.length - 1] !== "") output.push("");
        output.push(section);
        replaced = true;
      }
      skipping = true;
      continue;
    }
    if (skipping && /^##\s+/.test(line)) {
      skipping = false;
      if (output.length > 0 && output[output.length - 1] !== "") output.push("");
      output.push(line);
      continue;
    }
    if (skipping) continue;
    output.push(line);
  }

  if (!replaced) {
    if (output.length > 0 && output[output.length - 1] !== "") output.push("");
    output.push(section);
  }

  return `${output.join("\n").trimEnd()}\n`;
}

function normalizeHash(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/sha256:[a-f0-9]+/i);
  return match?.[0].toLowerCase();
}

function normalizeUri(value: string): string {
  return value.replace(/[),.;\]]+$/g, "");
}

function provenanceSection(body: string): string {
  const lines = body.split(/\r?\n/);
  const captured: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (inSection) break;
      inSection = /^##\s+(Provenance|Sources)\b/i.test(line);
      continue;
    }
    if (inSection) captured.push(line);
  }

  return captured.join("\n");
}

export function extractBodyProvenanceRefs(body: string): ProvenanceRef[] {
  const section = provenanceSection(body);
  if (!section.trim()) return [];

  const refs: ProvenanceRef[] = [];
  const uriPattern = /\b[a-z][a-z0-9+.-]*:(?:\/\/)?[^\s)`\]]+/gi;
  for (const line of section.split(/\r?\n/)) {
    const hashes = Array.from(line.matchAll(/sha256:[a-f0-9]+/gi)).map((match) => match[0].toLowerCase());
    for (const match of line.matchAll(uriPattern)) {
      const uri = normalizeUri(match[0]);
      if (/^sha256:/i.test(uri)) continue;
      refs.push({ uri, hash: hashes[0] });
    }
  }

  return refs;
}

export function assessBodyProvenanceConsistency(
  body: string,
  expectedRefs: ProvenanceRef[],
): ProvenanceConsistencyResult {
  const expectedByUri = new Map<string, ProvenanceRef>();
  for (const ref of expectedRefs) {
    expectedByUri.set(ref.uri, { uri: ref.uri, hash: normalizeHash(ref.hash) });
  }

  const mismatches: ProvenanceConsistencyResult["mismatches"] = [];
  for (const bodyRef of extractBodyProvenanceRefs(body)) {
    const expected = expectedByUri.get(bodyRef.uri);
    const bodyHash = normalizeHash(bodyRef.hash);
    if (!expected) {
      mismatches.push({ uri: bodyRef.uri, body_hash: bodyHash, reason: "unknown_body_ref" });
      continue;
    }
    if (bodyHash && expected.hash && bodyHash !== expected.hash) {
      mismatches.push({
        uri: bodyRef.uri,
        body_hash: bodyHash,
        expected_hash: expected.hash,
        reason: "hash_mismatch",
      });
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}
