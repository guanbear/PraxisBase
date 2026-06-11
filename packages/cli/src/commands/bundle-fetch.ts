import { fetchRepairBundle } from "@praxisbase/core/bundles/fetch.js";

export async function bundleFetchCommand(
  scenario: string,
  signature?: string
): Promise<{ bundle: unknown; warning?: string }> {
  const root = process.cwd();
  const result = await fetchRepairBundle(root, scenario, signature);
  const output: { bundle: unknown; warning?: string } = { bundle: result.bundle };
  if (result.warning) {
    output.warning = result.warning;
  }
  return output;
}
