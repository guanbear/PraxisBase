import { createHash } from "node:crypto";
import { readJson, readText, writeJson } from "../store/file-store.js";
import type { K8sIncidentManifest, K8sIncidentManifestEntry } from "../protocol/schemas.js";

export type BundleFetchResult = {
  bundle: unknown;
  warning?: "latest_unavailable_using_cache" | "bundle_unavailable";
};

function sha256(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function makeEmptyBundle(signature: string): Record<string, unknown> {
  return {
    protocol_version: "0.1",
    signature,
    warning: "bundle_unavailable",
    known_fixes: [],
    skills: [],
    forbidden_operations: [],
    verification_steps: [],
    source_refs: [],
    diagnostic_commands: [],
    rollback_steps: [],
    escalation_conditions: [],
  };
}

async function fetchK8sIncident(
  root: string,
  signature?: string
): Promise<BundleFetchResult> {
  const manifestPath = "dist/repair-bundles/k8s-incident/manifest.json";

  let manifest: K8sIncidentManifest;
  try {
    manifest = await readJson<K8sIncidentManifest>(root, manifestPath);
  } catch {
    return fallbackOrEmpty(root, signature);
  }

  const entry: K8sIncidentManifestEntry | undefined = manifest.entries.find(
    (e) => e.signature === signature
  );
  if (!entry) {
    return fallbackOrEmpty(root, signature);
  }

  let content: string;
  try {
    content = await readText(root, `dist/repair-bundles/${entry.path}`);
  } catch {
    return fallbackOrEmpty(root, signature);
  }

  if (sha256(content) !== entry.checksum) {
    return fallbackOrEmpty(root, signature);
  }

  const bundle = JSON.parse(content);
  const cachePath = `.praxisbase/cache/last-known-good/k8s-incident/${signature}.json`;
  await writeJson(root, cachePath, bundle);
  return { bundle };
}

async function fallbackOrEmpty(
  root: string,
  signature?: string
): Promise<BundleFetchResult> {
  if (signature) {
    const cachePath = `.praxisbase/cache/last-known-good/k8s-incident/${signature}.json`;
    try {
      return {
        bundle: await readJson(root, cachePath),
        warning: "latest_unavailable_using_cache",
      };
    } catch {}
  }
  return {
    bundle: makeEmptyBundle(signature ?? ""),
    warning: "bundle_unavailable",
  };
}

export async function fetchRepairBundle(
  root: string,
  scenario: string,
  signature?: string
): Promise<BundleFetchResult> {
  if (scenario === "k8s-incident") {
    return fetchK8sIncident(root, signature);
  }

  const bundlePath = `dist/repair-bundles/${scenario}-sandbox.json`;
  const cachePath = `.praxisbase/cache/last-known-good/${scenario}-sandbox.json`;

  try {
    const bundle = await readJson(root, bundlePath);
    await writeJson(root, cachePath, bundle);
    return { bundle };
  } catch (latestError) {
    try {
      return {
        bundle: await readJson(root, cachePath),
        warning: "latest_unavailable_using_cache",
      };
    } catch {
      throw latestError;
    }
  }
}
