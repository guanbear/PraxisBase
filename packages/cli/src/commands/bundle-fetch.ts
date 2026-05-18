import { fetchRepairBundle } from "@praxisbase/core/bundles/fetch.js";

export async function bundleFetchCommand(
  scenario: string,
  signature?: string
): Promise<{ bundle: unknown; warning?: string }> {
  const root = process.cwd();
  const result = await fetchRepairBundle(root, scenario, signature);
  return {
    bundle: result.bundle,
    warning: result.warning,
  };
}
