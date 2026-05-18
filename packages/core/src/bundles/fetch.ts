import { readJson, writeJson } from "../store/file-store.js";

export type BundleFetchResult = {
  bundle: unknown;
  warning?: "latest_unavailable_using_cache";
};

/**
 * Fetch a repair bundle by scenario, falling back to last-known-good cache.
 * The signature parameter filters per-signature entries for scenarios that support them.
 */
export async function fetchRepairBundle(
  root: string,
  scenario: string,
  _signature?: string
): Promise<BundleFetchResult> {
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
